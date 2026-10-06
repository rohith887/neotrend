const breakService = require('../services/break.service');
const notificationService = require('../services/notification.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const { logEvent } = require('../services/systemLog.service');

const auditUser = (req, action, message) =>
  logEvent({
    module: 'workflow',
    action,
    username: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email,
    userId: String(req.user._id),
    role: String(req.role.name || '').toUpperCase(),
    message,
    apiPath: req.originalUrl ? req.originalUrl.split('?')[0] : '',
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
  });

const startBreak = asyncHandler(async (req, res) => {
  const data = await breakService.startBreak(req.user._id, req.body);
  auditUser(req, 'BREAK_STARTED', `Break started: ${data?.type || req.body?.type || 'break'}`);
  return success(res, data, 'Break started', 201);
});

const endBreak = asyncHandler(async (req, res) => {
  const data = await breakService.endBreak(req.user._id);
  auditUser(req, 'BREAK_ENDED', `Break ended${data?.durationMinutes != null ? ` (${data.durationMinutes} min)` : ''}`);

  // Break-exceed alert — only for the 3 scheduled policy breaks
  // (Morning Tea / Lunch / Evening Tea), never for normal usage.
  const actorRole = String(req.role?.name || '').toUpperCase();
  if (
    (actorRole === 'AGENT' || actorRole === 'COUNSELOR') &&
    breakService.isBreakExceeded(data)
  ) {
    const allowed = breakService.BREAK_ALLOWANCE_MINUTES[data.type];
    const excess = Math.max(0, data.durationMinutes - allowed);
    const actorName =
      [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email;
    const endedLabel = data.endedAt
      ? new Date(data.endedAt).toLocaleString([], {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })
      : '';

    await notificationService.notifyAllSupervisors({
      type: 'break-exceeded',
      title: `Break exceeded — ${data.type} · ${actorName}`,
      body: `${actorName} (${actorRole}) exceeded ${data.type} by ${excess} min. Allowed ${allowed} min, actual ${data.durationMinutes} min${endedLabel ? ` · ended ${endedLabel}` : ''}.`,
      sender: req.user._id,
      targetUser: req.user._id,
      meta: {
        targetName: actorName,
        targetRole: actorRole,
        breakType: data.type,
        allowedMinutes: String(allowed),
        actualMinutes: String(data.durationMinutes),
        excessMinutes: String(excess),
        endedAt: data.endedAt ? data.endedAt.toISOString() : '',
      },
    });
  }

  return success(res, data, 'Break ended', 200);
});

const getActiveBreak = asyncHandler(async (req, res) => {
  const data = await breakService.getActiveBreak(req.user._id);
  return success(res, data, 'Active break fetched');
});

const listBreaks = asyncHandler(async (req, res) => {
  const data = await breakService.listBreaks(req.user._id, req.query);
  return success(res, data.docs, 'Breaks fetched', 200, data.meta);
});

const summarize = asyncHandler(async (req, res) => {
  const userId = req.role && req.role.name === 'SUPERVISOR' && req.query.userId
    ? req.query.userId
    : req.user._id;
  const data = await breakService.summarize({
    userId,
    from: req.query.from,
    to: req.query.to,
  });
  return success(res, data, 'Break summary fetched');
});

module.exports = { startBreak, endBreak, getActiveBreak, listBreaks, summarize };
