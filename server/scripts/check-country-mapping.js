const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://tasa_app:VDGq3ur3dQVnSeYCymLbrzVK@164.52.223.98:27017/tasa_crm?authSource=tasa_crm';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // Get all unique country string values in universities
  const uniqueCountries = await db.collection('universities').aggregate([
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();
  console.log('=== UNIQUE COUNTRY VALUES IN UNIVERSITIES ===');
  uniqueCountries.forEach(c => console.log(JSON.stringify({ country: c._id, count: c.count })));

  // Get all country names in the countries collection
  const countries = await db.collection('countries').find({}).toArray();
  console.log('\n=== COUNTRY NAMES IN COUNTRIES COLLECTION ===');
  countries.forEach(c => console.log(JSON.stringify({ _id: String(c._id), name: c.name, code: c.code })));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
