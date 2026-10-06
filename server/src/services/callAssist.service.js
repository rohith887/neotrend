const Lead = require('../models/Lead');
const Interaction = require('../models/Interaction');
const lifecycle = require('./lifecycle.service');
const { getRnrLimits } = require('./interaction.service');
const ApiError = require('../utils/ApiError');

/* ==========================================================================
   CALL ASSIST — reusable context builder for the Agent live-call popup.

   Assembles EVERYTHING a caller needs into one structured payload:
     - lead/student profile (populated refs)
     - current disposition / status
     - journey/workflow (lifecycle stage, waiting-on, next action)
     - previous context (recent interactions, RNR, callbacks, remarks,
       disposition history)
     - deterministic rule-based "generated" content (opening script,
       conversation focus, next question)

   LLM-READY DESIGN
   ---------------
   `data` above is pure CRM context — nothing invented. The `generated`
   block is currently produced by rules (`builder: 'rules-v1'`). To plug an
   LLM in later, replace ONLY the `generated` block by passing `data` to the
   model; the surface contract and the client component stay unchanged.
   Rules NEVER fabricate missing values — any absent field is simply omitted
   from the assembled context and the generated copy adapts to what exists.
   ========================================================================== */

const HISTORY_LIMIT = 6;         // most recent interactions to include
const REMARK_LIMIT = 3;          // latest non-empty remarks to surface
const DISPOSITION_HISTORY_LIMIT = 3;

// Version of the Call Assist generation logic. Carried on every context so
// agent feedback can reference the exact generation it judged:
//   rules-v1 → llm-v1 → llm-v2 → learned-v1
const GENERATED_CONTEXT_VERSION = 'rules-v1';

// Strip so a value renders as a clean "present / absent" flag.
const value = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const agentName = (user) => {
  if (!user) return '';
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || String(user.email || '').trim();
};

// 'UNIVERSITY_SHORTLIST' → 'University Shortlist'
const prettyStage = (stage) => {
  if (!stage) return null;
  return String(stage)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

const countryOf = (lead) => {
  if (lead.countryPreferred && typeof lead.countryPreferred === 'object' && lead.countryPreferred.name) {
    return lead.countryPreferred.name;
  }
  if (Array.isArray(lead.preferredCountries) && lead.preferredCountries.length) {
    const c = lead.preferredCountries.find((p) => p?.country?.name) || lead.preferredCountries[0];
    if (c?.country?.name) return c.country.name;
  }
  return null;
};

const universitiesOf = (lead) => {
  if (!Array.isArray(lead.preferredUniversities)) return [];
  return lead.preferredUniversities
    .map((p) => p?.university?.institutionName || p?.university)
    .filter((u) => value(String(u || '')));
};

// Course is only ever read from explicitly recorded applications — never
// guessed from the profile.
const courseOf = (lead) => {
  if (!Array.isArray(lead.applications) || !lead.applications.length) return null;
  const course = value(lead.applications[0].course);
  return course || null;
};

/**
 * Build the Call Assist context payload for a lead.
 *
 * @param {object}  opts
 * @param {string}  opts.leadId
 * @param {object}  opts.agent   - req.user (the agent making the call)
 * @returns {Promise<object>} the assembled context payload
 */
const buildCallAssistContext = async ({ leadId, agent }) => {
  const lead = await lifecycle.populatedLead(Lead.findById(leadId));
  if (!lead) throw new ApiError(404, 'Lead not found');

  // Recent interaction history (latest first) — one indexed query.
  const historyDocs = await Interaction.find({ lead: lead._id })
    .sort({ calledAt: -1 })
    .limit(HISTORY_LIMIT)
    .populate('disposition', 'name label color')
    .lean();

  // ── Previous context ────────────────────────────────────────────
  const history = historyDocs.map((it) => ({
    disposition: it.dispositionName || it.disposition?.name || null,
    remark: value(it.remarks || ''),
    interestLevel: it.interestLevel || null,
    scheduledCallback: it.callbackDateTime ? it.callbackDateTime.toISOString() : null,
    calledAt: it.calledAt ? it.calledAt.toISOString() : null,
    durationSec: Number.isFinite(it.durationSec) ? Math.max(0, Math.round(it.durationSec)) : 0,
  }));

  const rnrStatus = await getRnrLimits(lead._id).catch(() => null);
  const lastRnr = historyDocs.find((it) => String(it.dispositionName || '') === 'RNR');
  const rnr = rnrStatus
    ? {
        usedToday: rnrStatus.usedToday ?? 0,
        isBlocked: Boolean(rnrStatus.isBlocked),
        lastAt: lastRnr?.calledAt ? lastRnr.calledAt.toISOString() : null,
      }
    : null;

  const pendingCallback = historyDocs.find((it) => it.callbackDateTime);
  const scheduledCallback = pendingCallback
    ? {
        at: pendingCallback.callbackDateTime.toISOString(),
        disposition: pendingCallback.dispositionName || null,
        note: value(pendingCallback.remarks || ''),
      }
    : null;

  const recentRemarks = historyDocs
    .filter((it) => value(it.remarks || ''))
    .slice(0, REMARK_LIMIT)
    .map((it) => ({
      text: String(it.remarks).trim(),
      disposition: it.dispositionName || null,
      calledAt: it.calledAt ? it.calledAt.toISOString() : null,
    }));

  const dispositionHistory = (Array.isArray(lead.dispositionHistory) ? lead.dispositionHistory : [])
    .slice()
    .reverse()
    .slice(0, DISPOSITION_HISTORY_LIMIT)
    .map((entry) => ({
      disposition: value(entry.dispositionName || ''),
      note: value(entry.note || ''),
      changedAt: entry.changedAt ? entry.changedAt.toISOString() : null,
    }))
    .filter((entry) => entry.disposition);

  // ── Profile (pure CRM data — nothing derived/invented) ──────────
  const intake = value(lead.intake);
  const country = countryOf(lead);
  const universities = universitiesOf(lead);
  const course = courseOf(lead);
  const education = value(lead.highestEducation);

  const profile = {
    intake,
    education,
    country,
    universities: universities.length ? universities : null,
    course,
    leadSource: (() => {
      const src = lead.source;
      if (src && typeof src === 'object' && src.name) return src.name;
      if (typeof src === 'string' && String(src).trim()) return String(src).trim();
      return value(lead.leadSource || '');
    })(),
  };

  const current = {
    disposition: lead.currentDisposition
      ? {
          name: lead.currentDisposition.name || null,
          label: lead.currentDisposition.label || null,
          color: lead.currentDisposition.color || null,
        }
      : null,
    status: value(lead.status || ''),
    interestLevel: value(lead.interestLevel || ''),
  };

  const journey = {
    stage: prettyStage(lead.lifecycleStage),
    subStatus: value(lead.lifecycleSubStatus || ''),
    waitingOn: value(lead.waitingOn || ''),
    nextAction: value(lead.nextAction || ''),
    nextActionDue: lead.nextActionDue ? lead.nextActionDue.toISOString() : null,
  };

  // ── Generated content (rules-v1 — LLM-ready contract) ───────────
  const agentFullName = agentName(agent) || 'our team';
  const studentName = value(lead.studentName) || 'the student';

  const openingScript = intake
    ? `Hi ${studentName}, this is ${agentFullName} from Grassroots Study Abroad. I'm calling regarding your study-abroad enquiry for the ${intake} intake.`
    : `Hi ${studentName}, this is ${agentFullName} from Grassroots Study Abroad. I'm calling regarding your study-abroad enquiry.`;

  const focus = [];
  if (intake) focus.push(`Confirm the ${intake} intake plans.`);
  if (country) focus.push(`Confirm the preferred destination (${country}).`);
  if (universities.length) focus.push(`Discuss the preferred university (${universities.slice(0, 2).join(', ')}).`);
  if (course) focus.push(`Discuss the course preference (${course}).`);
  if (journey.stage) focus.push(`Understand the current stage: ${journey.stage}.`);
  if (scheduledCallback) focus.push('Follow up on the scheduled callback.');
  if (current.disposition?.name && current.disposition.name !== 'RNR') {
    focus.push(`Follow up on the previous enquiry (${current.disposition.name}).`);
  }
  const conversationFocus = focus.length ? focus.slice(0, 4) : ["Understand the student's study-abroad plans."];

  let nextQuestion = 'Could you tell me more about your study-abroad plans so I can guide you in the right direction?';
  if (intake) {
    nextQuestion = `Are you still planning to study abroad for the ${intake} intake?`;
  } else if (scheduledCallback) {
    const when = scheduledCallback.at.slice(0, 10);
    nextQuestion = `We had scheduled a follow-up for ${when}. Is this a good time to discuss your study-abroad plans?`;
  } else if (country) {
    nextQuestion = `Have you shortlisted ${country} as your preferred study destination?`;
  } else if (current.disposition?.name) {
    nextQuestion = 'How would you like to proceed with your study-abroad enquiry?';
  }

  return {
    leadId: String(lead._id),
    referenceId: value(lead.referenceId || '') || null,
    studentName,
    agent: { id: String(agent?._id || ''), name: agentFullName },
    profile,
    current,
    journey,
    previous: {
      history,
      rnr,
      scheduledCallback,
      recentRemarks,
      dispositionHistory,
    },
    generated: {
      openingScript,
      conversationFocus,
      nextQuestion,
      builder: GENERATED_CONTEXT_VERSION,
    },
    generatedContextVersion: GENERATED_CONTEXT_VERSION,
    generatedAt: new Date().toISOString(),
  };
};

module.exports = { buildCallAssistContext, prettyStage, GENERATED_CONTEXT_VERSION };