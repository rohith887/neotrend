const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const University = require('../models/University');
const Country = require('../models/Country');
const ApiError = require('../utils/ApiError');
const { parseListQuery } = require('../middleware/paginate');

const COUNTRY_FIELDS = 'name code';

const normalize = (v) => String(v || '').trim();
const normalizeOwnership = (v) => String(v || '').trim().toUpperCase();
const VALID_OWNERSHIP = ['PVT', 'PLC'];

// Escape user-supplied strings before embedding them in a RegExp so special
// characters ( ( ) [ ] { } + * ? ^ $ \ | . ) are treated literally instead of
// becoming regex metacharacters (which caused 500s / surprising match sets).
const escapeRegex = (v) => String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Country aliases for CSV normalization (maps common aliases → canonical Country name)
const COUNTRY_ALIASES = new Map([
  ['usa', 'United States'],
  ['us', 'United States'],
  ['united states', 'United States'],
  ['united states of america', 'United States'],
  ['u.s.a.', 'United States'],
  ['u.s.a', 'United States'],
  ['uk', 'United Kingdom'],
  ['united kingdom', 'United Kingdom'],
  ['great britain', 'United Kingdom'],
  ['england', 'United Kingdom'],
]);

/**
 * Resolve a country filter value to a Country document (its _id, name and code)
 * so the caller can match universities that store country as an ObjectId
 * reference AND universities that (legacy data) store country as a plain
 * string name / code.
 *
 * Accepts: Country ObjectId string, country name, or country code.
 * Returns: { _id: ObjectId, name, code } or null when unresolvable.
 */
const resolveCountryFilter = async (value) => {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  let country = null;

  if (mongoose.Types.ObjectId.isValid(trimmed)) {
    country = await Country.findById(new mongoose.Types.ObjectId(trimmed)).lean();
  } else {
    country = await Country.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { code: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
      ],
    }).lean();
  }

  if (!country) return null;
  return { _id: country._id, name: String(country.name || ''), code: String(country.code || '') };
};

// Build a `country` query condition that matches BOTH the canonical ObjectId
// reference and the legacy plain-string country name / code. This is what makes
// the student finder actually return results when university documents still
// store country as a string (e.g. "UAE") instead of a Country ObjectId.
const countryQuery = (resolved) => {
  const ors = [{ country: new mongoose.Types.ObjectId(resolved._id) }];
  if (resolved.name) ors.push({ country: { $regex: new RegExp(`^${escapeRegex(resolved.name)}$`, 'i') } });
  if (resolved.code) ors.push({ country: { $regex: new RegExp(`^${escapeRegex(resolved.code)}$`, 'i') } });
  return { $or: ors };
};

/**
 * List universities with search, filtering, pagination, and sorting.
 */
const listUniversities = async (rawQuery) => {
  const {
    country: rawCountry,
    ownership: rawOwnership,
    orderBy,
    ...restQuery
  } = rawQuery;
  const { query, sort, meta } = parseListQuery(restQuery, ['isActive']);

  // User input is escaped so special regex characters are matched literally.
  if (rawQuery.search) {
    query.institutionName = { $regex: new RegExp(escapeRegex(rawQuery.search.trim())), $options: 'i' };
  }

  // Phase 3 (student university finder): optional region/city narrowing.
  // Additive only — existing callers that omit these params are unaffected.
  if (rawQuery.stateRegion && String(rawQuery.stateRegion).trim()) {
    query.stateRegion = { $regex: new RegExp(escapeRegex(String(rawQuery.stateRegion).trim())), $options: 'i' };
  }
  if (rawQuery.city && String(rawQuery.city).trim()) {
    query.city = { $regex: new RegExp(escapeRegex(String(rawQuery.city).trim())), $options: 'i' };
  }

  const ownership = normalizeOwnership(rawOwnership);
  if (VALID_OWNERSHIP.includes(ownership)) {
    query.ownership = ownership;
  }

  if (rawCountry) {
    const resolved = await resolveCountryFilter(rawCountry);
    if (resolved) {
      // Merge at the query TOP LEVEL ($or) — never as `query.country = {...}`
      // (that would try to cast the whole $or object as a single country value
      // and throw "Can't use $or").
      Object.assign(query, countryQuery(resolved));
    } else {
      return {
        universities: [],
        total: 0,
        page: meta.page,
        pages: 0,
        limit: meta.limit,
      };
    }
  }

  // isActive handling. parseListQuery copies query params literally, so the
  // param arrives as the STRING "true"/"false". Normalize it before matching.
  // isActive:true must also not silently drop legacy documents that predate
  // the isActive field (schema default is true) — treat "active" as "not
  // explicitly inactive" ({ $ne:false }) so existing universities return.
  if (query.isActive !== undefined) {
    const v = String(query.isActive).toLowerCase();
    query.isActive =
      v === 'false' || v === '0' ? false : { $ne: false };
  }

  // Optional ordering: group results by country name, then institution name.
  // `orderBy=countryName` uses an aggregation ($lookup on country) because the
  // country reference cannot be sorted by its name through a plain .sort().
  // Falling back to the documented sort happens for all other callers.
  if (orderBy === 'countryName') {
    return listUniversitiesGroupedByCountry({ query, meta });
  }

  // Use the native MongoDB driver (not the Mongoose model) so the country
  // filter can be expressed as a top-level $or over the `country` field with
  // ObjectId AND $regex clauses. Mongoose's SchemaType would otherwise try to
  // cast every clause as a single country value ("Can't use $or"/"$regex").
  const [docs, total] = await Promise.all([
    University.collection.find(query).sort(sort).skip(meta.skip).limit(meta.limit).toArray(),
    University.collection.countDocuments(query),
  ]);

  // Reproduce populate('country') for this page so the response keeps the
  // { _id, name, code } shape the UI expects — works for ObjectId references
  // and falls back to the raw string for legacy string-country documents.
  const countryIds = [
    ...new Set(
      docs
        .map((d) => d.country)
        .filter((c) => c != null && mongoose.Types.ObjectId.isValid(String(c)))
        .map((c) => String(c))
    ),
  ];
  const countryDocs = countryIds.length
    ? await Country.find({ _id: { $in: countryIds } }).select(COUNTRY_FIELDS).lean()
    : [];
  const countryById = new Map(countryDocs.map((c) => [String(c._id), c]));

  const universities = docs.map((d) => {
    const c = d.country;
    if (c != null && mongoose.Types.ObjectId.isValid(String(c))) {
      const found = countryById.get(String(c));
      d.country = found ? { _id: found._id, name: found.name, code: found.code } : { _id: c, name: null, code: null };
    } else if (c != null) {
      // Legacy: country stored as a plain string name.
      d.country = { _id: null, name: String(c), code: null };
    }
    return d;
  });

  return {
    universities,
    total,
    page: meta.page,
    pages: Math.ceil(total / meta.limit) || 0,
    limit: meta.limit,
  };
};

/**
 * Deterministic, location-grouped ordering for the student finder.
 *
 * Uses ONLY existing data (country name + institutionName); no fabricated
 * relevance scores. Because country is a stored reference (ObjectId) that the
 * paginated find cannot sort by name through .sort(), we $lookup the country
 * name, sort by it, then by institution name, and paginate server-side.
 * Keeps the same response shape as the plain .find() path.
 */
const listUniversitiesGroupedByCountry = async ({ query, meta }) => {
  const [docs, total] = await Promise.all([
    University.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'countries',
          localField: 'country',
          foreignField: '_id',
          as: '_country',
        },
      },
      { $unwind: { path: '$_country', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          // For legacy documents that store country as a string rather than a
          // reference, the $lookup resolves nothing — fall back to the stored
          // text so they are still grouped sensibly instead of dropped/blank.
          _countryName: {
            $cond: [
              { $eq: ['$_country', null] },
              { $cond: [{ $eq: [{ $type: '$country' }, 'string'] }, '$country', ''] },
              { $ifNull: ['$_country.name', ''] },
            ],
          },
          _countryCode: {
            $cond: [{ $eq: ['$_country', null] }, '', { $ifNull: ['$_country.code', ''] }],
          },
        },
      },
      { $sort: { _countryName: 1, institutionName: 1, _id: 1 } },
      { $skip: meta.skip },
      { $limit: meta.limit },
      {
        $project: {
          _id: 1,
          institutionName: 1,
          city: 1,
          stateRegion: 1,
          ownership: 1,
          owner: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          country: {
            _id: '$_country._id',
            name: '$_countryName',
            code: '$_countryCode',
          },
        },
      },
    ]),
    University.collection.countDocuments(query),
  ]);

  return {
    universities: docs,
    total,
    page: meta.page,
    pages: Math.ceil(total / meta.limit) || 0,
    limit: meta.limit,
  };
};

/**
 * Get a single university by ID.
 */
const getUniversityById = async (id) => {
  const doc = await University.findById(id).populate('country', COUNTRY_FIELDS).lean();
  if (!doc) throw new ApiError(404, 'University not found');
  return doc;
};

/**
 * Create a new university. Prevents duplicate (institutionName, country, stateRegion, city)
 * — the same key enforced by the unique index.
 */
const createUniversity = async ({ institutionName, country, city, stateRegion, ownership }) => {
  const trimmed = normalize(institutionName);
  if (!trimmed) throw new ApiError(400, 'University name is required');

  if (!country) throw new ApiError(400, 'Country is required');
  if (!mongoose.Types.ObjectId.isValid(String(country))) {
    throw new ApiError(400, 'Country must be a valid id');
  }
  const countryId = new mongoose.Types.ObjectId(String(country));

  const cityVal = normalize(city);
  const stateVal = normalize(stateRegion);

  const existing = await University.findOne({
    institutionName: trimmed,
    country: countryId,
    stateRegion: stateVal,
    city: cityVal,
  });
  if (existing) throw new ApiError(409, 'A university with this name already exists in this country');

  const ownershipVal = ownership ? normalizeOwnership(ownership) : 'PVT';
  if (!VALID_OWNERSHIP.includes(ownershipVal)) {
    throw new ApiError(400, `Ownership must be one of: ${VALID_OWNERSHIP.join(', ')}`);
  }

  const doc = await University.create({
    institutionName: trimmed,
    country: countryId,
    city: cityVal,
    stateRegion: stateVal,
    ownership: ownershipVal,
    owner: 'Universities',
    isActive: true,
  });

  return University.findById(doc._id).populate('country', COUNTRY_FIELDS).lean();
};

/**
 * Update a university. Prevents duplicate (institutionName, country, stateRegion, city).
 */
const updateUniversity = async (id, payload = {}) => {
  const doc = await University.findById(id);
  if (!doc) throw new ApiError(404, 'University not found');

  if (payload.institutionName !== undefined) {
    const trimmed = normalize(payload.institutionName);
    if (!trimmed) throw new ApiError(400, 'University name cannot be empty');
    doc.institutionName = trimmed;
  }

  // Legacy clients may still send `name` — accept it as an alias.
  if (payload.institutionName === undefined && payload.name !== undefined) {
    const trimmed = normalize(payload.name);
    if (!trimmed) throw new ApiError(400, 'University name cannot be empty');
    doc.institutionName = trimmed;
  }

  if (payload.country !== undefined) {
    if (payload.country && !mongoose.Types.ObjectId.isValid(String(payload.country))) {
      throw new ApiError(400, 'Country must be a valid id');
    }
    doc.country = payload.country || undefined;
  }

  if (payload.city !== undefined) doc.city = normalize(payload.city);
  if (payload.stateRegion !== undefined) doc.stateRegion = normalize(payload.stateRegion);

  if (payload.ownership !== undefined) {
    const ownershipVal = normalizeOwnership(payload.ownership);
    if (!VALID_OWNERSHIP.includes(ownershipVal)) {
      throw new ApiError(400, `Ownership must be one of: ${VALID_OWNERSHIP.join(', ')}`);
    }
    doc.ownership = ownershipVal;
  }

  if (payload.isActive !== undefined) {
    doc.isActive = !!payload.isActive;
  }

  // Check uniqueness against the compound unique index before saving
  const dup = await University.findOne({
    institutionName: doc.institutionName,
    country: doc.country,
    stateRegion: doc.stateRegion || '',
    city: doc.city || '',
    _id: { $ne: id },
  });
  if (dup) throw new ApiError(409, 'A university with this name already exists in this country');

  await doc.save();
  return University.findById(id).populate('country', COUNTRY_FIELDS).lean();
};

/**
 * Soft-delete a university (isActive = false).
 */
const removeUniversity = async (id) => {
  const doc = await University.findById(id);
  if (!doc) throw new ApiError(404, 'University not found');

  doc.isActive = false;
  await doc.save();
  return University.findById(id).populate('country', COUNTRY_FIELDS).lean();
};

// ─── Import: CSV column aliases ──────────────────────────────────────
const COLUMN_ALIASES = {
  university: 'institutionName',
  universityname: 'institutionName',
  institutionname: 'institutionName',
  name: 'institutionName',
  country: 'country',
  city: 'city',
  'state / region': 'stateRegion',
  stateregion: 'stateRegion',
  state: 'stateRegion',
  region: 'stateRegion',
  ownership: 'ownership',
  ownershiptype: 'ownership',
};

const colKey = (raw) => {
  const k = String(raw || '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
  return COLUMN_ALIASES[k] || k;
};

// Mirror of the compound unique index key
const uniKey = (institutionName, country, stateRegion, city) =>
  `${normalize(institutionName)}__${String(country ?? '')}__${normalize(stateRegion)}__${normalize(city)}`;

/**
 * Parse uploaded CSV/XLSX buffer into row objects.
 */
const parseImportFile = async (fileBuffer, filename) => {
  const ext = String(filename || '').split('.').pop()?.toLowerCase();
  if (ext === 'xls') {
    throw new ApiError(400, 'Legacy .xls format is not supported. Please re-save as .xlsx or .csv.');
  }

  const workbook = new ExcelJS.Workbook();
  if (ext === 'csv') {
    await workbook.csv.read(fileBuffer);
  } else {
    await workbook.xlsx.load(fileBuffer);
  }

  const sheet = workbook.getWorksheet(1);
  if (!sheet || sheet.rowCount < 2) {
    throw new ApiError(400, 'The uploaded file is empty or has no data rows.');
  }

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = colKey(cell.value);
  });

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const record = {};
    let hasData = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      const val = cell.value != null ? String(cell.value).trim() : '';
      if (val) hasData = true;
      record[key] = val;
    });
    if (hasData) {
      rows.push({ _rowNumber: rowNumber, ...record });
    }
  });

  return rows;
};

/**
 * Resolve CSV country string to Country document.
 * Supports alias normalization (USA → United States).
 * Returns { countryDoc, error? }.
 */
const resolveCountryFromString = async (raw, countryMap) => {
  const trimmed = normalize(raw);
  if (!trimmed) return { countryDoc: null, error: 'Country is required' };

  // Try alias normalization first
  const aliasTarget = COUNTRY_ALIASES.get(trimmed.toLowerCase());
  const lookupName = aliasTarget || trimmed;

  // Check in-memory map first
  const cached = countryMap.get(lookupName.toLowerCase());
  if (cached) return { countryDoc: cached };

  // Try exact match
  const countryDoc = await Country.findOne({
    name: { $regex: new RegExp(`^${lookupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  }).lean();

  if (countryDoc) {
    countryMap.set(countryDoc.name.toLowerCase(), countryDoc);
    return { countryDoc };
  }

  return { countryDoc: null, error: `Country '${raw}' not found` };
};

/**
 * Preview import: parse + validate rows without inserting.
 * Returns { rows, summary }.
 */
const previewImport = async (fileBuffer, filename) => {
  const rows = await parseImportFile(fileBuffer, filename);

  // Load all countries into a map for fast lookup
  const countryDocs = await Country.find({}).lean();
  const countryMap = new Map();
  for (const c of countryDocs) {
    countryMap.set(c.name.toLowerCase(), c);
    if (c.code) countryMap.set(c.code.toLowerCase(), c);
  }

  // Load existing universities for duplicate detection.
  // Key mirrors the compound unique index (institutionName, country, stateRegion, city).
  const existingUnis = await University.find({}, { institutionName: 1, country: 1, stateRegion: 1, city: 1 }).lean();
  const existingKeys = new Set();
  for (const u of existingUnis) {
    existingKeys.add(uniKey(u.institutionName, u.country, u.stateRegion, u.city));
  }

  const validated = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  const unknownCountries = new Set();
  const invalidOwnershipValues = new Set();

  for (const row of rows) {
    const errors = [];
    const name = normalize(row.institutionName);
    const city = normalize(row.city);
    const stateRegion = normalize(row.stateRegion);
    const ownershipRaw = normalizeOwnership(row.ownership);
    const countryRaw = normalize(row.country);

    // Validate name
    if (!name) errors.push('University name is required');

    // Validate country
    let countryDoc = null;
    if (!countryRaw) {
      errors.push('Country is required');
    } else {
      const result = await resolveCountryFromString(countryRaw, countryMap);
      if (result.error) {
        errors.push(result.error);
        unknownCountries.add(countryRaw);
      } else {
        countryDoc = result.countryDoc;
      }
    }

    // Validate ownership
    let ownership = 'PVT';
    if (row.ownership !== undefined && row.ownership !== '') {
      if (!VALID_OWNERSHIP.includes(ownershipRaw)) {
        errors.push(`Invalid ownership '${row.ownership}'. Must be PVT or PLC`);
        invalidOwnershipValues.add(row.ownership);
      } else {
        ownership = ownershipRaw;
      }
    }

    // Check duplicate against the compound unique index key
    if (countryDoc) {
      const key = uniKey(name, String(countryDoc._id), stateRegion, city);
      if (existingKeys.has(key)) {
        duplicateCount++;
      }
    }

    const isValid = errors.length === 0;
    if (isValid) validCount++;
    else invalidCount++;

    validated.push({
      _rowNumber: row._rowNumber,
      institutionName: name,
      country: countryRaw,
      _countryId: countryDoc ? String(countryDoc._id) : null,
      city,
      stateRegion,
      ownership,
      isValid,
      errors,
    });
  }

  return {
    rows: validated,
    summary: {
      total: rows.length,
      valid: validCount,
      invalid: invalidCount,
      duplicates: duplicateCount,
      unknownCountries: [...unknownCountries],
      invalidOwnershipValues: [...invalidOwnershipValues],
    },
  };
};

/**
 * Execute the import: bulk upsert based on name+country.
 * Returns { imported, updated, skipped, failed, errors[] }.
 */
const executeImport = async (rows) => {
  const validRows = rows.filter((r) => r.isValid);
  if (!validRows.length) {
    return { imported: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  }

  const operations = [];
  const errors = [];

  for (const row of validRows) {
    const countryId = new mongoose.Types.ObjectId(row._countryId);
    operations.push({
      updateOne: {
        filter: {
          institutionName: row.institutionName,
          country: countryId,
          stateRegion: row.stateRegion || '',
          city: row.city || '',
        },
        update: {
          $set: {
            institutionName: row.institutionName,
            country: countryId,
            city: row.city || '',
            stateRegion: row.stateRegion || '',
            ownership: row.ownership || 'PVT',
            owner: 'Universities',
            isActive: true,
          },
        },
        upsert: true,
      },
    });
  }

  let imported = 0;
  let updated = 0;

  try {
    const result = await University.bulkWrite(operations, { ordered: false });
    imported = result.upsertedCount || 0;
    updated = result.modifiedCount || 0;
  } catch (err) {
    // If bulk write partially fails, fall back to one-by-one for the failed ops
    if (err.writeErrors) {
      for (const we of err.writeErrors) {
        const idx = we.index;
        errors.push({
          row: validRows[idx]?._rowNumber,
          message: we.errmsg || 'Unknown error',
        });
      }
      imported = (err.result?.upsertedCount) || 0;
      updated = (err.result?.modifiedCount) || 0;
    } else {
      throw err;
    }
  }

  const skipped = rows.length - validRows.length;

  return { imported, updated, skipped, failed: errors.length, errors };
};

/**
 * Generate a CSV template for university import.
 */
const generateTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Universities');

  sheet.columns = [
    { header: 'University', key: 'institutionName', width: 40 },
    { header: 'Country', key: 'country', width: 20 },
    { header: 'City', key: 'city', width: 20 },
    { header: 'State / Region', key: 'stateRegion', width: 15 },
    { header: 'Ownership', key: 'ownership', width: 12 },
  ];

  // Style header row
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Add example row
  sheet.addRow({
    institutionName: 'Alaska Career College',
    country: 'USA',
    city: 'Anchorage',
    stateRegion: 'AK',
    ownership: 'PVT',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  listUniversities,
  getUniversityById,
  createUniversity,
  updateUniversity,
  removeUniversity,
  previewImport,
  executeImport,
  generateTemplate,
};
