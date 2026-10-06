// ── Canonical call/conversion definitions ─────────────────────────────
// Single source of truth shared by User Management, Reports, Dashboard and
// Agent Workspace so the SAME metric always means the SAME number.
//
//   • Conversion  — a call is a conversion when its disposition priority is
//     P1/P2 OR the agent's logged interest level is P1/P2 (mirrors the
//     historic dashboard/lead semantics that also read `interestLevel`).
//   • Not-connected / busy — disposition-name driven (the call was dialled
//     but not answered / line busy), used to derive "connected" calls.

const CONVERSION_PRIORITIES = ['P1', 'P2'];

const NO_ANSWER_DISPOSITIONS = ['RNR', 'No Answer', 'NA', 'Unreachable'];
const BUSY_DISPOSITIONS = ['Busy', 'Busy Line', 'Call Later - Busy'];

// Dispositions that do NOT move a lead into a qualified status. Mirrors the
// status derivation in interaction.service.createInteraction: everything that
// is neither RNR (→ 'assigned') nor 'Not Interested' (→ 'completed') lands the
// lead in 'callback' or 'in-progress' — i.e. the qualified set
// ['in-progress', 'callback', 'follow-up']. Used for per-period "Qualified
// Leads" counts, sourced from the same Interaction rows as calls/connected so
// a table can never disagree with itself.
const QUALIFY_EXCLUDED = ['RNR', 'Not Interested'];

// True when an interaction counts as a conversion.
const isConversion = (it) => {
  if (CONVERSION_PRIORITIES.includes(it?.dispositionPriority)) return true;
  const interest = String(it?.interestLevel || '').toUpperCase();
  return CONVERSION_PRIORITIES.includes(interest);
};

// Is this interaction a "not connected" (no answer) call?
const isNotConnected = (it) => NO_ANSWER_DISPOSITIONS.includes(it?.dispositionName);

// Is this interaction a "busy" call?
const isBusy = (it) => BUSY_DISPOSITIONS.includes(it?.dispositionName);

module.exports = {
  CONVERSION_PRIORITIES,
  NO_ANSWER_DISPOSITIONS,
  BUSY_DISPOSITIONS,
  QUALIFY_EXCLUDED,
  isConversion,
  isNotConnected,
  isBusy,
};
