const { body, param } = require('express-validator');

const startCallRules = [
  body('leadId')
    .notEmpty()
    .withMessage('leadId is required')
    .isMongoId()
    .withMessage('leadId must be a valid id'),
];

// Lifecycle a browser-originated call may report. Forward-only live states plus
// the terminal outcomes the SIP session can produce — the call record itself
// rejects any regression or post-terminal change.
const REPORTABLE_STATUSES = [
  'ringing',
  'answered',
  'connected',
  'completed',
  'failed',
  'no-answer',
  'busy',
  'cancelled',
];

const reportStatusRules = [
  param('callId')
    .notEmpty()
    .withMessage('callId is required')
    .isMongoId()
    .withMessage('callId must be a valid id'),
  body('status')
    .exists()
    .withMessage('status is required')
    .bail()
    .isIn(REPORTABLE_STATUSES)
    .withMessage(`status must be one of: ${REPORTABLE_STATUSES.join(', ')}`),
];

module.exports = { startCallRules, reportStatusRules, REPORTABLE_STATUSES };