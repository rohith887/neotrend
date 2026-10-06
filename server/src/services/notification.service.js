/**
 * NOTIFICATION SERVICE — create / list / read bookkeeping.
 *
 * Purely additive infrastructure: nothing here mutates existing modules.
 * Writers (task.service) push notifications; readers poll via the API.
 */
const Notification = require('../models/Notification');
const User = require('../models/User');
const Role = require('../models/Role');
const ApiError = require('../utils/ApiError');

// Normalize a notification's `meta` — it can be a Mongoose Map, a plain JS
// Map, or (after .lean()) a plain object — into a plain object.
const normalizeMeta = (meta) => {
  if (!meta) return null;
  if (meta instanceof Map) return Object.fromEntries(meta);
  if (typeof meta.get === 'function' && typeof meta.entries === 'function') {
    return Object.fromEntries(meta.entries());
  }
  if (typeof meta === 'object') return { ...meta };
  return null;
};

const mapNotification = (n) => {
  const meta = normalizeMeta(n.meta);
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body || '',
    taskId: n.taskId ? String(n.taskId) : null,
    lead: n.lead ? String(n.lead) : null,
    sender: n.sender ? String(n.sender) : null,
    senderName: (meta && meta.senderName) || null,
    leadRef: (meta && meta.leadRef) || null,
    leadStudent: (meta && meta.leadStudent) || null,
    meta,
    // Logout-control / break-alert payload passthrough.
    targetUser: n.targetUser ? String(n.targetUser) : null,
    targetName: (meta && meta.targetName) || null,
    targetRole: (meta && meta.targetRole) || null,
    overrideStatus: n.overrideStatus || 'pending',
    overrideBy: n.overrideBy ? String(n.overrideBy) : null,
    overrideByName: n.overrideByName || null,
    overrideAt: n.overrideAt ? n.overrideAt.toISOString() : null,
    overrideReason: n.overrideReason || '',
    consumedAt: n.consumedAt ? n.consumedAt.toISOString() : null,
    // Drop-lead supervisor decision payload (see Notification model).
    dropDecision: n.dropDecision || 'pending',
    dropDecisionBy: n.dropDecisionBy ? String(n.dropDecisionBy) : null,
    dropDecisionByName: n.dropDecisionByName || '',
    dropDecisionReason: n.dropDecisionReason || '',
    dropDecisionAt: n.dropDecisionAt ? n.dropDecisionAt.toISOString() : null,
    read: !!n.read,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt ? n.createdAt.toISOString() : null,
  };
};

const createNotification = async ({ userId, type = 'info', title, body = '', taskId = null, lead = null, sender = null, meta = null, targetUser = null, override = null } = {}) => {
  if (!userId) throw new ApiError(400, 'userId is required');
  if (!title) throw new ApiError(400, 'title is required');
  const doc = await Notification.create({
    user: userId,
    type,
    title,
    body,
    taskId: taskId || undefined,
    lead: lead || undefined,
    sender: sender || undefined,
    targetUser: targetUser || undefined,
    ...(override && typeof override === 'object'
      ? {
          overrideStatus: override.overrideStatus || undefined,
          overrideBy: override.overrideBy || undefined,
          overrideByName: override.overrideByName || undefined,
          overrideAt: override.overrideAt || undefined,
          overrideReason: override.overrideReason || undefined,
          consumedAt: override.consumedAt || undefined,
        }
      : {}),
    meta: meta ? new Map(Object.entries(meta).map(([k, v]) => [k, String(v)])) : undefined,
  });
  return mapNotification(doc);
};

/**
 * Deliver an operational alert to every active supervisor. Single delivery
 * path reused by break-exceed, logout-blocked and logout-overridden alerts —
 * the supervisor bell, unread count and Alerts page all read the same
 * per-user Notification store, so nothing parallel is created. `lead` links
 * the alert to a lead (used by drop-request alerts so the supervisor can open
 * it and the decision service can resolve every copy of the alert).
 */
const notifyAllSupervisors = async ({ type = 'info', title, body = '', lead = null, sender = null, targetUser = null, taskId = null, meta = null, override = null } = {}) => {
  const role = await Role.findOne({ name: 'SUPERVISOR', isActive: true }).select('_id').lean();
  if (!role) return [];
  const supervisors = await User.find({ role: role._id, isActive: true }).select('_id').lean();
  const created = [];
  for (const s of supervisors) {
    created.push(
      await createNotification({ userId: s._id, type, title, body, lead, sender, targetUser, taskId, meta, override })
    );
  }
  return created;
};

const listNotifications = async (userId, { limit = 20, unreadOnly = false, hours = null } = {}) => {
  const filter = { user: userId };
  if (unreadOnly) filter.read = false;
  // Monitoring window — e.g. `hours=48` scopes the feed to a real time range
  // instead of "however many of the newest N rows happened to land in it",
  // so a busy window never silently pushes older-but-still-in-range alerts
  // off the page.
  const hoursNum = Number(hours);
  if (hoursNum > 0) {
    filter.createdAt = { $gte: new Date(Date.now() - hoursNum * 3600000) };
  }
  const docs = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(500, Math.max(1, Number(limit) || 20)))
    .lean();
  return docs.map(mapNotification);
};

const unreadCount = async (userId) =>
  Notification.countDocuments({ user: userId, read: false });

const markRead = async (userId, id) => {
  const doc = await Notification.findOneAndUpdate(
    { _id: id, user: userId, read: false },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  if (!doc) throw new ApiError(404, 'Notification not found');
  return mapNotification(doc);
};

const markAllRead = async (userId) => {
  const res = await Notification.updateMany(
    { user: userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  return { updated: res.modifiedCount || 0 };
};

/**
 * DROP-REQUEST ALERT — an Agent/Counselor submitted the Drop Lead disposition.
 * The lead enters the 'drop-requested' (Drop Pending) state and every active
 * supervisor immediately receives an alert carrying everything needed to
 * decide: student name, lead ref, who dropped it, the drop reason, timestamp
 * and the current Drop Pending state.
 */
const createDropRequestAlert = async ({ leadId, referenceId, studentName, actorId, actorName, reason } = {}) => {
  const leadRef = String(referenceId || '');
  const name = String(studentName || '').trim() || 'Student';
  const who = actorName && String(actorName).trim() ? String(actorName).trim() : 'A team member';
  const title = `Lead dropped — ${name}`;
  const body = `${who} dropped lead ${leadRef || String(leadId)}. Supervisor approval is required.`;
  return notifyAllSupervisors({
    type: 'drop-request',
    title,
    body,
    lead: leadId,
    sender: actorId,
    targetUser: actorId,
    meta: {
      senderName: who,
      leadRef,
      leadStudent: name,
      dropReason: String(reason || ''),
      action: 'drop-review',
      requestedAt: new Date().toISOString(),
      currentState: 'Drop Pending',
    },
  });
};

/**
 * Mirror a lead-level drop decision (approved / denied) onto every pending
 * 'drop-request' alert for that lead, so all supervisor copies show the same
 * outcome and no stale Approve/Deny button remains actionable.
 */
const resolveDropAlerts = async ({ leadId, decision, supervisorId, supervisorName, reason = '' }) => {
  const res = await Notification.updateMany(
    { type: 'drop-request', lead: leadId, dropDecision: 'pending' },
    {
      $set: {
        dropDecision: decision,
        dropDecisionBy: supervisorId,
        dropDecisionByName: supervisorName,
        dropDecisionReason: String(reason || ''),
        dropDecisionAt: new Date(),
      },
    }
  );
  return { updated: res.modifiedCount || 0 };
};

module.exports = {
  createNotification,
  notifyAllSupervisors,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  createDropRequestAlert,
  resolveDropAlerts,
};
