const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  loginRules,
  otpRequestRules,
  otpVerifyRules,
  updateProfileRules,
} = require('../validation/auth.validation');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

router.post('/login', loginLimiter, loginRules, validate, controller.login);
router.post('/otp/request', loginLimiter, otpRequestRules, validate, controller.otpRequest);
router.post('/otp/verify', loginLimiter, otpVerifyRules, validate, controller.otpVerify);
router.get('/profile', protect, controller.getProfile);
router.put('/profile', protect, updateProfileRules, validate, controller.updateProfile);

module.exports = router;
