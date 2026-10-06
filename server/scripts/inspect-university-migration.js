/**
 * READ-ONLY inspection for the University schema migration.
 * Writes nothing — safe to run against production.
 *
 * Answers, before any code/data change:
 *   1. Existing Country documents (name / code / isActive)
 *   2. Exact mapping path for every distinct universities.country value
 *      (objectId-ref → exact name → case-insensitive name → code → alias → NO MATCH)
 *   3. Universities whose country cannot be resolved to a Country document
 *   4. owner / isActive distributions
 *   +  field-shape census (name vs institutionName), current indexes,
 *      empty city/stateRegion counts, and duplicate-key preview under the
 *      NEW unique index (institutionName+country+stateRegion+city).
 *
 * Run: node scripts/inspect-university-migration.js
 */

const mongoose = require('mongoose');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://tasa_app:VDGq3ur3dQVnSeYCymLbrzVK@164.52.223.98:27017/tasa_crm?authSource=tasa_crm';

// Same alias table as university.service.js (CSV normalization)
const COUNTRY_ALIASES = {
  usa: 'United States',
  us: 'United States',
  'united states': 'United States',
  'united states of america': 'United States',
  'u.s.a.': 'United States',
  'u.s.a': 'United States',
  uk: 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'great britain': 'United Kingdom',
  england: 'United Kingdom',
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const unis = db.collection('universities');
  const countriesCol = db.collection('countries');

  // ── 0. Totals & field-shape census ────────────────────────────────
  const total = await unis.countDocuments({});
  console.log(`\n=== UNIVERSITIES: ${total} total ===`);

  const shapes = await unis
    .aggregate([
      {
        $project: {
          nameType: { $type: '$name' },
          instType: { $type: '$institutionName' },
          countryType: { $type: '$country' },
          ownerType: { $type: '$owner' },
          cityEmpty: { $in: [{ $ifNull: ['$city', ''] }, ['', null]] },
          stateEmpty: { $in: [{ $ifNull: ['$stateRegion', ''] }, ['', null]] },
        },
      },
      {
        $group: {
          _id: { n: '$nameType', i: '$instType', c: '$countryType', o: '$ownerType' },
          count: { $sum: 1 },
          cityEmpty: { $sum: { $cond: ['$cityEmpty', 1, 0] } },
          stateEmpty: { $sum: { $cond: ['$stateEmpty', 1, 0] } },
        },
      },
    ])
    .toArray();
  console.log('\n=== FIELD-SHAPE CENSUS ===');
  shapes.forEach((s) =>
    console.log(
      JSON.stringify({
        name: s._id.n,
        institutionName: s._id.i,
        country: s._id.c,
        owner: s._id.o,
        count: s.count,
        emptyCity: s.cityEmpty,
        emptyStateRegion: s.stateEmpty,
      })
    )
  );

  // ── 1. Country collection ─────────────────────────────────────────
  const countries = await countriesCol.find({}).toArray();
  console.log(`\n=== COUNTRIES COLLECTION (${countries.length} docs) ===`);
  countries.forEach((c) =>
    console.log(JSON.stringify({ _id: String(c._id), name: c.name, code: c.code, isActive: c.isActive }))
  );
  const byLowerName = new Map(countries.map((c) => [String(c.name).toLowerCase(), c]));
  const byLowerCode = new Map(
    countries.filter((c) => c.code).map((c) => [String(c.code).toLowerCase(), c])
  );

  // ── 2. Distinct country values in universities + resolution path ──
  const countryValues = await unis
    .aggregate([
      { $group: { _id: { t: { $type: '$country' }, v: '$country' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();

  console.log(`\n=== DISTINCT universities.country VALUES (${countryValues.length}) ===`);
  const unresolved = [];
  let resolvedDocs = 0;

  for (const entry of countryValues) {
    const { t, v } = entry._id;
    if (t === 'objectId') {
      const ok = countries.some((c) => String(c._id) === String(v));
      console.log(JSON.stringify({ value: String(v), type: 'objectId', count: entry.count, result: ok ? 'VALID REF' : 'MISSING COUNTRY DOC' }));
      if (ok) resolvedDocs += entry.count;
      else unresolved.push({ value: String(v), count: entry.count });
      continue;
    }

    const raw = String(v);
    const lower = raw.toLowerCase();
    let countryDoc = byLowerName.get(lower) || null;
    let path = countryDoc ? 'exact name' : null;

    if (!countryDoc) {
      countryDoc = byLowerCode.get(lower) || null;
      path = countryDoc ? `code (${countryDoc.code})` : null;
    }
    if (!countryDoc && COUNTRY_ALIASES[lower]) {
      countryDoc = byLowerName.get(COUNTRY_ALIASES[lower].toLowerCase()) || null;
      path = countryDoc ? `alias "${raw}" → "${COUNTRY_ALIASES[lower]}"` : null;
    }

    if (countryDoc) {
      resolvedDocs += entry.count;
      console.log(
        JSON.stringify({
          value: raw,
          type: t,
          count: entry.count,
          result: `→ Country "${countryDoc.name}" (${String(countryDoc._id)}) [${path}]`,
        })
      );
    } else {
      unresolved.push({ value: raw, count: entry.count });
      console.log(JSON.stringify({ value: raw, type: t, count: entry.count, result: 'NO MATCH' }));
    }
  }

  // ── 3. Unresolved summary ─────────────────────────────────────────
  console.log('\n=== UNRESOLVED COUNTRIES (no matching Country doc) ===');
  if (!unresolved.length) console.log('None — every university country resolves.');
  unresolved.forEach((u) => console.log(JSON.stringify(u)));
  const nullish = await unis.countDocuments({ $or: [{ country: null }, { country: { $exists: false } }] });
  console.log(`Universities with null/missing country: ${nullish}`);
  console.log(`Resolvable via existing Countries: ${resolvedDocs}/${total}`);

  // ── 4. owner / isActive distributions ────────────────────────────
  const owners = await unis
    .aggregate([{ $group: { _id: '$owner', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .toArray();
  console.log('\n=== OWNER DISTRIBUTION ===');
  owners.forEach((o) => console.log(JSON.stringify({ owner: o._id, count: o.count })));

  const active = await unis
    .aggregate([
      { $group: { _id: { $type: '$isActive' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();
  console.log('\n=== isActive PRESENCE (bson type: boolean=real value, missing=null-ish) ===');
  active.forEach((a) => console.log(JSON.stringify({ isActiveType: a._id, count: a.count })));

  // ── 5. Current indexes ───────────────────────────────────────────
  const indexes = await unis.indexes();
  console.log('\n=== CURRENT INDEXES ON universities ===');
  indexes.forEach((ix) =>
    console.log(JSON.stringify({ name: ix.name, key: ix.key, unique: ix.unique || false }))
  );

  // ── 6. Duplicate-key preview under the NEW unique index ─────────
  const dups = await unis
    .aggregate([
      {
        $group: {
          _id: {
            i: { $toLower: { $trim: { input: { $ifNull: ['$institutionName', '$name'] } } } },
            c: '$country',
            s: { $toLower: { $trim: { input: { $ifNull: ['$stateRegion', ''] } } } },
            ct: { $toLower: { $trim: { input: { $ifNull: ['$city', ''] } } } },
          },
          count: { $sum: 1 },
          samples: { $push: '$institutionName' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ])
    .toArray();
  console.log(`\n=== DUPLICATE KEYS UNDER NEW UNIQUE INDEX (top ${dups.length} groups) ===`);
  if (!dups.length) console.log('None — backfill will not hit E11000 on existing rows.');
  dups.forEach((d) =>
    console.log(JSON.stringify({ key: d._id, count: d.count, sample: d.samples[0] }))
  );

  // ── 7. Sample docs ───────────────────────────────────────────────
  const samples = await unis.find({}).limit(3).toArray();
  console.log('\n=== SAMPLE DOCS ===');
  samples.forEach((s) => console.log(JSON.stringify(s)));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
