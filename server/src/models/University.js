const mongoose = require('mongoose');

const universitySchema = new mongoose.Schema(
  {
    institutionName: { type: String, required: true, trim: true },
    country: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true },
    city: { type: String, trim: true, default: '' },
    stateRegion: { type: String, trim: true, default: '' },
    ownership: { type: String, enum: ['PVT', 'PLC'], default: 'PVT' },
    owner: { type: String, trim: true, default: 'Universities' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

universitySchema.index({ country: 1 });
// Accelerates exact / prefix institution-name matches and the country-scoped
// list that the student finder evaluates every time it runs. (An unanchored
// substring $regex is not indexable by a normal b-tree index — see
// university.service.js listUniversities.)
universitySchema.index({ institutionName: 1 });
universitySchema.index(
  { institutionName: 1, country: 1, stateRegion: 1, city: 1 },
  { unique: true }
);

module.exports = mongoose.model('University', universitySchema);
