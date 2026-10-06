const router     = require('express').Router();
const controller = require('../controllers/activity.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions } = require('../middleware/rbac');

// POST /api/activity/fetch-call
router.post(
  '/fetch-call',
  protect,
  allowPermissions('lead:fetch'),
  controller.fetchCall
);

// GET /api/activity/workspace-stats
router.get(
  '/workspace-stats',
  protect,
  allowPermissions('activity:status'),
  controller.stats
);

module.exports = router;
