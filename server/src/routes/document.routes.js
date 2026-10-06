const router = require('express').Router();
const ctrl = require('../controllers/document.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/lead/:leadId/summary', ctrl.getDocumentSummary);
router.get('/lead/:leadId', ctrl.getDocumentsByLead);
router.get('/counselor/queue', ctrl.getDocumentQueue);
router.post('/bulk', ctrl.bulkCreateDocuments);
router.post('/', ctrl.createDocument);
router.patch('/:id', ctrl.updateDocument);
router.delete('/:id', ctrl.deleteDocument);

module.exports = router;
