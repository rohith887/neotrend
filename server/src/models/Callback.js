const mongoose = require('mongoose');

const callbackSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'completed', 'missed'], default: 'pending' },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Callback', callbackSchema);
