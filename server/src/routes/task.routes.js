/**
 * TASK ROUTES — Phase 6 operational infrastructure.
 *
 *   GET    /api/tasks              — list tasks (scope=mine|team), user:read only
 *   POST   /api/tasks              — create task, user:read only
 *   GET    /api/tasks/mine         — caller's own tasks, any authenticated role
 *   PATCH  /api/tasks/mine/:id/status — caller's own status change, any authenticated role
 *   GET    /api/tasks/:id          — task detail
 *   PATCH  /api/tasks/:id          — update / reassign / status change
 *   DELETE /api/tasks/:id          — remove task
 *   POST   /api/tasks/sla/check    — run SLA breach detection on demand
 */
const router = require('express').Router();
const controller = require('../controllers/task.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createTaskRules, updateTaskRules } = require('../validation/task.validation');

// Self-service routes — no user:read gate, but scoped/enforced to the
// caller's own tasks in the controller/service. Must be registered before
// the generic '/:id' routes so '/mine' isn't swallowed as an :id value.
router.get('/mine',              protect, controller.listMine);
router.patch('/mine/:id/status', protect, controller.updateMyStatus);

router.get('/',        protect, allowPermissions('user:read'), controller.list);
router.post('/',       protect, allowPermissions('user:read'), createTaskRules, validate, controller.create);
router.post('/sla/check', protect, allowPermissions('user:read'), controller.runSlaCheck);
router.get('/:id',     protect, allowPermissions('user:read'), controller.getOne);
router.patch('/:id',   protect, allowPermissions('user:read'), updateTaskRules, validate, controller.update);
router.delete('/:id',  protect, allowPermissions('user:read'), controller.remove);

module.exports = router;
