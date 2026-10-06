const mongoose = require('mongoose');

const remarkSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    remark: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Remark', remarkSchema);
