const dashboardService = require('../services/dashboard.service');
const { RNR_MODES } = require('../services/rnr.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');

const summary = asyncHandler(async (req, res) => {
  const data = await dashboardService.getSummary(req.user._id);
  return success(res, data, 'Dashboard summary fetched');
});

const workQueue = asyncHandler(async (req, res) => {
  const data = await dashboardService.getWorkQueueCounts(req.user._id);
  return success(res, data, 'Work queue counts fetched');
});

const callbacks = asyncHandler(async (req, res) => {
  const data = await dashboardService.getCallbacks(req.user._id);
  return success(res, data, 'Callbacks fetched');
});

const readyToCall = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const data = await dashboardService.getReadyToCall(req.user._id, { limit });
  return success(res, data, 'Ready to call leads fetched');
});

const nextAction = asyncHandler(async (req, res) => {
  const data = await dashboardService.getNextAction(req.user._id);
  return success(res, data, 'Next action fetched');
});

const myLeads = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const group = req.query.group || null;
  const data = await dashboardService.getMyLeads(req.user._id, { limit, group });
  return success(res, data, 'My leads fetched');
});

const assignedLeads = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
  const search = String(req.query.search || '').trim().slice(0, 100);
  const statuses = (Array.isArray(req.query.status)
    ? req.query.status
    : String(req.query.status || '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
  const priority = String(req.query.priority || '').trim() || null;
  const country = String(req.query.country || '').trim() || null;
  const intake = String(req.query.intake || '').trim() || null;
  const dropStatus = String(req.query.dropStatus || '').trim() || null;
  // RNR context filter: 'current' (RNR Leads) | 'not-reachable' (Not Reachable
  // Leads) | 'escalated' (RNR 6+ Leads). Anything else is ignored rather than
  // guessed at.
  const rawRnr = String(req.query.rnr || '').trim().toLowerCase();
  const rnrMode = RNR_MODES.has(rawRnr) ? rawRnr : null;

  const data = await dashboardService.getAssignedLeads(req.user._id, {
    page,
    pageSize,
    search,
    statuses,
    priority,
    country,
    intake,
    dropStatus,
    rnrMode,
  });
  return success(res, data, 'Assigned leads fetched');
});

const leads = asyncHandler(async (req, res) => {
  const data = await dashboardService.getAgentLeads(req.user._id);
  return success(res, data, 'Agent leads fetched');
});

const activity = asyncHandler(async (req, res) => {
  const data = await dashboardService.getActivity(req.user._id);
  return success(res, data, 'Agent activity fetched');
});

const report = asyncHandler(async (req, res) => {
  const data = await dashboardService.getReport(req.user._id);
  return success(res, data, 'Agent report fetched');
});

const reportDrilldown = asyncHandler(async (req, res) => {
  const period = String(req.query.period || '').trim();
  const metric = String(req.query.metric || '').trim();
  const data = await dashboardService.getReportDrilldown(req.user._id, period, metric);
  return success(res, data, 'Report drilldown fetched');
});

module.exports = { summary, workQueue, callbacks, readyToCall, nextAction, myLeads, assignedLeads, leads, activity, report, reportDrilldown };
