const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://tasa_app:VDGq3ur3dQVnSeYCymLbrzVK@164.52.223.98:27017/tasa_crm?authSource=tasa_crm';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // Simulate what the listUniversities service returns (after populate)
  const unis = await db.collection('universities').find({}).limit(3).toArray();
  const countryIds = [...new Set(unis.map(u => String(u.country)))];
  const countries = await db.collection('countries').find({ _id: { $in: countryIds.map(id => new mongoose.Types.ObjectId(id)) } }).toArray();
  const countryMap = Object.fromEntries(countries.map(c => [String(c._id), c]));

  console.log('=== RAW UNIVERSITY DOCS (3 sample) ===');
  unis.forEach(u => console.log(JSON.stringify(u, null, 2)));

  console.log('\n=== AFTER POPULATE SIMULATION ===');
  unis.forEach(u => {
    const populated = {
      _id: u._id,
      name: u.name,
      country: countryMap[String(u.country)] || null,
      isActive: u.isActive,
      createdAt: u.createdAt,
    };
    console.log(JSON.stringify(populated, null, 2));
  });

  // Also check the normalize function in the frontend
  console.log('\n=== CHECK: what frontend normalize() would produce ===');
  unis.forEach(u => {
    const c = countryMap[String(u.country)];
    const normalized = {
      _id: String(u._id),
      name: u.name,
      country: c ? { _id: String(c._id), name: c.name, code: c.code } : null,
      isActive: u.isActive,
    };
    console.log(JSON.stringify(normalized));
  });

  await mongoose.disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
