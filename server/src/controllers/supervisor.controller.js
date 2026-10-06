const User = require('../models/User');
const Role = require('../models/Role');
const Lead = require('../models/Lead');
const Interaction = require('../models/Interaction');
const Break = require('../models/Break');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');

const taskService = require('../services/task.service');

const { BREAK_ALLOWANCE_MINUTES } = require('../services/break.service');
const config = require('../config');
const { startOfDayInTz, endOfDayInTz, dateKeyInTz, startOfDayNDaysAgoInTz, localClockToUtc, localYmd, localWeekday, addLocalDays, workingWeekWindows, monthWindows } = require('../utils/dateTime');
const { CONVERSION_PRIORITIES, isConversion, NO_ANSWER_DISPOSITIONS, BUSY_DISPOSITIONS, QUALIFY_EXCLUDED } = require('../utils/callMetrics');

const titleCase = (s = '') => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || '—' : '—');
const resolveAgent = (userRef, userMap) => {
  if (!userRef) return '—';
  const id = (userRef && typeof userRef === 'object' && userRef._id)
    ? String(userRef._id)
    : String(userRef);
  const fromMap = userMap.get(id);
  if (fromMap) return fromMap;
  if (userRef && typeof userRef === 'object' && (userRef.firstName || userRef.lastName)) {
    return fullName(userRef);
  }
  return '—';
};

const EVENT_LABELS = {
  LEAD_FETCHED: 'Lead Fetched',
  DISPOSITION_SAVED: 'Disposition Saved',
  CALLBACK_COMPLETED: 'Callback Completed',
  BREAK_IN: 'Break Started',
  BREAK_OUT: 'Break Ended',
  APPLICATION_UPDATED: 'Application Updated',
  SHORTLIST_UPDATED: 'Shortlist Updated',
  LIFECYCLE_CHANGED: 'Lifecycle Changed',
};

// Derive queue label from activity type + metadata (actual data, not fabricated)
const deriveQueue = (a) => {
  switch (a.type) {
    case 'LEAD_FETCHED': {
      const pool = a.metadata && a.metadata.leadStatus;
      return pool ? titleCase(pool) + ' Queue' : 'Calling Queue';
    }
    case 'DISPOSITION_SAVED':  return 'Calling Queue';
    case 'CALLBACK_COMPLETED': return 'Callbacks';
    case 'BREAK_IN':
    case 'BREAK_OUT':          return 'Break';
    case 'APPLICATION_UPDATED':return 'Applications';
    case 'SHORTLIST_UPDATED':  return 'Shortlists';
    case 'LIFECYCLE_CHANGED':  return 'Lifecycle';
    default:                  return '—';
  }
};

const toPermissionList = (perms) => {
  if (!perms) return [];
  if (Array.isArray(perms)) return perms;
  return String(perms).split(/\s+/).filter(Boolean);
};

const toKey = (d) => dateKeyInTz(d);

const timeOnly = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

const fmtDuration = (sec) => {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '0m';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? (s > 0 ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
};

const fmtMins = (min) => {
  if (min == null || !Number.isFinite(min)) return '0m';
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return m > 0 ? (s > 0 ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
};

const timeAgo = (d) => {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const rangeBounds = (range) => {
  const tz = config.businessTimezone;
  const now = new Date();
  const end = endOfDayInTz(now);
  let start = startOfDayInTz(now);
  switch (range) {
    case 'Today':
      break;
    case 'Yesterday': {
      start = addLocalDays(now, -1);
      const yEnd = endOfDayInTz(start);
      return { start, end: yEnd };
    }
    case 'This Week': {
      const dow = localWeekday(now, tz); // 0=Sun
      start = addLocalDays(now, -dow);
      break;
    }
    case 'Last Week': {
      const dow = localWeekday(now, tz);
      start = addLocalDays(now, -dow - 7);
      end.setTime(endOfDayInTz(addLocalDays(now, -dow - 1)).getTime());
      break;
    }
    case 'This Month': {
      const { y, mo } = localYmd(now, tz);
      start = localClockToUtc(tz, y, mo, 1);
      break;
    }
    case 'Quarter to Date': {
      const { y, mo } = localYmd(now, tz);
      const qStartMonth = Math.floor((mo - 1) / 3) * 3 + 1;
      start = localClockToUtc(tz, y, qStartMonth, 1);
      break;
    }
    default:
      start = new Date(2000, 0, 1); // epoch-ish for "All"
  }
  return { start, end };
};

// Canonical calling-agent eligibility: role.name === 'AGENT'
const isCallingAgent = (u) => u?.role?.name === 'AGENT';

// ── GET /api/supervisor/users ─────────────────────────────────────
const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) {
    const roleName = String(req.query.role).toUpperCase();
    const roleDoc = await Role.findOne({ name: roleName, isActive: true }).select('_id').lean();
    if (roleDoc) filter.role = roleDoc._id;
  }
  const users = await User.find(filter)
    .populate('role', 'name code permissions')
    .sort({ createdAt: 1 })
    .lean();

  const ids = users.map((u) => u._id);
  const todayStart = startOfDayInTz(new Date());

  const [allCalls, todayCalls, leadAssignments, currentLeadAgg] = await Promise.all([
    Interaction.aggregate([
      { $match: { agent: { $in: ids } } },
      {
        $group: {
          _id: '$agent',
          calls: { $sum: 1 },
          totalSec: { $sum: '$durationSec' },
          conversions: {
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
        },
      },
    ]),
    Interaction.aggregate([
      { $match: { agent: { $in: ids }, calledAt: { $gte: todayStart } } },
      { $group: { _id: '$agent', calls: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { assignedTo: { $in: ids } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { fetchedBy: { $in: ids }, status: 'fetched' } },
      { $sort: { fetchedAt: -1 } },
      { $group: { _id: '$fetchedBy', leadId: { $first: '$_id' }, studentName: { $first: '$studentName' }, referenceId: { $first: '$referenceId' } } },
    ]),
  ]);

  const byId = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const allMap = byId(allCalls);
  const todayMap = byId(todayCalls);
  const leadMap = byId(leadAssignments);
  const currentLeadMap = byId(currentLeadAgg);

  const data = users.map((u) => {
    const calls = allMap.get(String(u._id)) || {};
    const today = todayMap.get(String(u._id)) || {};
    const leads = leadMap.get(String(u._id)) || {};
    const callsTotal = calls.calls || 0;
    const curLead = currentLeadMap.get(String(u._id)) || null;
    return {
      id: String(u._id),
      name: fullName(u),
      email: u.email,
      role: u.role ? titleCase(u.role.name) : '—',
      roleCode: u.role?.code || '',
      permissions: u.role ? toPermissionList(u.role.permissions) : [],
      team: '—',
      queue: '—',
      status: u.status === 'active' ? 'Active' : 'Suspended',
      availability: u.availability || 'offline',
      isOnCall: !!u.isOnCall,
      callsToday: today.calls || 0,
      totalCalls: callsTotal,
      conversions: calls.conversions || 0,
      avgDuration: callsTotal ? fmtDuration(calls.totalSec / callsTotal) : '—',
      conversionRate: callsTotal ? `${Math.round(((calls.conversions || 0) / callsTotal) * 100)}%` : '0%',
      leadsAssigned: leads.count || 0,
      mobile: u.mobile || '—',
      sipExtension: u.sipExtension || null,
      sipProvisionStatus: u.sipProvisionStatus || 'unknown',
      lastLogin: timeAgo(u.lastActiveAt),
      createdAt: u.createdAt || null,
      lastActiveAt: u.lastActiveAt || null,
      currentLead: curLead ? { id: curLead.leadId, name: curLead.studentName || '—', ref: curLead.referenceId || '—' } : null,
    };
  });

  return success(res, data, 'Users fetched');
});

const listQueues = asyncHandler(async (req, res) => {
  const agg = await Lead.aggregate([
    {
      $group: {
        _id: '$status',
        leads: { $sum: 1 },
        agents: { $addToSet: '$assignedTo' },
      },
    },
    { $sort: { leads: -1 } },
  ]);

  const LABELS = {
    new: 'New Leads',
    assigned: 'Assigned',
    fetched: 'Fetched',
    'in-progress': 'In Progress',
    callback: 'Callback',
    completed: 'Completed',
    submitted: 'Submitted',
    'follow-up': 'Follow Up',
  };

  const data = agg
    .filter((g) => g._id)
    .map((g) => ({
      id: `queue-${String(g._id)}`,
      name: LABELS[g._id] || titleCase(g._id),
      status: g._id,
      leads: g.leads,
      agents: g.agents.filter(Boolean).length,
    }));

  return success(res, data, 'Queues fetched');
});

// ── GET /api/supervisor/reports ───────────────────────────────────
const activityDetail = (a) => {
  const meta = a.metadata;
  if (!meta) return '—';
  const get = (k) => (meta instanceof Map ? meta.get(k) : meta[k]);
  const leadRef = get('leadRef');
  const disp = get('dispositionName');
  const breakType = get('breakType');
  if (a.type === 'DISPOSITION_SAVED') return [leadRef, disp].filter(Boolean).join(' · ') || '—';
  if (a.type === 'LEAD_FETCHED') return leadRef || '—';
  if (a.type === 'BREAK_IN' || a.type === 'BREAK_OUT') return breakType || '—';
  return leadRef || '—';
};

const BREAK_ALLOWANCE = BREAK_ALLOWANCE_MINUTES;

const buildPeriods = async (agentIds) => {
  const now = new Date();
  const tz = config.businessTimezone;
  const ww = workingWeekWindows(now, tz);
  const months = monthWindows(now, tz);

  const windows = {
    today: { start: startOfDayInTz(now), end: endOfDayInTz(now) },
    yesterday: { start: startOfDayInTz(addLocalDays(now, -1)), end: endOfDayInTz(addLocalDays(now, -1)) },
    last7Days: { start: startOfDayNDaysAgoInTz(6), end: endOfDayInTz(now) },
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

  // Optional scope: restrict to a set of agents (used for per-individual
  // period aggregation). When absent, the aggregate spans the whole team.
  const scope = agentIds && agentIds.length
    ? { agent: { $in: agentIds } }
    : {};

  // Identical predicates to the Agent Dashboard metric pipeline.
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

  const qualifiedPipeline = (match) => [
    { $match: { ...match, dispositionName: { $nin: QUALIFY_EXCLUDED } } },
    { $group: { _id: '$lead' } },
  ];

  const facet = {};
  for (const [key, bounds] of Object.entries(windows)) {
    const match = inWindow(bounds);
    facet[key] = metricPipeline(match);
    facet[`${key}Qualified`] = qualifiedPipeline(match);
  }

 
  const oldestStart = Object.values(windows).reduce((m, w) => (w.start < m ? w.start : m), windows.lastWeek.start);
  const [agg = {}] = await Interaction.aggregate([
    { $match: { calledAt: { $gte: oldestStart }, ...scope } },
    { $facet: facet },
  ]);

  const periods = {};
  for (const key of Object.keys(windows)) {
    const rec = agg[key]?.[0] || {};
    const calls = rec.calls || 0;
    const notConnected = rec.notConnected || 0;
    const busy = rec.busy || 0;
    periods[key] = {
      calls,
      connected: Math.max(0, calls - notConnected - busy),
      p1: rec.p1 || 0,
      qualified: (agg[`${key}Qualified`] || []).length,
      avgTalkTimeSec: Math.round(rec.talkSec ?? 0),
    };
  }

  return periods;
};

const buildTeamPeriods = () => buildPeriods(null);

const listReports = asyncHandler(async (req, res) => {
  const { start, end } = rangeBounds(req.query.range || 'All');
  const rangeFilter = { $gte: start, $lte: end };

  const [users, interactions, breaks, activities, perfAgg, dispositionEvents, teamPeriods] = await Promise.all([
    User.find({}).populate('role', 'name').lean(),
    Interaction.find({ calledAt: rangeFilter }).populate('agent', 'firstName lastName').lean(),
    Break.find({ startedAt: rangeFilter }).populate('user', 'firstName lastName').lean(),
    Activity.find({ createdAt: rangeFilter }).populate('user', 'firstName lastName').sort({ createdAt: -1 }).lean(),
    (() => {
      const since = startOfDayNDaysAgoInTz(6);
      return Interaction.aggregate([
        { $match: { calledAt: { $gte: since } } },
        {
          $group: {
            _id: {
              agent: '$agent',
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$calledAt',
                  timezone: config.businessTimezone,
                },
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
          },
        },
      ]);
    })(),

    Lead.aggregate([
      { $unwind: '$dispositionHistory' },
      {
        $match: {
          'dispositionHistory.changedAt': rangeFilter,
        },
      },
      {
        $project: {
          _id: 0,
          lead: '$_id',
          disposition: '$dispositionHistory.dispositionName',
          changedBy: '$dispositionHistory.changedBy',
          changedAt: '$dispositionHistory.changedAt',
        },
      },
    ]),
    buildTeamPeriods(),
  ]);

  // User lookup map (fallback when populate returns null for deleted/orphaned refs)
  const userMap = new Map();
  users.forEach((u) => userMap.set(String(u._id), fullName(u)));


  const DUP_WINDOW_MS = 4000; 
  const dispositionMap = new Map();
  const bulk = new Map(); // actor -> array of {lead, disposition, changedAt}
  dispositionEvents.forEach((e) => {
    if (!e.changedBy) return;
    const actor = String(e.changedBy);
    if (!bulk.has(actor)) bulk.set(actor, []);
    bulk.get(actor).push({ lead: String(e.lead), disposition: e.disposition, at: new Date(e.changedAt).getTime() });
  });
  bulk.forEach((events, actor) => {
    events.sort((a, b) => a.at - b.at);
    let distinct = 0;
    let prev = null;
    events.forEach((e) => {
      const isDup = prev
        ? e.lead === prev.lead && e.disposition === prev.disposition && (e.at - prev.at) <= DUP_WINDOW_MS
        : false;
      prev = e;
      if (!isDup) distinct += 1;
    });
    dispositionMap.set(actor, distinct);
  });

  const perfMap = new Map();
  interactions.forEach((i) => {
    if (!i.agent) return;
    const key = String(i.agent._id);
    let rec = perfMap.get(key);
    if (!rec) {
      rec = { id: key, name: fullName(i.agent), calls: 0, dispositions: 0, conversions: 0, totalSec: 0 };
      perfMap.set(key, rec);
    }
    rec.calls += 1;
    rec.dispositions = dispositionMap.get(key) || 0;
    if (isConversion(i)) rec.conversions += 1;
    rec.totalSec += Number(i.durationSec) || 0;
  });

  // Ensure agents with dispositions but no interaction row still appear.
  dispositionMap.forEach((count, actor) => {
    if (!perfMap.has(actor)) {
      perfMap.set(actor, {
        id: actor,
        name: userMap.get(actor) || '—',
        calls: 0,
        dispositions: count,
        conversions: 0,
        totalSec: 0,
      });
    }
  });

  const advisorPerformance = [...perfMap.values()]
    .map((r) => ({
      id: r.id,
      name: r.name,
      calls: r.calls,
      dispositions: r.dispositions,
      conversions: r.conversions,
      conversionRate: r.calls ? `${Math.round((r.conversions / r.calls) * 100)}%` : '0%',
      avgDuration: r.calls ? fmtDuration(r.totalSec / r.calls) : '—',
      qaScore: '—',
    }))
    .sort((a, b) => b.calls - a.calls);

  // ── Break report ──
  const breakReport = breaks.map((b) => {
    const allowed = BREAK_ALLOWANCE[b.type];
    return {
      id: String(b._id),
      agent: fullName(b.user),
      type: b.type,
      started: timeOnly(b.startedAt),
      ended: b.endedAt ? timeOnly(b.endedAt) : '—',
      duration: b.durationMinutes != null ? `${b.durationMinutes} min` : '—',
      exceeded:
        allowed != null && b.durationMinutes != null
          ? b.durationMinutes > allowed ? 'Yes' : 'No'
          : '—',
    };
  });

  // ── Activity report ──
  const activityReport = activities.map((a) => ({
    id: String(a._id),
    agent: resolveAgent(a.user, userMap),
    event: EVENT_LABELS[a.type] || titleCase(String(a.type).replace(/_/g, ' ').toLowerCase()),
    queue: deriveQueue(a),
    time: new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    detail: activityDetail(a),
  }));

  // ── Quality / Time-share (agent rows only) ──
  const agents = users.filter((u) => u.role && String(u.role.name).toUpperCase() === 'AGENT');

  const agentCallMap = new Map();
  interactions.forEach((i) => {
    if (!i.agent) return;
    const key = String(i.agent._id);
    agentCallMap.set(key, (agentCallMap.get(key) || 0) + (Number(i.durationSec) || 0));
  });

  const agentBreakMap = new Map();
  breaks.forEach((b) => {
    if (!b.user) return;
    const key = String(b.user._id);
    agentBreakMap.set(key, (agentBreakMap.get(key) || 0) + (Number(b.durationMinutes) || 0));
  });

  const timeShare = agents.map((u) => {
    const key = String(u._id);
    return {
      id: key,
      name: fullName(u),
      loggedIn: '—',
      callTime: fmtDuration(agentCallMap.get(key) || 0),
      breakTime: fmtMins(agentBreakMap.get(key) || 0),
      idleTime: '—',
      utilization: '—',
    };
  });

  const qualityScores = agents.map((u) => ({
    id: String(u._id),
    name: fullName(u),
    qaScore: '—',
    reviewedCalls: '—',
    rating: '—',
  }));

  const perfByAgent = new Map();
  const perfTeamByDate = new Map();
  perfAgg.forEach((r) => {
    const agentKey = String(r._id.agent);
    if (!perfByAgent.has(agentKey)) perfByAgent.set(agentKey, new Map());
    perfByAgent.get(agentKey).set(r._id.date, r);
    const team = perfTeamByDate.get(r._id.date) || { calls: 0, notConnected: 0, busy: 0, p1: 0 };
    team.calls += r.calls;
    team.notConnected += r.notConnected;
    team.busy += r.busy;
    team.p1 += r.p1;
    perfTeamByDate.set(r._id.date, team);
  });

  const buildPerfDays = (rowsByDate) => {
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toKey(d);
      const row = rowsByDate.get(key) || {};
      const calls = row.calls || 0;
      const notConnected = row.notConnected || 0;
      const busy = row.busy || 0;
      days.push({
        date: key,
        calls,
        connected: Math.max(0, calls - notConnected - busy),
        p1: row.p1 || 0,
      });
    }
    return days;
  };

  const performance = [
    { id: 'all', name: 'All Agents', last7Days: buildPerfDays(perfTeamByDate) },
    ...agents.map((u) => ({
      id: String(u._id),
      name: fullName(u),
      last7Days: buildPerfDays(perfByAgent.get(String(u._id)) || new Map()),
    })),
  ];

  const periodUsers = users.filter((u) => {
    const r = u?.role && String(u.role.name).toUpperCase();
    return (r === 'AGENT' || r === 'COUNSELOR') && String(u.status).toLowerCase() === 'active';
  });
  const perUserPeriodsEntries = await Promise.all(
    periodUsers.map(async (u) => [String(u._id), await buildPeriods([u._id])])
  );
  const periodsByUser = Object.fromEntries(perUserPeriodsEntries);

  // Which of day1…day6 is today (business timezone) — null on Sundays, since
  // the working week excludes it. Lets the client mark "today" without doing
  // its own local date math.
  const dow = localWeekday(new Date(), config.businessTimezone);
  const dayIdx = (dow + 6) % 7; // 0..5 = Mon..Sat, 6 = Sun
  const todayDayKey = dayIdx < 6 ? `day${dayIdx + 1}` : null;

  const data = { advisorPerformance, breakReport, activityReport, qualityScores, timeShare, performance, periods: teamPeriods, periodsByUser, todayDayKey };
  return success(res, data, 'Reports fetched');
});

const getDashboardSummary = asyncHandler(async (req, res) => {
  const PRIORITY_FROM_P = { P1: 'Urgent', P2: 'Medium', P3: 'Low' };
  const DISPLAY_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Urgent']);

  const hotLeadsPipeline = [
    { $match: { status: { $ne: 'lost' } } },
    {
      $lookup: {
        from: 'interactions',
        let: { leadId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$lead', '$$leadId'] } } },
          { $sort: { calledAt: -1 } },
          { $limit: 1 },
          { $project: { dispositionPriority: 1, interestLevel: 1 } },
        ],
        as: 'latestInteraction',
      },
    },
    {
      $addFields: {
        latestInter: { $arrayElemAt: ['$latestInteraction', 0] },
      },
    },
    {
      $addFields: {
        effectivePriority: {
          $let: {
            vars: {
              fromInterDisp: '$latestInter.dispositionPriority',
              fromInterInterest: '$latestInter.interestLevel',
              fromLead: '$interestLevel',
            },
            in: {
              $switch: {
                branches: [
                  { case: { $in: ['$$fromInterDisp', ['P1']] }, then: 'Urgent' },
                  { case: { $in: ['$$fromInterDisp', ['P2']] }, then: 'Medium' },
                  { case: { $in: ['$$fromInterDisp', ['P3']] }, then: 'Low' },
                  { case: { $in: ['$$fromInterInterest', ['P1']] }, then: 'Urgent' },
                  { case: { $in: ['$$fromInterInterest', ['P2']] }, then: 'Medium' },
                  { case: { $in: ['$$fromInterInterest', ['P3']] }, then: 'Low' },
                  { case: { $in: ['$$fromLead', ['Low', 'Medium', 'High', 'Urgent']] }, then: '$$fromLead' },
                ],
                default: 'Low',
              },
            },
          },
        },
      },
    },
    { $match: { effectivePriority: 'Urgent' } },
    { $count: 'total' },
  ];

  const [hotLeadsResult] = await Lead.aggregate(hotLeadsPipeline);
  const hotLeads = hotLeadsResult?.total || 0;
  const todayStart = startOfDayInTz(new Date());
  const todayEnd = endOfDayInTz(new Date());

  const callbackLeads = await Lead.find({ status: 'callback' }).lean();
  const callbackLeadIds = callbackLeads.map((l) => l._id);

  let callbacksToday = 0;
  if (callbackLeadIds.length) {
    const [interactions, pendingCallbacks] = await Promise.all([
      Interaction.find({ lead: { $in: callbackLeadIds }, callbackDateTime: { $ne: null } })
        .sort({ calledAt: -1 })
        .lean(),
      require('../models/Callback').find({ lead: { $in: callbackLeadIds }, status: 'pending' })
        .sort({ scheduledAt: 1 })
        .lean(),
    ]);

    const itsByLead = new Map();
    for (const it of interactions) {
      const key = String(it.lead);
      if (!itsByLead.has(key)) itsByLead.set(key, []);
      itsByLead.get(key).push(it);
    }
    const cbsByLead = new Map();
    for (const cb of pendingCallbacks) {
      const key = String(cb.lead);
      if (!cbsByLead.has(key)) cbsByLead.set(key, []);
      cbsByLead.get(key).push(cb);
    }

    for (const lead of callbackLeads) {
      const key = String(lead._id);
      const its = itsByLead.get(key) || [];
      const cbs = cbsByLead.get(key) || [];

      const callbackDates = its
        .map((i) => (i.callbackDateTime ? new Date(i.callbackDateTime).getTime() : null))
        .filter(Boolean);
      const nowMs = Date.now();
      const nextDue = callbackDates.filter((t) => t > nowMs).sort((a, b) => a - b)[0]
        || callbackDates.sort((a, b) => b - a)[0]
        || (cbs.map((c) => new Date(c.scheduledAt).getTime()).sort((a, b) => a - b)[0])
        || null;

      if (nextDue) {
        const d = new Date(nextDue);
        if (d >= todayStart && d <= todayEnd) callbacksToday += 1;
      }
    }
  }

  return success(res, { hotLeads, callbacksToday }, 'Dashboard summary fetched');
});


const getAttentionSnapshot = asyncHandler(async (req, res) => {
  const snapshot = await taskService.getAttentionSnapshot();
  return success(res, snapshot, 'Attention snapshot fetched');
});

const lifecycle = require('../services/lifecycle.service');

const getLifecyclePipeline = asyncHandler(async (req, res) => {
  await lifecycle.ensureStagesBackfilled();

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const openStages = lifecycle.LIFECYCLE_STAGES.filter(
    (s) => s !== 'ENROLLED' && !lifecycle.isTerminalStage(s)
  );

  const [stageGroups, waitingGroups, unassigned, overdue, stalled, progressed] =
    await Promise.all([
      Lead.aggregate([{ $group: { _id: '$lifecycleStage', count: { $sum: 1 } } }]),
      Lead.aggregate([
        { $match: { waitingOn: { $ne: null } } },
        { $group: { _id: '$waitingOn', count: { $sum: 1 } } },
      ]),
      Lead.countDocuments({
        assignedTo: null,
        lifecycleStage: { $in: openStages },
      }),
      Lead.countDocuments({
        nextActionDue: { $lt: now, $ne: null },
        nextAction: { $nin: [null, ''] },
        lifecycleStage: { $in: openStages },
      }),
      Lead.countDocuments({
        updatedAt: { $lt: weekAgo },
        lifecycleStage: { $in: openStages },
      }),
      Lead.countDocuments({ lifecycleUpdatedAt: { $gte: dayAgo } }),
    ]);

  const counts = {};
  for (const stage of lifecycle.LIFECYCLE_ALL_STAGES) counts[stage] = 0;
  for (const g of stageGroups) {
    if (g._id && Object.prototype.hasOwnProperty.call(counts, g._id)) counts[g._id] = g.count;
  }

  const waitingOn = {};
  for (const g of waitingGroups) {
    if (g._id) waitingOn[g._id] = g.count;
  }

  return success(res, {
    stages: lifecycle.LIFECYCLE_STAGES,
    counts,
    attention: { unassigned, overdueNextActions: overdue, stalled, progressedToday: progressed },
    waitingOn,
    generatedAt: now.toISOString(),
  }, 'Lifecycle pipeline fetched');
});

module.exports = { listUsers, listQueues, listReports, getDashboardSummary, getAttentionSnapshot, getLifecyclePipeline };
