const { body, param, query } = require('express-validator');

const studentIdParam = [
  param('studentId').isMongoId().withMessage('Invalid student ID'),
];

const referralCodeParam = [
  param('referralCode').notEmpty().withMessage('Referral code is required'),
];

const publicSubmitRules = [
  param('referralCode').notEmpty().withMessage('Referral code is required'),
  body('studentName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Name must be between 2 and 200 characters'),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('preferredCountry')
    .optional({ values: 'falsy' })
    .trim(),
  body('intake')
    .optional({ values: 'falsy' })
    .trim(),
];

const publicQRSubmitRules = [
  body('employeeName')
    .trim()
    .notEmpty().withMessage('Employee name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Employee name must be between 2 and 200 characters'),
  body('employeeId')
    .trim()
    .notEmpty().withMessage('Employee ID is required')
    .isLength({ min: 1, max: 100 }).withMessage('Employee ID must be between 1 and 100 characters'),
  body('employeeNumber')
    .trim()
    .notEmpty().withMessage('Employee mobile number is required'),
  body('studentName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Name must be between 2 and 200 characters'),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('preferredCountry')
    .optional({ values: 'falsy' })
    .trim(),
  body('intake')
    .optional({ values: 'falsy' })
    .trim(),
];

const validateEmployeeRules = [
  param('userId').isMongoId().withMessage('Invalid employee ID'),
];

const employeeSubmitRules = [
  param('userId').isMongoId().withMessage('Invalid employee ID'),
  body('studentName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Name must be between 2 and 200 characters'),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('preferredCountry')
    .optional({ values: 'falsy' })
    .trim(),
  body('intake')
    .optional({ values: 'falsy' })
    .trim(),
];

const updateStatusRules = [
  param('id').isMongoId().withMessage('Invalid referral ID'),
  body('status')
    .isIn(['pending', 'contacted', 'qualified', 'converted', 'rejected'])
    .withMessage('Invalid status value'),
];

const updateRewardStatusRules = [
  param('id').isMongoId().withMessage('Invalid referral ID'),
  body('rewardStatus')
    .isIn(['not-eligible', 'eligible', 'processing', 'paid', 'cancelled'])
    .withMessage('Invalid reward status value'),
];

const updateReferralRules = [
  param('id').isMongoId().withMessage('Invalid referral ID'),
  body('referredName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Name must be between 2 and 200 characters'),
  body('referredMobile')
    .optional()
    .trim()
    .notEmpty().withMessage('Mobile number cannot be empty'),
  body('referredEmail')
    .optional({ values: 'falsy' })
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('intake')
    .optional({ values: 'falsy' })
    .trim(),
  body('rewardAmount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Reward amount must be a non-negative number')
    .toFloat(),
];

const setActiveRules = [
  param('id').isMongoId().withMessage('Invalid referral ID'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean').toBoolean(),
];

const listReferralsRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['pending', 'contacted', 'qualified', 'converted', 'rejected'])
    .withMessage('Invalid status filter'),
  query('rewardStatus')
    .optional()
    .isIn(['not-eligible', 'eligible', 'processing', 'paid', 'cancelled'])
    .withMessage('Invalid reward status filter'),
  query('source')
    .optional()
    .isIn(['individual', 'common', 'employee', 'public-qr', 'employee-referral', 'student-referral'])
    .withMessage('Invalid source filter'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('from').optional().isISO8601().withMessage('From must be a valid date'),
  query('to').optional().isISO8601().withMessage('To must be a valid date'),
];

module.exports = {
  studentIdParam,
  referralCodeParam,
  publicSubmitRules,
  publicQRSubmitRules,
  validateEmployeeRules,
  employeeSubmitRules,
  updateStatusRules,
  updateRewardStatusRules,
  updateReferralRules,
  setActiveRules,
  listReferralsRules,
};
