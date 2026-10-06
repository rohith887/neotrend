const mongoose = require('mongoose');
const educationSchema = new mongoose.Schema(
  {
    collegeName:    { type: String, trim: true },
    yearOfPassing:  { type: String, trim: true },
    workExperience: { type: String, trim: true },
    gpa:            { type: String, trim: true },
    countryInterested:   { type: String, trim: true },
    preferredUniversity: { type: String, trim: true },
  },
  { _id: false }
);

const referenceSchema = new mongoose.Schema(
  {
    name:   { type: String, trim: true },
    mobile: { type: String, trim: true },
  },
  { _id: false }
);

const interactionSchema = new mongoose.Schema(
  {
    lead:        { type: mongoose.Schema.Types.ObjectId, ref: 'Lead',        required: true, index: true },
    agent:       { type: mongoose.Schema.Types.ObjectId, ref: 'User',        required: true, index: true },
    disposition: { type: mongoose.Schema.Types.ObjectId, ref: 'Disposition', required: true, index: true },
dispositionName: {
  type: String,
  required: true,
  trim: true,
},

dispositionType: {
  type: String,
  enum: ['normal', 'priority'],
  default: 'normal',
},

dispositionPriority: {
  type: String,
  enum: ['P1', 'P2', 'P3', null],
  default: null,
},
    interestLevel: { type: String, enum: ['P1', 'P2', 'P3', null], default: null },

    // ── Remarks ─────────────────────────────────────────────────
    remarks: { type: String, trim: true, maxlength: 2000 },

    // ── Callback scheduling ──────────────────────────────────────
    callbackDate:     { type: String, trim: true },   // 'YYYY-MM-DD'  (raw input)
    callbackTime:     { type: String, trim: true },   // 'HH:MM'       (raw input)
    callbackDateTime: { type: Date },                 // combined ISO datetime for scheduler

    // ── Education details (Interested only) ─────────────────────
    education: { type: educationSchema, default: null },

    // ── Reference details (Interested only, optional) ───────────
    reference: { type: referenceSchema, default: null },

    // ── Call metadata ────────────────────────────────────────────
    calledAt:  { type: Date, default: Date.now, index: true },
    durationSec: { type: Number, default: 0, min: 0 },   // call talk time, set by the agent workspace

    // ── Click-to-call link ───────────────────────────────────────
    // Back-link to the live Call record that produced this disposition,
    // completing the chain Lead → Call → Call Assist Version → Interaction →
    // Feedback. Null for legacy/self-logged calls without a dialer session.
    call: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', default: null, index: true },

    // ── Mentioned users (@autocomplete inside remarks) ───────────
    // Snapshot of the real users referenced in `remarks` so a mention
    // keeps its identity link (id) across every role's workspace even
    // without per-request population.
    mentionedUsers: {
      type: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, trim: true },
        role: { type: String, trim: true },
      }],
      default: undefined,
    },
  },
  { timestamps: true }
);

interactionSchema.index({ lead: 1, calledAt: -1 });
interactionSchema.index({ agent: 1, calledAt: -1 });

module.exports = mongoose.model('Interaction', interactionSchema);
