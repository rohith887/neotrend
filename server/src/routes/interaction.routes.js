const router = require('express').Router();
const controller = require('../controllers/interaction.controller');
const { protect } = require('../middleware/auth');


router.get('/rnr-limits', protect, controller.rnrLimits);

router.post('/', protect, controller.create);

router.get('/', protect, controller.listByLead);

module.exports = router;
