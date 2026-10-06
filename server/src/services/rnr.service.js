const Lead        = require('../models/Lead');
const Interaction = require('../models/Interaction');
const Disposition = require('../models/Disposition');
const ApiError    = require('../utils/ApiError');
const config      = require('../config');
const { startOfDayInTz, endOfDayInTz } = require('../utils/dateTime');

/* ==========================================================================
   RNR WORKFLOW — the single source of truth for Ring-No-Response leads.

   RULES (calendar-day based; there is NO time-based reappearance window):

     DAILY RNR COUNT
       Number of RNR attempts this lead has on the current business-timezone
       calendar day. Resets at the next business-day boundary.

     MAX 3 RNRs PER LEAD PER CALENDAR DAY
       Attempt 1, 2 and 3 are allowed. After the 3rd attempt the lead is
       CLOSED FOR TODAY: it is not returned by today's available/work queue
       and a 4th RNR is rejected. Nothing is deleted, dropped, reassigned or
       un-assigned — the lead keeps its full history and its owner, and it
       becomes eligible again on the NEXT CALENDAR DAY.

     TOTAL (LIFETIME) RNR COUNT
       Every RNR attempt across the lead's whole history. Never resets.

   Both counts are DERIVED from the existing Interaction history (the same
   rows the agent already sees in the call log), so there is no parallel
   counter to drift and no duplicated history.

TWO INDEPENDENT WORK QUEUES (never merged)
        RNR            → the lead's latest disposition is exactly RNR.
        Not Reachable  → the lead's latest disposition is exactly
                         "Switched Off / Not Reachable".

        These are SEPARATE queues with SEPARATE predicates and SEPARATE daily
        counters. A lead whose latest disposition is RNR is only ever in the RNR
        queue; a lead whose latest disposition is Switched Off / Not Reachable is
        only ever in the Not Reachable queue. Neither is ever treated as the
        other, and neither queue's count is added to the other's.

     Consumers:
       interaction.service  → per-disposition daily-cap submission gates
       activity.service     → availability of a lead in today's queues
       dashboard.service    → "RNR Leads" + "Not Reachable Leads" + "RNR 6+ Leads"
                              KPIs and the Assigned Leads drawer filters behind them
   ========================================================================== */

const RNR_DISPOSITION_NAME = 'RNR';

// The Not Reachable queue's disposition, stored verbatim as
// Disposition.name and snapshotted into Interaction.dispositionName. Verified
// byte-exact (28 chars, single unambiguous value) and resolved by NAME at
// runtime, never by a hardcoded _id.
const NOT_REACHABLE_DISPOSITION_NAME = 'Switched Off / Not Reachable';

const RNR_MAX_PER_DAY     = 3;
const RNR_ESCALATION_MIN  = 6;
const BUSINESS_TIMEZONE   = config.businessTimezone;

// Drawer/KPI filter modes. They are DELIBERATELY different buckets:
//   current       → the agent's live RNR workload (latest disposition is RNR,
//                   and today's RNR allowance is NOT yet used up)
//   not-reachable → the agent's live Not Reachable workload (latest disposition
//                   is Switched Off / Not Reachable, today's allowance not used)
//   escalated     → LIFETIME escalation bucket: every assigned lead with a total
//                   (ever) RNR count >= 6 — regardless of status, drop state,
//                   which day the RNRs happened, or whether the lead is in today's
//                   RNR queue. This is NOT a current-day filter and does NOT
//                   consume or feed either current queue.
// Kebab-case so it survives the controller's `.toLowerCase()` normalisation.
const RNR_MODE = { CURRENT: 'current', NOT_REACHABLE: 'not-reachable', ESCALATED: 'escalated' };
const RNR_MODES = new Set(Object.values(RNR_MODE));

// Statuses that take a lead out of the agent's active workload — mirrors the
// TERMINAL_STATUSES used by workqueue.service and dashboard.service. Used ONLY
// for the `current` (RNR Leads) bucket so it is scoped exactly like every other
// workload count on the dashboard. The `escalated` (RNR 6+) bucket is a
// lifetime filter and deliberately ignores status and drop state.
const TERMINAL_STATUSES = ['submitted', 'lost', 'callback-completed'];

// ── Business-day bounds (Asia/Kolkata by default) ────────────────────────
// Reused from utils/dateTime so the RNR day boundary is identical to the one
// every report, KPI and dashboard widget already uses.
const dayBounds = (now = new Date()) => ({
  start: startOfDayInTz(now),
  end:   endOfDayInTz(now),
});

/**
 * Is this fetched Interaction row an RNR attempt?
 * Pure predicate — usable on lean documents already loaded by a caller
 * (work queue, logout gate, call assist) without another query.
 */
const isRnrInteraction = (it) =>
  String(it?.dispositionName || '').trim().toUpperCase() === RNR_DISPOSITION_NAME;

/**
 * Has the lead used up today's RNR allowance (closed for today)?
 * Uses RNR_MAX_PER_DAY so the queue and the submission gate always agree.
 */
const isClosedForToday = (rnrCountToday) => Number(rnrCountToday || 0) >= RNR_MAX_PER_DAY;

/**
 * Mongo matcher for RNR rows. Matches on the disposition ref OR the
 * dispositionName snapshot so legacy rows (written before the snapshot field
 * existed) are still counted exactly once.
 */
const rnrRowMatch = (rnrDisp) =>
  rnrDisp
    ? { $or: [{ disposition: rnrDisp._id }, { dispositionName: RNR_DISPOSITION_NAME }] }
    : { dispositionName: RNR_DISPOSITION_NAME };

const rnrDisposition = async () =>
  Disposition.findOne({ name: RNR_DISPOSITION_NAME }).select('_id').lean().catch(() => null);

/**
 * Is this fetched Interaction row a NOT REACHABLE attempt?
 *
 * Strict match on "Switched Off / Not Reachable" ONLY. This is the predicate
 * that defines the Not Reachable queue, and it is deliberately NOT shared with
 * isRnrInteraction — a lead in this state never enters the RNR queue, and an
 * RNR row never enters the Not Reachable queue.
 *
 * Pure predicate — usable on lean documents already loaded by a caller without
 * another query.
 */
const isNotReachableInteraction = (it) =>
  String(it?.dispositionName || '').trim().toUpperCase() ===
  NOT_REACHABLE_DISPOSITION_NAME.toUpperCase();

/**
 * Mongo matcher for Not Reachable rows. Matches the disposition ref OR the
 * dispositionName snapshot so legacy rows (written before the snapshot field
 * existed) are still counted exactly once.
 */
const notReachableRowMatch = (disp) =>
  disp
    ? { $or: [{ disposition: disp._id }, { dispositionName: NOT_REACHABLE_DISPOSITION_NAME }] }
    : { dispositionName: NOT_REACHABLE_DISPOSITION_NAME };

const notReachableDisposition = async () =>
  Disposition.findOne({ name: NOT_REACHABLE_DISPOSITION_NAME }).select('_id').lean().catch(() => null);

/**
 * Not Reachable attempts per lead on the current business-timezone calendar day.
 *
 * A COMPLETELY SEPARATE counter from getRnrCounts: a lead with 2 RNRs and 1 Not
 * Reachable today reads { rnr: 2, notReachable: 1 }. Neither is ever added to
 * the other.
 *
 * No lifetime total is computed here — RNR 6+ derives from RNR rows only, so it
 * is structurally immune to this queue.
 *
 * @returns {Promise<Map<string, number>>} keyed by String(leadId).
 */
const getNotReachableCounts = async (leadIds, now = new Date()) => {
  const ids = (leadIds || []).filter(Boolean);
  const counts = new Map();
  if (!ids.length) return counts;

  const [disp, { start, end }] = await Promise.all([notReachableDisposition(), dayBounds(now)]);
  if (!disp) return counts;

  const rows = await Interaction.aggregate([
    { $match: { lead: { $in: ids }, ...notReachableRowMatch(disp) } },
    {
      $group: {
        _id: '$lead',
        today: {
          $sum: {
            $cond: [{ $and: [{ $gte: ['$calledAt', start] }, { $lte: ['$calledAt', end] }] }, 1, 0],
          },
        },
      },
    },
  ]);

  for (const r of rows) counts.set(String(r._id), r.today || 0);
  return counts;
};

/** Not Reachable attempts for ONE lead on the current business day. */
const countNotReachableForDay = async (leadId, now = new Date()) => {
  const [disp, { start, end }] = await Promise.all([notReachableDisposition(), dayBounds(now)]);
  if (!disp) return 0;
  return Interaction.countDocuments({
    lead: leadId,
    ...notReachableRowMatch(disp),
    calledAt: { $gte: start, $lte: end },
  });
};

/**
 * Daily + lifetime RNR counts for a batch of leads, in ONE aggregation.
 *
 * @param {Array}  leadIds
 * @param {Date}   [now]
 * @returns {Promise<Map<string, { today: number, total: number }>>} keyed by
 *          String(leadId); leads with no RNR history are simply absent.
 */
const getRnrCounts = async (leadIds, now = new Date()) => {
  const ids = (leadIds || []).filter(Boolean);
  const counts = new Map();
  if (!ids.length) return counts;

  const [rnrDisp, { start, end }] = await Promise.all([rnrDisposition(), dayBounds(now)]);
  if (!rnrDisp) {
    // No RNR disposition configured in this database — no RNR can exist.
    return counts;
  }

  const rows = await Interaction.aggregate([
    { $match: { lead: { $in: ids }, ...rnrRowMatch(rnrDisp) } },
    {
      $group: {
        _id: '$lead',
        total: { $sum: 1 },
        today: {
          $sum: {
            $cond: [{ $and: [{ $gte: ['$calledAt', start] }, { $lte: ['$calledAt', end] }] }, 1, 0],
          },
        },
      },
    },
  ]);

  for (const r of rows) counts.set(String(r._id), { today: r.today || 0, total: r.total || 0 });
  return counts;
};

/** Number of RNR attempts for ONE lead on the current business day. */
const countRnrsForDay = async (leadId, now = new Date()) => {
  const [rnrDisp, { start, end }] = await Promise.all([rnrDisposition(), dayBounds(now)]);
  if (!rnrDisp) return 0;
  return Interaction.countDocuments({
    lead: leadId,
    ...rnrRowMatch(rnrDisp),
    calledAt: { $gte: start, $lte: end },
  });
};

/** Lifetime (never resetting) RNR attempts for ONE lead. */
const countRnrsTotal = async (leadId) => {
  const rnrDisp = await rnrDisposition();
  if (!rnrDisp) return 0;
  return Interaction.countDocuments({ lead: leadId, ...rnrRowMatch(rnrDisp) });
};

/**
 * Read-only RNR limit status for a lead (drives the disposition form + call
 * assist). Never throws.
 *
 * @returns {{ usedToday, total, maxPerDay, isBlocked, reason, timezone,
 *             closedForToday, escalationThreshold }}
 *
 * `usedToday` counts RNR attempts ONLY. Not Reachable has its own independent
 * allowance (see getNotReachableLimits) and the two are never combined.
 */
const getRnrLimits = async (leadId, { now, maxPerDay } = {}) => {
  const _now = now || new Date();
  const _max = maxPerDay ?? RNR_MAX_PER_DAY;

  const rnrDisp = await rnrDisposition();
  if (!rnrDisp) {
    return {
      usedToday: 0, total: 0, maxPerDay: _max, isBlocked: false,
      reason: null, closedForToday: false, timezone: BUSINESS_TIMEZONE,
      escalationThreshold: RNR_ESCALATION_MIN,
    };
  }

  const { start, end } = dayBounds(_now);
  const [usedToday, total] = await Promise.all([
    Interaction.countDocuments({
      lead: leadId,
      ...rnrRowMatch(rnrDisp),
      calledAt: { $gte: start, $lte: end },
    }),
    // RNR-ONLY, lifetime. Unchanged — feeds the RNR 6+ escalation bucket.
    Interaction.countDocuments({ lead: leadId, ...rnrRowMatch(rnrDisp) }),
  ]);

  const blocked = usedToday >= _max;
  return {
    usedToday,
    total,
    maxPerDay: _max,
    isBlocked: blocked,
    closedForToday: blocked,
    reason: blocked
      ? `RNR limit reached for today. Maximum ${_max} RNR attempts are allowed per lead per day — this lead is closed for today and reopens on the next calendar day.`
      : null,
    timezone: BUSINESS_TIMEZONE,
    escalationThreshold: RNR_ESCALATION_MIN,
  };
};

/**
 * Submission gate for the RNR disposition. Throws once the lead has used its
 * daily RNR allowance; otherwise returns silently. Never mutates the lead —
 * it only blocks a further attempt today.
 */
const validateRnrLimits = async (leadId, { now, maxPerDay } = {}) => {
  const status = await getRnrLimits(leadId, { now, maxPerDay });
  if (status.isBlocked) throw new ApiError(400, status.reason);
};

/**
 * Read-only Not Reachable limit status. Mirrors getRnrLimits but counts ONLY
 * "Switched Off / Not Reachable" rows, so a lead with 2 RNRs and 1 Not Reachable
 * today reports usedToday = 1 here and usedToday = 2 in getRnrLimits.
 *
 * Deliberately exposes no lifetime `total`: Not Reachable never feeds RNR 6+.
 */
const getNotReachableLimits = async (leadId, { now, maxPerDay } = {}) => {
  const _max = maxPerDay ?? RNR_MAX_PER_DAY;
  const usedToday = await countNotReachableForDay(leadId, now || new Date());
  const blocked = usedToday >= _max;
  return {
    usedToday,
    maxPerDay: _max,
    isBlocked: blocked,
    closedForToday: blocked,
    reason: blocked
      ? `Not Reachable limit reached for today. Maximum ${_max} Not Reachable attempts are allowed per lead per day — this lead is closed for today and reopens on the next calendar day.`
      : null,
    timezone: BUSINESS_TIMEZONE,
  };
};

/**
 * Submission gate for the Not Reachable disposition. Independent of, and never
 * combined with, the RNR daily allowance.
 */
const validateNotReachableLimits = async (leadId, { now, maxPerDay } = {}) => {
  const status = await getNotReachableLimits(leadId, { now, maxPerDay });
  if (status.isBlocked) throw new ApiError(400, status.reason);
};

/**
 * The agent's THREE lead sets — the single source of BOTH the dashboard KPIs
 * and the Assigned Leads drawer filters, so a count and its list can never
 * disagree.
 *
 *   current       → LIVE RNR QUEUE. Active-surface leads whose latest
 *                   disposition is EXACTLY RNR and whose today RNR allowance is
 *                   not yet used up.
 *   notReachable  → LIVE NOT REACHABLE QUEUE. Active-surface leads whose latest
 *                   disposition is EXACTLY "Switched Off / Not Reachable" and
 *                   whose today Not Reachable allowance is not yet used up.
 *                   Completely disjoint from `current`.
 *   escalated     → LIFETIME RNR 6+ BUCKET. EVERY lead assigned to this agent
 *                   whose TOTAL (ever) RNR count is >= 6 — across all days, no
 *                   matter the current status, drop state, or which current
 *                   queue the lead is in. Feeds neither queue.
 *
 * A lead is placed in at most one current queue, chosen purely by its latest
 * disposition.
 *
 * @returns {Promise<{ current: ObjectId[], notReachable: ObjectId[], escalated: ObjectId[] }>}
 */
const getAgentRnrSets = async (agentId, now = new Date()) => {
  // Every lead assigned to this agent. The 6+ bucket needs the FULL assigned
  // scope — a lead that reached 6 lifetime RNRs is escalated even if it has
  // since moved out of the active workload (dropped, submitted, lost, etc).
  const assigned = await Lead.find({ assignedTo: agentId })
    .select('_id status dropStatus')
    .lean();

  if (!assigned.length) return { current: [], notReachable: [], escalated: [] };

  // Active-surface scope (both current queues only): non-terminal status and not
  // dropped / drop-requested — the same scope every other dashboard workload
  // count uses. Escalation deliberately ignores this scope.
  const activeScope = new Set(
    assigned
      .filter(
        (l) =>
          !TERMINAL_STATUSES.includes(l.status) &&
          l.dropStatus !== 'dropped' &&
          l.dropStatus !== 'drop-requested',
      )
      .map((l) => String(l._id)),
  );

  const ids = assigned.map((l) => l._id);
  const [interactions, rnrCounts, notReachableCounts] = await Promise.all([
    // Newest-first so the first row seen for a lead IS its latest disposition
    // (same "latest interaction wins" rule as the work queue / logout gate).
    Interaction.find({ lead: { $in: ids } })
      .sort({ calledAt: -1, createdAt: -1 })
      .select('lead dispositionName')
      .lean(),
    // RNR-only counts. `total` is the RNR 6+ escalation input; `today` is the
    // RNR queue's own daily allowance.
    getRnrCounts(ids, now),
    // Not Reachable queue's own, completely separate daily allowance.
    getNotReachableCounts(ids, now),
  ]);

  const latestByLead = new Map();
  for (const it of interactions) {
    const key = String(it.lead);
    if (!latestByLead.has(key)) latestByLead.set(key, it);
  }

  const current = [];
  const notReachable = [];
  const escalated = [];
  for (const lead of assigned) {
    const key = String(lead._id);
    const c = rnrCounts.get(key) || { today: 0, total: 0 };
    // LIFETIME RNR count — aggregated over EVERY day in the lead's history. If
    // the lead ever reached 6 RNR attempts, it belongs in RNR 6+ regardless of
    // what day the RNRs happened, today's schedule, or its queue state.
    // UNCHANGED: still RNR-only, still status-agnostic, and it feeds neither
    // current queue.
    if (c.total >= RNR_ESCALATION_MIN) escalated.push(lead._id);

    const latest = latestByLead.get(key);
    if (!latest || !activeScope.has(key)) continue;

    // RNR queue: latest disposition is RNR and today's RNR allowance remains.
    // Hitting 3/3 hides the lead for the rest of today ONLY — the interaction
    // history and the lead's latest disposition are left completely untouched.
    if (isRnrInteraction(latest) && !isClosedForToday(c.today)) {
      current.push(lead._id);
      continue;
    }
    // Not Reachable queue: latest disposition is Switched Off / Not Reachable,
    // gated by its OWN independent daily counter.
    if (isNotReachableInteraction(latest) && !isClosedForToday(notReachableCounts.get(key) || 0)) {
      notReachable.push(lead._id);
    }
  }

  return { current, notReachable, escalated };
};

/**
 * Lead ids for ONE RNR mode (what the drawer's `rnr` filter matches on).
 * @param {'current'|'not-reachable'|'escalated'} mode
 */
const getRnrLeadIds = async (agentId, mode, now = new Date()) => {
  const m = String(mode || '').trim().toLowerCase();
  const sets = await getAgentRnrSets(agentId, now);
  if (m === RNR_MODE.ESCALATED) return sets.escalated;
  if (m === RNR_MODE.NOT_REACHABLE) return sets.notReachable;
  return sets.current;
};

module.exports = {
  RNR_DISPOSITION_NAME,
  NOT_REACHABLE_DISPOSITION_NAME,
  RNR_MAX_PER_DAY,
  RNR_ESCALATION_MIN,
  RNR_MODE,
  RNR_MODES,
  BUSINESS_TIMEZONE,
  dayBounds,
  isRnrInteraction,
  isNotReachableInteraction,
  isClosedForToday,
  getRnrCounts,
  getNotReachableCounts,
  countRnrsForDay,
  countRnrsTotal,
  countNotReachableForDay,
  getRnrLimits,
  validateRnrLimits,
  getNotReachableLimits,
  validateNotReachableLimits,
  getAgentRnrSets,
  getRnrLeadIds,
};
