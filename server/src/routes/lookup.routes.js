/**
 * Lookup routes — read-only reference data used by the frontend
 * to populate dropdowns (countries, universities).
 *
 * GET /api/lookups/countries
 * GET /api/lookups/universities          — all active
 * GET /api/lookups/universities?country= — filtered by country name
 */
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const { protect } = require('../middleware/auth');
const Country    = require('../models/Country');
const University = require('../models/University');
const LeadSource = require('../models/LeadSource');

// ── Countries ────────────────────────────────────────────────────
router.get('/countries', protect, asyncHandler(async (req, res) => {
  const docs = await Country.find({ isActive: true }).sort({ name: 1 }).lean();
  const data = docs.map((c) => ({ id: String(c._id), name: c.name, code: c.code }));
  return success(res, data, 'Countries fetched');
}));

// ── Universities ──────────────────────────────────────────────────
router.get('/universities', protect, asyncHandler(async (req, res) => {
  const filter = { isActive: true };

  // Optional ?country=Canada  — filter by country name
  if (req.query.country) {
    const countryDoc = await Country.findOne({
      name: { $regex: new RegExp(`^${req.query.country}$`, 'i') },
    }).lean();
    if (countryDoc) filter.country = countryDoc._id;
  }

  const docs = await University.find(filter)
    .sort({ institutionName: 1 })
    .populate('country', 'name code')
    .lean();

  const data = docs.map((u) => ({
    id:      String(u._id),
    name:    u.institutionName,
    country: u.country ? u.country.name : null,
  }));

  return success(res, data, 'Universities fetched');
}));

// ── Lead sources (Lead Type dropdown) ──────────────────────────────
router.get('/lead-sources', protect, asyncHandler(async (req, res) => {
  const docs = await LeadSource.find({ isActive: true }).sort({ name: 1 }).lean();
  const data = docs.map((s) => ({ id: String(s._id), name: s.name }));
  return success(res, data, 'Lead sources fetched');
}));

module.exports = router;
