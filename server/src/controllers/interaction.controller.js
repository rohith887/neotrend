const interactionService = require('../services/interaction.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { logEvent } = require('../services/systemLog.service');

/**
 * POST /api/interactions
 * Submit a call outcome for a lead.
 */
const create = asyncHandler(async (req, res) => {
  const data = await interactionService.createInteraction(req.user._id, req.role.name, req.body);

  // Audit trail — disposition submitted / remarks captured on a lead. The
  // remark text and contact values are never written to the log.
  const interaction = data?.interaction || null;
  const remarks = String(req.body.remarks || '');
  logEvent({
    module: 'workflow',
    action: 'DISPOSITION_SUBMITTED',
    username: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email,
    userId: String(req.user._id),
    role: String(req.role.name || '').toUpperCase(),
    leadId: String(req.body.leadId || ''),
    message: `Disposition submitted: ${interaction?.dispositionName || '—'}`,
    apiPath: '/api/interactions',
    statusCode: 201,
    durationMs: interaction?.durationSec != null ? interaction.durationSec : undefined,
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
    metadata: {
      dispositionName: interaction?.dispositionName || null,
      hasRemarks: remarks.trim().length > 0,
      callbackRequested: Boolean(req.body.callbackDate && req.body.callbackTime),
      interactionId: interaction ? String(interaction._id) : null,
      callId: req.body.callId ? String(req.body.callId) : null,
    },
  });

  // Call remark / note captured as its own high-value event (text never stored).
  if (remarks.trim()) {
    logEvent({
      module: 'workflow',
      action: 'CALL_REMARK_ADDED',
      username: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email,
      userId: String(req.user._id),
      role: String(req.role.name || '').toUpperCase(),
      leadId: String(req.body.leadId || ''),
      message: `Call remark added to ${interaction?.lead?.studentName || 'lead'}`,
      apiPath: '/api/interactions',
      statusCode: 201,
      ipAddress: req.ip,
      requestId: String(req._tasaRequestId || ''),
      metadata: { interactionId: interaction ? String(interaction._id) : null },
    });
  }

  return success(res, data, 'Interaction saved', 201);
});

/**
 * GET /api/interactions?leadId=:id
 * List interactions for a lead (supervisor / reporting).
 */
const listByLead = asyncHandler(async (req, res) => {
  const { leadId } = req.query;
  if (!leadId) throw new ApiError(400, 'leadId query param is required');
  const data = await interactionService.listByLead(leadId);
  return success(res, data, 'Interactions fetched');
});

/**
 * GET /api/interactions/rnr-limits?leadId=:id
 * Return the RNR limit status for a lead (read-only, for frontend UX).
 */
const rnrLimits = asyncHandler(async (req, res) => {
  const { leadId } = req.query;
  if (!leadId) throw new ApiError(400, 'leadId query param is required');
  const data = await interactionService.getRnrLimits(leadId);
  return success(res, data, 'RNR limits fetched');
});

module.exports = { create, listByLead, rnrLimits };
