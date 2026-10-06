/**
 * READ-ONLY diagnostic: places a call to the PBX's echo-test extension and
 * captures the SDP Asterisk answers with, WITHOUT needing a real
 * microphone/media device (this runs in Node, not a browser). We swap in a
 * minimal fake SessionDescriptionHandler that sends a static, syntactically
 * valid offer SDP and just logs whatever answer SDP comes back — the goal is
 * only to see what IP address Asterisk advertises for RTP (the public
 * 118.185.152.22 / sip.grcti.com, or a private LAN address like 172.16.10.19,
 * which would be unreachable from the browser and explain "no audio").
 *
 * Tries a short list of common FreePBX echo-test extensions (does not ring
 * any real phone). Same AOR/credentials/WSS the browser uses. Password is
 * read from the DB and never printed.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SERVER = path.resolve(process.cwd());
const config = require(path.join(SERVER, 'src/config'));
const mongoose = require(path.join(SERVER, 'node_modules/mongoose'));
const User = require(path.join(SERVER, 'src/models/User'));

// Trace the WebSocket so we can see the raw INVITE / 200 OK SDP bodies.
const NativeWS = globalThis.WebSocket;
let wsSeq = 0;
globalThis.WebSocket = class TracedWS extends NativeWS {
  constructor(url, protocols) {
    super(url, protocols);
    this._id = ++wsSeq;
    this.addEventListener('message', (e) => {
      const text = typeof e.data === 'string' ? e.data : '<binary>';
      if (/^(INVITE|SIP\/2\.0 200)/.test(text) || text.includes('m=audio')) {
        console.log(`\n[ws#${this._id}] <<< IN\n${redact(text)}`);
      }
    });
    const send = this.send.bind(this);
    this.send = (data) => {
      const text = typeof data === 'string' ? data : '<binary>';
      if (/^INVITE|^ACK/.test(text) || text.includes('m=audio')) {
        console.log(`\n[ws#${this._id}] >>> OUT\n${redact(text)}`);
      }
      return send(data);
    };
  }
};
const redact = (text) => text.replace(/(Authorization:\s*Digest\s+)[^\r\n]*/gi, '$1<redacted>');

const { UserAgent, Inviter, SessionState } = await import(
  pathToFileURL(path.join(SERVER, '..', 'client', 'node_modules', 'sip.js', 'lib', 'index.js')).href
);

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
const user = await User.findOne({ sipProvisionStatus: 'provisioned' })
  .select('+sipPassword sipUsername sipExtension sipDomain sipWssUrl');
if (!user) { console.log('no provisioned user'); process.exit(1); }

const aor = `sip:${user.sipUsername}@${user.sipDomain}`;
const uri = UserAgent.makeURI(aor);
console.log('AOR:', aor, '| WSS:', user.sipWssUrl);

// Minimal fake SDH: static offer, just logs the answer. No real media needed
// — we only care about what connection/candidate IP Asterisk answers with.
// Real host + server-reflexive candidates (the srflx IP is this network's
// actual public-facing address, confirmed earlier via a live STUN binding
// against stun.l.google.com) — so this offer is exactly as ICE-compliant as
// what a real browser sends. If Asterisk still answers with no candidates
// and a private c= line, the missing ICE is proven to be Asterisk's own
// answer, not an artifact of a lazy fake offer.
const FAKE_OFFER = [
  'v=0',
  'o=- 0 0 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  'm=audio 54400 UDP/TLS/RTP/SAVPF 0 8 101',
  'c=IN IP4 192.168.1.50',
  'a=rtcp:54401 IN IP4 192.168.1.50',
  'a=candidate:1 1 udp 2113937151 192.168.1.50 54400 typ host generation 0 ufrag diag network-cost 999',
  'a=candidate:2 1 udp 1677729535 106.51.38.202 54400 typ srflx raddr 0.0.0.0 rport 0 generation 0 ufrag diag network-cost 999',
  'a=end-of-candidates',
  'a=ice-ufrag:diag',
  'a=ice-pwd:diagnosticpwd0000000000000000',
  'a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF',
  'a=setup:actpass',
  'a=mid:0',
  'a=sendrecv',
  'a=rtcp-mux',
  'a=rtpmap:0 PCMU/8000',
  'a=rtpmap:8 PCMA/8000',
  'a=rtpmap:101 telephone-event/8000',
  '',
].join('\r\n');

class FakeSDH {
  close() {}
  getDescription() { return Promise.resolve({ body: FAKE_OFFER, contentType: 'application/sdp' }); }
  hasDescription(contentType) { return contentType === 'application/sdp'; }
  setDescription(sdp) {
    console.log('\n=== ANSWER SDP FROM ASTERISK ===\n' + sdp + '=================================\n');
    const conn = sdp.match(/^c=IN IP4 (\S+)/m);
    const cands = [...sdp.matchAll(/^a=candidate:.*$/gm)].map((m) => m[0]);
    console.log('Connection (c=) address:', conn ? conn[1] : '(none)');
    console.log('ICE candidates in answer:', cands.length ? cands : '(none — non-ICE / direct media)');
    return Promise.resolve();
  }
  sendDtmf() { return false; }
}

const ua = new UserAgent({
  uri,
  authorizationUsername: String(user.sipUsername),
  authorizationPassword: String(user.sipPassword),
  displayName: `TASA-diag-audio-${user.sipUsername}`,
  transportOptions: { server: user.sipWssUrl },
  sessionDescriptionHandlerFactory: () => new FakeSDH(),
  logConfiguration: false,
  logBuiltinEnabled: false,
  logLevel: 'off',
});

await ua.start();
console.log('transport connected:', ua.transport.isConnected());

const candidates = ['*43', '500', '600', '9999'];
let done = false;

const tryNext = async () => {
  if (done) return;
  const ext = candidates.shift();
  if (!ext) { console.log('\nNo more echo-test extensions to try.'); finish('DONE (exhausted candidates)'); return; }
  console.log(`\n--- Trying echo-test extension: ${ext} ---`);
  const target = UserAgent.makeURI(`sip:${ext}@${user.sipDomain}`);
  const inviter = new Inviter(ua, target);
  inviter.stateChange.addListener((state) => {
    console.log('[session] state =', state);
    if (state === SessionState.Established) {
      console.log(`\n*** ${ext} ANSWERED — SDP captured above ***`);
      setTimeout(() => { inviter.bye().catch(() => {}); finish('DONE (answered + captured)'); }, 1000);
    }
    if (state === SessionState.Terminated && !done) {
      tryNext();
    }
  });
  try {
    await inviter.invite();
  } catch (err) {
    console.log(`INVITE to ${ext} failed:`, err?.message);
    tryNext();
  }
};

const finish = (msg) => { if (done) return; done = true; console.log('\n' + msg); setTimeout(() => process.exit(0), 500); };

tryNext();
setTimeout(() => finish('TIMEOUT — no echo-test extension answered in 30s'), 30000);
