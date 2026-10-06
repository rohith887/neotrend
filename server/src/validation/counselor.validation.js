const { body, param } = require('express-validator');

const COUNSELOR_STATUSES = ['active', 'inactive'];

const createCounselorRules = [
  body('userId')
    .notEmpty()
    .withMessage('userId is required')
    .isMongoId()
    .withMessage('userId must be a valid id'),
  body('status')
    .optional({ values: 'falsy' })
    .isIn(COUNSELOR_STATUSES)
    .withMessage(`status must be one of: ${COUNSELOR_STATUSES.join(', ')}`),
];

const counselorIdParamRules = [
  param('id').isMongoId().withMessage('Invalid counselor id'),
];

const userIdParamRules = [
  param('userId').isMongoId().withMessage('Invalid user id'),
];

const updateCounselorRules = [
  ...counselorIdParamRules,
  body('status')
    .optional({ values: 'falsy' })
    .isIn(COUNSELOR_STATUSES)
    .withMessage(`status must be one of: ${COUNSELOR_STATUSES.join(', ')}`),
];

module.exports = { createCounselorRules, counselorIdParamRules, userIdParamRules, updateCounselorRules };
