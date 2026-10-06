const mongoose = require('mongoose');

const dispositionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    type: { type: String, enum: ['normal', 'priority'], default: 'normal' },
    priority: { type: String, enum: ['P1', 'P2', 'P3', null], default: null },
    label: { type: String, trim: true },
    color: { type: String, trim: true, default: '#6c757d' },
    requiresCallback: { type: Boolean, default: false },
    requiresProfile: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

dispositionSchema.index({ priority: 1, type: 1 });

module.exports = mongoose.model('Disposition', dispositionSchema);
