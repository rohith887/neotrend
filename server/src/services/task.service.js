/**
 * TASK SERVICE — Phase 6 reusable operational infrastructure.
 *
 * Responsibilities:
 *   • CRUD + assignment/reassignment for Task documents
 *   • Due-date / overdue detection
 *   • SLA window tracking (createdAt + slaHours) with one-shot breach
 *     escalation (flag persisted → notification + escalationLevel bump)
 *   • getAttentionSnapshot(): the single aggregate behind
 *     GET /api/supervisor/attention (overdue, SLA breaches, unassigned &
 *     stalled leads, waiting-on distribution, recent assignments, team
 *     workload). Everything is computed from real collections on demand —
 *     no cron, no fabricated data.
 */
const Task = require('../models/Task');
const { activeLeadsFilter } = require('./leadDrop.service');
const Lead = require('../models/Lead');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notification.service');

const { TASK_OPEN_STATUSES } = Task;

// Mirror of workqueue.service TERMINAL_STATUSES — leads that never count
// toward operational attention.
const TERMINAL_LEAD_STATUSES = ['submitted', 'lost', 'callback-completed'];

// A lead with no contact attempt in this window is considered stalled.
const STALLED_DAYS = 14;
// Window for the "recently assigned" operational feed.
const RECENT_ASSIGNMENT_DAYS = 7;

const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '—' : '—');

const mapTask = (t) => {
  const now = Date.now();
  const dueAt = t.dueAt ? t.dueAt.toISOString() : null;
  const slaDueAt =
    t.slaHours && t.createdAt
      ? new Date(new Date(t.createdAt).getTime() + t.slaHours * 3600000).toISOString()
      : null;
  return {
    id: String(t._id),
    title: t.title,
    description: t.description || '',
    type: t.type,
    priority: t.priority,
    status: t.status,
    dueAt,
    startedAt: t.startedAt ? t.startedAt.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    slaHours: t.slaHours ?? null,
    slaDueAt,
    slaBreached: !!t.slaBreached,
    escalationLevel: t.escalationLevel || 0,
    waitingOn: t.waitingOn || null,
    lead: t.lead
      ? {
          id: String(t.lead._id || t.lead),
          referenceId: t.lead.referenceId || null,
          studentName: t.lead.studentName || null,
        }
      : null,
    assignedTo: t.assignedTo
      ? {
          id: String(t.assignedTo._id || t.assignedTo),
          name: t.assignedTo._id ? fullName(t.assignedTo) : null,
        }
      : null,
    assignedBy: t.assignedBy ? String(t.assignedBy._id || t.assignedBy) : null,
    overdue: !!dueAt && TASK_OPEN_STATUSES.includes(t.status) && new Date(dueAt).getTime() < now,
    createdAt: t.createdAt ? t.createdAt.toISOString() : null,
    updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
  };
};

const POPULATE = [
  { path: 'assignedTo', select: 'firstName lastName email' },
  { path: 'lead', select: 'referenceId studentName' },
];

/* ── CRUD ──────────────────────────────────────────────────────────── */

const createTask = async (actorId, payload = {}) => {
  if (!payload.title || !String(payload.title).trim()) {
    throw new ApiError(400, 'Title is required');
  }
  const assignedTo = payload.assignedTo || actorId;

  const doc = await Task.create({
    title: String(payload.title).trim(),
    description: payload.description ? String(payload.description).trim() : '',
    type: payload.type || 'general',
    priority: payload.priority || 'P3',
    status: payload.status === 'in-progress' ? 'in-progress' : 'pending',
    dueAt: payload.dueAt || null,
    slaHours: payload.slaHours ?? null,
    waitingOn: payload.waitingOn || null,
    lead: payload.leadId || null,
    application: payload.applicationId || null,
    assignedTo,
    assignedBy: actorId,
    startedAt: payload.status === 'in-progress' ? new Date() : null,
  });

  if (String(assignedTo) !== String(actorId)) {
    notificationService
      .createNotification({
        userId: assignedTo,
        type: 'task-assigned',
        title: `New task: ${doc.title}`,
        body: payload.description || '',
        taskId: doc._id,
      })
      .catch(() => {});

    // Supervisor monitoring: mirror every assignment onto the supervisor
    // alert feed (same broadcast path as break-exceeded/drop-request) so
    // supervisors can see task load land on Agents/Counselors in real time.
    const [assignee, actor] = await Promise.all([
      User.findById(assignedTo).select('firstName lastName email').lean(),
      User.findById(actorId).select('firstName lastName email').lean(),
    ]);
    notificationService
      .notifyAllSupervisors({
        type: 'task-assigned',
        title: `New task: ${doc.title}`,
        body: payload.description || '',
        sender: actorId,
        targetUser: assignedTo,
        taskId: doc._id,
        meta: { targetName: fullName(assignee), senderName: fullName(actor) },
      })
      .catch(() => {});
  }

  const populated = await Task.findById(doc._id).populate(POPULATE).lean();
  return mapTask(populated);
};

const listTasks = async ({ scope = 'mine', actorId, status, assignedTo, type, page = 1, pageSize = 20 } = {}) => {
  const filter = {};
  if (scope === 'team') {
    // Team-wide listing — callers without user:read are rejected at the route.
    if (assignedTo) filter.assignedTo = assignedTo;
  } else {
    filter.assignedTo = assignedTo || actorId;
  }
  if (status === 'open') filter.status = { $in: TASK_OPEN_STATUSES };
  else if (status) filter.status = status;
  if (type) filter.type = type;

  const lim = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = Math.max(0, ((Number(page) || 1) - 1) * lim);

  const [rows, total] = await Promise.all([
    Task.find(filter).sort({ dueAt: 1, createdAt: -1 }).skip(skip).limit(lim).populate(POPULATE).lean(),
    Task.countDocuments(filter),
  ]);

  return { rows: rows.map(mapTask), total, page: Number(page) || 1, pageSize: lim };
};

const getTaskById = async (id) => {
  const t = await Task.findById(id).populate(POPULATE).lean();
  if (!t) throw new ApiError(404, 'Task not found');
  return mapTask(t);
};

const updateTask = async (actorId, id, patch = {}) => {
  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, 'Task not found');

  const reassignedTo =
    patch.assignedTo && String(patch.assignedTo) !== String(task.assignedTo)
      ? patch.assignedTo
      : null;

  const fields = ['title', 'description', 'type', 'priority', 'slaHours', 'waitingOn'];
  fields.forEach((f) => {
    if (patch[f] !== undefined) task[f] = patch[f];
  });
  if (patch.title !== undefined && !String(patch.title).trim()) {
    throw new ApiError(400, 'Title cannot be empty');
  }
  if (patch.dueAt !== undefined) task.dueAt = patch.dueAt || null;
  if (patch.leadId !== undefined) task.lead = patch.leadId || null;
  if (patch.status !== undefined) {
    const s = patch.status;
    if (!Task.TASK_STATUSES.includes(s)) throw new ApiError(400, `Invalid status: ${s}`);
    if (s === 'done' && task.status !== 'done') {
      task.completedAt = new Date();
      task.completedBy = actorId;
    }
    if (s === 'in-progress' && !task.startedAt) task.startedAt = new Date();
    if (s !== 'done' && task.completedAt) {
      task.completedAt = null;
      task.completedBy = undefined;
    }
    task.status = s;
  }
  if (reassignedTo) {
    task.assignedTo = reassignedTo;
    // Reassignment resets the SLA clock against the new owner's start point.
    task.slaBreached = false;
    task.breachedAt = null;
    task.escalatedAt = null;
  }

  await task.save();

  if (reassignedTo) {
    notificationService
      .createNotification({
        userId: reassignedTo,
        type: 'task-reassigned',
        title: `Task assigned to you: ${task.title}`,
        body: '',
        taskId: task._id,
      })
      .catch(() => {});

    // Supervisor monitoring: mirror the reassignment onto the supervisor
    // alert feed, same broadcast path as task-assigned above.
    const [newAssignee, actor] = await Promise.all([
      User.findById(reassignedTo).select('firstName lastName email').lean(),
      User.findById(actorId).select('firstName lastName email').lean(),
    ]);
    notificationService
      .notifyAllSupervisors({
        type: 'task-reassigned',
        title: `Task reassigned: ${task.title}`,
        body: '',
        sender: actorId,
        targetUser: reassignedTo,
        taskId: task._id,
        meta: { targetName: fullName(newAssignee), senderName: fullName(actor) },
      })
      .catch(() => {});
  }

  const populated = await Task.findById(task._id).populate(POPULATE).lean();
  return mapTask(populated);
};

/**
 * Self-service status change — any Agent/Counselor can move their own task
 * between pending/in-progress/done without the `user:read` permission that
 * guards the generic PATCH /:id (which also allows retitling/reassigning).
 * Ownership is enforced here: a caller can only touch a task assigned to them.
 */
const updateTaskStatusSelf = async (actorId, id, status) => {
  if (!Task.TASK_STATUSES.includes(status)) throw new ApiError(400, `Invalid status: ${status}`);
  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, 'Task not found');
  if (String(task.assignedTo) !== String(actorId)) {
    throw new ApiError(403, 'You can only update your own tasks');
  }

  if (status === 'done' && task.status !== 'done') {
    task.completedAt = new Date();
    task.completedBy = actorId;
  }
  if (status === 'in-progress' && !task.startedAt) task.startedAt = new Date();
  if (status !== 'done' && task.completedAt) {
    task.completedAt = null;
    task.completedBy = undefined;
  }
  task.status = status;
  await task.save();

  const populated = await Task.findById(task._id).populate(POPULATE).lean();
  return mapTask(populated);
};

const deleteTask = async (id) => {
  const task = await Task.findByIdAndDelete(id);
  if (!task) throw new ApiError(404, 'Task not found');
  // Cascade-clean notifications pointing at the removed task.
  const Notification = require('../models/Notification');
  await Notification.deleteMany({ taskId: task._id });
  return { id };
};

/* ── SLA breach detection + escalation ─────────────────────────────── */

/**
 * Scan open tasks whose SLA window has elapsed and escalate each exactly
 * once (persisted flag guards re-entry). Called lazily before any attention
 * read so counts and notifications stay fresh without a scheduler.
 */
const checkSlaBreaches = async () => {
  const now = new Date();
  const candidates = await Task.find({
    status: { $in: TASK_OPEN_STATUSES },
    slaHours: { $ne: null },
    slaBreached: false,
  })
    .select('title assignedTo slaHours createdAt')
    .populate('assignedTo', 'firstName lastName email')
    .lean();

  let escalated = 0;
  for (const t of candidates) {
    const deadline = new Date(t.createdAt).getTime() + t.slaHours * 3600000;
    if (deadline >= now.getTime()) continue;

    await Task.updateOne(
      { _id: t._id, slaBreached: false },
      {
        $set: { slaBreached: true, breachedAt: now, escalatedAt: now },
        $inc: { escalationLevel: 1 },
      }
    );

    const assigneeId = t.assignedTo?._id || t.assignedTo;

    await notificationService
      .createNotification({
        userId: assigneeId,
        type: 'task-sla-breach',
        title: `SLA breached: ${t.title}`,
        body: `Task exceeded its ${t.slaHours}h SLA window`,
        taskId: t._id,
      })
      .catch(() => {});

    // Supervisor monitoring: mirror every SLA breach onto the supervisor
    // alert feed, same broadcast path as break-exceeded/drop-request, so
    // supervisors see missed SLAs across Agents/Counselors in real time.
    notificationService
      .notifyAllSupervisors({
        type: 'task-sla-breach',
        title: `SLA breached: ${t.title}`,
        body: `Task exceeded its ${t.slaHours}h SLA window`,
        targetUser: assigneeId,
        taskId: t._id,
        meta: { targetName: fullName(t.assignedTo) },
      })
      .catch(() => {});

    escalated += 1;
  }
  return escalated;
};

/* ── Supervisor attention snapshot ─────────────────────────────────── */

/**
 * One read-only aggregate powering the dashboard "Attention Required" and
 * "Live Operations" panels. Counts derive from real Task/Lead documents at
 * request time; empty collections legitimately yield zeros.
 */
const getAttentionSnapshot = async () => {
  await checkSlaBreaches();

  const nowMs = Date.now();
  const stalledCutoff = new Date(nowMs - STALLED_DAYS * 86400000);
  const recentCutoff = new Date(nowMs - RECENT_ASSIGNMENT_DAYS * 86400000);
  const nowDate = new Date(nowMs);

  const [
    openTasks,
    overdueTasks,
    slaBreachedTasks,
    unassignedLeads,
    stalledLeads,
    waitingOnAgg,
    recentAssignments,
    workloadAgg,
  ] = await Promise.all([
    Task.countDocuments({ status: { $in: TASK_OPEN_STATUSES } }),
    Task.countDocuments({
      status: { $in: TASK_OPEN_STATUSES },
      dueAt: { $ne: null, $lt: nowDate },
    }),
    Task.countDocuments({ status: { $in: TASK_OPEN_STATUSES }, slaBreached: true }),
    Lead.countDocuments({
      status: 'new',
      $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
      ...activeLeadsFilter(),
    }),
    Lead.countDocuments({
      status: { $nin: TERMINAL_LEAD_STATUSES },
      assignedTo: { $exists: true, $ne: null },
      ...activeLeadsFilter(),
      $expr: {
        $lte: [
          { $ifNull: ['$lastCallAt', { $ifNull: ['$assignedAt', '$createdAt'] }] },
          stalledCutoff,
        ],
      },
    }),
    Lead.aggregate([
      { $match: { waitingOn: { $ne: null }, status: { $nin: TERMINAL_LEAD_STATUSES }, ...activeLeadsFilter() } },
      { $group: { _id: '$waitingOn', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]),
    Lead.find({ assignedAt: { $gte: recentCutoff }, ...activeLeadsFilter() })
      .sort({ assignedAt: -1 })
      .limit(5)
      .populate('assignedTo', 'firstName lastName')
      .select('studentName referenceId assignedAt assignedTo')
      .lean(),
    Task.aggregate([
      { $match: { status: { $in: TASK_OPEN_STATUSES } } },
      {
        $group: {
          _id: '$assignedTo',
          open: { $sum: 1 },
          overdue: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$dueAt', null] }, { $lt: ['$dueAt', '$$NOW'] }] },
                1,
                0,
              ],
            },
          },
          breached: { $sum: { $cond: ['$slaBreached', 1, 0] } },
        },
      },
      { $sort: { overdue: -1, breached: -1, open: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: '_u',
        },
      },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$_id' },
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: [{ $arrayElemAt: ['$_u.firstName', 0] }, ''] },
                  ' ',
                  { $ifNull: [{ $arrayElemAt: ['$_u.lastName', 0] }, ''] },
                ],
              },
            },
          },
          open: 1,
          overdue: 1,
          breached: 1,
        },
      },
    ]),
  ]);

  return {
    tasks: {
      open: openTasks,
      overdue: overdueTasks,
      slaBreached: slaBreachedTasks,
    },
    leads: {
      unassigned: unassignedLeads,
      stalled: stalledLeads,
      stalledDays: STALLED_DAYS,
    },
    waitingOn: waitingOnAgg.map((w) => ({ key: w._id, count: w.count })),
    recentAssignments: recentAssignments.map((l) => ({
      id: String(l._id),
      studentName: l.studentName,
      referenceId: l.referenceId,
      agentName: l.assignedTo ? fullName(l.assignedTo) : '—',
      assignedAt: l.assignedAt ? l.assignedAt.toISOString() : null,
    })),
    teamWorkload: workloadAgg.map((w) => ({
      userId: w.userId,
      name: w.name || 'Unknown',
      open: w.open,
      overdue: w.overdue,
      breached: w.breached,
    })),
    generatedAt: new Date(nowMs).toISOString(),
  };
};

module.exports = {
  createTask,
  listTasks,
  getTaskById,
  updateTask,
  updateTaskStatusSelf,
  deleteTask,
  checkSlaBreaches,
  getAttentionSnapshot,
};
