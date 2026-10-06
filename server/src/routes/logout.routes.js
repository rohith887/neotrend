/**
 * Logout-control routes:
 *   POST /api/logout/check          — sign-out gate (all authenticated roles;
 *                                     only Agents/Counselors are gated)
 *   POST /api/logout/:alertId/override — supervisor grants a one-shot override
 */
const router = require('express').Router();
const controller = require('../controllers/logout.controller');
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/rbac');

router.post('/check', protect, controller.checkLogout);
router.post('/:alertId/override', protect, allowRoles('SUPERVISOR'), controller.approveOverride);

module.exports = router;