const activityService = require('../services/activity.service');
const callService     = require('../services/call.service');
const asyncHandler    = require('../utils/asyncHandler');
const { success }     = require('../utils/ApiResponse');
const ApiError        = require('../utils/ApiError');
const { logEvent }    = require('../services/systemLog.service');

/**
 * POST /api/activity/fetch-call
 *
 * Finds the next available lead for the logged-in agent (or claims a
 * specific lead when body.leadId is provided, e.g. from the work queue),
 * marks it as fetched, and returns the full lead object.
 */
const fetchCall = asyncHandler(async (req, res) => {
  // Only agents are eligible for calling assignments.
  // Counselors and supervisors must never receive calling leads.
  const roleCode = String(req.role?.code || '').toLowerCase();
  if (roleCode !== 'agent') {
    throw new ApiError(403, 'Only agents can fetch calling leads');
  }

  // A live call is the source of truth for "this agent is busy": fetching or
  // resuming another lead while a call is live would orphan the call record
  // and race the disposition workflow. The backend enforces the same gate as
  // the UI — End Call first.
  const liveCall = await callService.getActiveCallForAgent(req.user._id);
  if (liveCall) {
    throw new ApiError(409, 'End the active call before fetching another lead.');
  }

  const lead = req.body?.leadId
    ? await activityService.fetchLeadById(req.user._id, req.body.leadId)
    : await activityService.fetchNextLead(req.user._id);

  if (!lead) {
    throw new ApiError(404, 'No leads available');
  }

  const studentName = String(lead.studentName || '').trim();

  // Audit trail — which agent fetched/opened which lead, and when.
  logEvent({
    module: 'crud',
    action: 'FETCH_CALL',
    username: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email,
    userId: String(req.user._id),
    role: String(req.role.name || '').toUpperCase(),
    leadId: String(lead._id),
    leadName: studentName,
    message: `Agent fetched lead${studentName ? ` for ${studentName}` : ''}`,
    apiPath: '/api/activity/fetch-call',
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
    metadata: { claimed: Boolean(req.body?.leadId) },
  });

  return success(res, { lead }, 'Lead fetched successfully');
});

/**
 * GET /api/activity/workspace-stats
 * Today's live stats for the agent workspace hero strip.
 */
const stats = asyncHandler(async (req, res) => {
  const data = await activityService.workspaceStats(req.user._id);
  return success(res, data, 'Workspace stats fetched');
});

module.exports = { fetchCall, stats };
