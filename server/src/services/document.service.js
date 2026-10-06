const Document = require('../models/Document');
const Lead = require('../models/Lead');
const ApiError = require('../utils/ApiError');
const { activeLeadsFilter } = require('./leadDrop.service');

const getDocumentsByLead = async (leadId) => {
  const docs = await Document.find({ lead: leadId }).sort({ createdAt: 1 }).lean();
  return docs;
};

const getDocumentSummary = async (leadId) => {
  const docs = await Document.find({ lead: leadId }).lean();
  const total = docs.length;
  const verified = docs.filter(d => d.status === 'verified').length;
  const missing = docs.filter(d => d.status === 'missing').length;
  const underReview = docs.filter(d => d.status === 'under-review').length;
  const rejected = docs.filter(d => d.status === 'rejected').length;
  const received = docs.filter(d => d.status === 'received').length;
  const requiredDocs = docs.filter(d => d.required);
  const requiredVerified = requiredDocs.filter(d => d.status === 'verified').length;
  const completionPct = requiredDocs.length > 0 ? Math.round((requiredVerified / requiredDocs.length) * 100) : 0;
  const missingNames = docs.filter(d => d.status === 'missing' || d.status === 'rejected').map(d => d.documentType);

  return {
    total,
    verified,
    missing,
    underReview,
    rejected,
    received,
    completionPct,
    missingNames,
  };
};

const createDocument = async (payload, userId) => {
  const lead = await Lead.findById(payload.lead).lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  const doc = await Document.create({
    lead: lead._id,
    studentName: lead.studentName,
    referenceId: lead.referenceId,
    documentType: payload.documentType,
    documentName: payload.documentName || '',
    category: payload.category || 'other',
    required: payload.required !== false,
    status: payload.status || 'missing',
    remarks: payload.remarks || '',
    createdBy: userId,
  });

  return doc;
};

const updateDocument = async (docId, payload, userId) => {
  const doc = await Document.findById(docId);
  if (!doc) throw new ApiError(404, 'Document not found');

  if (payload.status !== undefined) {
    doc.status = payload.status;
    if (payload.status === 'verified') {
      doc.verifiedAt = new Date();
      doc.verifiedBy = userId;
    }
    if (payload.status === 'received' && !doc.uploadedAt) {
      doc.uploadedAt = new Date();
    }
  }
  if (payload.documentType !== undefined) doc.documentType = payload.documentType;
  if (payload.documentName !== undefined) doc.documentName = payload.documentName;
  if (payload.category !== undefined) doc.category = payload.category;
  if (payload.required !== undefined) doc.required = payload.required;
  if (payload.rejectionReason !== undefined) doc.rejectionReason = payload.rejectionReason;
  if (payload.remarks !== undefined) doc.remarks = payload.remarks;

  await doc.save();
  return Document.findById(docId).lean();
};

const deleteDocument = async (docId) => {
  const doc = await Document.findById(docId);
  if (!doc) throw new ApiError(404, 'Document not found');
  await doc.deleteOne();
  return { success: true };
};

const bulkCreateDocuments = async (leadId, documents, userId) => {
  const lead = await Lead.findById(leadId).lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  const docs = documents.map(d => ({
    lead: lead._id,
    studentName: lead.studentName,
    referenceId: lead.referenceId,
    documentType: d.documentType,
    documentName: d.documentName || '',
    category: d.category || 'other',
    required: d.required !== false,
    status: d.status || 'missing',
    remarks: d.remarks || '',
    createdBy: userId,
  }));

  const created = await Document.insertMany(docs);
  return created;
};

const getDocumentQueue = async (counselorUserId, rawQuery = {}) => {
  const leads = await Lead.find({ assignedTo: counselorUserId, ...activeLeadsFilter() }).lean();
  const leadIds = leads.map(l => l._id);

  if (leadIds.length === 0) {
    return {
      students: [],
      summary: { totalStudents: 0, pending: 0, underReview: 0, verified: 0, rejected: 0 },
    };
  }

  const docs = await Document.find({ lead: { $in: leadIds } }).lean();

  const docsByLead = new Map();
  for (const doc of docs) {
    const key = String(doc.lead);
    if (!docsByLead.has(key)) docsByLead.set(key, []);
    docsByLead.get(key).push(doc);
  }

  const leadMap = new Map(leads.map(l => [String(l._id), l]));

  const students = leadIds.map(leadId => {
    const lead = leadMap.get(String(leadId));
    const leadDocs = docsByLead.get(String(leadId)) || [];
    const total = leadDocs.length;
    const verified = leadDocs.filter(d => d.status === 'verified').length;
    const missing = leadDocs.filter(d => d.status === 'missing').length;
    const underReview = leadDocs.filter(d => d.status === 'under-review').length;
    const rejected = leadDocs.filter(d => d.status === 'rejected').length;
    const requiredDocs = leadDocs.filter(d => d.required);
    const requiredVerified = requiredDocs.filter(d => d.status === 'verified').length;
    const completionPct = requiredDocs.length > 0 ? Math.round((requiredVerified / requiredDocs.length) * 100) : (total === 0 ? 0 : 100);
    const lastUpdated = leadDocs.length > 0
      ? leadDocs.reduce((latest, d) => d.updatedAt > latest ? d.updatedAt : latest, leadDocs[0].updatedAt)
      : null;

    return {
      lead: {
        _id: lead._id,
        studentName: lead.studentName,
        referenceId: lead.referenceId,
        mobile: lead.mobile,
        email: lead.email,
        intake: lead.intake,
        countryPreferred: lead.countryPreferred,
      },
      totalDocuments: total,
      verifiedDocuments: verified,
      missingDocuments: missing,
      underReviewDocuments: underReview,
      rejectedDocuments: rejected,
      completionPct,
      lastUpdated,
    };
  });

  const search = rawQuery.search || '';
  const filtered = search
    ? students.filter(s =>
        s.lead.studentName.toLowerCase().includes(search.toLowerCase()) ||
        s.lead.referenceId.toLowerCase().includes(search.toLowerCase())
      )
    : students;

  const statusFilter = rawQuery.status || '';
  const statusFiltered = statusFilter
    ? filtered.filter(s => {
        if (statusFilter === 'pending') return s.missingDocuments > 0 || s.totalDocuments === 0;
        if (statusFilter === 'under-review') return s.underReviewDocuments > 0;
        if (statusFilter === 'verified') return s.verifiedDocuments === s.totalDocuments && s.totalDocuments > 0;
        if (statusFilter === 'rejected') return s.rejectedDocuments > 0;
        return true;
      })
    : filtered;

  const summary = {
    totalStudents: students.length,
    pending: students.filter(s => s.missingDocuments > 0 || s.totalDocuments === 0).length,
    underReview: students.filter(s => s.underReviewDocuments > 0).length,
    verified: students.filter(s => s.verifiedDocuments === s.totalDocuments && s.totalDocuments > 0).length,
    rejected: students.filter(s => s.rejectedDocuments > 0).length,
  };

  return { students: statusFiltered, summary };
};

module.exports = {
  getDocumentsByLead,
  getDocumentSummary,
  createDocument,
  updateDocument,
  deleteDocument,
  bulkCreateDocuments,
  getDocumentQueue,
};
