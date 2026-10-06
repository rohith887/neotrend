const { body } = require('express-validator');
const CallAssistFeedback = require('../models/CallAssistFeedback');

const { FEEDBACK_VALUES } = CallAssistFeedback;

const FEEDBACK_FIELDS = ['openingScript', 'studentContext', 'conversationFocus', 'nextQuestion'];

const callAssistFeedbackRules = [
  // Every feedback references the exact generation it judged.
  body('generatedContextVersion')
    .notEmpty()
    .withMessage('generatedContextVersion is required')
    .isString()
    .withMessage('generatedContextVersion must be text'),

  // Each category must be a deliberate agree / disagree.
  ...FEEDBACK_FIELDS.map((field) =>
    body(field)
      .isIn(FEEDBACK_VALUES)
      .withMessage(`${field} must be one of: ${FEEDBACK_VALUES.join(', ')}`)
  ),

  body('comment')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Comment must be text')
    .isLength({ max: 2000 })
    .withMessage('Comment must be at most 2000 characters'),

  // No dialer yet — callId is null, but a future real call id validates.
  body('callId')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('callId must be a valid identifier or null'),
];

module.exports = { callAssistFeedbackRules };