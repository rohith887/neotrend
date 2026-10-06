/**
 * NOTIFICATION MODEL — Phase 6 operational infrastructure.
 *
 * Per-user operational notifications (currently produced by task SLA
 * escalations, assignment changes, break-exceed alerts and logout-control
 * alerts). Kept deliberately small: recipient, message, optional task link
 * and read bookkeeping. Delivery is pull-based (the client polls
 * unread-count); no sockets, no external transports.
 */
const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'task-sla-breach',
  'task-overdue',
  'task-assigned',
  'task-reassigned',
  'supervisor-mention',
  // Break policy: a scheduled break (Morning Tea / Lunch / Evening Tea)
  // finished after its allowance → important supervisor alert.
  'break-exceeded',
  // Logout control: an Agent/Counselor attempted to sign out with unfinished
  // RNRs or pending callbacks → logout is blocked + important alert.
  'logout-blocked',
  // A supervisor granted a one-shot logout override for a blocked attempt.
  'logout-overridden',
  // An Agent/Counselor submitted the Drop Lead disposition → lead enters a
  // 'drop-requested' (Drop Pending) state and every supervisor gets an alert
  // to Approve or Deny the drop before it takes effect.
  'drop-request',
  // Privacy protection: an Agent/Counselor revealed a masked candidate email
  // or mobile number → every supervisor gets an alert so contact-detail
  // access stays auditable.
  'contact-viewed',
  'info',
];

// Lifecycle of a logout-blocked alert's one-shot override approval. A
// deliberate new logout attempt supersedes stale approvals so an override can
// never drift into a permanent bypass; consuming marks an approval "used".
const OVERRIDE_STATUSES = ['pending', 'approved', 'used', 'superseded'];

const notificationSchema = new mongoose.Schema(
  {
    user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:  { type: String, enum: NOTIFICATION_TYPES, default: 'info', index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body:  { type: String, trim: true, default: '', maxlength: 1000 },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    // Supervisor @mention alert: which lead was referenced and who created the alert.
    lead:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
    sender:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    meta:  { type: Map, of: String, default: null },
    read:   { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    // Logout-control / break-alert payload. `targetUser` is the Agent/Counselor
    // whose break was exceeded or whose logout attempt was flagged; override
    // bookkeeping records a Supervisor's one-shot approval on the alert.
    targetUser:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    overrideStatus: { type: String, enum: OVERRIDE_STATUSES, default: 'pending' },
    overrideBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    overrideByName: { type: String, trim: true, default: '' },
    overrideAt:     { type: Date, default: null },
    overrideReason: { type: String, trim: true, default: '' },
    consumedAt:     { type: Date, default: null },
    // Drop-lead supervisor decision bookkeeping on a 'drop-request' alert.
    // The action is lead-level (Approve → dropped, Deny → active again); the
    // decision is mirrored onto every supervisor copy of the alert so all of
    // them see the outcome and stale Approve/Deny buttons disappear.
    dropDecision:       { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
    dropDecisionBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dropDecisionByName: { type: String, trim: true, default: '' },
    dropDecisionReason: { type: String, trim: true, default: '' },
    dropDecisionAt:     { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ type: 1, targetUser: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.OVERRIDE_STATUSES = OVERRIDE_STATUSES;
