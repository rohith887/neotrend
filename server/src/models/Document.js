const mongoose = require('mongoose');

const DOCUMENT_TYPES = [
  'Passport',
  'Academic Transcripts',
  'Degree Certificate',
  'GRE Score',
  'GMAT Score',
  'IELTS Score',
  'TOEFL Score',
  'PTE Score',
  'SOP',
  'LOR',
  'Resume / CV',
  'Financial Documents',
  'Bank Statements',
  'Medical Reports',
  'Other',
];

const DOCUMENT_CATEGORIES = ['identity', 'academic', 'financial', 'test-score', 'application', 'visa', 'other'];

const DOCUMENT_STATUSES = ['missing', 'received', 'under-review', 'verified', 'rejected'];

const documentSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  // Phase 4 application-document foundation — optional link so a student
  // document can be associated with the application it supports. Existing
  // lead-scoped documents keep working unchanged (field stays null).
  application: { type: mongoose.Schema.ObjectId, ref: 'Application', default: null, index: true },
  studentName: { type: String, trim: true, required: true },
  referenceId: { type: String, trim: true, required: true },
  documentType: { type: String, enum: DOCUMENT_TYPES, required: true },
  documentName: { type: String, trim: true, default: '' },
  category: { type: String, enum: DOCUMENT_CATEGORIES, default: 'other' },
  required: { type: Boolean, default: true },
  status: { type: String, enum: DOCUMENT_STATUSES, default: 'missing', index: true },
  uploadedAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String, trim: true, default: '' },
  remarks: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

documentSchema.index({ lead: 1, status: 1 });
documentSchema.index({ lead: 1, documentType: 1 });
documentSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Document', documentSchema);
