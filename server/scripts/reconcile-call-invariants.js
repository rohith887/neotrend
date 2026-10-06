require('dotenv').config();
const mongoose = require('mongoose');
const Call = require('../src/models/Call');
const { logEvent } = require('../src/services/systemLog.service');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Reconcile race-created duplicates, FIRST (before the unique index exists):
  //    keep the newest live call per agent, terminate the older ones.
  const dupes = await Call.aggregate([
    { $match: { status: { $in: [...Call.CALL_LIVE] } } },
    { $group: { _id: '$agent', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  console.log('AGENTS WITH >1 LIVE CALL (pre-reconcile):', dupes.length);
  for (const d of dupes) {
    const live = await Call.find({ agent: d._id, status: { $in: [...Call.CALL_LIVE] } })
      .sort({ startedAt: -1 })
      .select('_id status startedAt');
    const keep = live[0];
    console.log(`  agent=${String(d._id).slice(0, 8)} n=${live.length} keep=${keep._id} (${keep.startedAt.toISOString()})`);
    for (const dup of live.slice(1)) {
      const now = new Date();
      Call.transaction = undefined;
      const terminated = await Call.findByIdAndUpdate(
        dup._id,
        { $set: { status: 'cancelled', statusUpdatedAt: now, endedAt: now } },
        { new: true }
      );
      console.log(`    ended duplicate ${dup._id} -> ${terminated.status}`);
      await logEvent({
        module: 'telephony',
        action: 'CALL_DUP_RECONCILED',
        username: 'system',
        userId: String(d._id),
        role: 'AGENT',
        leadId: String(dup.lead || ''),
        message: `Race-created duplicate live call marked cancelled (kept newer ${keep._id})`,
        apiPath: '/server/scripts/reconcile-call-invariants.js',
        metadata: { callId: String(dup._id), callStatus: 'cancelled' },
      });
    }
  }

  // 2. Build the partial unique index that atomically enforces
  //    one-live-call-per-agent going forward. (Explicit name required: the
  //    legacy field-level `agent_1` index occupies the auto-generated name.)
  await Call.init();
  await Call.collection.createIndex(
    { agent: 1 },
    { unique: true, partialFilterExpression: { status: { $in: [...Call.CALL_LIVE] } }, name: 'one_live_call_per_agent' }
  );
  const idx = await Call.collection.indexes();
  console.log('\nINDEXES NOW:');
  for (const i of idx.filter(i => i.name === 'one_live_call_per_agent')) {
    console.log(`  ${i.name}: unique=${i.unique} partial=${JSON.stringify(i.partialFilterExpression)}`);
  }

  // 3. Final invariant check.
  const left = await Call.find({ status: { $in: [...Call.CALL_LIVE] } }).select('_id agent startedAt').sort({ startedAt: 1 }).lean();
  console.log('\nLIVE CALLS AFTER:', left.length);
  for (const c of left) console.log(`  ${c._id} agent=${String(c.agent).slice(0, 8)} ${c.startedAt.toISOString()}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });