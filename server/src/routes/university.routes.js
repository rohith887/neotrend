/**
 * University routes — CRUD management + bulk import for universities.
 * Coexists with the existing lookup API at GET /api/lookups/universities.
 *
 * GET    /api/universities                  — paginated list (search, country, ownership, isActive filters)
 * GET    /api/universities/import/template   — download CSV/XLSX template
 * POST   /api/universities/import/preview    — preview import (validate without inserting)
 * POST   /api/universities/import            — execute bulk import
 * GET    /api/universities/:id               — single university
 * POST   /api/universities                   — create
 * PATCH  /api/universities/:id               — update
 * DELETE /api/universities/:id               — soft-delete (isActive = false)
 */
const router = require('express').Router();
const controller = require('../controllers/university.controller');
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const upload = require('../middleware/upload');
const {
  createUniversityRules,
  universityIdParamRules,
  updateUniversityRules,
} = require('../validation/university.validation');

// ── List (all authenticated users — needed for dropdowns + management UI) ──
router.get('/', protect, controller.list);

// ── Import endpoints (MUST be before /:id to avoid param capture) ──────
router.get('/import/template', protect, allowRoles('SUPERVISOR'), controller.downloadTemplate);
router.post('/import/preview', protect, allowRoles('SUPERVISOR'), upload.single('file'), controller.previewImport);
router.post('/import', protect, allowRoles('SUPERVISOR'), upload.single('file'), controller.importUniversities);

// ── Read by ID ─────────────────────────────────────────────────────────────
router.get('/:id', protect, universityIdParamRules, validate, controller.getById);

// ── Create (supervisor only) ───────────────────────────────────────────────
router.post('/', protect, createUniversityRules, validate, allowRoles('SUPERVISOR'), controller.create);

// ── Update (supervisor only) ───────────────────────────────────────────────
router.patch('/:id', protect, universityIdParamRules, validate, updateUniversityRules, validate, allowRoles('SUPERVISOR'), controller.update);

// ── Soft-delete (supervisor only) ──────────────────────────────────────────
router.delete('/:id', protect, universityIdParamRules, validate, allowRoles('SUPERVISOR'), controller.remove);

module.exports = router;
