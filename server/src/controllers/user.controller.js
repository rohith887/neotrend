const User = require('../models/User');
const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { logEvent } = require('../services/systemLog.service');

// Single shared identity source for @mention autocomplete — everyone
// (Agent / Counselor / Supervisor) picks from the same active user list,
// so a mention created in one role's workspace stays resolvable in every
// other role's workspace.
const MENTIONABLE_ROLE_CODES = ['agent', 'counselor', 'supervisor'];

const logUserEvent = (req, action, user, statusCode, message) => {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'User';
  logEvent({
    module: 'telephony',
    action,
    username: req.user.email,
    userId: String(req.user._id),
    role: String(req.role.name || '').toUpperCase(),
    message: `${message}: ${name}`,
    apiPath: req.originalUrl,
    statusCode,
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
    metadata: {
      targetUserId: String(user?._id || ''),
      targetRole: user?.role?.code || user?.role || '',
      sipExtension: user?.sipExtension || null,
      sipProvisionStatus: user?.sipProvisionStatus || null,
    },
  });
};

const listMentionable = asyncHandler(async (req, res) => {
  const users = await User.find({ status: 'active' })
    .populate('role', 'name code')
    .select('firstName lastName email')
    .lean();

  const mentionable = users
    .filter((u) => u.role && MENTIONABLE_ROLE_CODES.includes(String(u.role.code).toLowerCase()))
    .map((u) => ({
      id: String(u._id),
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'User',
      email: u.email || '',
      roleName: u.role?.name || null,
      roleCode: u.role?.code || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return success(res, mentionable, 'Mentionable users fetched');
});

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body);
  logUserEvent(req, 'USER_CREATED', user, 201, 'User created');
  return success(res, user.toSafeJSON(), 'User created and SIP extension provisioned', 201);
});

const provisionSip = asyncHandler(async (req, res) => {
  const user = await userService.provisionSip(req.params.id);
  logUserEvent(req, 'USER_SIP_PROVISIONED', user, 200, 'SIP provisioned');
  return success(res, user.toSafeJSON(), 'SIP provisioned');
});

const updateUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id) && req.body.role && req.body.role !== req.role.code) {
    throw new ApiError(403, 'You cannot change your own role');
  }
  const user = await userService.updateUser(req.params.id, req.body);
  logUserEvent(req, 'USER_UPDATED', user, 200, 'User updated');
  return success(res, user.toSafeJSON(), 'User updated');
});

const setUserStatus = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id) && req.body.status === 'inactive') {
    throw new ApiError(403, 'You cannot deactivate your own account');
  }
  const user = await userService.setUserStatus(req.params.id, req.body.status);
  logUserEvent(
    req,
    req.body.status === 'active' ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
    user,
    200,
    req.body.status === 'active' ? 'User activated' : 'User suspended and SIP extension deleted'
  );
  return success(res, user.toSafeJSON(), req.body.status === 'active' ? 'User activated' : 'User suspended');
});

const resetPassword = asyncHandler(async (req, res) => {
  const user = await userService.resetPassword(req.params.id, req.body.password);
  logUserEvent(req, 'USER_PASSWORD_RESET', user, 200, 'CRM password reset');
  return success(res, { id: String(user._id), passwordReset: true }, 'Password reset');
});

const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw new ApiError(403, 'You cannot delete your own account');
  }
  const user = await userService.setUserStatus(req.params.id, 'inactive');
  logUserEvent(req, 'USER_DELETED', user, 200, 'User access removed and SIP extension deleted');
  return success(res, {
    id: String(user._id),
    status: user.status,
    sipExtension: user.sipExtension,
    sipProvisionStatus: user.sipProvisionStatus,
  }, 'User access removed and SIP extension deleted');
});

module.exports = {
  listMentionable,
  createUser,
  provisionSip,
  updateUser,
  setUserStatus,
  resetPassword,
  deleteUser,
};