const Lead = require('../models/Lead');
const Interaction = require('../models/Interaction');
const Activity = require('../models/Activity');
const ApiError = require('../utils/ApiError');
const { buildCallbackDateTime } = require('./interaction.service');
const { syncReferralStatus } = require('./referral.service');
const { activeLeadsFilter } = require('./leadDrop.service');
const { RNR_DISPOSITION_NAME } = require('./rnr.service');

/**
 * AGENT WORK QUEUE
 *
 * A generic queue framework over existing callback data. The "callback"
 * queue is the agent's leads that currently hold a PENDING scheduled
 * callback — the source of truth is the scheduled callback INTERACTION,
 * not the lead status. A lead is pending when its latest interaction has a
 * callbackDateTime AND that interaction is not itself an RNR (so a newer
 * non-callback disposition — RNR, Interested, Not Interested — supersedes
 * the callback), the lead is still assigned to the agent, and its status is
 * non-terminal. Leads whose status is explicitly 'callback' are always
 * included (covers legacy rows scheduled before status-derivation existed).
 *
 * RNR interactions carry their OWN callbackDateTime — the "next call
 * attempt" date shown on the RNR disposition form — which is a retry
 * marker, never a real scheduled callback. Without excluding it here, a
 * lead whose latest disposition is RNR would falsely qualify for this
 * Callback queue too (see rnr.service's separate 'current' RNR set for the
 * actual RNR queue).
 *
 * Buckets:
 *   overdue   — callback datetime earlier than today
 *   today     — callback datetime on the current calendar day
 *   tomorrow  — callback datetime on the next calendar day
 *   later     — scheduled further out or with no scheduled time
 *
 * priorityP1 is the same entries pinned when priority (dispositionPriority
 * or interestLevel) is P1 — the "hot" sub-queue.
 */

// Statuses that take a lead out of the agent's active workload forever.
const TERMINAL_STATUSES = ['submitted', 'lost', 'callback-completed'];

const buildEntry = (lead, cbInteraction) => {
  const country =
    lead.countryPreferred?.name ||
    lead.preferredCountries?.find((c) => c?.country)?.country?.name ||
    null;

  const disp = lead.currentDisposition
    ? {
        name: lead.currentDisposition.name,
        label: lead.currentDisposition.label,
        color: lead.currentDisposition.color,
      }
    : null;

  return {
    id: lead._id,
    referenceId: lead.referenceId,
    studentName: lead.studentName,
    mobile: lead.mobile,
    email: lead.email,
    country,
    priority: cbInteraction?.dispositionPriority || cbInteraction?.interestLevel || null,
    disposition: disp
      ? { ...disp, label: disp.label || disp.name }
      : cbInteraction?.dispositionName
        ? { name: cbInteraction.dispositionName, label: cbInteraction.dispositionName, color: null }
        : null,
    dispositionName: cbInteraction?.dispositionName || disp?.name || null,
    callbackDate: cbInteraction?.callbackDate || null,
    callbackTime: cbInteraction?.callbackTime || null,
    // Previous remark — the note recorded when the callback was scheduled
    // (the latest interaction on a pending-callback lead is the scheduling
    // interaction, so its remarks are the "last time" context).
    remark: cbInteraction?.remarks || null,
    dueAt: cbInteraction?.callbackDateTime ? cbInteraction.callbackDateTime.toISOString() : null,
  };
};

const getWorkQueue = async (agentId) => {
  // All of the agent's non-terminal, non-dropped leads — the candidates for
  // the queue. Dropped leads are deliberately excluded (see leadDrop.service).
  const leads = await Lead.find({
    assignedTo: agentId,
    status: { $nin: TERMINAL_STATUSES },
    ...activeLeadsFilter(),
  })
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('currentDisposition', 'name label color')
    .lean();

  const empty = {
    callbacksOverdue: [],
    callbacksToday: [],
    callbacksTomorrow: [],
    callbacksLater: [],
    priorityP1: [],
    pendingCount: 0,
  };

  if (!leads.length) return empty;

  // Latest interaction per lead (newest calledAt first). A callback is only
  // pending while the LATEST interaction on the lead is itself a scheduled
  // callback — a newer non-callback disposition (RNR, Interested, ...)
  // supersedes it, so the follow-up is no longer pending.
  const interactions = await Interaction.find({
    lead: { $in: leads.map((l) => l._id) },
  })
    .sort({ calledAt: -1, createdAt: -1 })
    .lean();

  const latestByLead = new Map();
  for (const it of interactions) {
    if (!latestByLead.has(String(it.lead))) latestByLead.set(String(it.lead), it);
  }

  const entries = leads
    .filter((lead) => {
      const latest = latestByLead.get(String(lead._id));
      const isRealScheduledCallback =
        !!latest?.callbackDateTime && latest.dispositionName !== RNR_DISPOSITION_NAME;
      return lead.status === 'callback' || isRealScheduledCallback;
    })
    .map((lead) => buildEntry(lead, latestByLead.get(String(lead._id))));

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDayAfter = new Date(startOfTomorrow);
  startOfDayAfter.setDate(startOfDayAfter.getDate() + 1);

  const buckets = {
    callbacksOverdue: [],
    callbacksToday: [],
    callbacksTomorrow: [],
    callbacksLater: [],
  };

  for (const entry of entries) {
    const due = entry.dueAt ? new Date(entry.dueAt) : null;
    let bucket = 'callbacksLater';
    if (!due || due >= startOfDayAfter) bucket = 'callbacksLater';
    else if (due >= startOfTomorrow) bucket = 'callbacksTomorrow';
    else if (due >= startOfToday) bucket = 'callbacksToday';
    else bucket = 'callbacksOverdue';

    const status = bucket.replace('callbacks', '');
    buckets[bucket].push({ ...entry, status });
  }

  return {
    callbacksOverdue: buckets.callbacksOverdue,
    callbacksToday: buckets.callbacksToday,
    callbacksTomorrow: buckets.callbacksTomorrow,
    callbacksLater: buckets.callbacksLater,
    priorityP1: entries
      .filter((e) => e.priority === 'P1')
      .map((e) => ({ ...e, status: 'priority' })),
    // Total pending callback leads for the agent — the single source of
    // truth for the "Pending Callbacks" KPI (== sum of the four buckets).
    pendingCount: entries.length,
  };
};

/**
 * Mark a callback as completed from the callback workspace (no call was
 * made). The lead leaves the callback queue via the terminal status
 * 'callback-completed', and an audit entry is recorded.
 */
const completeCallback = async (agentId, { leadId } = {}) => {
  if (!leadId) throw new ApiError(400, 'leadId is required');

  const lead = await Lead.findOne({
    _id: leadId,
    assignedTo: agentId,
    status: { $nin: TERMINAL_STATUSES },
    ...activeLeadsFilter(),
  });
  if (!lead) throw new ApiError(404, 'Callback not found in your queue');

  await Lead.updateOne(
    { _id: leadId },
    {
      $set: { status: 'callback-completed' },
      $push: {
        dispositionHistory: {
          disposition: lead.currentDisposition || undefined,
          dispositionName: 'Callback Completed',
          note: 'Marked completed from the callback workspace',
          changedBy: agentId,
          changedAt: new Date(),
        },
      },
    }
  );

  // Sync referral status when lead status changes to callback-completed
  syncReferralStatus(leadId, agentId).catch(() => {});

  await Activity.create({
    user: agentId,
    type: 'CALLBACK_COMPLETED',
    lead: leadId,
    metadata: new Map([
      ['leadRef', lead.referenceId],
    ]),
  });

  return { leadId };
};

/**
 * Reschedule the callback for a lead in the agent's queue.
 * Updates the latest scheduled interaction and records an audit entry.
 */
const rescheduleCallback = async (agentId, { leadId, callbackDate, callbackTime } = {}) => {
  if (!leadId) throw new ApiError(400, 'leadId is required');
  if (!callbackDate || !callbackTime) {
    throw new ApiError(400, 'Callback date and time are required');
  }

  const callbackDateTime = buildCallbackDateTime(callbackDate, callbackTime);
  if (!callbackDateTime) throw new ApiError(400, 'Invalid callback date/time');
  if (callbackDateTime < new Date()) {
    throw new ApiError(400, 'Callback date/time cannot be in the past');
  }

  const lead = await Lead.findOne({
    _id: leadId,
    assignedTo: agentId,
    status: { $nin: TERMINAL_STATUSES },
    ...activeLeadsFilter(),
  })
    .populate('currentDisposition', 'name label color')
    .lean();
  if (!lead) throw new ApiError(404, 'Callback not found in your queue');

  const existing = await Interaction.findOne({
    lead: leadId,
    callbackDateTime: { $ne: null },
  }).sort({ calledAt: -1, createdAt: -1 });
  if (!existing) throw new ApiError(404, 'No scheduled callback found for this lead');

  const previous = existing.callbackDateTime;

  await Interaction.updateOne(
    { _id: existing._id },
    { $set: { callbackDate, callbackTime, callbackDateTime } }
  );

  await Lead.updateOne(
    { _id: leadId },
    {
      $push: {
        dispositionHistory: {
          disposition: lead.currentDisposition?._id || undefined,
          dispositionName: 'Callback Rescheduled',
          note: `Moved from ${previous ? previous.toISOString() : 'n/a'} to ${callbackDateTime.toISOString()}`,
          changedBy: agentId,
          changedAt: new Date(),
        },
      },
    }
  );

  return {
    leadId,
    callbackDate,
    callbackTime,
    callbackDateTime: callbackDateTime.toISOString(),
  };
};

module.exports = { getWorkQueue, rescheduleCallback, completeCallback };
