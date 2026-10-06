const router = require('express').Router();
const controller = require('../controllers/application.controller');
const { protect } = require('../middleware/auth');

/* Canonical application workflow (Phase 4).
   Lead-scoped routes live in lead.routes.js (/leads/:id/applications);
   application-scoped routes are mounted here at /api/applications. */

router.get('/',                          protect, controller.getApplicationsOverview);
router.get('/:applicationId/timeline',   protect, controller.getApplicationTimeline);
router.get('/:applicationId',          protect, controller.getApplication);
router.patch('/:applicationId',        protect, controller.updateApplication);
router.post('/:applicationId/submit',  protect, controller.submitApplication);
router.post('/:applicationId/withdraw', protect, controller.withdrawApplication);

module.exports = router;
