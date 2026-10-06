const router = require('express').Router();
const controller = require('../controllers/disposition.controller');
const { protect } = require('../middleware/auth');

// Both endpoints are read-only, available to any authenticated user.
router.get('/',              protect, controller.listDispositions);
router.get('/interest-levels', protect, controller.listInterestLevels);

module.exports = router;
