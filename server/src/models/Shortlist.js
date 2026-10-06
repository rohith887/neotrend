const mongoose = require('mongoose');

/* ── Student ↔ University shortlist (Phase 3) ────────────────────────
   References ONLY — the university record stays canonical in University
   Management; a shortlist entry never duplicates university fields.

   Shortlist status is PER-UNIVERSITY and independent of the student's
   canonical lifecycle stage (Lead.lifecycleStage). A student at
   UNIVERSITY_SHORTLIST may hold University A → Confirmed while
   University B is still Considering.                                */

const SHORTLIST_STATUS = ['Considering', 'Shortlisted', 'Confirmed', 'Rejected', 'Removed'];
const SHORTLIST_PRIORITY = ['High', 'Medium', 'Low'];

const shortlistNoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const shortlistSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    university: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'University',
      required: true,
      index: true,
    },
    // Counselor/owner who added the entry.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    status: { type: String, enum: SHORTLIST_STATUS, default: 'Considering', index: true },
    priority: { type: String, enum: SHORTLIST_PRIORITY, default: 'Medium' },

    notes: { type: [shortlistNoteSchema], default: [] },

    // Soft-remove bookkeeping — historical entries are never destroyed
    // when a university is deactivated or an entry is removed.
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One entry per student+university — duplicates are impossible at the DB level.
shortlistSchema.index({ lead: 1, university: 1 }, { unique: true });

module.exports = mongoose.model('Shortlist', shortlistSchema);
module.exports.SHORTLIST_STATUS = SHORTLIST_STATUS;
module.exports.SHORTLIST_PRIORITY = SHORTLIST_PRIORITY;
