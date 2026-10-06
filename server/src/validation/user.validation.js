const { body, param } = require('express-validator');

const managedRoles = ['agent', 'counselor', 'supervisor'];
const statuses = ['active', 'inactive'];

const userIdParamRules = [
  param('id').isMongoId().withMessage('Invalid user id'),
];

const createUserRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 100 }),
  body('lastName').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('role').customSanitizer((value) => String(value || '').toLowerCase()).isIn(managedRoles).withMessage(`Role must be one of: ${managedRoles.join(', ')}`),
  body('mobile').optional({ values: 'falsy' }).trim().isLength({ min: 7, max: 20 }),
  body('extension')
    .optional({ values: 'falsy' })
    .isInt({ min: 1000, max: 1999 })
    .withMessage('Extension must be between 1000 and 1999')
    .toInt(),
];

const updateUserRules = [
  ...userIdParamRules,
  body('firstName').optional().trim().notEmpty().withMessage('First name is required').isLength({ max: 100 }),
  body('lastName').optional().trim().isLength({ max: 100 }),
  body('email').optional().trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('role').optional().customSanitizer((value) => String(value || '').toLowerCase()).isIn(managedRoles).withMessage(`Role must be one of: ${managedRoles.join(', ')}`),
  body('mobile').optional({ values: 'falsy' }).trim().isLength({ min: 7, max: 20 }),
];

const userStatusRules = [
  ...userIdParamRules,
  body('status').isIn(statuses).withMessage(`Status must be one of: ${statuses.join(', ')}`),
];

const resetPasswordRules = [
  ...userIdParamRules,
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be 8 to 128 characters'),
];

module.exports = { userIdParamRules, createUserRules, updateUserRules, userStatusRules, resetPasswordRules };
