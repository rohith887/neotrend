const logoutGateService = require('../services/logoutGate.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

/**
 * POST /api/logout/check — sign-out gate for Agents/Counselors.
 * Supervisors/admins are never gated. For an agent/counselor with a
 * supervisor-approved one-shot override on the latest attempt, the override
 * is consumed and the logout is allowed.
 */
const checkLogout = asyncHandler(async (req, res) => {
  const role = String(req.role?.name || '').toUpperCase();
  if (role !== 'AGENT' && role !== 'COUNSELOR') {
    return success(res, {
      allowed: true,
      pendingCallbacks: 0,
      unfinishedRnr: 0,
      reason: null,
    });
  }
  const result = await logoutGateService.checkLogout(req.user._id);
  return success(res, result, result.allowed ? 'Logout allowed' : 'Logout blocked');
});

/**
 * POST /api/logout/:alertId/override — supervisor grants a one-shot logout
 * override for a specific blocked attempt (supervisor role only).
 */
const approveOverride = asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(alertId)) {
    throw new ApiError(400, 'Invalid alert id');
  }
  const supervisorName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email;
  const result = await logoutGateService.approveOverride({
    alertId,
    supervisorId: req.user._id,
    supervisorName,
    reason: req.body?.reason || '',
  });
  return success(res, result, 'Logout override granted');
});

module.exports = { checkLogout, approveOverride };