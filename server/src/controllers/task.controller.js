/**
 * TASK CONTROLLER — Phase 6 infrastructure.
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/ApiResponse');
const taskService = require('../services/task.service');

// GET /api/tasks
const list = asyncHandler(async (req, res) => {
  const data = await taskService.listTasks({
    scope: req.query.scope === 'team' ? 'team' : 'mine',
    actorId: String(req.user._id),
    assignedTo: req.query.assignedTo || undefined,
    status: req.query.status || undefined,
    type: req.query.type || undefined,
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  return success(res, data.rows, 'Tasks fetched', 200, {
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
  });
});

// GET /api/tasks/mine — every Agent/Counselor's own open tasks, no
// user:read permission required. assignedTo is always the caller; ignores
// any assignedTo the client might send so this can never be used to browse
// someone else's tasks.
const listMine = asyncHandler(async (req, res) => {
  const data = await taskService.listTasks({
    scope: 'mine',
    actorId: String(req.user._id),
    status: req.query.status || undefined,
    type: req.query.type || undefined,
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  return success(res, data.rows, 'Tasks fetched', 200, {
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
  });
});

// PATCH /api/tasks/mine/:id/status — self-service status change only
// (pending/in-progress/done/cancelled). Ownership is enforced in the service.
const updateMyStatus = asyncHandler(async (req, res) => {
  if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) throw new ApiError(400, 'Invalid task id');
  const task = await taskService.updateTaskStatusSelf(String(req.user._id), req.params.id, req.body.status);
  return success(res, task, 'Task updated');
});

// POST /api/tasks
const create = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(String(req.user._id), req.body);
  return success(res, task, 'Task created', 201);
});

// GET /api/tasks/:id
const getOne = asyncHandler(async (req, res) => {
  if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) throw new ApiError(400, 'Invalid task id');
  const task = await taskService.getTaskById(req.params.id);
  return success(res, task, 'Task fetched');
});

// PATCH /api/tasks/:id
const update = asyncHandler(async (req, res) => {
  if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) throw new ApiError(400, 'Invalid task id');
  const task = await taskService.updateTask(String(req.user._id), req.params.id, req.body);
  return success(res, task, 'Task updated');
});

// DELETE /api/tasks/:id
const remove = asyncHandler(async (req, res) => {
  if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) throw new ApiError(400, 'Invalid task id');
  const result = await taskService.deleteTask(req.params.id);
  return success(res, result, 'Task deleted');
});

// POST /api/tasks/sla/check
const runSlaCheck = asyncHandler(async (req, res) => {
  const escalated = await taskService.checkSlaBreaches();
  return success(res, { escalated }, 'SLA check complete');
});

module.exports = { list, listMine, create, getOne, update, updateMyStatus, remove, runSlaCheck };
