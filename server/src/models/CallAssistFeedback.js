const mongoose = require('mongoose');

/**
 * CallAssistFeedback — structured agent rating of the Call Assist context
 * that was shown during a call.
 *
 * Phase 1 foundation: the dialer does not exist yet, so `callId` is NULL.
 * When the dialer lands, the real call document id is stored here and the
 * relationship chain becomes Lead → Call → Call Assist Version → Feedback.
 *
 * The generation version is stored as data (never re-derived) so historical
 * feedback can be sliced by version later (rules-v1 → llm-v1 → …).
 */
const FEEDBACK_VALUES = ['agree', 'disagree'];

const callAssistFeedbackSchema = new mongoose.Schema(
  {
    callId: { type: mongoose.Schema.Types.ObjectId, default: null },

    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Exact generation the agent judged (e.g. 'rules-v1').
    generatedContextVersion: { type: String, required: true, trim: true },

    openingScript: { type: String, enum: FEEDBACK_VALUES, required: true },
    studentContext: { type: String, enum: FEEDBACK_VALUES, required: true },
    conversationFocus: { type: String, enum: FEEDBACK_VALUES, required: true },
    nextQuestion: { type: String, enum: FEEDBACK_VALUES, required: true },

    comment: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { timestamps: true }
);

callAssistFeedbackSchema.index({ leadId: 1, createdAt: -1 });
callAssistFeedbackSchema.index({ agentId: 1, createdAt: -1 });
callAssistFeedbackSchema.index({ generatedContextVersion: 1, createdAt: -1 });

const CallAssistFeedback = mongoose.model('CallAssistFeedback', callAssistFeedbackSchema);

CallAssistFeedback.FEEDBACK_VALUES = FEEDBACK_VALUES;

module.exports = CallAssistFeedback;