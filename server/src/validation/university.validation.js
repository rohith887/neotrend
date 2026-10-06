const { body, param } = require('express-validator');

const VALID_OWNERSHIP = ['PVT', 'PLC'];

const createUniversityRules = [
  body('institutionName')
    .trim()
    .notEmpty()
    .withMessage('University name is required')
    .isLength({ max: 200 })
    .withMessage('Name must be at most 200 characters'),
  body('country')
    .notEmpty()
    .withMessage('Country is required')
    .isMongoId()
    .withMessage('Country must be a valid id'),
  body('city')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('City must be at most 200 characters'),
  body('stateRegion')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('State/Region must be at most 100 characters'),
  body('ownership')
    .optional()
    .isIn(VALID_OWNERSHIP)
    .withMessage(`Ownership must be one of: ${VALID_OWNERSHIP.join(', ')}`),
];

const universityIdParamRules = [
  param('id').isMongoId().withMessage('Invalid university id'),
];

const updateUniversityRules = [
  body('institutionName')
    .optional({ values: 'falsy' })
    .trim()
    .notEmpty()
    .withMessage('University name cannot be empty')
    .isLength({ max: 200 })
    .withMessage('Name must be at most 200 characters'),
  body('country')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Country must be a valid id'),
  body('city')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('City must be at most 200 characters'),
  body('stateRegion')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('State/Region must be at most 100 characters'),
  body('ownership')
    .optional()
    .isIn(VALID_OWNERSHIP)
    .withMessage(`Ownership must be one of: ${VALID_OWNERSHIP.join(', ')}`),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

module.exports = {
  createUniversityRules,
  universityIdParamRules,
  updateUniversityRules,
};
