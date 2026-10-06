const mongoose = require('mongoose');

/* ==========================================================================
   APPLICATION MODEL (Phase 4) — canonical application record.
   --------------------------------------------------------------------------
   • References the canonical Lead, University and the originating
     Shortlist entry. University data is NEVER copied — resolve through
     the University collection (University Management stays the master).
   • ONE status field drives the whole workflow. Statuses anchor on TASA's
     existing vocabulary (Draft / Submitted / Under Review / Offer Received
     / Rejected already existed) and add the preparation granularity the
     workflow needs. This is separate from the student's lifecycle stage.
   • Duplicate protection: at most ONE ACTIVE application per lead +
     university. Closed outcomes (Rejected / Withdrawn) free the pair so
     history can accumulate without blocking a future re-application.
     Enforced by a partial unique index on the computed `activeKey`.
   ========================================================================== */

const APPLICATION_STATUSES = [
  'Draft',
  'Preparing',
  'Documents Pending',
  'Ready to Submit',
  'Submitted',
  'Under Review',
  'Offer Received',
  'Rejected',
  'Withdrawn',
];

// Forward display order for progress views.
const APPLICATION_STATUS_FLOW = [
  'Draft',
  'Preparing',
  'Documents Pending',
  'Ready to Submit',
  'Submitted',
  'Under Review',
  'Offer Received',
];

// Statuses that keep the lead+university pair locked.
const APPLICATION_ACTIVE_STATUSES = [
  'Draft',
  'Preparing',
  'Documents Pending',
  'Ready to Submit',
  'Submitted',
  'Under Review',
  'Offer Received',
];

// Map onto Lead.APPLICATION_APP_STATUS so legacy derivations
// (deriveStage fallback over lead.applications[]) stay coherent.
const LEGACY_STATUS_MAP = {
  'Draft': 'draft',
  'Preparing': 'draft',
  'Documents Pending': 'draft',
  'Ready to Submit': 'draft',
  'Submitted': 'submitted',
  'Under Review': 'under-review',
  'Offer Received': 'offer-received',
  'Rejected': 'rejected',
};

const applicationSchema = new mongoose.Schema(
  {
    lead:       { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    university: { type: mongoose.Schema.Types.ObjectId, ref: 'University', required: true, index: true },
    shortlist:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shortlist', default: null },
    owner:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status:     { type: String, enum: APPLICATION_STATUSES, default: 'Draft', index: true },
    nextAction: { type: String, trim: true, default: '' },

    submittedAt:    { type: Date, default: null },
    submittedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt:      { type: Date, default: null },
    offerReceivedAt:{ type: Date, default: null },
    closedAt:       { type: Date, default: null },   // Rejected | Withdrawn
    closureReason:  { type: String, trim: true, default: '' },

    // Computed uniqueness key for ACTIVE applications only:
    // `${lead}:${university}` while active, removed once Rejected/Withdrawn.
    activeKey: { type: String, default: null },
  },
  { timestamps: true }
);

applicationSchema.index({ lead: 1, createdAt: -1 });
applicationSchema.index({ owner: 1, status: 1 });
applicationSchema.index({ university: 1, status: 1 });
applicationSchema.index(
  { activeKey: 1 },
  // $type (not $exists) so stored `null` defaults are NOT indexed — only
  // genuinely active applications carry a string key.
  { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } }
);

applicationSchema.pre('validate', function markActiveKey(next) {
  if (APPLICATION_ACTIVE_STATUSES.includes(this.status)) {
    this.activeKey = `${this.lead}:${this.university}`;
  } else {
    this.activeKey = undefined; // unsets → frees the pair, keeps the document
  }
  next();
});

module.exports = mongoose.model('Application', applicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
module.exports.APPLICATION_STATUS_FLOW = APPLICATION_STATUS_FLOW;
module.exports.APPLICATION_ACTIVE_STATUSES = APPLICATION_ACTIVE_STATUSES;
module.exports.LEGACY_STATUS_MAP = LEGACY_STATUS_MAP;
