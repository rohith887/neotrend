/**
 * Counselor routes — profile management + lifecycle operational endpoints.
 * Protected by auth; supervisor-level operations require user:manage,
 * self-service reads are gated by role.
 */
const router = require('express').Router();
const controller = require('../controllers/counselor.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions, allowRoles } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const {
  createCounselorRules,
  counselorIdParamRules,
  userIdParamRules,
  updateCounselorRules,
} = require('../validation/counselor.validation');

// ── Lifecycle operational endpoints (must come before /:id) ────────────
router.get('/my-students', protect, controller.getMyStudents);
router.get('/dashboard', protect, controller.getCounselorDashboard);
router.get('/registration/queue', protect, controller.getRegistrationQueue);
router.get('/registration/:leadId', protect, controller.getRegistrationDetail);
router.patch('/registration/:leadId', protect, controller.updateRegistration);
router.post('/counseling/:leadId/complete', protect, controller.completeCounseling);

// ── Counselor profile CRUD ─────────────────────────────────────────────
router.post('/', protect, createCounselorRules, validate, allowPermissions('user:manage'), controller.createCounselor);
router.get('/', protect, allowPermissions('user:manage'), controller.listCounselors);
router.get('/user/:userId', protect, userIdParamRules, validate, allowRoles('SUPERVISOR', 'COUNSELOR'), controller.getCounselorByUser);
router.get('/:id', protect, counselorIdParamRules, validate, allowRoles('SUPERVISOR', 'COUNSELOR'), controller.getCounselor);
router.patch('/:id', protect, counselorIdParamRules, validate, allowPermissions('user:manage'), controller.updateCounselor);

module.exports = router;
