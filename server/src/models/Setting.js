const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true },
    value: { type: mongoose.Schema.Types.Mixed },
    label: { type: String, trim: true },
    group: { type: String, trim: true, default: 'general' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
