/**
 * Frame-level trace of the browser's exact registration path, run outside the
 * browser with the same sip.js build, same AOR and same WSS endpoint.
 * The SIP password is read from the DB and NEVER printed; Authorization
 * headers are redacted before any frame is logged.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SERVER = path.resolve(process.cwd());
const config = require(path.join(SERVER, 'src/config'));
const mongoose = require(path.join(SERVER, 'node_modules/mongoose'));
const User = require(path.join(SERVER, 'src/models/User'));

// ── trace the WebSocket SIP.js will use ────────────────────────────────���─
const NativeWS = globalThis.WebSocket;
let wsSeq = 0;
globalThis.WebSocket = class TracedWS extends NativeWS {
  constructor(url, protocols) {
    super(url, protocols);
    this._id = ++wsSeq;
    console.log(`\n[ws#${this._id}] OPENING ${url} protocols=${JSON.stringify(protocols)}`);
    this.addEventListener('open', () => {
      console.log(`[ws#${this._id}] OPEN (readyState=${this.readyState})`);
      ua?.transport?.stateChange && console.log('[ws] transport state change fired');
    });
    this.addEventListener('error', () => console.log(`[ws#${this._id}] ERROR (readyState=${this.readyState})`));
    this.addEventListener('close', (e) => console.log(`[ws#${this._id}] CLOSE code=${e.code} reason=${JSON.stringify(e.reason || '')}`));
    this.addEventListener('message', (e) => {
      const text = typeof e.data === 'string' ? e.data : '<binary>';
      console.log(`[ws#${this._id}] <<< IN  ${redact(text).replace(/\r\n/g, ' | ')}`);
    });
    const send = this.send.bind(this);
    this.send = (data) => {
      const text = typeof data === 'string' ? data : '<binary>';
      console.log(`[ws#${this._id}] >>> OUT ${redact(text).replace(/\r\n/g, ' | ')}`);
      return send(data);
    };
  }
};

const redact = (text) => text.replace(/(Authorization:\s*Digest\s+)[^\r\n]*/gi, '$1<redacted>')
  .replace(/(responseDigest=")[^"]*(")/gi, '$1<redacted>$2');

const { UserAgent, Registerer, RegistererState } = await import(
  pathToFileURL(path.join(SERVER, '..', 'client', 'node_modules', 'sip.js', 'lib', 'index.js')).href
);

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
const user = await User.findOne({ sipProvisionStatus: 'provisioned' })
  .select('+sipPassword sipUsername sipExtension sipDomain sipWssUrl');

const aor = `sip:${user.sipUsername}@${user.sipDomain}`;
console.log('AOR   :', aor);
console.log('WSS   :', user.sipWssUrl);
console.log('Ext   :', user.sipExtension, '| domain:', user.sipDomain);

const ua = new UserAgent({
  uri: UserAgent.makeURI(aor),
  authorizationUsername: String(user.sipUsername),
  authorizationPassword: String(user.sipPassword),
  displayName: `TASA-diag-${user.sipUsername}`,
  transportOptions: { server: user.sipWssUrl },
  logConfiguration: false,
  logBuiltinEnabled: false,
  logLevel: 'off',
});

const registerer = new Registerer(ua);
registerer.stateChange.addListener((s) => console.log('[registerer] state =', s));

const finish = (msg) => { console.log('\n' + msg); process.exit(0); };

try {
  await ua.start();
  console.log('transport connected:', ua.transport.isConnected());
  await registerer.register();
  console.log('register() dispatched');
} catch (err) {
  console.log('\nREGISTER ERROR:', err?.name, '|', String(err?.message || err).slice(0, 300));
  if (err?.response) {
    console.log('  status :', err.response.statusCode, err.response.reasonPhrase);
    console.log('  headers:', String(err.response.headers || '').replace(/\r\n/g, ' | ').slice(0, 500));
  }
  finish('DONE (error)');
}

setTimeout(() => {
  console.log('\nfinal transport connected:', ua.transport.isConnected());
  finish(`DONE — registerer state: ${RegistererState[registerer.state] ?? registerer.state}`);
}, 12000);
