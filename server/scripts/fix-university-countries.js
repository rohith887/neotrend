/**
 * Fix university country references.
 *
 * Problem: CSV import stored country as plain strings (e.g. "USA", "UK")
 * instead of resolving them to Country document ObjectIds.
 *
 * This script:
 * 1. Creates missing Country documents for any country string not already in the collection
 * 2. Builds an alias map (e.g. "USA" → "United States") to match string values to Country names
 * 3. Updates all universities to have proper Country ObjectId references
 *
 * Run: node scripts/fix-university-countries.js [--dry-run]
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://tasa_app:VDGq3ur3dQVnSeYCymLbrzVK@164.52.223.98:27017/tasa_crm?authSource=tasa_crm';

// Alias map: university string values → Country collection name
// Only include aliases where the names differ
const COUNTRY_ALIASES = {
  'USA':             'United States',
  'UK':              'United Kingdom',
  'US':              'United States',
  'GB':              'United Kingdom',
  'UAE':             'UAE', // matches directly
  'New Zealand':     'New Zealand', // matches directly
};

// ISO codes for countries we might need to create
const COUNTRY_CODES = {
  'Italy':           'IT',
  'Spain':           'ES',
  'Malaysia':        'MY',
  'France':          'FR',
  'Netherlands':     'NL',
  'Hungary':         'HU',
  'Austria':         'AT',
  'Portugal':        'PT',
  'Sweden':          'SE',
  'Finland':         'FI',
  'Switzerland':     'CH',
  'Norway':          'NO',
  'Denmark':         'DK',
  'Canada':          'CA',
  'United States':   'US',
  'United Kingdom':  'GB',
  'Australia':       'AU',
  'Germany':         'DE',
  'Ireland':         'IE',
  'New Zealand':     'NZ',
  'UAE':             'AE',
  'Singapore':       'SG',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const countriesCol = db.collection('countries');
  const universitiesCol = db.collection('universities');

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // 1. Get all unique country string values from universities
  const uniqueStrings = await universitiesCol.aggregate([
    { $match: { country: { $ne: null, $type: 'string' } } },
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  console.log(`Found ${uniqueStrings.length} unique country strings in universities`);

  // 2. Load existing countries
  const existingCountries = await countriesCol.find({}).toArray();
  const countryByName = Object.fromEntries(existingCountries.map(c => [c.name, c]));
  const countryByLower = Object.fromEntries(existingCountries.map(c => [c.name.toLowerCase(), c]));

  console.log(`Found ${existingCountries.length} existing Country documents`);

  // 3. Build the mapping: university string → Country ObjectId
  const stringToObjectId = {};
  const countriesToCreate = [];

  for (const entry of uniqueStrings) {
    const raw = entry._id;
    const count = entry.count;

    // Try alias first
    const aliased = COUNTRY_ALIASES[raw];
    if (aliased && countryByName[aliased]) {
      stringToObjectId[raw] = countryByName[aliased]._id;
      console.log(`  "${raw}" → "${aliased}" (${count} unis) [alias → existing]`);
      continue;
    }

    // Try exact name match
    if (countryByName[raw]) {
      stringToObjectId[raw] = countryByName[raw]._id;
      console.log(`  "${raw}" → "${raw}" (${count} unis) [exact match]`);
      continue;
    }

    // Try case-insensitive match
    const lower = raw.toLowerCase();
    if (countryByLower[lower]) {
      stringToObjectId[raw] = countryByLower[lower]._id;
      console.log(`  "${raw}" → "${countryByLower[lower].name}" (${count} unis) [case-insensitive]`);
      continue;
    }

    // Check alias that points to a name we can create
    const resolvedName = aliased || raw;
    if (countryByName[resolvedName]) {
      stringToObjectId[raw] = countryByName[resolvedName]._id;
      console.log(`  "${raw}" → "${resolvedName}" (${count} unis) [alias → existing]`);
      continue;
    }

    // Need to create a new Country document
    const code = COUNTRY_CODES[resolvedName] || resolvedName.substring(0, 2).toUpperCase();
    countriesToCreate.push({ name: resolvedName, code, rawString: raw, count });
    console.log(`  "${raw}" → "${resolvedName}" (${count} unis) [NEEDS CREATION]`);
  }

  // 4. Create missing Country documents
  if (countriesToCreate.length > 0) {
    console.log(`\nCreating ${countriesToCreate.length} missing Country documents...`);
    for (const c of countriesToCreate) {
      if (dryRun) {
        console.log(`  [DRY RUN] Would create: { name: "${c.name}", code: "${c.code}", isActive: true }`);
        stringToObjectId[c.rawString] = new mongoose.Types.ObjectId(); // placeholder
      } else {
        const result = await countriesCol.insertOne({
          name: c.name,
          code: c.code,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        stringToObjectId[c.rawString] = result.insertedId;
        console.log(`  Created "${c.name}" (${c.code}) with _id ${result.insertedId}`);
      }
    }
  }

  // 5. Update universities
  console.log('\nUpdating universities...');
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of uniqueStrings) {
    const raw = entry._id;
    const objectId = stringToObjectId[raw];
    if (!objectId) {
      console.log(`  SKIP: No mapping for "${raw}"`);
      skipped++;
      continue;
    }

    if (dryRun) {
      const count = await universitiesCol.countDocuments({ country: raw });
      console.log(`  [DRY RUN] Would update ${count} universities: "${raw}" → ObjectId(${objectId})`);
      updated += count;
    } else {
      try {
        const result = await universitiesCol.updateMany(
          { country: raw },
          { $set: { country: new mongoose.Types.ObjectId(String(objectId)) } }
        );
        console.log(`  Updated ${result.modifiedCount} universities: "${raw}" → ObjectId(${objectId})`);
        updated += result.modifiedCount;
      } catch (err) {
        console.error(`  ERROR updating "${raw}": ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);

  // 6. Verify
  if (!dryRun) {
    const remaining = await universitiesCol.countDocuments({ country: { $ne: null, $type: 'string' } });
    const withObjectId = await universitiesCol.countDocuments({ $expr: { $eq: [{ $type: '$country' }, 'objectId'] } });
    const withNull = await universitiesCol.countDocuments({ country: null });
    const total = await universitiesCol.countDocuments();
    console.log(`\nVerification:`);
    console.log(`  Total universities: ${total}`);
    console.log(`  With ObjectId country: ${withObjectId}`);
    console.log(`  With string country (remaining): ${remaining}`);
    console.log(`  With null country: ${withNull}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
