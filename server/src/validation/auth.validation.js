const { body } = require('express-validator');

const emailRule = () =>
  body('email')
    .isEmail()
    .withMessage('Valid email address is required')
    .normalizeEmail()
    .toLowerCase();

const loginRules = [
  emailRule(),
  body('password').notEmpty().withMessage('Password is required'),
];

const otpRequestRules = [emailRule()];

const otpVerifyRules = [
  emailRule(),
  body('otp')
    .exists({ checkFalsy: true })
    .withMessage('Invalid OTP')
    .isString()
    .withMessage('Invalid OTP'),
];

const updateProfileRules = [
  body('firstName').optional().isString().withMessage('First name must be text'),
  body('lastName').optional().isString().withMessage('Last name must be text'),
  body('mobile').optional().isString().withMessage('Mobile must be text'),
  body('currentPassword').optional().isString().withMessage('Current password must be text'),
  body('newPassword')
    .optional()
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
];

module.exports = { loginRules, otpRequestRules, otpVerifyRules, updateProfileRules };
