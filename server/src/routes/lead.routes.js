const router = require('express').Router();
const controller = require('../controllers/lead.controller');
const callAssistController = require('../controllers/callAssist.controller');
const dropController = require('../controllers/leadDrop.controller');
const shortlistController = require('../controllers/shortlist.controller');
const applicationController = require('../controllers/application.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { callAssistFeedbackRules } = require('../validation/callAssist.validation');
const upload = require('../middleware/upload');

router.post('/whatsapp', controller.createWhatsappLead);

router.get('/check-mobile', controller.checkMobileExists);

router.get('/import/template', protect, allowPermissions('lead:create'), controller.downloadImportTemplate);
router.post('/import', protect, allowPermissions('lead:create'), upload.single('file'), controller.importLeads);
router.get('/import/errors/:jobId', protect, allowPermissions('lead:create'), controller.downloadErrorReport);
router.get('/options', protect, controller.getLeadOptions);
router.get('/', protect, controller.getLeads);
router.post('/export', protect, controller.exportReports);
router.get('/:id', protect, controller.getLeadById);
router.post('/:id/revive', protect, dropController.reviveLeadAction);
router.get('/:id/lifecycle', protect, controller.getLeadLifecycle);
router.patch('/:id/lifecycle', protect, controller.updateLeadLifecycle);
router.get('/:id/call-assist', protect, callAssistController.getCallAssist);
router.post(
  '/:id/call-assist/feedback',
  protect,
  callAssistFeedbackRules,
  validate,
  callAssistController.submitCallAssistFeedback
);
router.get('/:id/shortlist', protect, shortlistController.getShortlist);
router.post('/:id/shortlist/confirm', protect, shortlistController.confirmShortlist);
router.post('/:id/shortlist/:universityId', protect, shortlistController.addToShortlist);
router.patch('/:id/shortlist/:universityId', protect, shortlistController.updateShortlistEntry);
router.delete('/:id/shortlist/:universityId', protect, shortlistController.removeFromShortlist);
router.get('/:id/applications', protect, applicationController.listApplications);
router.post('/:id/applications', protect, applicationController.createApplication);
router.post('/', protect, controller.createLead);
router.patch('/:id', protect, controller.updateProfile);
router.get('/:id/tags', protect, controller.getLeadTags);
router.post('/:id/tags', protect, controller.addLeadTag);
router.delete('/:id/tags/:tagId', protect, controller.removeLeadTag);

router.patch('/:id/counselor-status', protect, controller.updateCounselorStatus);
router.post('/:id/counselor-notes', protect, controller.addCounselorNote);
router.get('/:id/counselor-notes', protect, controller.getCounselorNotes);

module.exports = router;
