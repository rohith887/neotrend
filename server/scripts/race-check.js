require('dotenv').config();
const mongoose = require('mongoose');
const Call = require('../src/models/Call');

const AGENTS = {
  Diya: '6a7abf70e2b60d6031a70105',
  Rohith: '6a7c01d3b0e2f6f1a80591de',
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const live = await Call.find({ status: { $in: ['initiated', 'ringing', 'answered', 'connected'] } })
    .select('_id agent lead status startedAt endedAt')
    .sort({ startedAt: -1 })
    .lean();
  console.log('ALL LIVE CALLS NOW:', live.length);
  for (const c of live) {
    console.log(`  ${c._id.toString().slice(0, 8)} | agent=${String(c.agent).slice(0, 8)} | ${c.status} | start=${c.startedAt.toISOString()} | lead=${String(c.lead).slice(0, 8)}`);
  }
  for (const [name, id] of Object.entries(AGENTS)) {
    const hits = await Call.find({ agent: id, status: { $in: ['initiated', 'ringing', 'answered', 'connected'] } })
      .select('_id status startedAt').sort({ startedAt: 1 }).lean();
    if (hits.length > 1) {
      console.log(`MULTIPLE LIVE CALLS for ${name}: ${hits.map(c => `${c._id.toString().slice(0, 8)}|${c.status}|${c.startedAt.toISOString()}`).join('  ')}`);
    }
  }
  const dupeAgents = await Call.aggregate([
    { $match: { status: { $in: ['initiated', 'ringing', 'answered', 'connected'] } } },
    { $group: { _id: '$agent', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  console.log('AGENTS WITH >1 LIVE CALL:', dupeAgents.length);
  for (const d of dupeAgents) console.log(`  ${d._id.toString().slice(0, 8)} -> ${d.n} live`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });