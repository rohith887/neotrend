/**
 * Agent dashboard routes — every widget on the Agent Dashboard has its own
 * lightweight endpoint (summary KPIs, work queue counts, callbacks, my leads,
 * full leads list, activity timeline, personal report). All gated by agent
 * permissions and scoped to the logged-in agent in the service layer.
 */
const router = require('express').Router();
const controller = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions } = require('../middleware/rbac');

router.get('/summary',    protect, allowPermissions('activity:status'), controller.summary);
router.get('/work-queue', protect, allowPermissions('lead:read-own'),   controller.workQueue);
router.get('/callbacks',  protect, allowPermissions('lead:read-own'),   controller.callbacks);
router.get('/ready-to-call', protect, allowPermissions('lead:read-own'), controller.readyToCall);
router.get('/next-action', protect, allowPermissions('lead:read-own'),  controller.nextAction);
router.get('/my-leads',   protect, allowPermissions('lead:read-own'),   controller.myLeads);
router.get('/assigned-leads', protect, allowPermissions('lead:read-own'), controller.assignedLeads);
router.get('/leads',      protect, allowPermissions('lead:read-own'),   controller.leads);
router.get('/activity',   protect, allowPermissions('activity:status'), controller.activity);
router.get('/report',     protect, allowPermissions('activity:status'), controller.report);
router.get('/report/drilldown', protect, allowPermissions('activity:status'), controller.reportDrilldown);

module.exports = router;
