require('dotenv').config();
const mongoose = require('mongoose');
const SystemLog = require('../src/models/SystemLog');

const short = (v) => String(v || '').slice(0, 8);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const logs = await SystemLog.find({ module: 'telephony', createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .select('action username callId callStatus userId createdAt message')
    .lean();
  console.log('TELEPHONY LOGS (last 6h):', logs.length);
  for (const l of logs) {
    console.log(
      `${l.createdAt.toISOString()} | ${String(l.action).padEnd(20)} | user=${short(l.userId)}${l.username ? `(${l.username})` : ''} | callId=${short(l.callId)} | status=${callStatus(l)} | ${String(l.message || '').slice(0, 70)}`
    );
  }
  await mongoose.disconnect();

  function callStatus(l) {
    const m = l.metadata || {};
    return m.callStatus || l.callStatus || '-';
  }
})().catch((e) => { console.error(e); process.exit(1); });