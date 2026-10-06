const router = require('express').Router();
const controller = require('../controllers/whatsapp.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions } = require('../middleware/rbac');

router.get('/templates', protect, controller.listTemplates);
router.get('/templates/meta', protect, controller.listTemplateMetadata);
router.get('/templates/meta/:nameOrId', protect, controller.getTemplateMetadata);
router.post('/preview', protect, allowPermissions('lead:read-own'), controller.previewTemplate);
router.post('/send', protect, allowPermissions('lead:read-own'), controller.sendLeadTemplate);
router.post('/send-template', protect, allowPermissions('lead:read-own'), controller.sendTemplateMessage);
router.post('/template', protect, allowPermissions('lead:read-own'), controller.sendTemplate);

module.exports = router;
