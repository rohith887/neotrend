const router = require('express').Router();
const controller = require('../controllers/break.controller');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { startBreakRules } = require('../validation/break.validation');

router.post('/start', protect, startBreakRules, validate, controller.startBreak);
router.post('/end', protect, controller.endBreak);
router.get('/active', protect, controller.getActiveBreak);
router.get('/mine', protect, controller.listBreaks);
router.get('/summary', protect, controller.summarize);

module.exports = router;
