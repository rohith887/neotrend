/**
 * Supervisor routes — read-only aggregates for the supervisor workspace.
 * Every route is gated by role permissions (user:read / report:read).
 */
const router = require('express').Router();
const controller = require('../controllers/supervisor.controller');
const systemLogController = require('../controllers/systemLog.controller');
const callAssistController = require('../controllers/callAssist.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions } = require('../middleware/rbac');

router.get('/users',            protect, allowPermissions('user:read'),   controller.listUsers);
router.get('/queues',           protect, allowPermissions('user:read'),   controller.listQueues);
router.get('/reports',          protect, allowPermissions('report:read'), controller.listReports);
router.get('/dashboard/summary', protect, allowPermissions('user:read'), controller.getDashboardSummary);
router.get('/attention',        protect, allowPermissions('report:read'), controller.getAttentionSnapshot);
router.get('/lifecycle',        protect, allowPermissions('report:read'), controller.getLifecyclePipeline);

/* Call Assist feedback analytics — minimal aggregate (totals + agree % per
   category). Deliberately no per-agent ranking or scoring in Phase 1. */
router.get('/call-assist-feedback/summary', protect, allowPermissions('report:read'), callAssistController.getFeedbackSummary);

/* System logs — audit trail viewable by the supervisor (report:read). */
router.get('/system-log/meta',    protect, allowPermissions('report:read'), systemLogController.getMeta);
router.get('/system-log/export',  protect, allowPermissions('report:read'), systemLogController.exportLogs);
router.get('/system-logs',        protect, allowPermissions('report:read'), systemLogController.listLogs);

module.exports = router;
