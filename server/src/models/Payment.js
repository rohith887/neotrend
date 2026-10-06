const mongoose = require('mongoose');

const PAYMENT_TYPES = ['Registration Fee', 'Application Fee', 'Other Fee'];
const PAYMENT_STATUSES = [
  'pending',
  'link-sent',
  'partially-paid',
  'paid',
  'failed',
  'refunded',
];

const paymentSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    studentName: { type: String, trim: true, required: true },
    referenceId: { type: String, trim: true, required: true },
    paymentType: {
      type: String,
      enum: PAYMENT_TYPES,
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, trim: true, default: 'INR' },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    dueDate: { type: Date, default: null },
    paidDate: { type: Date, default: null },
    transactionRef: { type: String, trim: true, default: '' },
    paymentLink: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

paymentSchema.index({ lead: 1, status: 1 });
paymentSchema.index({ lead: 1, paymentType: 1 });
paymentSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
