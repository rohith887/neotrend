require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const User = require('../src/models/User');
const Role = require('../src/models/Role');
const Lead = require('../src/models/Lead');
const Call = require('../src/models/Call');

const BASE = process.env.API_BASE_URL || 'http://localhost:5000/api';
let AUTH_TOKEN = null;
const headers = (token, json = true) => ({
  Authorization: `Bearer ${token}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

const call = async (method, path, token, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const agentRole = await Role.findOne({ code: 'agent' }).lean();
  const email = process.env.AGENT_EMAIL;
  if (!email) throw new Error('set AGENT_EMAIL env var');
  const agent = await User.findOne({ email, role: agentRole._id }).lean();
  if (!agent) throw new Error(`agent not found: ${email}`);
  console.log(`AGENT ${agent.email} mobile= ${agent.mobile ? String(agent.mobile).slice(0, 3) + '****' + String(agent.mobile).slice(-2) : 'MISSING'}`);

  const lead = await Lead.findOne({}).sort({ createdAt: -1 }).lean();
  if (!lead) throw new Error('no lead found');
  console.log(`LEAD ${lead._id} "${String(lead.studentName || '').slice(0, 20)}" ${String(lead.mobile || '').slice(0, 4)}****`);

  // Mint a real app JWT exactly as auth.service does (protect re-resolves the
  // user + role from the DB against the shared secret). Login password is out
  // of scope here — the test drives the live server + RBAC + controllers + DB.
  AUTH_TOKEN = jwt.sign(
    { id: String(agent._id), role: String(agentRole.code) },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn || '1h' }
  );

  const countLive = async () => {
    const n = await Call.countDocuments({ agent: agent._id, status: { $in: ['initiated', 'ringing', 'answered', 'connected'] } });
    return n;
  };

  // ══ SECTION A — acceptance #1: targeted End (exact call id) ══
  console.log('\n══ ACCEPTANCE #1 (targeted end) ══');
  if ((await countLive()) !== 0) {
    const rst = await call('POST', '/calls/end-active', AUTH_TOKEN);
    console.log(`RESET -> ended leftover live call -> HTTP ${rst.status}`, rst.json?.data?.ended);
    if ((await countLive()) !== 0) throw new Error(`could not reset: still ${await countLive()} live`);
  }
  const s1 = await call('POST', '/calls/start', AUTH_TOKEN, { leadId: lead._id });
  console.log(`START  -> HTTP ${s1.status}`, s1.json?.data?.callId || s1.json?.message);
  if (s1.status !== 201) throw new Error('START failed (#1)');
  if ((await countLive()) !== 1) throw new Error(`after START expected 1 live, got ${await countLive()}`);

  const e1 = await call('POST', `/calls/${s1.json.data.callId}/end`, AUTH_TOKEN);
  console.log(`END    -> HTTP ${e1.status}`, e1.json?.data?.status || e1.json?.message);
  if (e1.status !== 200) throw new Error(`END failed (#1): ${e1.json?.message}`);
  if ((await countLive()) !== 0) throw new Error(`after END expected 0 live, got ${await countLive()}`);

  const s2 = await call('POST', '/calls/start', AUTH_TOKEN, { leadId: lead._id });
  console.log(`START2 -> HTTP ${s2.status}`, s2.json?.data?.callId || s2.json?.message);
  if (s2.status !== 201) throw new Error(`START again failed (#1) — 409 bug present`);
  const e2 = await call('POST', '/calls/end-active', AUTH_TOKEN);
  console.log(`CLEANUP-> HTTP ${e2.status}`, e2.json?.data?.ended);
  if ((await countLive()) !== 0) throw new Error(`cleanup left ${await countLive()} live`);

  // ══ SECTION B — acceptance #2: authoritative End (no call id) ══
  console.log('\n══ ACCEPTANCE #2 (authoritative end-active, no call id needed) ══');
  const s3 = await call('POST', '/calls/start', AUTH_TOKEN, { leadId: lead._id });
  console.log(`START  -> HTTP ${s3.status}`, s3.json?.data?.callId || s3.json?.message);
  if (s3.status !== 201) throw new Error('START failed (#2)');
  const g1 = await call('GET', '/calls/active', AUTH_TOKEN);
  console.log(`ACTIVE -> HTTP ${g1.status}`, g1.json?.data?.callId || 'none');
  if (!g1.json?.data) throw new Error('GET /calls/active returned nothing while live');

  const ea = await call('POST', '/calls/end-active', AUTH_TOKEN);
  console.log(`END-ACTIVE -> HTTP ${ea.status}`, ea.json?.data);
  if (ea.json?.data?.ended !== true) throw new Error('end-active did not end');
  if ((await countLive()) !== 0) throw new Error(`after end-active expected 0 live, got ${await countLive()}`);

  const s4 = await call('POST', '/calls/start', AUTH_TOKEN, { leadId: lead._id });
  console.log(`START2 -> HTTP ${s4.status}`, s4.json?.data?.callId || s4.json?.message);
  if (s4.status !== 201) throw new Error(`START again failed (#2) — 409 bug present`);

  // ══ SECTION C — RACE regression: two concurrent Start calls ══
  console.log('\n══ RACE REGRESSION (concurrent double Start) ══');
  const pre = await call('POST', '/calls/end-active', AUTH_TOKEN);
  console.log(`PRE-RACE  -> HTTP ${pre.status}`, pre.json?.data?.ended);
  if ((await countLive()) !== 0) throw new Error(`race precondition not met: ${await countLive()} live`);
  const [r1, r2] = await Promise.all([
    call('POST', '/calls/start', AUTH_TOKEN, { leadId: lead._id }),
    call('POST', '/calls/start', AUTH_TOKEN, { leadId: lead._id }),
  ]);
  console.log(`CONCURRENT -> HTTP ${r1.status} & ${r2.status}`);
  const sorted = [r1.status, r2.status].sort((a, b) => a - b);
  if (!(sorted[0] === 201 && sorted[1] === 409)) {
    throw new Error(`expected exactly one 201 and one 409 — got ${sorted.join(' & ')} (race STILL possible)`);
  }
  if ((await countLive()) !== 1) throw new Error(`race left ${await countLive()} live — invariant violated`);
  console.log('RESULT: exactly one live call after concurrent double start — 409 gate is now atomic.');

  const e3 = await call('POST', '/calls/end-active', AUTH_TOKEN);
  console.log(`CLEANUP-> HTTP ${e3.status}`, e3.json?.data?.ended);
  if ((await countLive()) !== 0) throw new Error(`final cleanup left ${await countLive()} live`);

  // ══ SECTION D — fetch-call blocked while a call is live (Part 8) ══
  console.log('\n══ SECTION D — fetch-call gate while live ══');
  const s5 = await call('POST', '/calls/start', AUTH_TOKEN, { leadId: lead._id });
  console.log(`START  -> HTTP ${s5.status}`, s5.json?.data?.callId || s5.json?.message);
  if (s5.status !== 201) throw new Error('START failed (D)');
  const f1 = await call('POST', '/activity/fetch-call', AUTH_TOKEN, { leadId: lead._id });
  console.log(`FETCH while live -> HTTP ${f1.status}`, f1.json?.message || '');
  if (f1.status !== 409) throw new Error(`expected 409 fetch-while-live, got ${f1.status}`);
  const e4 = await call('POST', '/calls/end-active', AUTH_TOKEN);
  console.log(`END-ACTIVE -> HTTP ${e4.status}`, e4.json?.data?.ended);
  if ((await countLive()) !== 0) throw new Error(`section D cleanup left ${await countLive()} live`);
  const f2 = await call('POST', '/activity/fetch-call', AUTH_TOKEN, { leadId: lead._id });
  console.log(`FETCH after end -> HTTP ${f2.status}`);
  if (f2.status === 409) throw new Error('fetch still 409 after the call ended — guard is too strict');

  // ══ SECTION E — START → END ×2 acceptance loop ══
  console.log('\n══ SECTION E — START → END ×2 ══');
  for (let i = 1; i <= 2; i += 1) {
    const s = await call('POST', '/calls/start', AUTH_TOKEN, { leadId: lead._id });
    if (s.status !== 201) throw new Error(`loop ${i}: START failed ${s.status}`);
    const g = await call('GET', '/calls/active', AUTH_TOKEN);
    if (!g.json?.data?.callId) throw new Error(`loop ${i}: GET /calls/active empty after start`);
    const e = await call('POST', '/calls/end-active', AUTH_TOKEN);
    if (e.json?.data?.ended !== true) throw new Error(`loop ${i}: end-active did not end`);
    const after = await call('GET', '/calls/active', AUTH_TOKEN);
    if (after.json?.data) throw new Error(`loop ${i}: still active after end`);
    if ((await countLive()) !== 0) throw new Error(`loop ${i}: live leftover`);
    console.log(`loop ${i}: START 201 -> ACTIVE ok -> END ended -> ACTIVE none`);
  }

  await mongoose.disconnect();
  console.log('\nPASS: acceptance #1, #2, race regression, fetch-gate, x2 loop all green; no live call remains.');
})().catch(e => { console.error('FLOW ERROR:', e.message); process.exit(1); });