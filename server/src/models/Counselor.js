const mongoose = require('mongoose');

/**
 * Counselor profile — generic identity/workforce record linked to the
 * existing User. Holds no workflow fields; the registration → visa journey
 * will be added when counselor requirements are finalized.
 */
const counselorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Counselor', counselorSchema);
