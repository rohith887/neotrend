/**
 * TASK MODEL — Phase 6 operational infrastructure.
 *
 * A lightweight, reusable work-item that complements (never replaces) the
 * existing Lead / Callback workflow. Tasks carry their own due dates, an
 * optional SLA window and escalation bookkeeping so supervisors can track
 * operational risk independently of lead dispositions.
 *
 * Design rules:
 * • No mock lifecycle data — every task is created through the real API.
 * • SLA breach detection is stored (slaBreached) so escalations fire exactly
 *   once per breach, even though the deadline itself is derived.
 * • waitingOn mirrors Lead.WAITING_ON_OPTIONS so the two stay compatible.
 */
const mongoose = require('mongoose');
const { WAITING_ON_OPTIONS } = require('./Lead');

const TASK_TYPES = ['callback', 'follow-up', 'documents', 'application', 'visa', 'payment', 'general'];
const TASK_PRIORITIES = ['P1', 'P2', 'P3'];
const TASK_STATUSES = ['pending', 'in-progress', 'done', 'cancelled'];

const taskSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    type:        { type: String, enum: TASK_TYPES, default: 'general', index: true },
    priority:    { type: String, enum: TASK_PRIORITIES, default: 'P3', index: true },
    status:      { type: String, enum: TASK_STATUSES, default: 'pending', index: true },

    // Due dates & lifecycle stamps
    dueAt:       { type: Date, default: null },
    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // SLA tracking — deadline is createdAt + slaHours (derived, not stored)
    slaHours:    { type: Number, min: 1, max: 1000, default: null },
    slaBreached: { type: Boolean, default: false, index: true },
    breachedAt:  { type: Date, default: null },

    // Escalation support — incremented once per detected breach
    escalationLevel: { type: Number, default: 0, min: 0 },
    escalatedAt:     { type: Date, default: null },

    // Who/what is blocking (reuses the lead lifecycle vocabulary)
    waitingOn: { type: String, enum: [...WAITING_ON_OPTIONS, null], default: null },

    // Optional link to the student record this task belongs to
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },

    // Phase 4 — optional link to the application this task supports
    // (e.g. preparation / document follow-up / university follow-up).
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', default: null, index: true },

    assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ status: 1, dueAt: 1 });

module.exports = mongoose.model('Task', taskSchema);
module.exports.TASK_TYPES = TASK_TYPES;
module.exports.TASK_PRIORITIES = TASK_PRIORITIES;
module.exports.TASK_STATUSES = TASK_STATUSES;
module.exports.TASK_OPEN_STATUSES = ['pending', 'in-progress'];
