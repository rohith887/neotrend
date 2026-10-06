/**
 * TASK VALIDATION — Phase 6 infrastructure.
 */
const { body, query } = require('express-validator');
const { TASK_TYPES, TASK_PRIORITIES, TASK_STATUSES, TASK_OPEN_STATUSES } = require('../models/Task');
const { WAITING_ON_OPTIONS } = require('../models/Lead');

const createTaskRules = [
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isString()
    .isLength({ max: 200 })
    .withMessage('Title must be at most 200 characters'),
  body('description').optional({ values: 'falsy' }).isString().isLength({ max: 2000 }),
  body('type').optional().isIn(TASK_TYPES).withMessage(`Type must be one of: ${TASK_TYPES.join(', ')}`),
  body('priority').optional().isIn(TASK_PRIORITIES).withMessage(`Priority must be one of: ${TASK_PRIORITIES.join(', ')}`),
  body('status').optional().isIn(['pending', 'in-progress']).withMessage('Initial status must be pending or in-progress'),
  body('dueAt').optional({ values: 'falsy' }).isISO8601().withMessage('dueAt must be a valid date'),
  body('slaHours').optional({ values: 'falsy' }).isInt({ min: 1, max: 1000 }).withMessage('slaHours must be between 1 and 1000'),
  body('waitingOn').optional({ values: 'falsy' }).isIn(WAITING_ON_OPTIONS),
  body('leadId').optional({ values: 'falsy' }).isMongoId().withMessage('leadId must be a valid id'),
  body('assignedTo').optional({ values: 'falsy' }).isMongoId().withMessage('assignedTo must be a valid user id'),
];

const updateTaskRules = [
  body('title').optional().isString().trim().notEmpty().withMessage('Title cannot be empty').isLength({ max: 200 }),
  body('description').optional({ values: 'falsy' }).isString().isLength({ max: 2000 }),
  body('type').optional().isIn(TASK_TYPES),
  body('priority').optional().isIn(TASK_PRIORITIES),
  body('status').optional().isIn(TASK_STATUSES).withMessage(`Status must be one of: ${TASK_STATUSES.join(', ')}`),
  body('dueAt').optional({ nullable: true }).isISO8601().withMessage('dueAt must be a valid date'),
  body('slaHours').optional({ nullable: true }).isInt({ min: 1, max: 1000 }),
  body('waitingOn').optional({ nullable: true }).isIn([...WAITING_ON_OPTIONS, null]),
  body('leadId').optional({ nullable: true }).isMongoId(),
  body('assignedTo').optional({ values: 'falsy' }).isMongoId(),
];

const listTasksRules = [
  query('scope').optional().isIn(['mine', 'team']),
  query('status')
    .optional()
    .custom((v) => v === 'open' || [...TASK_OPEN_STATUSES, ...TASK_STATUSES].includes(v))
    .withMessage('Invalid status filter'),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

module.exports = { createTaskRules, updateTaskRules, listTasksRules };
