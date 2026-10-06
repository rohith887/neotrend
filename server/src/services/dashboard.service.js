const Lead = require('../models/Lead');
const Interaction = require('../models/Interaction');
const Activity = require('../models/Activity');
const ApiError = require('../utils/ApiError');
const config = require('../config');
const { workspaceStats, listReadyToCall } = require('./activity.service');
const { getWorkQueue } = require('./workqueue.service');
const { getAgentRnrSets, getRnrLeadIds } = require('./rnr.service');
const { activeLeadsFilter } = require('./leadDrop.service');
const { startOfDayNDaysAgoInTz, startOfDayInTz, endOfDayInTz, dateKeyInTz, addLocalDays, workingWeekWindows, monthWindows } = require('../utils/dateTime');
const { NO_ANSWER_DISPOSITIONS, BUSY_DISPOSITIONS, CONVERSION_PRIORITIES, QUALIFY_EXCLUDED } = require('../utils/callMetrics');

/**
 * AGENT DASHBOARD SERVICE
 *
 * Purpose-built endpoints for the Agent Dashboard landing page. Every widget
 * on the page maps to exactly one function here so the UI never has to fetch
 * heavyweight lists just to render a count. All queries are scoped to the
 * logged-in agent (`assignedTo: agentId`) — the same data-level rule enforced
 * in the rest of the service layer.
 */

const STATUS_DISPLAY = {
  new: 'New',
  assigned: 'Contacted',
  fetched: 'Contacted',
  'in-progress': 'Qualified',
  callback: 'Qualified',
  'follow-up': 'Qualified',
  completed: 'Application Started',
  'callback-completed': 'Callback Completed',
  submitted: 'Enrolled',
  'documents-pending': 'Documents Pending',
  'offer-received': 'Offer Received',
  'visa-process': 'Visa Process',
  lost: 'Lost',
  dropped: 'Dropped',
};

// Reverse map: display label → every raw status that renders as that label.
// Used by the Assigned Leads drawer so the status filter can be driven by
// friendly labels ("Qualified") while still matching every raw status.
const DISPLAY_TO_RAW = {};
for (const [raw, label] of Object.entries(STATUS_DISPLAY)) {
  (DISPLAY_TO_RAW[label] ||= []).push(raw);
}

// Expand a filter value (display label or raw status) into raw statuses.
const statusToRaw = (value) => {
  const label = DISPLAY_TO_RAW[value];
  if (label) return label;
  return [value];
};

// Mirror of the work-queue widget groups. `statuses` are the lifecycle
// statuses that belong to the group; `priority` marks groups driven by the
// current disposition/interest priority instead of status.
const WORK_QUEUE_GROUPS = [
  { key: 'readyToDial',       label: 'Ready to Dial',       statuses: ['new', 'assigned'],                          priority: null, today: false, icon: 'bi-telephone-inbound' },
  { key: 'contacted',         label: 'Contacted',           statuses: ['fetched'],                                  priority: null, today: false, icon: 'bi-person-check' },
  { key: 'qualified',         label: 'Qualified',           statuses: ['in-progress', 'follow-up'],                 priority: null, today: false, icon: 'bi-patch-check' },
  { key: 'interested',        label: 'Interested',          statuses: [],                                           priority: 'any', today: false, icon: 'bi-hand-thumbs-up' },
  { key: 'callbackScheduled', label: 'Callback Scheduled',  statuses: ['callback'],                                 priority: null, today: false, icon: 'bi-calendar2-check' },
  { key: 'p1Ready',           label: 'P1 Ready',            statuses: [],                                           priority: 'P1',  today: false, icon: 'bi-fire' },
  { key: 'completedToday',    label: 'Completed Today',     statuses: ['completed'],                                priority: null, today: true,  icon: 'bi-check2-circle' },
  { key: 'registrationReady', label: 'Ready for Registration', statuses: ['documents-pending', 'offer-received', 'visa-process'], priority: null, today: false, icon: 'bi-send-check' },
];

const PRIORITY_VALUES = new Set(['P1', 'P2', 'P3']);

// Statuses that take a lead out of the agent's active workload. The "Total
// Assigned Leads" KPI and the `active` lead group exclude these.
const TERMINAL_STATUSES = ['submitted', 'lost', 'callback-completed'];

// Lead-list filters keyed by the KPI "group" a dashboard shortcut maps to.
// Mirrors the summary KPI definitions so a count and its list can never
// disagree.
const LEAD_GROUP_FILTERS = {
  active: { status: { $nin: TERMINAL_STATUSES } },
  readyToCall: { status: { $in: ['new', 'assigned'] } },
  qualified: { status: { $in: ['in-progress', 'callback', 'follow-up'] } },
  registrationReady: {
    status: { $in: ['completed', 'documents-pending', 'offer-received', 'visa-process'] },
  },
  callbacks: { status: 'callback' },
};

const toKey = (d) => dateKeyInTz(d);

/* ── Lead → client shape (shared by my-leads + leads list) ──────────── */
const mapAgentLead = (l) => {
  const disp = l.currentDisposition;
  const priority = disp?.priority || l.interestLevel || null;
  return {
    id: String(l._id),
    referenceId: l.referenceId,
    studentName: l.studentName,
    mobile: l.mobile,
    email: l.email || '',
    country: l.countryPreferred?.name || null,
    intake: l.intake || '',
    status: STATUS_DISPLAY[l.status] || l.status,
    rawStatus: l.status,
    priority,
    assignedAt: l.assignedAt ? l.assignedAt.toISOString() : null,
    lastCallAt: l.lastCallAt ? l.lastCallAt.toISOString() : null,
    dispositionName: disp?.name || null,
    dispositionColor: disp?.color || null,
    dropStatus: l.dropStatus || 'active',
  };
};

/* ── Aggregation-shaped lead → same client shape as mapAgentLead ────── */
const mapAssignedLead = (l) => {
  const disp = l._disp && l._disp[0];
  return {
    id: String(l._id),
    referenceId: l.referenceId,
    studentName: l.studentName,
    mobile: l.mobile,
    email: l.email || '',
    country: l._countryName || null,
    intake: l.intake || '',
    status: STATUS_DISPLAY[l.status] || l.status,
    rawStatus: l.status,
    priority: l._priority || null,
    assignedAt: l.assignedAt ? l.assignedAt.toISOString() : null,
    lastCallAt: l.lastCallAt ? l.lastCallAt.toISOString() : null,
    dispositionName: disp?.name || null,
    dispositionColor: disp?.color || null,
    dropStatus: l.dropStatus || 'active',
    // Counselor lifecycle fields
    registrationStatus: l.registrationStatus || null,
    documentStatus:     l.documentStatus || null,
    applicationStatus:  l.applicationStatus || null,
    visaStatus:         l.visaStatus || null,
  };
};

/* ── Ready-to-call queue row — mapAgentLead + the fields the dashboard
   "Ready to Call" list needs (lead source + created date). ─────────── */
const mapReadyLead = (l) => ({
  ...mapAgentLead(l),
  source: l.source?.name || null,
  createdAt: l.createdAt ? l.createdAt.toISOString() : null,
});

/**
 * GET /agent/dashboard/summary — workload KPI values for the agent.
 *
 * These are the "what needs doing next" numbers that drive the dashboard:
 * assigned workload, ready-to-call pool, pending callbacks, hot (P1) leads,
 * qualified leads and the registration hand-off queue. Call-by-call metrics
 * (calls made, connected, talk time) belong to the Call Workspace strip, so
 * they are intentionally not repeated here.
 *
 * totalAssignedLeads counts EVERY lead currently assigned to the agent,
 * regardless of status — the "Assigned Leads" work-queue drawer behind the
 * KPI is the single source of truth for the full workload.
 *
 * rnrLeads / notReachableLeads / rnr6PlusLeads are three deliberately DIFFERENT
 * buckets, all resolved from rnr.service so the KPI number and the drawer list
 * behind it can never disagree:
 *   rnrLeads           → live RNR queue: latest disposition is EXACTLY RNR and
 *                        today's RNR allowance is not yet used up (3/day).
 *   notReachableLeads  → live Not Reachable queue: latest disposition is EXACTLY
 *                        "Switched Off / Not Reachable", with its own independent
 *                        daily allowance. Disjoint from rnrLeads.
 *   rnr6PlusLeads      → lifetime escalation bucket (lifetime total RNR attempts
 *                        >= 6), regardless of current status or disposition.
 *                        Feeds neither current queue.
 */
const getSummary = async (agentId) => {
  const [queue, totalAssignedLeads, readyToCall, qualifiedLeads, readyForRegistration, p1Count, droppedLeads, rnrSets] =
    await Promise.all([
      getWorkQueue(agentId),
      // Total assigned = the agent's active workload. Dropped leads are
      // counted separately.
      Lead.countDocuments({ assignedTo: agentId, ...activeLeadsFilter() }),
      // Ready-to-call = the agent's actionable leads per the existing
      // call-queue rules (activity.service.listReadyToCall → isAssignedActionable):
      // the agent's own 'new'/'assigned'/'callback' leads that are not locked
      // by another agent, whose callback is due (or retry window elapsed).
      // Kept in lock-step with the "Ready to Call" list so the KPI always
      // equals the list length. The shared unassigned fresh pool is NOT part
      // of this count — fresh leads are only ever claimed via the FIFO
      // Fetch Call path.
      listReadyToCall(agentId, 10000).then((leads) => leads.length),
      Lead.countDocuments({
        assignedTo: agentId,
        status: { $in: ['in-progress', 'callback', 'follow-up'] },
        ...activeLeadsFilter(),
      }),
      Lead.countDocuments({
        assignedTo: agentId,
        status: { $in: ['completed', 'documents-pending', 'offer-received', 'visa-process'] },
        ...activeLeadsFilter(),
      }),
      // Hot (P1) leads: P1 from the current disposition OR a manual P1
      // interest-level tag, excluding terminal statuses.
      Lead.aggregate([
        { $match: { assignedTo: agentId, status: { $nin: TERMINAL_STATUSES }, ...activeLeadsFilter() } },
        {
          $lookup: {
            from: 'dispositions',
            localField: 'currentDisposition',
            foreignField: '_id',
            as: '_disp',
          },
        },
        {
          $addFields: {
            _dispPriority: { $arrayElemAt: ['$_disp.priority', 0] },
          },
        },
        {
          $match: {
            $or: [{ _dispPriority: 'P1' }, { interestLevel: 'P1' }],
          },
        },
        { $count: 'n' },
      ]),
      // Dropped leads = leads marked via the Drop Lead disposition. Counted
      // with the EXACT condition the Assigned Leads drawer applies for its
      // "Dropped" filter (dropStatus === 'dropped') so the KPI and the drawer
      // results can never disagree.
      Lead.countDocuments({ assignedTo: agentId, dropStatus: 'dropped' }),
      // All three RNR-family KPI buckets come from the SAME rnr.service resolver
      // the Assigned Leads drawer uses for its `rnr=current` /
      // `rnr=not-reachable` / `rnr=escalated` filters — count === list length,
      // always. `current` and `notReachable` are disjoint queues.
      getAgentRnrSets(agentId),
    ]);

  return {
    totalAssignedLeads,
    readyToCall,
    pendingCallbacks: queue.pendingCount,
    p1Leads: p1Count[0]?.n ?? 0,
    qualifiedLeads,
    readyForRegistration,
    droppedLeads,
    rnrLeads: rnrSets.current.length,
    notReachableLeads: rnrSets.notReachable.length,
    rnr6PlusLeads: rnrSets.escalated.length,
    updatedAt: new Date().toISOString(),
  };
};

/**
 * GET /agent/dashboard/work-queue — "My Work Queue" grouped lead counts.
 * Groups are derived from the agent's assigned leads; priority groups read
 * the current disposition/interest priority.
 */
const getWorkQueueCounts = async (agentId) => {
  const [leads, stats] = await Promise.all([
    Lead.find({ assignedTo: agentId, ...activeLeadsFilter() })
      .populate('currentDisposition', 'name label priority color')
      .lean(),
    workspaceStats(agentId),
  ]);

  const startOfToday = startOfDayInTz(new Date());

  const groups = WORK_QUEUE_GROUPS.map((g) => {
    let count = 0;
    for (const l of leads) {
      const dispPriority = l.currentDisposition?.priority || null;
      if (g.priority === 'P1') {
        if (dispPriority === 'P1' || l.interestLevel === 'P1') count += 1;
        continue;
      }
      if (g.priority === 'any') {
        if (PRIORITY_VALUES.has(dispPriority) || PRIORITY_VALUES.has(l.interestLevel)) count += 1;
        continue;
      }
      if (!g.statuses.includes(l.status)) continue;
      if (g.today && !(l.lastCallAt && l.lastCallAt >= startOfToday)) continue;
      count += 1;
    }
    return { key: g.key, label: g.label, icon: g.icon, count };
  });

  return { groups, totalCalls: stats.todayCalls, updatedAt: new Date().toISOString() };
};

/**
 * GET /agent/dashboard/callbacks — the agent's callback queue.
 *
 * Built from the shared work-queue buckets (single source of truth), then
 * re-split into the two buckets the dashboard shows:
 *   dueNow   — scheduled callback time has arrived (or missing) → red/orange
 *   upcoming — scheduled later, sorted by date/time ascending
 * The four work-queue buckets (overdue/today/tomorrow/later) are still
 * returned so the workspace widgets keep working unchanged.
 */
const getCallbacks = async (agentId) => {
  const queue = await getWorkQueue(agentId);
  const now = new Date();
  const all = [
    ...queue.callbacksOverdue,
    ...queue.callbacksToday,
    ...queue.callbacksTomorrow,
    ...queue.callbacksLater,
  ];
  const sortByDue = (a, b) => String(a.dueAt || '').localeCompare(String(b.dueAt || ''));
  return {
    dueNow: all
      .filter((e) => !e.dueAt || new Date(e.dueAt).getTime() <= now.getTime())
      .sort(sortByDue),
    upcoming: all
      .filter((e) => e.dueAt && new Date(e.dueAt).getTime() > now.getTime())
      .sort(sortByDue),
    overdue: queue.callbacksOverdue,
    today: queue.callbacksToday,
    pendingCount: queue.pendingCount,
    overdueCount: queue.callbacksOverdue.length,
    updatedAt: new Date().toISOString(),
  };
};

/**
 * GET /agent/dashboard/ready-to-call — the agent's live "Ready to Call"
 * queue. Uses the exact same eligibility as the workspace fetch pool
 * (activity.service.listReadyToCall → isAssignedActionable), so a lead shown
 * here is guaranteed to be claimable by the same fetch-call endpoint.
 */
const getReadyToCall = async (agentId, { limit = 20 } = {}) => {
  const leads = await listReadyToCall(agentId, limit);
  return leads.map(mapReadyLead);
};

/**
 * GET /agent/dashboard/next-action — the single most urgent thing the agent
 * should do right now. Resolution order:
 *   1. Overdue callback (danger)
 *   2. Hot (P1) lead ready to call (danger)
 *   3. Callback due today
 *   4. Any other scheduled callback
 *   5. Next ready lead in the pool
 *   6. Queue clear
 */
const getNextAction = async (agentId) => {
  const [queue, hotLead, readyToCallCount] = await Promise.all([
    getWorkQueue(agentId),
    Lead.aggregate([
      { $match: { assignedTo: agentId, status: { $in: ['new', 'assigned'] }, ...activeLeadsFilter() } },
      {
        $lookup: {
          from: 'dispositions',
          localField: 'currentDisposition',
          foreignField: '_id',
          as: '_disp',
        },
      },
      {
        $addFields: {
          _dispPriority: { $arrayElemAt: ['$_disp.priority', 0] },
        },
      },
      { $match: { $or: [{ _dispPriority: 'P1' }, { interestLevel: 'P1' }] } },
      { $sort: { createdAt: 1 } },
      { $limit: 1 },
      {
        $project: {
          _id: 1,
          studentName: 1,
          referenceId: 1,
          priority: { $literal: 'P1' },
        },
      },
    ]),
    Lead.countDocuments({
      status: { $in: ['new', 'assigned'] },
      $or: [
        { assignedTo: agentId },
        { assignedTo: { $exists: false } },
        { assignedTo: null },
      ],
      ...activeLeadsFilter(),
    }),
  ]);

  const pick = (entry) => ({
    action: 'callback',
    leadId: entry.id,
    studentName: entry.studentName,
    mobile: entry.mobile,
    dueAt: entry.dueAt,
    title: 'Resume overdue callback',
    detail: `${entry.studentName} — callback was due ${entry.dueAt ? new Date(entry.dueAt).toLocaleString() : ''}`.trim(),
    tone: 'danger',
    icon: 'bi-alarm',
  });

  let action;
  if (queue.callbacksOverdue.length) {
    action = pick(queue.callbacksOverdue[0]);
  } else if (hotLead.length) {
    action = {
      action: 'call',
      leadId: String(hotLead[0]._id),
      studentName: hotLead[0].studentName,
      title: 'Call hot P1 lead',
      detail: `${hotLead[0].studentName} is P1 and ready to call — highest priority`,
      tone: 'danger',
      icon: 'bi-fire',
    };
  } else if (queue.callbacksToday.length) {
    const e = queue.callbacksToday[0];
    action = {
      ...pick(e),
      title: 'Resume next callback',
      detail: `${e.studentName} — callback due today`,
      tone: 'warning',
      icon: 'bi-calendar2-check',
    };
  } else if (queue.pendingCount) {
    const e = queue.callbacksLater[0] || queue.callbacksTomorrow[0];
    if (e) {
      action = {
        action: 'callback',
        leadId: e.id,
        studentName: e.studentName,
        dueAt: e.dueAt,
        title: 'Resume scheduled callback',
        detail: `${e.studentName} — next scheduled callback`,
        tone: 'warning',
        icon: 'bi-calendar2-check',
      };
    } else {
      action = {
        action: 'fetch',
        leadId: null,
        title: 'Fetch next ready lead',
        detail: 'Your callbacks are scheduled for later — start a fresh call instead',
        tone: 'primary',
        icon: 'bi-telephone-inbound',
      };
    }
  } else if (readyToCallCount) {
    action = {
      action: 'fetch',
      leadId: null,
      title: 'Fetch next ready lead',
      detail: `${readyToCallCount} lead${readyToCallCount === 1 ? '' : 's'} ready to call — start a fresh call`,
      tone: 'primary',
      icon: 'bi-telephone-inbound',
    };
  } else {
    action = {
      action: 'clear',
      leadId: null,
      title: 'All caught up',
      detail: 'No pending work — your queue is clear',
      tone: 'success',
      icon: 'bi-check2-circle',
    };
  }

  return { ...action, updatedAt: new Date().toISOString() };
};

/**
 * GET /agent/dashboard/my-leads — the agent's assigned leads.
 *
 * Default (no `group`): the most recently assigned leads (compact widget).
 * With `group`: a filtered, latest-assigned-first list behind the KPI strip
 * shortcuts — active / qualified / registrationReady / callbacks (status
 * driven) and p1 (current disposition/interest priority P1).
 */
const getMyLeads = async (agentId, { limit = 10, group } = {}) => {
  const query = { assignedTo: agentId, ...activeLeadsFilter() };
  let byPriority = false;

  if (group) {
    if (group === 'p1') {
      query.status = { $nin: TERMINAL_STATUSES };
      byPriority = true;
    } else {
      const filter = LEAD_GROUP_FILTERS[group];
      if (!filter) throw new ApiError(400, `Unknown lead group: ${group}`);
      Object.assign(query, filter);
    }
  }

  const fetchLimit = group ? (byPriority ? 200 : 50) : limit;

  let leads = await Lead.find(query)
    .sort({ assignedAt: -1, createdAt: -1 })
    .limit(fetchLimit)
    .populate('countryPreferred', 'name code')
    .populate('currentDisposition', 'name label priority color')
    .lean();

  if (byPriority) {
    leads = leads.filter(
      (l) => l.currentDisposition?.priority === 'P1' || l.interestLevel === 'P1'
    );
  }

  return leads.slice(0, 50).map(mapAgentLead);
};

/**
 * GET /agent/dashboard/assigned-leads — the agent's full assigned workload.
 *
 * The primary agent work queue. Unlike `my-leads` (compact widgets), this
 * returns EVERY lead assigned to the agent regardless of status, with server
 * side search, filters (Status / Priority / Country / Intake), sorting and
 * pagination — the single source of truth behind the "Assigned Leads" KPI.
 *
 * `status` accepts display labels ("Qualified") or raw statuses and expands
 * to every matching raw status. Filter option lists (statuses / countries /
 * intakes / priorities) are derived from the agent's own leads so the drawer
 * never hard-codes values.
 *
 * `rnrMode` is the RNR context filter used by the three RNR dashboard KPIs. It
 * resolves to exactly the same lead set the matching KPI counts (both go
 * through rnr.service), so the KPI number and the drawer result can never
 * drift apart:
 *   'current'       → latest disposition is RNR and still open today (max 3/day)
 *   'not-reachable' → latest disposition is "Switched Off / Not Reachable",
 *                     with its own independent daily allowance (max 3/day)
 *   'escalated'     → lifetime RNR attempts >= 6 (RNR state or not)
 */
const getAssignedLeads = async (agentId, {
  page = 1,
  pageSize = 10,
  search = '',
  statuses = [],
  priority = null,
  country = null,
  intake = null,
  dropStatus = null,
  rnrMode = null,
} = {}) => {
  const base = { assignedTo: agentId };

  const filters = { ...base };
  if (Array.isArray(statuses) && statuses.length) {
    // "Callback" is defined by a pending scheduled callback (latest
    // interaction), not the lead status — resolve it through the work queue
    // so the drawer matches the Pending Callbacks KPI exactly.
    const wantsCallback = statuses.some((s) => String(s).trim().toLowerCase() === 'callback');
    const others = statuses.filter((s) => String(s).trim().toLowerCase() !== 'callback');
    const raw = [...new Set(others.flatMap((s) => statusToRaw(String(s))))];
    let callbackIds = [];
    if (wantsCallback) {
      const q = await getWorkQueue(agentId);
      callbackIds = [...q.callbacksOverdue, ...q.callbacksToday, ...q.callbacksTomorrow, ...q.callbacksLater]
        .map((e) => e.id);
    }
    const conds = [];
    if (raw.length) conds.push({ status: { $in: raw } });
    if (wantsCallback) conds.push({ _id: { $in: callbackIds } });
    if (conds.length) filters.$and = [{ $or: conds }];
  }
  if (intake) filters.intake = String(intake).trim();
  if (country) filters._countryName = String(country).trim();
  if (priority) filters._priority = String(priority).trim().toUpperCase();
  if (dropStatus) filters.dropStatus = String(dropStatus).trim();
  // RNR context filter (RNR Leads / RNR 6+ Leads KPIs). Resolved through
  // rnr.service — the exact same resolver that produces the KPI counts.
  if (rnrMode) filters._id = { $in: await getRnrLeadIds(agentId, rnrMode) };
  if (search) {
    const esc = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filters.$or = [
      { studentName: { $regex: esc, $options: 'i' } },
      { referenceId: { $regex: esc, $options: 'i' } },
      { mobile: { $regex: esc, $options: 'i' } },
      { email: { $regex: esc, $options: 'i' } },
    ];
  }

  const skip = Math.max(0, (page - 1) * pageSize);
  const limit = Math.min(50, Math.max(1, pageSize));

  const [result] = await Lead.aggregate([
    { $match: base },
    {
      $lookup: {
        from: 'dispositions',
        localField: 'currentDisposition',
        foreignField: '_id',
        as: '_disp',
      },
    },
    {
      $lookup: {
        from: 'countries',
        localField: 'countryPreferred',
        foreignField: '_id',
        as: '_country',
      },
    },
    {
      $addFields: {
        _countryName: { $ifNull: [{ $arrayElemAt: ['$_country.name', 0] }, ''] },
        _priority: { $ifNull: [{ $arrayElemAt: ['$_disp.priority', 0] }, '$interestLevel'] },
        registrationStatus: '$registrationStatus',
        documentStatus: '$documentStatus',
        applicationStatus: '$applicationStatus',
        visaStatus: '$visaStatus',
        dropStatus: '$dropStatus',
      },
    },
    {
      $facet: {
        rows: [
          { $match: filters },
          { $sort: { assignedAt: -1, createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
        ],
        total: [{ $match: filters }, { $count: 'n' }],
        allCount: [{ $count: 'n' }],
        options: [
          {
            $group: {
              _id: null,
              statuses: { $addToSet: '$status' },
              countries: { $addToSet: '$_countryName' },
              intakes: { $addToSet: '$intake' },
              priorities: { $addToSet: '$_priority' },
              dropStatuses: { $addToSet: '$dropStatus' },
            },
          },
        ],
      },
    },
  ]);

  const options = result?.options?.[0] || {};

  return {
    rows: (result?.rows || []).map(mapAssignedLead),
    total: result?.total?.[0]?.n ?? 0,
    allCount: result?.allCount?.[0]?.n ?? 0,
    page,
    pageSize: limit,
    options: {
      statuses: (options.statuses || []).filter(Boolean).sort(),
      countries: (options.countries || []).filter(Boolean).sort(),
      intakes: (options.intakes || []).filter(Boolean).sort(),
      priorities: (options.priorities || []).filter(Boolean).sort(),
      dropStatuses: (options.dropStatuses || []).filter(Boolean).sort(),
    },
    updatedAt: new Date().toISOString(),
  };
};

/**
 * GET /agent/dashboard/leads — full list of the agent's own leads (My Leads /
 * Lead Management page). Same shape as my-leads.
 */
const getAgentLeads = async (agentId) => {
  const leads = await Lead.find({ assignedTo: agentId, ...activeLeadsFilter() })
    .sort({ createdAt: -1 })
    .populate('countryPreferred', 'name code')
    .populate('currentDisposition', 'name label priority color')
    .lean();
  return leads.map(mapAgentLead);
};

/**
 * GET /agent/dashboard/activity — the agent's recent activity timeline.
 * Maps raw Activity documents into display-friendly timeline entries.
 */
const ACTIVITY_MAP = {
  LEAD_FETCHED: { title: 'Lead fetched', tone: 'primary', icon: 'bi-telephone-inbound' },
  START_CALL: { title: 'Call connected', tone: 'success', icon: 'bi-telephone' },
  END_CALL: { title: 'Call ended', tone: 'info', icon: 'bi-telephone-x' },
  CALLBACK_COMPLETED: { title: 'Callback completed', tone: 'success', icon: 'bi-check2-circle' },
  CALLBACK_RESCHEDULED: { title: 'Callback rescheduled', tone: 'warning', icon: 'bi-calendar2-plus' },
  BREAK_IN: { title: 'Break started', tone: 'warning', icon: 'bi-pause-circle' },
  BREAK_OUT: { title: 'Break ended', tone: 'success', icon: 'bi-play-circle' },
  LOGIN: { title: 'Signed in', tone: 'primary', icon: 'bi-box-arrow-in-right' },
  LOGOUT: { title: 'Signed out', tone: 'neutral', icon: 'bi-box-arrow-right' },
};

const getActivity = async (agentId, limit = 20) => {
  const docs = await Activity.find({ user: agentId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('lead', 'referenceId studentName')
    .lean();

  return docs.map((a) => {
    const meta =
      a.metadata && typeof a.metadata.get === 'function'
        ? Object.fromEntries(a.metadata)
        : a.metadata || {};
    const leadRef = a.lead?.referenceId || meta.leadRef || null;
    const studentName = a.lead?.studentName || null;
    const dispName = meta.dispositionName || '';

    let mapped = ACTIVITY_MAP[a.type] || {
      title: a.type ? a.type.toLowerCase().replace(/_/g, ' ') : 'Activity',
      tone: 'neutral',
      icon: 'bi-clock',
    };

    if (a.type === 'DISPOSITION_SAVED') {
      if (/registration|ready/i.test(dispName)) {
        mapped = { title: 'Registration ready', tone: 'success', icon: 'bi-send-check' };
      } else if (/^P1/i.test(dispName)) {
        mapped = { title: 'Qualification updated (P1)', tone: 'danger', icon: 'bi-fire' };
      } else if (/^P[23]/i.test(dispName)) {
        mapped = { title: 'Qualification updated', tone: 'warning', icon: 'bi-star' };
      } else {
        mapped = { title: 'Disposition submitted', tone: 'info', icon: 'bi-clipboard-check' };
      }
    }

    const detail = [studentName || null, dispName || null, leadRef ? `#${leadRef}` : null]
      .filter(Boolean)
      .join(' · ');

    return {
      id: String(a._id),
      type: a.type,
      title: mapped.title,
      tone: mapped.tone,
      icon: mapped.icon,
      detail: detail || mapped.title,
      time: a.createdAt ? a.createdAt.toISOString() : null,
    };
  });
};

/**
 * GET /agent/dashboard/report — personal performance report for the agent:
 * summary KPIs, all-time disposition mix, per-day call volume for the last 7
 * days, and canonical per-period aggregates (`periods`: today / yesterday /
 * last7Days / day1…day6 / thisWeek / lastWeek / thisMonth / lastMonth, each
 * with calls / connected / p1 / qualified / avgTalkTimeSec).
 *
 * Day 1…Day 6 are the calendar dates of the current Monday–Saturday working
 * week (Sunday excluded); days that have not happened yet resolve to 0 because
 * no interactions can fall inside their windows. thisWeek / lastWeek are the
 * current and previous Monday–Saturday working week (never a rolling 7-day
 * window). All windows are computed in the business timezone, so exact
 * 00:00:00 → 23:59:59.999 boundaries land on the right days.
 */
const getReport = async (agentId) => {
  // ── Canonical period windows (business timezone) ───────────────
  const now = new Date();
  const ww = workingWeekWindows(now, config.businessTimezone);
  const months = monthWindows(now, config.businessTimezone);
  const windows = {
    today: {
      start: startOfDayInTz(now),
      end: endOfDayInTz(now),
    },
    yesterday: {
      start: startOfDayInTz(addLocalDays(now, -1)),
      end: endOfDayInTz(addLocalDays(now, -1)),
    },
    last7Days: {
      start: startOfDayNDaysAgoInTz(6),
      end: endOfDayInTz(now),
    },
    day1: ww.days[0],
    day2: ww.days[1],
    day3: ww.days[2],
    day4: ww.days[3],
    day5: ww.days[4],
    day6: ww.days[5],
    thisWeek: ww.thisWeek,
    lastWeek: ww.lastWeek,
    thisMonth: months.thisMonth,
    lastMonth: months.lastMonth,
  };

  const inWindow = ({ start, end }) => ({ calledAt: { $gte: start, $lte: end } });

  // Per-period call metrics — identical predicates to the daily aggregation so
  // the trailing-7-day sums and Reports stay in lock-step.
  const metricPipeline = (match) => [
    { $match: match },
    {
      $group: {
        _id: null,
        calls: { $sum: 1 },
        notConnected: {
          $sum: { $cond: [{ $in: ['$dispositionName', NO_ANSWER_DISPOSITIONS] }, 1, 0] },
        },
        busy: {
          $sum: { $cond: [{ $in: ['$dispositionName', BUSY_DISPOSITIONS] }, 1, 0] },
        },
        p1: {
          $sum: {
            $cond: [
              { $or: [
                { $in: ['$dispositionPriority', CONVERSION_PRIORITIES] },
                { $in: ['$interestLevel', CONVERSION_PRIORITIES] },
              ] },
              1, 0,
            ],
          },
        },
        talkSec: { $avg: '$durationSec' },
      },
    },
  ];

  // Distinct leads the agent qualified inside the window — a qualifying
  // disposition (see QUALIFY_EXCLUDED) logged by this agent. Sourced from the
  // same Interaction rows as calls/connected so the table can never disagree
  // with itself.
  const qualifiedPipeline = (match) => [
    { $match: { ...match, dispositionName: { $nin: QUALIFY_EXCLUDED } } },
    { $group: { _id: '$lead' } },
  ];

  const [summary, byDisposition, daysAgg, periodsAgg] = await Promise.all([
    getSummary(agentId),
    Interaction.aggregate([
      { $match: { agent: agentId } },
      { $group: { _id: '$dispositionName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    (() => {
      const since = startOfDayNDaysAgoInTz(6);
      return Interaction.aggregate([
        { $match: { agent: agentId, calledAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$calledAt',
                timezone: config.businessTimezone,
              },
            },
            calls: { $sum: 1 },
            notConnected: {
              $sum: {
                $cond: [
                  { $in: ['$dispositionName', NO_ANSWER_DISPOSITIONS] },
                  1, 0,
                ],
              },
            },
            busy: {
              $sum: {
                $cond: [
                  { $in: ['$dispositionName', BUSY_DISPOSITIONS] },
                  1, 0,
                ],
              },
            },
            p1: {
              $sum: {
                $cond: [
                  { $or: [
                    { $in: ['$dispositionPriority', CONVERSION_PRIORITIES] },
                    { $in: ['$interestLevel', CONVERSION_PRIORITIES] },
                  ] },
                  1, 0,
                ],
              },
            },
            talkSec: { $avg: '$durationSec' },
          },
        },
      ]);
    })(),
    (() => {
      const facet = {};
      for (const [key, bounds] of Object.entries(windows)) {
        const match = inWindow(bounds);
        facet[key] = metricPipeline(match);
        facet[`${key}Qualified`] = qualifiedPipeline(match);
      }
      // Pre-filter to the OLDEST window start (usually lastMonth) so window
      // pipelines spanning earlier dates aren't starved by the facet guard.
      const oldestStart = Object.values(windows).reduce((m, w) => (w.start < m ? w.start : m), windows.lastWeek.start);
      return Interaction.aggregate([
        { $match: { agent: agentId, calledAt: { $gte: oldestStart } } },
        { $facet: facet },
      ]);
    })(),
  ]);

  const rowByKey = Object.fromEntries(daysAgg.map((r) => [r._id, r]));
  const last7Days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = addLocalDays(new Date(), -i);
    const key = toKey(d);
    const row = rowByKey[key] || {};
    const calls = row.calls || 0;
    const notConnected = row.notConnected || 0;
    const busy = row.busy || 0;
    last7Days.push({
      date: key,
      calls,
      connected: Math.max(0, calls - notConnected - busy),
      p1: row.p1 || 0,
      avgTalkTimeSec: Math.round(row.talkSec ?? 0),
    });
  }

  const periods = {};
  const facetResult = periodsAgg[0] || {};
  for (const key of Object.keys(windows)) {
    const rec = facetResult[key]?.[0] || {};
    const calls = rec.calls || 0;
    const notConnected = rec.notConnected || 0;
    const busy = rec.busy || 0;
    periods[key] = {
      calls,
      connected: Math.max(0, calls - notConnected - busy),
      p1: rec.p1 || 0,
      qualified: (facetResult[`${key}Qualified`] || []).length,
      avgTalkTimeSec: Math.round(rec.talkSec ?? 0),
    };
  }

  // Which of day1…day6 is today's calendar date (business timezone), so the
  // client can surface "today" without doing its own local date math — null
  // on Sundays, since the working week excludes it.
  const todayDayKey = ['day1', 'day2', 'day3', 'day4', 'day5', 'day6']
    .find((k) => windows[k].start.getTime() === windows.today.start.getTime()) || null;

  return {
    summary,
    byDisposition: byDisposition.map((r) => ({ name: r._id, count: r.count })),
    last7Days,
    periods,
    todayDayKey,
    updatedAt: new Date().toISOString(),
  };
};

const DRILLDOWN_PERIOD_KEYS = ['day1', 'day2', 'day3', 'day4', 'day5', 'day6', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'];
const DRILLDOWN_METRICS = ['calls', 'connected', 'qualified', 'p1'];

// Same window definitions as getReport's `windows` object, so a drilldown
// list can never disagree with the aggregate count it's drilling into.
const resolvePeriodWindow = (periodKey, now = new Date(), tz = config.businessTimezone) => {
  const ww = workingWeekWindows(now, tz);
  const months = monthWindows(now, tz);
  const map = {
    day1: ww.days[0], day2: ww.days[1], day3: ww.days[2],
    day4: ww.days[3], day5: ww.days[4], day6: ww.days[5],
    thisWeek: ww.thisWeek, lastWeek: ww.lastWeek,
    thisMonth: months.thisMonth, lastMonth: months.lastMonth,
  };
  return map[periodKey] || null;
};

/**
 * GET /agent/dashboard/report/drilldown — the actual interactions behind one
 * Performance Summary cell (period × metric), so a supervisor/agent can see
 * exactly which calls make up a number instead of just the count. Uses the
 * SAME predicates as getReport's aggregation (utils/callMetrics) — a
 * drilldown list can never disagree with the cell it drilled into.
 */
const getReportDrilldown = async (agentId, period, metric) => {
  if (!DRILLDOWN_PERIOD_KEYS.includes(period)) throw new ApiError(422, 'Invalid period');
  if (!DRILLDOWN_METRICS.includes(metric)) throw new ApiError(422, 'Invalid metric');

  const window = resolvePeriodWindow(period);
  const match = { agent: agentId, calledAt: { $gte: window.start, $lte: window.end } };

  if (metric === 'connected') {
    match.dispositionName = { $nin: [...NO_ANSWER_DISPOSITIONS, ...BUSY_DISPOSITIONS] };
  } else if (metric === 'p1') {
    match.$or = [
      { dispositionPriority: { $in: CONVERSION_PRIORITIES } },
      { interestLevel: { $in: CONVERSION_PRIORITIES } },
    ];
  } else if (metric === 'qualified') {
    match.dispositionName = { $nin: QUALIFY_EXCLUDED };
  }

  let rows;
  if (metric === 'qualified') {
    // "Qualified Leads" counts distinct leads (qualifiedPipeline groups by
    // lead) — dedup the same way so the list length matches the cell.
    rows = await Interaction.aggregate([
      { $match: match },
      { $sort: { calledAt: -1 } },
      { $group: { _id: '$lead', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { calledAt: -1 } },
      { $limit: 200 },
    ]);
  } else {
    rows = await Interaction.find(match).sort({ calledAt: -1 }).limit(200).lean();
  }

  const leadIds = [...new Set(rows.map((r) => String(r.lead)))];
  const leads = await Lead.find({ _id: { $in: leadIds } }).select('studentName referenceId mobile').lean();
  const leadById = Object.fromEntries(leads.map((l) => [String(l._id), l]));

  return rows.map((r) => {
    const lead = leadById[String(r.lead)] || {};
    return {
      interactionId: String(r._id),
      leadId: String(r.lead),
      studentName: lead.studentName || null,
      referenceId: lead.referenceId || null,
      mobile: lead.mobile || null,
      calledAt: r.calledAt,
      dispositionName: r.dispositionName || null,
      durationSec: r.durationSec || 0,
    };
  });
};

module.exports = {
  WORK_QUEUE_GROUPS,
  getSummary,
  getWorkQueueCounts,
  getCallbacks,
  getReadyToCall,
  getNextAction,
  getMyLeads,
  getAssignedLeads,
  getAgentLeads,
  getActivity,
  getReport,
  getReportDrilldown,
};
