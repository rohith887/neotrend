const mongoose = require('mongoose');

// ── TASA call states ────────────────────────────────────────────────
// A provider-agnostic view of a click-to-call session. The gateway's raw
// status string is kept separately (`providerStatus`); `status` is always one
// of these values so the Agent workspace and every report speak one
// vocabulary regardless of the SIP/PBX vendor.
const CALL_STATUS = [
  'initiated',   // gateway accepted the request, dialing the agent's phone
  'ringing',     // a leg is ringing
  'answered',    // a leg answered
  'connected',   // agent ↔ student both on the line (talk time)
  'completed',   // ended normally
  'failed',      // gateway error / rejected
  'no-answer',   // rang but nobody picked up
  'busy',        // called party busy
  'cancelled',   // abandoned before connect
];

// Statuses that still mean "the call is live".
const CALL_LIVE = new Set(['initiated', 'ringing', 'answered', 'connected']);

// Terminal statuses — after one of these the call is finished.
const CALL_TERMINAL = new Set(['completed', 'failed', 'no-answer', 'busy', 'cancelled']);

const callSchema = new mongoose.Schema(
  {
    lead:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Provider that originated the call (the Asterisk AMI gateway).
    provider: { type: String, trim: true, default: 'asterisk' },

    // Asterisk Uniqueid of the originated (agent-leg) channel. This is the
    // ONLY id TASA treats as the provider's (`providerCallId`); `_id` is the
    // TASA `callId` that is threaded into dispositions, Call Assist feedback
    // and reports. Correlation: providerCallId = Uniqueid, channel = the
    // agent-leg channel, linkedId = Asterisk Linkedid (the call-chain root).
    providerCallId: { type: String, sparse: true, unique: true, index: true },

    // Asterisk agent-leg channel (e.g. SIP/9999-0000abcd). Needed to issue
    // AMI Hangup against the exact tracked channel. The student leg is found
    // by Linkedid, never stored by name.
    channel: { type: String, trim: true, default: '' },

    // Asterisk Linkedid of the agent leg — the call-chain root shared by
    // every bridged leg, so student-leg AMI events resolve to this Call.
    linkedId: { type: String, trim: true, default: '' },

    // Raw status string as reported by the gateway (kept for reconciliation).
    providerStatus: { type: String, trim: true, default: '' },
    status: { type: String, enum: CALL_STATUS, default: 'initiated', index: true },

    // Dialed numbers, snapshotted at initiation (source of truth: agent
    // User.mobile, student Lead.mobile). Never expoortsed to role UIs
    // unmasked; the owning agent already has both via lead/user.
    agentNumber:   { type: String, trim: true, default: '' },
    studentNumber: { type: String, trim: true, default: '' },

    startedAt:       { type: Date, default: Date.now },
    answeredAt:      { type: Date, default: null },
    endedAt:         { type: Date, default: null },
    statusUpdatedAt: { type: Date, default: Date.now },

    // Back-link set when the post-call disposition is saved, completing the
    // chain the Call Assist model anticipates: Lead → Call → Call Assist
    // Version (generatedContextVersion) → Interaction (disposition) →
    // CallAssistFeedback. Null until a disposition references this call.
    interaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Interaction', default: null },

    // Sanitized, user-facing failure note (never raw gateway payloads / secrets).
    errorMessage: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

callSchema.index({ agent: 1, status: 1 });
callSchema.index({ lead: 1, startedAt: -1 });

// DB-ENFORCED single live call per agent. The application check in startCall is
// a routine read and two near-simultaneous Start requests can both pass it
// before either insert commits (proven in prod: two live 'initiated' records
// for one agent created 5ms apart). This partial unique index makes the
// invariant atomic — a second live insert fails with E11000, which the service
// maps to the existing 409. Terminal records (completed/failed/etc.) are
// excluded by the filter, so history keeps as many rows as it needs.
callSchema.index(
  { agent: 1 },
  {
    unique: true,
    name: 'one_live_call_per_agent',
    partialFilterExpression: { status: { $in: [...CALL_LIVE] } },
  }
);

module.exports = mongoose.model('Call', callSchema);
module.exports.CALL_STATUS = CALL_STATUS;
module.exports.CALL_LIVE = CALL_LIVE;
module.exports.CALL_TERMINAL = CALL_TERMINAL;