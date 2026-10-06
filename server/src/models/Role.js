const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, uppercase: true },
    code: { type: String, required: true, trim: true, unique: true, lowercase: true },
    description: { type: String, trim: true },
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', roleSchema);
