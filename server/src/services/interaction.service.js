const mongoose = require('mongoose');
const Interaction = require('../models/Interaction');
const Disposition = require('../models/Disposition');
const Lead        = require('../models/Lead');
const User        = require('../models/User');
const Call        = require('../models/Call');
const Notification = require('../models/Notification');
const Activity    = require('../models/Activity');
const ApiError    = require('../utils/ApiError');
const { syncReferralStatus } = require('./referral.service');
const lifecycle   = require('./lifecycle.service');
const notificationService = require('./notification.service');
// RNR rules (3 attempts per lead per business calendar day) live in
// rnr.service — the single source of truth shared by the submission gate,
// the availability queue, the dashboard KPIs and the Assigned Leads drawer.
const {
  validateRnrLimits,
  validateNotReachableLimits,
  getRnrLimits,
  countRnrsForDay,
  RNR_DISPOSITION_NAME,
  NOT_REACHABLE_DISPOSITION_NAME,
  RNR_MAX_PER_DAY,
  BUSINESS_TIMEZONE,
} = require('./rnr.service');

// ── Accidental duplicate-save guard ─────────────────────────────
// The audit found near-identical Interaction rows (same lead + agent +
// disposition, seconds apart). Rapid re-dials that legitimately complete
// take longer than a click, so a second interaction for the same lead +
// disposition from the same agent within this window is treated as an
// accidental double-submit and rejected rather than creating a duplicate
// call/disposition row that inflates every report.
const DUP_WINDOW_MS = 4000;

// ── @mention resolution ─────────────────────────────────────────
// Users that may be referenced with "@Name" inside remarks. A mention is
// stored as { user, name, role } — an identity link to a real user, not
// just the typed string. Invalid/unknown/inactive ids are skipped so a
// stray id can never block a disposition save.
const MENTIONABLE_ROLE_CODES = ['agent', 'counselor', 'supervisor'];

const resolveMentionUsers = async (mentions) => {
  const raw = Array.isArray(mentions) ? mentions.filter(Boolean) : [];
  if (!raw.length) return [];

  const seen = new Set();
  const result = [];
  for (const id of raw) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);

    let user = null;
    try {
      user = await User.findById(id).populate('role', 'name code').select('firstName lastName status').lean();
    } catch {
      user = null; // malformed ObjectId — not a mention sender error
    }
    if (!user || String(user.status) !== 'active') continue;

    const roleCode = String(user.role?.code || '').toLowerCase();
    if (!MENTIONABLE_ROLE_CODES.includes(roleCode)) continue;

    result.push({
      user: user._id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      role: String(user.role?.name || '').toUpperCase(),
    });
  }
  return result;
};

// ── @mention → alert ────────────────────────────────────────────
// When a remark mentions another user (agent/counselor/supervisor), create a
// shared Notification alert addressed to that mentioned user and linked to
// this lead — the same Notification collection and 'supervisor-mention' type
// the Agent alerts already use. This keeps Agent + Counselor + Supervisor on
// one connected alert stream: if an agent (or supervisor, or another
// counselor) mentions a counselor, that counselor sees it in their Alerts.
// The actor never alerts themselves; invalid/unknown recipients are skipped.
const notifyMentionedUsers = async ({ mentionedUsers, actorId, senderName, leadId, leadRef, leadLabel, message }) => {
  for (const m of mentionedUsers || []) {
    const recipientId = m.user;
    if (!recipientId || String(recipientId) === String(actorId)) continue;
    try {
      await Notification.create({
        user: recipientId,
        type: 'supervisor-mention',
        title: `${senderName} mentioned you`,
        body: message,
        lead: leadId,
        sender: actorId,
        meta: new Map(Object.entries({
          senderName: String(senderName),
          leadRef:    String(leadRef),
          leadStudent: String(leadLabel),
        }).map(([k, v]) => [k, String(v)])),
      });
    } catch (err) {
      // A mention must never block the disposition save.
      console.error('[interaction] mention alert failed:', err?.message);
    }
  }
};

// ── Lead status derived from disposition name ────────────────────
// RNR is "ring no response" — the lead stays assigned to the agent and is
// re-queued. 'Not Interested' terminates the lead. Everything else that
// requires a callback (e.g. 'Callback', 'P2 - Needs Parent Discussion')
// becomes 'callback' so the fetch strategy re-surfaces it to the agent.
const DISPOSITION_TO_LEAD_STATUS = {
  'RNR':            'assigned',
  'Not Interested': 'completed',
  'Drop Lead':      'dropped',
};

// RNR never schedules a callback even if a legacy DB row has the
// requiresCallback flag set — the agent just rings again later.
const NEVER_REQUIRES_CALLBACK = new Set(['RNR']);

// Mandatory student-profile fields. Mirrors client/src/utils/leadProfile.js
// REQUIRED_PROFILE_FIELDS — the single source of truth for which fields gate
// a disposition. Enforced ONLY for dispositions flagged requiresProfile
// (currently 'Interested'), never for Callback / RNR / Not Interested.
const REQUIRED_PROFILE_FIELDS = [
  { key: 'studentName',      label: 'Student Name' },
  { key: 'countryPreferred', label: 'Country Preference' },
  { key: 'intake',           label: 'Intake' },
  { key: 'highestEducation', label: 'Highest Education' },
  { key: 'source',           label: 'Lead Type' },
];

const missingProfileFields = (lead) =>
  REQUIRED_PROFILE_FIELDS.filter(({ key }) => {
    const v = lead[key];
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    return false;
  }).map(({ label }) => label);

/**
 * Build a combined ISO datetime string from separate date + time strings.
 * Returns null when either part is missing.
 */
const buildCallbackDateTime = (date, time) => {
  if (!date || !time) return null;
  const iso = `${date}T${time}:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Create a new Interaction document and update the parent Lead accordingly.
 *
 * @param {ObjectId} agentId   - req.user._id
 * @param {string}   roleName  - req.role.name (ownership enforcement)
 * @param {object}   payload   - validated body from controller
 */
const createInteraction = async (agentId, roleName, payload) => {
  const {
    leadId,
    dispositionId,
    interestLevel = null,
    remarks       = '',
    callbackDate  = '',
    callbackTime  = '',
    education     = null,
    reference     = null,
    durationSec   = 0,
    mentions      = undefined,
    callId        = null,
  } = payload;

  // ── Validate referenced documents exist ─────────────────────
  const [lead, disposition] = await Promise.all([
    Lead.findById(leadId),
    Disposition.findById(dispositionId),
  ]);

  if (!lead)        throw new ApiError(404, 'Lead not found');
  if (!disposition) throw new ApiError(404, 'Disposition not found');

  // ── Ownership guard — agents/counselors can only log calls on their own leads ──
  const upperRole  = String(roleName).toUpperCase();
  const isSupervisor = upperRole === 'SUPERVISOR';
  const isCounselor  = upperRole === 'COUNSELOR';
  const isAssigned   = lead.assignedTo && String(lead.assignedTo) === String(agentId);
  const isFetchedBy  = lead.fetchedBy  && String(lead.fetchedBy)  === String(agentId);
  if (!isSupervisor && !isCounselor && !isAssigned && !isFetchedBy) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  // ── Click-to-call linkage ─────────────────────────────────────
  // When the disposition save carries the caller's callId (the Call._id the
  // click-to-call created for THIS agent + lead), the interaction is linked
  // back to the live call so the chain Lead → Call → Disposition → Call
  // Assist Feedback stays complete. Wrong/mismatched call ids are rejected
  // rather than silently mis-linked.
  let callRefId = null;
  if (callId) {
    const call = await Call.findOne({ _id: callId, agent: agentId, lead: lead._id });
    if (!call) throw new ApiError(400, 'Invalid call reference for this lead');
    callRefId = call._id;
  }

  // ── RNR daily limit ─────────────────────────────────────────
  // Enforce max 3 RNR callback attempts per lead per calendar day.
  // There is no minimum interval between attempts. Only applies to RNR
  // dispositions — all other dispositions pass through unaffected.
  if (disposition.name === RNR_DISPOSITION_NAME) {
    await validateRnrLimits(lead._id);
  }
  // ── Not Reachable daily limit ─────────────────────────────
  // Separate, independent allowance: a lead with 2 RNRs today still gets its
  // full 3 Not Reachable attempts, and vice versa. The counters are never
  // combined. Blocking only prevents a further attempt today — the existing
  // interactions and the lead's latest disposition are left untouched.
  if (disposition.name === NOT_REACHABLE_DISPOSITION_NAME) {
    await validateNotReachableLimits(lead._id);
  }

  // ── Accidental duplicate-save guard ───────────────────────────
  // Reject a second interaction for the same lead + disposition from the
  // same agent created within the duplicate window. See DUP_WINDOW_MS.
  {
    const dupStart = new Date(Date.now() - DUP_WINDOW_MS);
    const recentDup = await Interaction.findOne({
      lead: lead._id,
      agent: agentId,
      disposition: disposition._id,
      calledAt: { $gte: dupStart },
    }).sort({ calledAt: -1 }).lean();
    if (recentDup) {
      throw new ApiError(
        400,
        'This disposition was just saved for this lead. Avoid submitting the same disposition twice in quick succession.'
      );
    }
  }

  // ── Drop Lead disposition rules ────────────────────────────────
  // A 'Drop Lead' submission is a SUPERVISOR-GATED request, not a silent drop.
  // The lead first enters a 'drop-requested' (Drop Pending) state and every
  // supervisor gets a drop-request alert to Approve (→ truly dropped, still
  // revivable) or Deny (→ back to the active working state). While pending,
  // no other disposition may be saved on the lead — it is on hold awaiting
  // the supervisor's decision. A reason is mandatory and double requests are
  // rejected (no duplicate alerts for the same drop attempt).
  const dropState = String(lead.dropStatus || 'active');
  if (dropState === 'drop-requested') {
    throw new ApiError(409, 'This lead has a pending Drop Lead request awaiting supervisor approval.');
  }
  if (disposition.name === 'Drop Lead') {
    if (dropState === 'dropped' || String(lead.status || '') === 'dropped') {
      throw new ApiError(409, 'This lead is already dropped. Revive it to continue working it.');
    }
    const dropReason = String(remarks || '').trim();
    if (!dropReason) {
      throw new ApiError(400, 'A drop reason is required — please explain why this lead is being dropped.');
    }
  }

  // Journey position BEFORE this call — the transition's previousStage.
  const previousStage = lifecycle.deriveStage(lead);
  const priorCalls = await Interaction.countDocuments({ lead: lead._id });

  // ── Mandatory student profile (only when the disposition requires it) ──
  // Mirror of the frontend gate — Callback / RNR / Not Interested submit
  // even with an incomplete profile. Interested blocks until the profile
  // fields are filled in.
  if (disposition.requiresProfile) {
    const missing = missingProfileFields(lead);
    if (missing.length) {
      throw new ApiError(
        400,
        `Complete the student profile before submitting this disposition. Missing: ${missing.join(', ')}`
      );
    }
  }

  // ── Build callbackDateTime ───────────────────────────────────
  const callbackDateTime = buildCallbackDateTime(callbackDate, callbackTime);

  const needsCallback = disposition.requiresCallback && !NEVER_REQUIRES_CALLBACK.has(disposition.name);
  if (needsCallback && !callbackDateTime) {
    throw new ApiError(400, 'Callback date and time are required for this disposition');
  }

  // Callback date must not be in the past
  if (callbackDateTime && callbackDateTime < new Date()) {
    throw new ApiError(400, 'Callback date/time cannot be in the past');
  }

  // Resolve @mention recipients once — stored on the Interaction and used to
  // emit connected alerts to the mentioned users (see notifyMentionedUsers).
  const mentionedUsers = await resolveMentionUsers(mentions);

  const interaction = await Interaction.create({
    lead: lead._id,
    agent: agentId,
    call: callRefId || undefined,
    disposition: disposition._id,
    dispositionName: disposition.name,
    dispositionType: disposition.type,
    dispositionPriority: disposition.priority,
    interestLevel: interestLevel || null,
    remarks: remarks || undefined,
    mentionedUsers: mentionedUsers || undefined,
    callbackDate: callbackDate || undefined,
    callbackTime: callbackTime || undefined,
    callbackDateTime: callbackDateTime || undefined,
    education: education || undefined,
    reference: reference || undefined,
    durationSec: Number.isFinite(durationSec) ? Math.max(0, Math.round(durationSec)) : 0,
    calledAt: new Date(),
  });

  // ── Call back-link ──────────────────────────────────────────
  // Completes the chain in the other direction: the Call document gets its
  // `interaction` field set. Best-effort — a failed link must never undo the
  // disposition save, and the link never overrides the call's own status
  // (the gateway owns the lifecycle).
  if (callRefId) {
    Call.updateOne({ _id: callRefId }, { $set: { interaction: interaction._id } }).catch(() => {});
  }

  // ── Mentioned-user alerts (connected Agent/Counselor/Supervisor alerts) ──
  // Fire-and-forget so a notification write can never block the save.
  if (mentionedUsers && mentionedUsers.length) {
    const actor = await User.findById(agentId).select('firstName lastName').lean().catch(() => null);
    const senderName = actor ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') : 'A team member';
    const leadLabel = String(lead.studentName || '').trim() || 'Student';
    const leadRef = String(lead.referenceId || lead._id);
    notifyMentionedUsers({
      mentionedUsers,
      actorId: agentId,
      senderName,
      leadId: lead._id,
      leadRef,
      leadLabel,
      message: remarks || 'You were mentioned on this lead',
    }).catch(() => {});
  }
  const newStatus = needsCallback
    ? 'callback'
    : (DISPOSITION_TO_LEAD_STATUS[disposition.name] || 'in-progress');

  // Drop Lead is now a SUPERVISOR-GATED soft-drop request, not a silent drop:
  //   active → (Drop Lead saved) → drop-requested / Drop Pending → supervisor
  //   approves → dropped (revivable) OR denies → back to the active state.
  // At request time the working status is preserved (never flipped to
  // 'dropped'); the pre-drop snapshot (droppedFromStatus/Disposition) is taken
  // by the supervisor's Approve action, and the REQUESTED event is appended to
  // dropHistory. Pending leads are held out of the active queues.
  const isDropLead = disposition.name === 'Drop Lead';
  const setFields = {
    currentDisposition: disposition._id,
    interestLevel:      interestLevel || lead.interestLevel,
    // Preserve the current working status for a pending drop; other
    // dispositions advance status as before.
    status:             isDropLead ? (lead.status || 'assigned') : newStatus,
    lastCallAt:         new Date(),
    // Release the cross-agent lock so the lead can be re-fetched
    // (by the same agent for callbacks/RNRs, or reassigned by a supervisor).
    fetchedBy:          null,
    fetchedAt:          null,
    ...(newStatus === 'completed' ? { submittedAt: new Date(), submittedBy: agentId } : {}),
  };
  const pushFields = {
    // Audit trail — every disposition change is recorded on the lead.
    dispositionHistory: {
      disposition: disposition._id,
      dispositionName: disposition.name,
      note: remarks || undefined,
      changedBy: agentId,
      changedAt: new Date(),
    },
  };
  if (isDropLead) {
    setFields.dropStatus = 'drop-requested';
    pushFields.dropHistory = {
      action: 'REQUESTED',
      by: agentId,
      reason: String(remarks || '').trim(),
      at: new Date(),
    };
  }

  await Lead.updateOne(
    { _id: lead._id },
    { $set: setFields, $push: pushFields }
  );

  // ── Supervisor drop-request alert ────────────────────────────
  // A Drop Lead submission is supervisor-gated: the lead is now Drop Pending
  // and every supervisor is alerted immediately with the student name, lead
  // ref, who dropped it, the reason and the current Drop Pending state so
  // they can Approve or Deny straight from the Alerts page. The request-time
  // guard (rejecting a second request while already pending) guarantees one
  // alert per drop attempt — never duplicates.
  if (isDropLead) {
    const actorUser = await User.findById(agentId).select('firstName lastName email').lean().catch(() => null);
    const actorName = actorUser
      ? [actorUser.firstName, actorUser.lastName].filter(Boolean).join(' ').trim() || actorUser.email || ''
      : '';
    await notificationService.createDropRequestAlert({
      leadId: lead._id,
      referenceId: String(lead.referenceId || ''),
      studentName: String(lead.studentName || '').trim(),
      actorId: agentId,
      actorName,
      reason: String(remarks || '').trim(),
    });
  }

  // Sync referral status when the lead's lifecycle stage changes
  syncReferralStatus(lead._id, agentId).catch(() => {});

  // ── Lifecycle transition (real business action: a disposition was saved) ──
  // Terminal "Not Interested" may be entered from anywhere; every other move
  // is forward-only so routine callbacks can never drag back an application.
  const targetStage = lifecycle.stageFromDisposition({
    disposition,
    callIndex: priorCalls + 1,
    currentStage: previousStage,
  });
  let freshLead = null;
  if (targetStage) {
    freshLead = await lifecycle.applyTransition({
      leadId: lead._id,
      actorId: agentId,
      toStage: targetStage,
      source: 'disposition',
      forwardOnly: targetStage !== 'NOT_INTERESTED',
      note: remarks || undefined,
    }).catch(async (err) => {
      console.error('[lifecycle] transition failed:', err?.message);
      return lifecycle.populatedLead(Lead.findById(lead._id));
    });
  } else {
    freshLead = await lifecycle.populatedLead(Lead.findById(lead._id));
  }

  // ── Activity log ─────────────────────────────────────────────
  await Activity.create({
    user: agentId,
    type: 'DISPOSITION_SAVED',
    lead: lead._id,
    metadata: new Map([
      ['dispositionName', disposition.name],
      ['interactionId',   String(interaction._id)],
      ['leadRef',         lead.referenceId],
    ]),
  });

  // Additive response: `lead` carries the fresh lifecycle state so the
  // workspace updates immediately without an extra fetch. Existing
  // consumers reading `interaction` are unaffected.
  return { interaction, lead: freshLead || null };
};

/**
 * List interactions for a given lead (supervisor / reporting use).
 */
const listByLead = async (leadId) => {
  const docs = await Interaction.find({ lead: leadId })
    .sort({ calledAt: -1 })
    .populate('agent',       'firstName lastName email')
    .populate('disposition', 'name label color')
    .lean();
  return docs;
};

module.exports = {
  createInteraction,
  listByLead,
  buildCallbackDateTime,
  validateRnrLimits,
  getRnrLimits,
  countRnrsForDay,
  RNR_MAX_PER_DAY,
  BUSINESS_TIMEZONE,
};
