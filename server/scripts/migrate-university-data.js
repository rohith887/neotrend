/**
 * One-time migration of raw imported university documents to the app schema.
 *
 * Before: { institutionName: "…", country: "USA" | "Canada" | …, city, stateRegion, owner }
 * After:  { institutionName: "…", country: <Country._id>,        city, stateRegion,
 *           owner: "Universities", isActive: true }
 *
 * Resolution order for country strings (NO new Country docs are created):
 *   1. exact Country.name (case-insensitive)
 *   2. Country.code (case-insensitive)
 *   3. alias table ("USA" → "United States", "UK" → "United Kingdom", …)
 *
 * Also backfills: isActive: true (missing on all raw rows),
 *                 owner: "Universities" (if missing/empty),
 *                 institutionName ← name (legacy safety net).
 *
 * Run: node scripts/migrate-university-data.js [--dry-run]
 */

const mongoose = require('mongoose');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://tasa_app:VDGq3ur3dQVnSeYCymLbrzVK@164.52.223.98:27017/tasa_crm?authSource=tasa_crm';

// Same alias table as src/services/university.service.js
const COUNTRY_ALIASES = {
  usa: 'United States',
  us: 'United States',
  'united states of america': 'United States',
  'u.s.a.': 'United States',
  'u.s.a': 'United States',
  uk: 'United Kingdom',
  'great britain': 'United Kingdom',
  england: 'United Kingdom',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const unis = db.collection('universities');
  const countriesCol = db.collection('countries');

  // ── Build Country lookup maps ─────────────────────────────────────
  const countries = await countriesCol.find({}).toArray();
  const byLowerName = new Map(countries.map((c) => [String(c.name).toLowerCase(), c]));
  const byLowerCode = new Map(countries.filter((c) => c.code).map((c) => [String(c.code).toLowerCase(), c]));

  console.log(`Countries loaded: ${countries.length} · Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Only touch docs that still need fixing
  const stale = {
    $or: [
      { country: { $type: 'string' } },
      { isActive: { $exists: false } },
      { owner: { $in: [null, ''] } },
      { owner: { $exists: false } },
    ],
  };

  const total = await unis.countDocuments({});
  const todo = await unis.countDocuments(stale);
  console.log(`Universities: ${total} total · ${todo} needing migration`);

  // Pre-resolve every distinct string value so failures are visible up front
  const distinctValues = await unis.aggregate([
    { $match: { country: { $type: 'string' } } },
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  const unresolved = [];
  const resolved = new Map();
  for (const { _id: raw, count } of distinctValues) {
    const lower = String(raw).toLowerCase();
    let doc = byLowerName.get(lower) || null;
    if (!doc) doc = byLowerCode.get(lower) || null;
    if (!doc && COUNTRY_ALIASES[lower]) doc = byLowerName.get(COUNTRY_ALIASES[lower].toLowerCase()) || null;
    if (doc) {
      resolved.set(raw, doc._id);
      console.log(`  "${raw}" (${count}) → "${doc.name}" (${doc._id})`);
    } else {
      unresolved.push({ raw, count });
      console.log(`  "${raw}" (${count}) → NO MATCH — will NOT be touched`);
    }
  }

  if (unresolved.length) {
    console.error(`\nABORT: ${unresolved.length} country value(s) have no matching Country document.`);
    process.exit(1);
  }

  // ── Migrate ───────────────────────────────────────────────────────
  let updated = 0;
  const cursor = unis.find(stale);

  for await (const u of cursor) {
    const set = {};

    if (typeof u.country === 'string') {
      const oid = resolved.get(u.country);
      if (!oid) continue; // safety — already aborted above
      set.country = oid;
    }
    if (u.isActive === undefined || u.isActive === null) set.isActive = true;
    if (!u.owner) set.owner = 'Universities';
    if (!u.institutionName && u.name) set.institutionName = u.name; // legacy safety net

    if (Object.keys(set).length === 0) continue;

    if (dryRun) {
      updated++;
    } else {
      const r = await unis.updateOne({ _id: u._id }, { $set: set });
      updated += r.modifiedCount;
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] Would update' : 'Updated'}: ${updated} documents`);
  console.log('No Country records were created or modified.');

  // ── Verify ────────────────────────────────────────────────────────
  if (!dryRun) {
    const remainingStrings = await unis.countDocuments({ country: { $type: 'string' } });
    const withRef = await unis.countDocuments({ country: { $type: 'objectId' } });
    const activeCount = await unis.countDocuments({ isActive: true });
    const ownedCount = await unis.countDocuments({ owner: 'Universities' });
    const namedCount = await unis.countDocuments({ institutionName: { $exists: true, $ne: '' } });
    console.log('\n=== VERIFICATION ===');
    console.log(`  country as ObjectId:     ${withRef}/${total}`);
    console.log(`  country still a string:  ${remainingStrings}`);
    console.log(`  isActive=true:           ${activeCount}`);
    console.log(`  owner="Universities":    ${ownedCount}`);
    console.log(`  institutionName present: ${namedCount}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
