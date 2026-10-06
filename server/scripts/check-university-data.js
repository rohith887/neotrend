const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://tasa_app:VDGq3ur3dQVnSeYCymLbrzVK@164.52.223.98:27017/tasa_crm?authSource=tasa_crm';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // Check countries
  const countries = await db.collection('countries').find({}).toArray();
  console.log('=== COUNTRIES (' + countries.length + ') ===');
  countries.forEach(c => console.log(JSON.stringify({ _id: c._id, name: c.name, code: c.code, isActive: c.isActive })));

  // Check universities
  const total = await db.collection('universities').countDocuments();
  console.log('\n=== UNIVERSITIES (total: ' + total + ') ===');

  const unis = await db.collection('universities').find({}).limit(10).toArray();
  unis.forEach(u => console.log(JSON.stringify({
    _id: u._id,
    name: u.name,
    country: u.country,
    countryType: typeof u.country,
    countryBsonType: u.country ? u.country.constructor.name : 'null',
    isActive: u.isActive,
  })));

  // Check for string country values (non-ObjectId)
  const stringCountries = await db.collection('universities').find({ country: { $ne: null, $type: 'string' } }).limit(10).toArray();
  console.log('\n=== UNIVERSITIES WITH STRING COUNTRY (' + stringCountries.length + ' found) ===');
  stringCountries.forEach(u => console.log(JSON.stringify({ name: u.name, country: u.country })));

  // Check for null country
  const nullCountry = await db.collection('universities').countDocuments({ country: null });
  console.log('\nUniversities with null country: ' + nullCountry);

  // Check for valid ObjectId country
  const objectIdCountry = await db.collection('universities').countDocuments({ $expr: { $eq: [{ $type: '$country' }, 'objectId'] } });
  console.log('Universities with ObjectId country: ' + objectIdCountry);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
