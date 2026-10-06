const Lead     = require('../models/Lead');
const User     = require('../models/User');
const Activity = require('../models/Activity');
const Interaction = require('../models/Interaction');
const ApiError = require('../utils/ApiError');
const lifecycle   = require('./lifecycle.service');
const { isRnrInteraction, isClosedForToday, getRnrCounts } = require('./rnr.service');
const { startOfDayInTz, endOfDayInTz } = require('../utils/dateTime');
const { NO_ANSWER_DISPOSITIONS, BUSY_DISPOSITIONS, CONVERSION_PRIORITIES } = require('../utils/callMetrics');
const { activeLeadsFilter } = require('./leadDrop.service');
require('../models/LeadSource');
require('../models/Country');
require('../models/University');
require('../models/Disposition');

/**
 * LEAD FETCH STRATEGY
 *
 * Two entry points, one shared priority:
 *
 * 1. TARGETED — Work Queue / Resume Call ("Call Now" on a specific row)
 *    → claims that exact lead by id → fetchLeadById()
 *
 * 2. AUTOMATIC — Call Workspace "Fetch Call" button and the Dashboard's
 *    "Fetch Next" action (no leadId given) → fetchNextLead(), which tries:
 *      a. This agent's own actionable lead first (callback/RNR due, or a
 *         fresh 'new'/'assigned' lead already assigned to them) — the same
 *         lookup (findCandidate()) that produces the "Ready to Call" count,
 *         so the count and the claim can never disagree.
 *      b. The shared unassigned pool, FIFO (oldest first) —
 *         claimNextFreshLead() — only when (a) finds nothing.
 */

// ── Helpers ──────────────────────────────────────────────────────

const POPULATE_FIELDS = [
  'countryPreferred', 'preferredCountries.country', 'preferredUniversities.university',
  'source', 'currentDisposition',
];
const POPULATE_OPTS = [
  ['countryPreferred', 'name code'],
  ['preferredCountries.country', 'name code'],
  ['preferredUniversities.university', 'institutionName'],
  ['source', 'name'],
  ['currentDisposition', 'name label color'],
];

const applyPopulate = (q) => {
  for (const [field, select] of POPULATE_OPTS) q.populate(field, select);
  return q;
};

/**
 * Check whether a lead is actionable for the given agent.
 * Used by both fetch and ready-to-call list.
 *
 * There is NO time-based retry window: a lead becomes callable again as soon
 * as it is due. The only RNR gate is the DAILY CAP (rnr.service): once a lead
 * has used all 3 of today's RNR attempts it is closed for the rest of the
 * calendar day and leaves today's queue; it returns on the next calendar day.
 */
const isAssignedActionable = (lead, latest, now, agentId, rnrCountToday = 0) => {
  // Never re-offer a lead another agent is currently working.
  if (lead.fetchedBy && String(lead.fetchedBy) !== String(agentId)) return false;

  // 'callback' — eligible once the scheduled callback time has arrived.
  if (lead.status === 'callback') {
    const due = latest?.callbackDateTime ? new Date(latest.callbackDateTime) : null;
    return !due || due.getTime() <= now.getTime();
  }

  // 'assigned' (RNR) — closed for today once the daily RNR cap is used up.
  if (isRnrInteraction(latest) && isClosedForToday(rnrCountToday)) return false;

  return true;
};

// ── Eligible-agent resolution ────────────────────────────────────

/**
 * Verify the requesting user is an eligible calling AGENT.
 *
 * Eligibility = role code 'agent' AND status 'active' AND availability 'available'.
 * Agents on break or offline are ineligible. Counselors and Supervisors are
 * excluded by the role code check (they must never receive calling leads).
 *
 * Returns true when the agent may Fetch Call, false otherwise.
 */
const isEligibleCallingAgent = async (userId) => {
  const user = await User.findById(userId)
    .select('status availability role')
    .populate('role', 'code isActive')
    .lean();
  if (!user) return false;
  if (user.status !== 'active') return false;
  if (user.availability !== 'available') return false;
  if (!user.role || !user.role.isActive) return false;
  return String(user.role.code).toLowerCase() === 'agent';
};

// ── Fresh-lead FIFO assignment ───────────────────────────────────

/**
 * Atomically claim the OLDEST unassigned fresh lead for the requesting agent.
 *
 * The claim runs as a single findOneAndUpdate keyed on { status: 'new',
 * assignedTo: null }, sorted by createdAt ASC, so two agents Fetching Call
 * simultaneously are guaranteed to receive different leads.
 *
 * Returns the populated lead, or null when no eligible unassigned fresh
 * lead exists (or the requester is not an eligible calling agent).
 */
const claimNextFreshLead = async (agentId) => {
  const now = new Date();
  const lead = await Lead.findOneAndUpdate(
    {
      status: 'new',
      $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }],
      ...activeLeadsFilter(),
    },
    {
      $set: {
        status: 'fetched',
        assignedTo: agentId,
        assignedAt: now,
        assignedBy: null,
        fetchedBy: agentId,
        fetchedAt: now,
      },
    },
    { new: true }
  )
    .sort({ createdAt: 1 })
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source', 'name')
    .populate('currentDisposition', 'name label color')
    .lean();

  if (!lead) return null;

  // Log the assignment.
  await Activity.create({
    user: agentId,
    type: 'LEAD_FETCHED',
    lead: lead._id,
    metadata: new Map([
      ['leadRef', lead.referenceId],
      ['leadStatus', lead.status],
      ['assignment', 'fifo'],
    ]),
  });

  // Lifecycle: assignment is a real business action → NEW_LEAD → ASSIGNED.
  lifecycle.ensureStageReached({
    leadId: lead._id,
    actorId: agentId,
    toStage: 'ASSIGNED',
    source: 'assignment',
  }).catch(() => {});

  return { ...lead, lifecycle: lifecycle.inlineLifecycle(lead) };
};

// ── Candidate selection (per-agent) ──────────────────────────────

/**
 * Find the next candidate lead for an agent. Returns a fully populated
 * candidate or null when the pool is empty.
 *
 * Priority:
 *   1. This agent's own callback/assigned (RNR) leads — callbacks first, oldest first.
 *   2. Fresh leads already assigned to this agent.
 *
 * Does NOT grab from the shared unassigned pool — that's handled by
 * claimNextFreshLead (fresh FIFO fetch only).
 */
const findCandidate = async (agentId) => {
  // ── 1. Try assigned leads for this agent first ───────────────
  //    Callbacks before plain assigned leads, oldest first.
  const candidates = await Lead.find({
    assignedTo: agentId,
    status: { $in: ['callback', 'assigned'] },
    ...activeLeadsFilter(),
  })
    .sort({ status: -1, createdAt: 1 })
    .populate('countryPreferred',     'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source',               'name')
    .populate('currentDisposition',   'name label color')
    .lean();

  if (candidates.length) {
    const interactions = await Interaction.find({
      lead: { $in: candidates.map((l) => l._id) },
    })
      .sort({ calledAt: -1, createdAt: -1 })
      .lean();

    const latestByLead = new Map();
    for (const it of interactions) {
      if (!latestByLead.has(String(it.lead))) latestByLead.set(String(it.lead), it);
    }

    const now = new Date();
    const rnrCounts = await getRnrCounts(candidates.map((l) => l._id), now);

    const eligible = candidates.filter((lead) =>
      isAssignedActionable(
        lead,
        latestByLead.get(String(lead._id)),
        now,
        agentId,
        rnrCounts.get(String(lead._id))?.today ?? 0
      )
    );
    if (eligible.length) return eligible[0];
  }

  // ── 2. Fresh leads already assigned to this agent ──
  const assignedFresh = await Lead.findOne({
    assignedTo: agentId,
    status: { $in: ['new', 'assigned'] },
    ...activeLeadsFilter(),
  })
    .sort({ createdAt: 1 })
    .populate('countryPreferred',     'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source',               'name')
    .populate('currentDisposition',   'name label color')
    .lean();

  if (assignedFresh) {
    const now = new Date();
    const [latestInteraction, rnrCounts] = await Promise.all([
      Interaction.findOne({ lead: assignedFresh._id })
        .sort({ calledAt: -1, createdAt: -1 })
        .lean(),
      getRnrCounts([assignedFresh._id], now),
    ]);
    if (isAssignedActionable(
      assignedFresh,
      latestInteraction,
      now,
      agentId,
      rnrCounts.get(String(assignedFresh._id))?.today ?? 0
    )) {
      return assignedFresh;
    }
  }

  return null;
};

// ── Claim logic ──────────────────────────────────────────────────

/**
 * Atomically claim a candidate lead for an agent. The claim update runs on
 * { _id, status }, so if two requests race for the same lead only one wins.
 */
const claimLead = async (lead, agentId, { preserveStatus = false } = {}) => {
  const now = new Date();
  const isCallback = lead.status === 'callback';
  const stay = isCallback || preserveStatus;
  const claim = await Lead.updateOne(
    { _id: lead._id, status: lead.status },
    {
      $set: {
        ...(stay ? {} : { status: 'fetched' }),
        fetchedBy: agentId,
        fetchedAt: now,
        ...(!lead.assignedTo ? { assignedTo: agentId, assignedAt: now } : {}),
      },
    }
  );

  if (claim.modifiedCount !== 1) return null;

  await Activity.create({
    user: agentId,
    type: 'LEAD_FETCHED',
    lead: lead._id,
    metadata: new Map([
      ['leadRef',    lead.referenceId],
      ['leadStatus', lead.status],
    ]),
  });

  // Lifecycle: claiming/working a lead is the assignment milestone.
  lifecycle.ensureStageReached({
    leadId: lead._id,
    actorId: agentId,
    toStage: 'ASSIGNED',
    source: 'assignment',
  }).catch(() => {});

  const result = {
    ...lead,
    ...(stay ? {} : { status: 'fetched' }),
    fetchedBy: agentId,
    fetchedAt: now,
    ...(!lead.assignedTo ? { assignedTo: agentId, assignedAt: now } : {}),
  };
  if (result.assignedTo && !lead.assignedTo) {
    // Freshly claimed — reflect ownership in the inline lifecycle view.
    result.lifecycle = lifecycle.inlineLifecycle({ ...lead, assignedTo: result.assignedTo });
  } else {
    result.lifecycle = lifecycle.inlineLifecycle(lead);
  }
  return result;
};

// ── Public: fetch-next (auto) ────────────────────────────────────

/**
 * Auto-fetch the next lead for an agent — Call Workspace "Fetch Call" and
 * the Dashboard's "Fetch Next" action share this same entry point.
 *
 * Priority:
 *   1. A lead already actionable for THIS agent (own callback/RNR, or a
 *      fresh 'new'/'assigned' lead already assigned to them) — via
 *      findCandidate(), the same lookup the "Ready to Call" count uses.
 *   2. The shared unassigned pool, FIFO (oldest first) — via
 *      claimNextFreshLead(), only reached when tier 1 finds nothing.
 *
 * Without tier 1, an agent whose fresh leads were assigned directly
 * (rather than sitting in the shared pool) would see a nonzero "Ready to
 * Call" count but get "No leads available" on every Fetch — the count and
 * the claim were checking different lead sets.
 *
 * Flow:
 *   1. Verify the requester is an eligible calling AGENT (active + available).
 *   2. Try to claim the agent's own actionable lead first.
 *   3. Fall back to atomically claiming the oldest unassigned fresh lead.
 *   4. Record the LEAD_FETCHED activity and run the lifecycle transition.
 */
const fetchNextLead = async (agentId) => {
  if (!(await isEligibleCallingAgent(agentId))) return null;

  const candidate = await findCandidate(agentId);
  if (candidate) {
    const claimed = await claimLead(candidate, agentId, {
      preserveStatus: !['new', 'assigned'].includes(candidate.status),
    });
    if (claimed) return claimed;
  }

  return claimNextFreshLead(agentId);
};

// ── Public: fetch-by-id (targeted claim) ─────────────────────────

const RESUME_STATUSES = [
  'new', 'assigned', 'callback', 'fetched', 'in-progress', 'follow-up',
  'completed', 'documents-pending', 'offer-received', 'visa-process',
  'dropped',
];

const fetchLeadById = async (agentId, leadId) => {
  // Explicit by-id claim of the agent's OWN lead (assigned drawer / queue).
  // Dropped leads stay assigned, so they must remain reopenable here (their
  // Revive action lives in the workspace). Auto/queue paths keep excluding
  // dropped leads via activeLeadsFilter().
  const lead = await Lead.findOne({
    _id: leadId,
    status: { $in: RESUME_STATUSES },
    $and: [
      {
        $or: [
          { assignedTo: agentId },
          { assignedTo: { $exists: false } },
          { assignedTo: null },
        ],
      },
      {
        $or: [
          { dropStatus: { $ne: 'dropped' } },
          { assignedTo: agentId },
        ],
      },
    ],
  })
    .populate('countryPreferred',     'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source',               'name')
    .populate('currentDisposition',   'name label color')
    .lean();

  if (!lead) return null;
  return claimLead(lead, agentId, { preserveStatus: !['new', 'assigned'].includes(lead.status) });
};

// ── Public: ready-to-call list ───────────────────────────────────

/**
 * List the agent's leads that are immediately ready to call.
 *   1. Agent's own callback/RNR leads (actionable).
 *   2. Fresh leads already assigned to this agent.
 *
 * The shared unassigned pool is NO LONGER shown here — fresh leads
 * are only ever assigned through the FIFO Fetch Call path.
 */
const listReadyToCall = async (agentId, limit = 20) => {
  const leads = await Lead.find({
    assignedTo: agentId,
    status: { $in: ['new', 'assigned', 'callback'] },
    ...activeLeadsFilter(),
  })
    .sort({ status: -1, createdAt: 1 })
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('source', 'name')
    .populate('currentDisposition', 'name label color')
    .lean();

  if (!leads.length) return [];

  const interactions = await Interaction.find({
    lead: { $in: leads.map((l) => l._id) },
  })
    .sort({ calledAt: -1, createdAt: -1 })
    .lean();

  const latestByLead = new Map();
  for (const it of interactions) {
    if (!latestByLead.has(String(it.lead))) latestByLead.set(String(it.lead), it);
  }

  const now = new Date();
  const rnrCounts = await getRnrCounts(leads.map((l) => l._id), now);

  return leads
    .filter((lead) =>
      isAssignedActionable(
        lead,
        latestByLead.get(String(lead._id)),
        now,
        agentId,
        rnrCounts.get(String(lead._id))?.today ?? 0
      )
    )
    .slice(0, limit);
};

// ── Public: workspace stats ──────────────────────────────────────

const workspaceStats = async (agentId) => {
  // "Today" in the business timezone (Asia/Kolkata), not the server TZ.
  const start = startOfDayInTz(new Date());
  const end = endOfDayInTz(new Date());

  const todayFilter = { agent: agentId, calledAt: { $gte: start, $lte: end } };

  const [todayCalls, notConnected, busy, p1CreatedToday, avgResult] = await Promise.all([
    Interaction.countDocuments(todayFilter),
    Interaction.countDocuments({ ...todayFilter, dispositionName: { $in: NO_ANSWER_DISPOSITIONS } }),
    Interaction.countDocuments({ ...todayFilter, dispositionName: { $in: BUSY_DISPOSITIONS } }),
    Interaction.countDocuments({
      ...todayFilter,
      $or: [
        { dispositionPriority: { $in: CONVERSION_PRIORITIES } },
        { interestLevel: { $in: CONVERSION_PRIORITIES } },
      ],
    }),
    Interaction.aggregate([
      { $match: todayFilter },
      { $group: { _id: null, avg: { $avg: '$durationSec' } } },
    ]),
  ]);

  return {
    todayCalls,
    connected: Math.max(0, todayCalls - notConnected - busy),
    notConnected,
    busy,
    avgTalkTimeSec: Math.round(avgResult[0]?.avg ?? 0),
    p1CreatedToday,
    updatedAt: new Date().toISOString(),
  };
};

module.exports = {
  fetchNextLead,
  fetchLeadById,
  findCandidate,
  isAssignedActionable,
  listReadyToCall,
  workspaceStats,
  isEligibleCallingAgent,
};
