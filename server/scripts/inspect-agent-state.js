require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Role = require('../src/models/Role');
const Call = require('../src/models/Call');
const Break = require('../src/models/Break');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const agentRole = await Role.findOne({ code: 'agent' }).lean();
  const agents = await User.find({ role: agentRole._id }).select('firstName lastName email availability status').lean();
  console.log('=== AGENTS ===');
  for (const a of agents) {
    const live = await Call.find({ agent: a._id, status: { $in: [...Call.CALL_LIVE] } }).select('_id status startedAt lead').lean();
    console.log(`${a.email}  availability=${a.availability} status=${a.status} live=${live.length}`);
    for (const l of live) console.log(`    live call ${l._id} status=${l.status} startedAt=${l.startedAt}`);
  }
  console.log('\n=== ACTIVE BREAKS ===');
  const breaks = await Break.find({ status: { $in: ['active', 'started'] } }).lean().catch(() => []);
  console.log(breaks.length ? breaks.map((b) => `${b._id} user=${b.user} status=${b.status} startedAt=${b.startedAt}`).join('\n') : 'none');
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
