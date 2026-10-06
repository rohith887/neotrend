require('dotenv').config();
const mongoose = require('mongoose');
const Call = require('../src/models/Call');
const User = require('../src/models/User');
const Role = require('../src/models/Role');

const short = (v) => String(v || '-').slice(0, 8);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const agentRole = await Role.findOne({ code: 'agent' }).lean();
  const agents = await User.find({ role: agentRole._id }).select('firstName lastName email').lean();
  console.log('AGENT_ROLE', agentRole ? agentRole._id.toString() : 'MISSING', agentRole ? agentRole.code : '');
  console.log('AGENTS', agents.length);
  for (const a of agents.slice(0, 8)) console.log('  -', a._id.toString(), `${a.firstName} ${a.lastName || ''}`.trim(), a.email);

  console.log('\nRECENT 25 CALLS (newest first)');
  const calls = await Call.find().sort({ startedAt: -1 }).limit(25).lean();
  for (const c of calls) {
    console.log(
      `${short(c._id)} | status=${c.status} | start=${c.startedAt.toISOString()} | upd=${(c.statusUpdatedAt || c.updatedAt).toISOString()} | end=${c.endedAt ? c.endedAt.toISOString() : '-'} | agent=${short(c.agent)} | lead=${short(c.lead)}`
    );
  }

  const LIVE = ['initiated', 'ringing', 'answered', 'connected'];
  const liveCalls = await Call.find({ status: { $in: LIVE } }).lean();
  console.log('\nLIVE CALLS NOW:', liveCalls.length);
  for (const c of liveCalls) {
    console.log(
      `  ${short(c._id)} | ${c.status} | start=${c.startedAt.toISOString()} | agent=${short(c.agent)} | lead=${short(c.lead)}`
    );
  }

  const byStatus = await Call.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).sort({ n: -1 });
  console.log('\nCALL STATUS COUNTS');
  for (const s of byStatus) console.log(`  ${s._id}: ${s.n}`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });