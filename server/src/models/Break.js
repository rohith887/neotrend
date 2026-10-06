const mongoose = require('mongoose');

const BREAK_TYPES = [
  'Morning Tea Break',
  'Lunch Break',
  'Evening Tea Break',
  'Tea Break',
  'Bio Break',
  'Meeting / Briefing',
  'Training',
  'Personal Break',
  'Other',
];

const breakSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: BREAK_TYPES, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    startedAt: { type: Date, required: true, index: true },
    endedAt: { type: Date },
    durationMinutes: { type: Number, min: 0 },
    status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },
  },
  { timestamps: true }
);

breakSchema.index({ user: 1, status: 1 });
breakSchema.index({ user: 1, startedAt: -1 });

breakSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Break', breakSchema);
module.exports.BREAK_TYPES = BREAK_TYPES;
