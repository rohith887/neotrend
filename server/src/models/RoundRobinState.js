const mongoose = require('mongoose');

/**
 * RoundRobinState — singleton document that tracks fresh-lead round-robin
 * assignment across agents.
 *
 * There is exactly ONE document in the collection (with _id = 'singleton').
 * currentIndex grows monotonically; the actual position is computed as
 * currentIndex % agents.length at read time.
 */
const roundRobinStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },
    agents: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    currentIndex: { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: { updatedAt: true } }
);

module.exports = mongoose.model('RoundRobinState', roundRobinStateSchema);
