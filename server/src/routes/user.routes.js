const router = require('express').Router();
const controller = require('../controllers/user.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions, allowRoles } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const {
  userIdParamRules,
  createUserRules,
  updateUserRules,
  userStatusRules,
  resetPasswordRules,
} = require('../validation/user.validation');

// Mentionable users for @mention autocomplete inside remarks (shared across
// Agent / Counselor / Supervisor workspaces — protect-only, no extra grant).
router.get('/mentionable', protect, controller.listMentionable);

router.post(
  '/',
  protect,
  allowRoles('SUPERVISOR'),
  allowPermissions('user:manage'),
  createUserRules,
  validate,
  controller.createUser
);
router.post(
  '/:id/provision-sip',
  protect,
  allowRoles('SUPERVISOR'),
  allowPermissions('user:manage'),
  userIdParamRules,
  validate,
  controller.provisionSip
);
router.patch(
  '/:id',
  protect,
  allowRoles('SUPERVISOR'),
  allowPermissions('user:manage'),
  updateUserRules,
  validate,
  controller.updateUser
);
router.patch(
  '/:id/status',
  protect,
  allowRoles('SUPERVISOR'),
  allowPermissions('user:manage'),
  userStatusRules,
  validate,
  controller.setUserStatus
);
router.post(
  '/:id/reset-password',
  protect,
  allowRoles('SUPERVISOR'),
  allowPermissions('user:manage'),
  resetPasswordRules,
  validate,
  controller.resetPassword
);
router.delete(
  '/:id',
  protect,
  allowRoles('SUPERVISOR'),
  allowPermissions('user:manage'),
  userIdParamRules,
  validate,
  controller.deleteUser
);

module.exports = router;