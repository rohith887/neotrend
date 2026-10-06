/**
 * Fix: copy institutionName → name for all universities that are missing the name field.
 * These were imported via CSV with the wrong field name.
 */
const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://tasa_app:VDGq3ur3dQVnSeYCymLbrzVK@164.52.223.98:27017/tasa_crm?authSource=tasa_crm';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const col = db.collection('universities');

  const needsFix = await col.countDocuments({ name: { $exists: false }, institutionName: { $exists: true } });
  console.log(`Universities missing 'name' but having 'institutionName': ${needsFix}`);

  if (needsFix === 0) {
    console.log('Nothing to fix.');
    await mongoose.disconnect();
    process.exit(0);
    return;
  }

  const result = await col.updateMany(
    { name: { $exists: false }, institutionName: { $exists: true } },
    [{ $set: { name: '$institutionName' } }]
  );
  console.log(`Updated ${result.modifiedCount} universities: institutionName → name`);

  // Verify
  const stillMissing = await col.countDocuments({ name: { $exists: false } });
  const hasName = await col.countDocuments({ name: { $exists: true } });
  console.log(`After fix: ${hasName} with name, ${stillMissing} still missing`);

  await mongoose.disconnect();
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
