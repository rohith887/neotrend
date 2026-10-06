const mongoose = require('mongoose');
const crypto = require('crypto');

const REFERRAL_STATUS = [
  'pending',
  'contacted',
  'qualified',
  'converted',
  'rejected',
];

const REWARD_STATUS = [
  'pending',
  'not-eligible',
  'eligible',
  'processing',
  'paid',
  'cancelled',
];

const rewardHistoryEntrySchema = new mongoose.Schema(
  {
    from: { type: String, enum: REWARD_STATUS, required: true },
    to: { type: String, enum: REWARD_STATUS, required: true },
    at: { type: Date, default: Date.now },
    by: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, trim: true },
    },
  },
  { _id: false }
);

const referralSchema = new mongoose.Schema(
  {
    referrerStudent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    referrerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    referralCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    referredLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
      index: true,
    },
    referredName: { type: String, trim: true, default: '' },
    referredMobile: { type: String, trim: true, default: '', index: true },
    referredEmail: { type: String, trim: true, lowercase: true, default: '' },
    preferredCountry: { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
    intake: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: REFERRAL_STATUS,
      default: 'pending',
      index: true,
    },
    rewardAmount: { type: Number, default: 10000 },
    rewardStatus: {
      type: String,
      enum: REWARD_STATUS,
      default: 'pending',
      index: true,
    },
    rewardHistory: {
      type: [rewardHistoryEntrySchema],
      default: [],
    },
    processingAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    processedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, trim: true },
    },
    paidBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, trim: true },
    },
    employeeName: { type: String, trim: true, default: '' },
    employeeId: { type: String, trim: true, default: '' },
    employeeNumber: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    source: {
      type: String,
      enum: ['individual', 'common', 'employee', 'public-qr'],
      default: 'individual',
    },
  },
  { timestamps: true }
);

referralSchema.index({ referrerStudent: 1, createdAt: -1 });

referralSchema.index(
  { referrerStudent: 1 },
  { unique: true, partialFilterExpression: { referrerStudent: { $ne: null } } }
);

referralSchema.index(
  { referrerUser: 1, referredLead: 1 },
  { unique: true, partialFilterExpression: { referrerUser: { $ne: null }, referredLead: { $ne: null } } }
);

referralSchema.index({ referrerUser: 1, createdAt: -1 });

referralSchema.statics.generateCode = function () {
  const bytes = crypto.randomBytes(8);
  return 'GR-RF-' + bytes.toString('base64url').toUpperCase().slice(0, 8);
};

module.exports = mongoose.model('Referral', referralSchema);
