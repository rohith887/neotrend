const router = require('express').Router();
const controller = require('../controllers/workqueue.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions } = require('../middleware/rbac');

// GET /api/agent/workqueue
router.get('/workqueue', protect, allowPermissions('lead:fetch'), controller.getWorkQueue);

// PATCH /api/agent/workqueue/reschedule
router.patch(
  '/workqueue/reschedule',
  protect,
  allowPermissions('lead:fetch'),
  controller.reschedule
);

// POST /api/agent/workqueue/complete — mark a callback completed (removes it
// from the workspace, decrements the pending KPI).
router.post(
  '/workqueue/complete',
  protect,
  allowPermissions('lead:fetch'),
  controller.complete
);

module.exports = router;
