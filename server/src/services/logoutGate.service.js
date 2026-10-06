/**
 * LOGOUT GATE SERVICE — logout-control for Agents/Counselors.
 *
 * An Agent/Counselor may not sign out while there is unfinished work:
 * pending scheduled callbacks, or an unfinished RNR (a Ring-No-Response lead
 * whose latest call was RNR and no retry was scheduled).
 *
 * Flow:
 *   checkLogout()   — counts outstanding work; if any exists it supersedes
 *                     stale overrides, raises a "logout-blocked" alert to all
 *                     supervisors and blocks. If a supervisor has already
 *                     approved a one-shot override for the LATEST attempt,
 *                     the approval is consumed and the logout is allowed.
 *   approveOverride()— a supervisor grants a one-shot override for a specific
 *                     blocked attempt. Recorded in the System Log (audit)
 *                     and confirmed with a "logout-overridden" alert.
 *
 * Nothing is logged for normal breaks / normal logouts, and no alerts are
 * created for ordinary activity — only for the important events above.
 */
const Lead = require('../models/Lead');
const Interaction = require('../models/Interaction');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const { logEvent } = require('./systemLog.service');
const { getWorkQueue } = require('./workqueue.service');
const { activeLeadsFilter } = require('./leadDrop.service');
const notificationService = require('./notification.service');

// Statuses that take a lead out of the user's active workload (mirrors
// workqueue.service / dashboard.service so counts agree everywhere).
const TERMINAL_STATUSES = ['submitted', 'lost', 'callback-completed'];

const FULL_NAME_LIMIT = 60;

const normalizeMeta = (meta) => {
  if (!meta) return null;
  if (meta instanceof Map) return Object.fromEntries(meta);
  if (typeof meta.get === 'function' && typeof meta.entries === 'function') {
    return Object.fromEntries(meta.entries());
  }
  if (typeof meta === 'object') return { ...meta };
  return null;
};

const fullName = (u) =>
  (u ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim().slice(0, FULL_NAME_LIMIT) : '') ||
  u?.email ||
  'User';

/**
 * Outstanding-work counts for a user (the numbers shown in the blocked
 * dialog and in the supervisor alert). `pendingCallbacks` is the work-queue
 * single source of truth; `unfinishedRnr` is a lead still waiting on a retry
 * (latest disposition RNR, no scheduled callback supersedes it).
 */
const getOutstandingCounts = async (userId) => {
  const [queue, leads] = await Promise.all([
    getWorkQueue(userId),
    Lead.find({ assignedTo: userId, status: { $nin: TERMINAL_STATUSES }, ...activeLeadsFilter() })
      .select('_id')
      .lean(),
  ]);

  let unfinishedRnr = 0;
  if (leads.length) {
    const interactions = await Interaction.find({
      lead: { $in: leads.map((l) => l._id) },
    })
      .sort({ calledAt: -1, createdAt: -1 })
      .select('lead dispositionName callbackDateTime')
      .lean();

    const latestByLead = new Map();
    for (const it of interactions) {
      if (!latestByLead.has(String(it.lead))) latestByLead.set(String(it.lead), it);
    }

    for (const l of leads) {
      const latest = latestByLead.get(String(l._id));
      if (latest && latest.dispositionName === 'RNR' && !latest.callbackDateTime) {
        unfinishedRnr += 1;
      }
    }
  }

  return { pendingCallbacks: queue.pendingCount, unfinishedRnr };
};

const supersedeStaleOverrides = async (userId) =>
  Notification.updateMany(
    { type: 'logout-blocked', targetUser: userId, overrideStatus: { $in: ['pending', 'approved'] } },
    { $set: { overrideStatus: 'superseded' } }
  );

/**
 * Gate for a sign-out attempt. Returns the outcome + counts so the client
 * can either sign out or surface exactly what work remains.
 */
const checkLogout = async (userId) => {
  const counts = await getOutstandingCounts(userId);

  if (counts.pendingCallbacks === 0 && counts.unfinishedRnr === 0) {
    // Clean sign-out: an override belongs to a specific blocked attempt, so
    // drop any lingering approval — it must never unlock a future attempt.
    await supersedeStaleOverrides(userId);
    return { allowed: true, ...counts, reason: null, overrideUsed: null };
  }

  // A supervisor-approved one-shot override unlocks THE LATEST attempt only —
  // the approval lives on the newest logout-blocked alert for this user. An
  // older approval is stale the moment a newer attempt exists.
  const latest = await Notification.findOne({
    type: 'logout-blocked',
    targetUser: userId,
  })
    .sort({ createdAt: -1 })
    .lean();
  if (latest && latest.overrideStatus === 'approved') {
    // Consume the approval (and resolve any sibling copies still pending).
    await Notification.updateMany(
      { type: 'logout-blocked', targetUser: userId, overrideStatus: 'approved' },
      { $set: { overrideStatus: 'used', consumedAt: new Date() } }
    );
    await Notification.updateMany(
      { type: 'logout-blocked', targetUser: userId, overrideStatus: 'pending' },
      { $set: { overrideStatus: 'superseded' } }
    );
    return {
      allowed: true,
      ...counts,
      reason: 'override',
      overrideUsed: { alertId: String(latest._id) },
    };
  }

  // Block: invalidate stale approvals (a deliberate new attempt supersedes
  // an old supervisor approval so overrides are never permanent) and raise
  // the important supervisor alert.
  await supersedeStaleOverrides(userId);

  const user = await User.findById(userId).populate('role', 'name').lean();
  const targetName = fullName(user);
  const targetRole = String(user?.role?.name || '').toUpperCase();

  await notificationService.notifyAllSupervisors({
    type: 'logout-blocked',
    title: `Logout blocked — ${targetName}`,
    body: `${targetName} (${targetRole}) attempted to sign out with unfinished work: ${counts.pendingCallbacks} pending callback${counts.pendingCallbacks === 1 ? '' : 's'} and ${counts.unfinishedRnr} unfinished RNR lead${counts.unfinishedRnr === 1 ? '' : 's'}.`,
    sender: userId,
    targetUser: userId,
    meta: {
      targetName,
      targetRole,
      pendingCallbacks: String(counts.pendingCallbacks),
      unfinishedRnr: String(counts.unfinishedRnr),
      attemptAt: new Date().toISOString(),
    },
  });

  return { allowed: false, ...counts, reason: 'unfinished-work', overrideUsed: null };
};

/**
 * Supervisor grants a one-shot logout override for a specific blocked
 * attempt. Only pending attempts are overridable; the approval is recorded
 * in the System Log (as the target user's audit entry, with the supervisor
 * named in the payload) and confirmed to all supervisors via an alert.
 */
const approveOverride = async ({ alertId, supervisorId, supervisorName, reason = '' } = {}) => {
  if (!alertId) throw new ApiError(400, 'alertId is required');

  const alert = await Notification.findOne({
    _id: alertId,
    type: 'logout-blocked',
    user: supervisorId,
  });
  if (!alert) throw new ApiError(404, 'Logout alert not found');
  if (alert.overrideStatus !== 'pending') {
    throw new ApiError(409, `This logout alert was already ${alert.overrideStatus}`);
  }

  const target = await User.findById(alert.targetUser).populate('role', 'name').lean();
  if (!target) throw new ApiError(404, 'Target user not found');

  const overrideAt = new Date();
  alert.overrideStatus = 'approved';
  alert.overrideBy = supervisorId;
  alert.overrideByName = supervisorName;
  alert.overrideAt = overrideAt;
  alert.overrideReason = String(reason || '').trim().slice(0, 500);
  await alert.save();

  const targetName = fullName(target);
  const targetRole = String(target.role?.name || '').toUpperCase();
  const meta = normalizeMeta(alert.meta) || {};

  // System Log audit entry. The scope gate records Agent/Counselor activity
  // only, so the entry is attributed to the target user with the supervisor
  // and reason carried in the message + metadata.
  logEvent({
    module: 'security',
    action: 'LOGOUT_OVERRIDE_APPROVED',
    username: targetName,
    userId: String(target._id),
    role: targetRole,
    message: `${supervisorName} approved a one-shot logout override for ${targetName} (${targetRole})${reason ? ` — ${String(reason).slice(0, 160)}` : ''}`,
    apiPath: '/api/logout/:alertId/override',
    metadata: {
      supervisorName,
      supervisorId: String(supervisorId),
      reason: String(reason || '').slice(0, 500),
      alertId: String(alert._id),
      overrideAt: overrideAt.toISOString(),
      pendingCallbacks: meta.pendingCallbacks || '',
      unfinishedRnr: meta.unfinishedRnr || '',
      targetUserId: String(target._id),
    },
  });

  // Confirm to every supervisor that the override happened (important
  // operational alert — kept in the same alert stream).
  await notificationService.notifyAllSupervisors({
    type: 'logout-overridden',
    title: `Logout override granted — ${targetName}`,
    body: `${supervisorName} allowed ${targetName} (${targetRole}) to sign out despite outstanding work${reason ? ` — ${String(reason).slice(0, 200)}` : ''}.`,
    sender: supervisorId,
    targetUser: target._id,
    meta: {
      supervisorName,
      targetName,
      targetRole,
      reason: String(reason || '').slice(0, 200),
      alertId: String(alert._id),
      overrideAt: overrideAt.toISOString(),
    },
  });

  return {
    alertId: String(alert._id),
    overrideStatus: alert.overrideStatus,
    overrideBy: supervisorName,
    overrideAt: overrideAt.toISOString(),
  };
};

module.exports = { getOutstandingCounts, checkLogout, approveOverride };