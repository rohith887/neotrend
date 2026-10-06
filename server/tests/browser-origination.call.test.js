/**
 * Browser-originated call flow — dependency-free assertions with stubbed
 * models/services. Proves the AMI 503 path is gone: Start never originates
 * over AMI, the browser gets a dial string, lifecycle reports are accepted
 * only for browser-placed calls, and End needs no gateway action.
 */
const assert = require('assert');
const path = require('path');

const SERVER = path.resolve(__dirname, '..');
const stub = (rel, exports) => {
  const filename = require.resolve(path.join(SERVER, 'src', rel));
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

// ── stubs ────────────────────────────────────────────────────────────────
const lead = { _id: 'LEAD1', studentName: 'Test Student', mobile: '9876543210', assignedTo: 'AGENT1' };
let caller = {
  _id: 'AGENT1',
  mobile: '9000000000',
  sipProvisionStatus: 'provisioned',
  sipExtension: '1007',
  sipUsername: '1007',
  sipWssUrl: 'wss://sip.grcti.com/ws',
  sipDomain: 'sip.grcti.com',
};
const calls = new Map();
let created = [];
const callServiceStub = {
  CALL_LIVE: new Set(['initiated', 'ringing', 'answered', 'connected']),
  CALL_TERMINAL: new Set(['completed', 'failed', 'no-answer', 'busy', 'cancelled']),
  getActiveCallForAgent: async () => null,
  createCall: async (args) => {
    const call = {
      _id: `CALL${created.length + 1}`,
      status: 'initiated',
      startedAt: new Date(),
      provider: args.provider,
      channel: args.channel || '',
      studentNumber: args.studentNumber,
      ...args,
    };
    created.push(call);
    calls.set(call._id, call);
    return call;
  },
  getOwnedCall: async (callId) => {
    const call = calls.get(callId);
    if (!call) {
      const err = new Error('Call not found');
      err.statusCode = 404;
      throw err;
    }
    return call;
  },
  markEnded: async (call, { status = 'completed' } = {}) => {
    call.status = status;
    call.endedAt = new Date();
    return call;
  },
  applyProviderStatus: async (callId, { status, providerStatus }) => {
    const call = calls.get(callId);
    call.status = status;
    call.providerStatus = providerStatus;
    return call;
  },
  linkInteraction: async () => true,
  setProvider: async () => null,
  listLiveCalls: async () => [...calls.values()],
  getLiveByProvider: async () => null,
};

stub('models/Lead.js', { findById: async () => lead });
stub('models/User.js', {
  findById: () => ({ select: async () => caller }),
});
stub('services/call.service.js', callServiceStub);
stub('services/systemLog.service.js', { logEvent: () => {} });

// Real telephony.service (its AMI client is never started here).
const telephony = require(path.join(SERVER, 'src/services/telephony.service.js'));
let originateCalls = 0;
let hangupCalls = 0;
telephony.originateCall = async () => {
  originateCalls += 1;
  throw new Error('originateCall must not run in browser mode');
};
telephony.hangupCall = async () => {
  hangupCalls += 1;
  throw new Error('hangupCall must not run in browser mode');
};

const controller = require(path.join(SERVER, 'src/controllers/call.controller.js'));

const fakeRes = () => ({
  code: null,
  body: null,
  set() {},
  status(code) { this.code = code; return this; },
  json(payload) { this.body = payload; return this; },
});

// asyncHandler does not return the promise, so resolve on the response itself.
const run = async (handler, req) => {
  const res = fakeRes();
  const settled = new Promise((resolve) => {
    res.status = (code) => { res.code = code; return res; };
    res.json = (payload) => { res.body = payload; resolve({ code: res.code, body: payload }); return res; };
    handler(req, res, (err) => {
      resolve({ code: err?.statusCode || 500, body: { message: err?.message || 'error' } });
    });
  });
  return settled;
};

const agentReq = (over = {}) => ({
  // `protect` puts the Role document on req.role (the caller's own profile is
  // req.user) — mirror that exactly.
  role: { code: 'AGENT', name: 'Agent', permissions: ['lead:fetch'] },
  user: { _id: 'AGENT1', email: 'a@b.c', firstName: 'A', lastName: 'B', mobile: '9000000000' },
  body: {},
  params: {},
  ip: '127.0.0.1',
  _tasaRequestId: 'test',
  ...over,
});

(async () => {
  // 1) Browser-originated Start → record + dial string, no AMI.
  let out = await run(controller.startCall, agentReq({ body: { leadId: 'LEAD1' } }));
  assert.strictEqual(out.code, 201, `start should be 201, got ${out.code} ${out.body?.message}`);
  assert.strictEqual(out.body.data.origination, 'browser');
  assert.strictEqual(out.body.data.dialNumber, '09876543210');
  assert.strictEqual(out.body.data.extension, '1007');
  assert.strictEqual(out.body.data.wssUrl, 'wss://sip.grcti.com/ws');
  assert.strictEqual(out.body.data.domain, 'sip.grcti.com');
  assert.strictEqual(created[0].provider, 'browser-sip.js');
  assert.strictEqual(originateCalls, 0, 'AMI Originate must not be used in browser mode');
  const callId = out.body.data.callId;

  // 2) Manual dial number is honored.
  out = await run(controller.startCall, agentReq({ body: { leadId: 'LEAD1', manualNumber: '9000000001' } }));
  assert.strictEqual(out.body.data.dialNumber, '09000000001');

  // 3) Unprovisioned agent → 422 with the actionable message, no record.
  const before = created.length;
  caller = { ...caller, sipProvisionStatus: 'pending' };
  out = await run(controller.startCall, agentReq({ body: { leadId: 'LEAD1' } }));
  assert.strictEqual(out.code, 422, `unprovisioned start should be 422, got ${out.code}`);
  assert.match(out.body.message, /not provisioned/i);
  assert.strictEqual(created.length, before, 'no Call record may be created for an unprovisioned agent');
  caller = { ...caller, sipProvisionStatus: 'provisioned' };

  // 4) Browser lifecycle report is stored.
  out = await run(controller.reportStatus, agentReq({ params: { callId }, body: { status: 'ringing' } }));
  assert.strictEqual(out.code, 200);
  assert.strictEqual(calls.get(callId).status, 'ringing');
  out = await run(controller.reportStatus, agentReq({ params: { callId }, body: { status: 'connected' } }));
  assert.strictEqual(calls.get(callId).status, 'connected');
  out = await run(controller.reportStatus, agentReq({ params: { callId }, body: { status: 'completed' } }));
  assert.strictEqual(calls.get(callId).status, 'completed');

  // Terminal-final: a late report cannot reopen the call.
  out = await run(controller.reportStatus, agentReq({ params: { callId }, body: { status: 'ringing' } }));
  assert.strictEqual(calls.get(callId).status, 'completed');

  // 5) End Call on a browser-placed call needs no gateway action.
  const live = await run(controller.startCall, agentReq({ body: { leadId: 'LEAD1' } }));
  const liveId = live.body.data.callId;
  out = await run(controller.endCall, agentReq({ params: { callId: liveId } }));
  assert.strictEqual(out.code, 200, `end should be 200, got ${out.code} ${out.body?.message}`);
  assert.strictEqual(hangupCalls, 0, 'AMI Hangup must not be used for a browser-placed call');
  assert.strictEqual(calls.get(liveId).status, 'completed');

  // 6) A gateway-originated call still refuses browser status reports.
  const amiCall = { _id: 'CALLAMI', status: 'initiated', provider: 'asterisk', startedAt: new Date() };
  calls.set('CALLAMI', amiCall);
  out = await run(controller.reportStatus, agentReq({ params: { callId: 'CALLAMI' }, body: { status: 'ringing' } }));
  assert.strictEqual(out.code, 409, 'status report on an AMI call should be 409');

  // 7) Telephony config reports browser origination with AMI not required.
  const status = telephony.getConfigStatus();
  assert.strictEqual(status.origination, 'browser');
  assert.strictEqual(status.amiRequired, false);
  assert.strictEqual(status.configured, true);
  assert.strictEqual(status.integrationStatus, 'browser-sip.js');

  console.log('browser-origination call flow: all assertions passed');
  console.log(JSON.stringify({
    start: out.code,
    dialNumber: created[0].studentNumber,
    originateCalls,
    hangupCalls,
  }));
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
