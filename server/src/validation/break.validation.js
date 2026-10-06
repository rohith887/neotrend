const { body } = require('express-validator');
const { BREAK_TYPES } = require('../models/Break');

const startBreakRules = [
  body('type')
    .notEmpty()
    .withMessage('Break type is required')
    .isIn(BREAK_TYPES)
    .withMessage(`Break type must be one of: ${BREAK_TYPES.join(', ')}`),
  body('note')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Note must be text')
    .isLength({ max: 500 })
    .withMessage('Note must be at most 500 characters'),
];

module.exports = { startBreakRules };
