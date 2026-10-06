const callAssistService = require('../services/callAssist.service');
const callAssistFeedbackService = require('../services/callAssistFeedback.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const { logEvent } = require('../services/systemLog.service');

const actorName = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || '';

/**
 * GET /api/leads/:id/call-assist
 *
 * Builds the live-call context payload for the Agent Call Assist popup.
 * Read-only — no state is mutated; access mirrors GET /api/leads/:id.
 */
const getCallAssist = asyncHandler(async (req, res) => {
  const context = await callAssistService.buildCallAssistContext({
    leadId: req.params.id,
    agent: req.user,
  });

  logEvent({
    module: 'crud',
    action: 'CALL_ASSIST_OPENED',
    username: actorName(req.user),
    userId: String(req.user._id),
    role: String(req.role?.name || '').toUpperCase(),
    leadId: String(context.leadId),
    leadName: String(context.studentName || '').trim(),
    message: `Call assist opened for ${String(context.studentName || context.leadId).slice(0, 80)}`,
    apiPath: '/api/leads/:id/call-assist',
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
    metadata: { builder: context.generated?.builder || 'rules-v1', generatedContextVersion: context.generatedContextVersion },
  });

  return success(res, context, 'Call assist context fetched');
});

/**
 * POST /api/leads/:id/call-assist/feedback
 *
 * Stores a structured agent rating of the Call Assist context used during a
 * call. The agent is always derived from the authenticated session; `callId`
 * is null until a dialer exists. Failure here must never affect the already
 * completed call.
 */
const submitCallAssistFeedback = asyncHandler(async (req, res) => {
  const feedback = await callAssistFeedbackService.submitCallAssistFeedback({
    leadId: req.params.id,
    userId: req.user._id,
    payload: req.body,
  });

  logEvent({
    module: 'crud',
    action: 'CALL_ASSIST_FEEDBACK_SUBMITTED',
    username: actorName(req.user),
    userId: String(feedback.agentId),
    role: String(req.role?.name || '').toUpperCase(),
    leadId: String(feedback.leadId),
    leadName: String(feedback.studentName || '').trim(),
    message: 'Call assist feedback submitted',
    apiPath: '/api/leads/:id/call-assist/feedback',
    statusCode: 201,
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
    metadata: {
      generatedContextVersion: feedback.generatedContextVersion,
      callId: feedback.callId || null,
      disagreeCount: ['openingScript', 'studentContext', 'conversationFocus', 'nextQuestion'].filter(
        (f) => feedback[f] === 'disagree'
      ).length,
    },
  });

  return success(res, feedback, 'Call assist feedback submitted', 201);
});

/**
 * GET /api/supervisor/call-assist-feedback/summary
 *
 * Minimal Phase-1 aggregate: total submissions, comment count, and agree %
 * per category. No per-agent ranking or scoring.
 */
const getFeedbackSummary = asyncHandler(async (req, res) => {
  const summary = await callAssistFeedbackService.getFeedbackSummary();
  return success(res, summary, 'Call assist feedback summary fetched');
});

module.exports = { getCallAssist, submitCallAssistFeedback, getFeedbackSummary };