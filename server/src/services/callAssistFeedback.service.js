const Lead = require('../models/Lead');
const CallAssistFeedback = require('../models/CallAssistFeedback');
const ApiError = require('../utils/ApiError');

/* ==========================================================================
   CALL ASSIST FEEDBACK — persistent, structured agent ratings of the Call
   Assist context shown during a call.

   The actor (agentId) always comes from the authenticated user, never from
   the client. `callId` stays null until a real dialer exists — the code is
   already wired for the future chain Lead → Call → Call Assist Version →
   Feedback without any schema change.
   ========================================================================== */

const FEEDBACK_CATEGORY_FIELDS = ['openingScript', 'studentContext', 'conversationFocus', 'nextQuestion'];

/**
 * Persist one feedback submission for a lead.
 *
 * @param {object} opts
 * @param {string} opts.leadId
 * @param {string} opts.userId   - authenticated agent (from auth middleware)
 * @param {object} opts.payload  - validated request body
 * @returns {Promise<object>} the stored feedback doc (with studentName for audit)
 */
const submitCallAssistFeedback = async ({ leadId, userId, payload }) => {
  const lead = await Lead.findById(leadId).select('_id studentName').lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  const doc = await CallAssistFeedback.create({
    callId: payload.callId || null,
    leadId: lead._id,
    agentId: userId,
    generatedContextVersion: payload.generatedContextVersion,
    openingScript: payload.openingScript,
    studentContext: payload.studentContext,
    conversationFocus: payload.conversationFocus,
    nextQuestion: payload.nextQuestion,
    comment: String(payload.comment || '').trim(),
  });

  return {
    _id: String(doc._id),
    callId: doc.callId ? String(doc.callId) : null,
    leadId: String(doc.leadId),
    agentId: String(doc.agentId),
    generatedContextVersion: doc.generatedContextVersion,
    openingScript: doc.openingScript,
    studentContext: doc.studentContext,
    conversationFocus: doc.conversationFocus,
    nextQuestion: doc.nextQuestion,
    comment: doc.comment,
    createdAt: doc.createdAt,
    studentName: lead.studentName || null,
  };
};

/**
 * Minimal Phase-1 analytics — totals plus agree % per category.
 * Deliberately NOT per-agent, no ranking, no scores, no AI analysis.
 */
const getFeedbackSummary = async () => {
  const agreeCounts = {
    openingScript: 0,
    studentContext: 0,
    conversationFocus: 0,
    nextQuestion: 0,
  };

  const pipeline = [
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        ...FEEDBACK_CATEGORY_FIELDS.reduce((acc, field) => {
          acc[`${field}Agree`] = { $sum: { $cond: [{ $eq: [`$${field}`, 'agree'] }, 1, 0] } };
          acc[`${field}Disagree`] = { $sum: { $cond: [{ $eq: [`$${field}`, 'disagree'] }, 1, 0] } };
          return acc;
        }, {}),
      },
    },
  ];

  const [agg, commentCount] = await Promise.all([
    CallAssistFeedback.aggregate(pipeline),
    CallAssistFeedback.countDocuments({ comment: { $ne: '' } }),
  ]);

  const row = agg[0] || { total: 0 };
  const total = row.total || 0;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  const categories = {};
  for (const field of FEEDBACK_CATEGORY_FIELDS) {
    const agree = row[`${field}Agree`] || 0;
    const disagree = row[`${field}Disagree`] || 0;
    categories[field] = { agree, disagree, agreePct: pct(agree) };
  }

  return { total, comments: commentCount, categories };
};

module.exports = { submitCallAssistFeedback, getFeedbackSummary };