const leadDropService = require('../services/leadDrop.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

/**
 * POST /api/notifications/:id/approve-drop — supervisor approves a pending
 * Drop Lead request (supervisor role only). The lead becomes a real dropped
 * lead (still revivable); every supervisor copy of the alert is resolved.
 */
const approveDropRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new ApiError(400, 'Invalid alert id');
  const supervisorName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email;
  const result = await leadDropService.approveDropRequest({
    alertId: id,
    supervisorId: req.user._id,
    supervisorName,
    reason: req.body?.reason || '',
  });
  return success(res, result, 'Drop approved — lead moved to Dropped');
});

/**
 * POST /api/notifications/:id/deny-drop — supervisor denies a pending Drop
 * Lead request (supervisor role only). The pending drop is cancelled and the
 * lead returns to its active working state.
 */
const denyDropRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new ApiError(400, 'Invalid alert id');
  const supervisorName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email;
  const result = await leadDropService.denyDropRequest({
    alertId: id,
    supervisorId: req.user._id,
    supervisorName,
    reason: req.body?.reason || '',
  });
  return success(res, result, 'Drop denied — lead returned to the active queue');
});

module.exports = { approveDropRequest, denyDropRequest };