/**
 * NOTIFICATION ROUTES — Phase 6 operational infrastructure.
 *
 *   GET  /api/notifications                    — current user's notifications
 *   GET  /api/notifications/unread             — unread count
 *   POST /api/notifications/:id/read           — mark one read
 *   POST /api/notifications/read-all           — mark all read
 *   POST /api/notifications/:id/approve-drop   — supervisor approves a pending
 *                                                Drop Lead request
 *   POST /api/notifications/:id/deny-drop      — supervisor denies a pending
 *                                                Drop Lead request
 */
const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/rbac');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');
const notificationController = require('../controllers/notification.controller');

router.get('/', protect, asyncHandler(async (req, res) => {
  const { limit, unread, hours } = req.query;
  const rows = await notificationService.listNotifications(req.user._id, {
    limit,
    unreadOnly: unread === 'true',
    hours,
  });
  return success(res, rows, 'Notifications fetched');
}));

router.get('/unread', protect, asyncHandler(async (req, res) => {
  const count = await notificationService.unreadCount(req.user._id);
  return success(res, { count }, 'Unread count fetched');
}));

router.post('/read-all', protect, asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.user._id);
  return success(res, result, 'All notifications marked read');
}));

router.post('/:id/read', protect, asyncHandler(async (req, res) => {
  const row = await notificationService.markRead(req.user._id, req.params.id);
  return success(res, row, 'Notification marked read');
}));

// Supervisor drop-decision actions on a 'drop-request' alert. Supervisor-only,
// mirroring the logout-override endpoint pattern (protect + allowRoles).
router.post('/:id/approve-drop', protect, allowRoles('SUPERVISOR'), notificationController.approveDropRequest);
router.post('/:id/deny-drop', protect, allowRoles('SUPERVISOR'), notificationController.denyDropRequest);

// Guard against invalid ObjectId params hitting cast errors.
router.param('id', (req, res, next, id) => {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return next(new ApiError(400, 'Invalid notification id'));
  }
  return next();
});

module.exports = router;
