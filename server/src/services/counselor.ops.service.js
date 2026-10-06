const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Payment = require('../models/Payment');
const Document = require('../models/Document');
const Interaction = require('../models/Interaction');
const Callback = require('../models/Callback');
const Country = require('../models/Country');
const ApiError = require('../utils/ApiError');
const { syncReferralStatus } = require('./referral.service');
const { activeLeadsFilter } = require('./leadDrop.service');

// Counselor work queue: students at Counselor stage (workflow-driven, not assignedTo)
const COUNSELOR_STATUSES = ['completed', 'documents-pending', 'offer-received', 'visa-process'];

const getMyStudents = async (userId, rawQuery = {}) => {
  const page = Math.max(1, parseInt(rawQuery.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(rawQuery.limit) || 25));
  const skip = (page - 1) * limit;

  // Workflow-driven: students at Counselor stage (not assignedTo). Dropped
  // students remain in the bucket (they were dropped via the disposition —
  // they stay assigned and revivable from this list), but every other
  // active-surface query below keeps the activeLeadsFilter() exclusion.
  const STUDENT_LIST_STATUSES = [...COUNSELOR_STATUSES, 'dropped'];
  const query = { status: { $in: STUDENT_LIST_STATUSES } };

  // If specific status filter is provided, intersect with the bucket statuses
  if (rawQuery.status) {
    const filtered = STUDENT_LIST_STATUSES.filter(s => s === rawQuery.status);
    query.status = filtered.length ? { $in: filtered } : { $in: STUDENT_LIST_STATUSES };
  }
  // 'active' is a synthetic bucket matching getCounselorDashboard's own
  // registration.inProgress / visa.inProgress definitions exactly (real Lead
  // fields, no reach-gate — the dashboard doesn't gate these either), so a
  // KPI tile's count and this filtered list always agree. Plain values still
  // work as an exact match for any other caller.
  if (rawQuery.registrationStatus === 'active') {
    query.registrationStatus = { $nin: ['not-started', 'completed', 'failed', 'cancelled'] };
  } else if (rawQuery.registrationStatus) {
    query.registrationStatus = rawQuery.registrationStatus;
  }
  if (rawQuery.documentStatus) {
    query.documentStatus = rawQuery.documentStatus;
  }
  if (rawQuery.visaStatus === 'active') {
    query.visaStatus = { $nin: ['not-started', 'received', 'denied'] };
  } else if (rawQuery.visaStatus) {
    query.visaStatus = rawQuery.visaStatus;
  }
  if (rawQuery.applicationStatus) {
    query.applicationStatus = rawQuery.applicationStatus;
  }
  const andConditions = [];

  if (rawQuery.journeyStage) {
    if (rawQuery.journeyStage === 'not-started') {
      andConditions.push({ $or: [
        { counselingStatus: 'not-started' },
        { counselingStatus: { $exists: false } },
        { counselingStatus: null },
      ]});
    } else {
      query.counselingStatus = rawQuery.journeyStage;
    }
  }
  if (rawQuery.priority) {
    query.interestLevel = rawQuery.priority;
  }
  if (rawQuery.search) {
    const searchRegex = new RegExp(rawQuery.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    andConditions.push({ $or: [
      { studentName: searchRegex },
      { referenceId: searchRegex },
      { mobile: { $regex: rawQuery.search.replace(/[^\d]/g, ''), $options: 'i' } },
    ]});
  }
  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  const sort = {};
  if (rawQuery.sort) {
    const parts = rawQuery.sort.split(':');
    sort[parts[0]] = parts[1] === 'desc' ? -1 : 1;
  } else {
    sort.createdAt = -1;
  }

  const [leads, total] = await Promise.all([
    Lead.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('countryPreferred', 'name code')
      .lean(),
    Lead.countDocuments(query),
  ]);

  const leadIds = leads.map(l => l._id);

  const [interactions, callbacks, payments, documents] = await Promise.all([
    Interaction.find({ lead: { $in: leadIds } })
      .sort({ calledAt: -1 })
      .lean(),
    Callback.find({ lead: { $in: leadIds }, status: 'pending' })
      .sort({ scheduledAt: 1 })
      .lean(),
    Payment.find({ lead: { $in: leadIds } })
      .select('lead status amount')
      .lean(),
    Document.find({ lead: { $in: leadIds } })
      .select('lead status required')
      .lean(),
  ]);

  const interactionsByLead = new Map();
  for (const it of interactions) {
    const key = String(it.lead);
    if (!interactionsByLead.has(key)) interactionsByLead.set(key, []);
    interactionsByLead.get(key).push(it);
  }

  const paymentsByLead = new Map();
  for (const p of payments) {
    const key = String(p.lead);
    if (!paymentsByLead.has(key)) paymentsByLead.set(key, []);
    paymentsByLead.get(key).push(p);
  }

  const docsByLead = new Map();
  for (const d of documents) {
    const key = String(d.lead);
    if (!docsByLead.has(key)) docsByLead.set(key, []);
    docsByLead.get(key).push(d);
  }

  const mapped = leads.map(l => {
    const key = String(l._id);
    const leadInteractions = interactionsByLead.get(key) || [];
    const leadPayments = paymentsByLead.get(key) || [];
    const leadDocs = docsByLead.get(key) || [];

    const lastInteraction = leadInteractions[0];
    const lastCallAt = lastInteraction?.calledAt || null;

    const hasPendingPayments = leadPayments.some(p => p.status === 'pending' || p.status === 'link-sent');
    const allPaid = leadPayments.length > 0 && leadPayments.every(p => p.status === 'paid');
    const paymentStatus = leadPayments.length === 0 ? 'none' : allPaid ? 'paid' : hasPendingPayments ? 'pending' : 'other';

    const totalRequired = leadDocs.filter(d => d.required).length;
    const verifiedRequired = leadDocs.filter(d => d.required && d.status === 'verified').length;
    const documentCompletionPct = totalRequired > 0 ? Math.round((verifiedRequired / totalRequired) * 100) : 0;

    return {
      _id: l._id,
      referenceId: l.referenceId,
      studentName: l.studentName,
      mobile: l.mobile,
      email: l.email,
      status: l.status,
      interestLevel: l.interestLevel,
      intake: l.intake,
      gender: l.gender,
      countryPreferred: l.countryPreferred,
      lastCallAt,
      counselingStatus: l.counselingStatus || 'not-started',
      registrationStatus: l.registrationStatus || 'not-started',
      registrationDate: l.registrationDate,
      agreementStatus: l.agreementStatus || 'not-started',
      feeStatus: l.feeStatus || 'not-applicable',
      documentStatus: l.documentStatus,
      applicationStatus: l.applicationStatus,
      visaStatus: l.visaStatus,
      paymentStatus,
      documentCompletionPct,
      counselorAssigned: l.counselorAssigned || null,
      dropStatus: l.dropStatus || 'active',
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  });

  return {
    students: mapped,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};

const getCounselorDashboard = async (userId) => {
  // Workflow-driven: students at Counselor stage (not assignedTo)
  const leads = await Lead.find({ status: { $in: COUNSELOR_STATUSES }, ...activeLeadsFilter() }).lean();
  const leadIds = leads.map(l => l._id);

  const [payments, documents, callbacks] = await Promise.all([
    Payment.find({ lead: { $in: leadIds } })
      .select('lead status amount')
      .lean(),
    Document.find({ lead: { $in: leadIds } })
      .select('lead status required')
      .lean(),
    Callback.find({ lead: { $in: leadIds } })
      .select('lead scheduledAt status dispositionName callbackDate callbackTime')
      .lean(),
  ]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const totalAssigned = leads.length;

  // Counseling stage counts
  const counseling = {
    notStarted: leads.filter(l => !l.counselingStatus || l.counselingStatus === 'not-started').length,
    inProgress: leads.filter(l => l.counselingStatus === 'in-progress').length,
    completed: leads.filter(l => l.counselingStatus === 'completed').length,
  };

  const registration = {
    notStarted: leads.filter(l => !l.registrationStatus || l.registrationStatus === 'not-started').length,
    inProgress: leads.filter(l => l.registrationStatus && !['not-started', 'completed', 'failed', 'cancelled'].includes(l.registrationStatus)).length,
    completed: leads.filter(l => l.registrationStatus === 'completed').length,
    failed: leads.filter(l => l.registrationStatus === 'failed').length,
  };

  const docsByLead = new Map();
  for (const d of documents) {
    const key = String(d.lead);
    if (!docsByLead.has(key)) docsByLead.set(key, []);
    docsByLead.get(key).push(d);
  }

  // A lead only counts toward the Documents bucket once it has actually
  // reached that stage — same gate the workspace stepper uses to decide
  // when the Documents step becomes reachable (deriveStepStates in
  // CounselorWorkspace.jsx): counseling AND registration both completed or
  // in-progress. Without this, every lead with zero uploaded documents
  // (i.e. the entire untouched pool, including those who haven't even
  // started counseling) was counted as "pending".
  const isActiveOrDone = (v) => v === 'completed' || v === 'in-progress';
  const reachedDocumentsStage = (l) => isActiveOrDone(l.counselingStatus) && isActiveOrDone(l.registrationStatus);

  let docsPending = 0;
  let docsUnderReview = 0;
  let docsVerified = 0;
  let docsRejected = 0;

  for (const lead of leads) {
    if (!reachedDocumentsStage(lead)) continue;
    const leadDocs = docsByLead.get(String(lead._id)) || [];
    if (leadDocs.length === 0) {
      docsPending++;
      continue;
    }
    if (leadDocs.some(d => d.status === 'rejected')) docsRejected++;
    else if (leadDocs.some(d => d.status === 'under-review')) docsUnderReview++;
    else if (leadDocs.every(d => d.status === 'verified')) docsVerified++;
    else docsPending++;
  }

  const documentsSummary = { pending: docsPending, underReview: docsUnderReview, verified: docsVerified, rejected: docsRejected };

  const paymentsSummary = {
    pending: payments.filter(p => p.status === 'pending' || p.status === 'link-sent').length,
    paid: payments.filter(p => p.status === 'paid').length,
    totalCollected: payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0),
  };

  const applications = {
    total: leads.filter(l => l.applications && l.applications.length > 0).length,
    inProgress: leads.filter(l =>
      l.applications && l.applications.some(a => ['draft', 'submitted', 'under-review'].includes(a.status))
    ).length,
    offersReceived: leads.filter(l =>
      l.applications && l.applications.some(a => a.status === 'offer-received')
    ).length,
    accepted: leads.filter(l =>
      l.applications && l.applications.some(a => a.status === 'accepted')
    ).length,
  };

  const visa = {
    inProgress: leads.filter(l => l.visaStatus && !['not-started', 'received', 'denied'].includes(l.visaStatus)).length,
    received: leads.filter(l => l.visaStatus === 'received').length,
    denied: leads.filter(l => l.visaStatus === 'denied').length,
  };

  // Follow-up / callback breakdown
  const overdue = callbacks.filter(c => c.status === 'pending' && c.scheduledAt < now).length;
  const dueToday = callbacks.filter(c => c.status === 'pending' && c.scheduledAt >= todayStart && c.scheduledAt < todayEnd).length;
  const upcoming = callbacks.filter(c => c.status === 'pending' && c.scheduledAt >= todayEnd).length;
  const pendingCallbacks = callbacks.filter(c => c.status === 'pending').length;

  return {
    totalAssignedStudents: totalAssigned,
    counseling,
    registration,
    documents: documentsSummary,
    payments: paymentsSummary,
    applications,
    visa,
    followUps: { overdue, dueToday, upcoming },
    pendingCallbacks,
  };
};

const getRegistrationDetail = async (leadId, userId) => {
  // Workflow-driven: any Counselor can view any lead at Counselor stage
  const lead = await Lead.findById(leadId)
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source', 'name')
    .populate('assignedTo', 'firstName lastName')
    .lean();

  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!COUNSELOR_STATUSES.includes(lead.status)) {
    throw new ApiError(403, 'Lead is not at Counselor stage');
  }

  const payments = await Payment.find({ lead: leadId, paymentType: 'Registration Fee' })
    .sort({ createdAt: -1 })
    .lean();

  return {
    lead: {
      _id: lead._id,
      referenceId: lead.referenceId,
      studentName: lead.studentName,
      mobile: lead.mobile,
      email: lead.email,
      status: lead.status,
      intake: lead.intake,
      countryPreferred: lead.countryPreferred,
      assignedTo: lead.assignedTo,
    },
    registration: {
      status: lead.registrationStatus || 'not-started',
      registrationDate: lead.registrationDate,
      agreementStatus: lead.agreementStatus || 'not-started',
      feeStatus: lead.feeStatus || 'not-applicable',
      payments,
      lastUpdated: lead.updatedAt,
    },
  };
};

const updateRegistration = async (leadId, payload, userId) => {
  // Workflow-driven: any Counselor can update any lead at Counselor stage
  const lead = await Lead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!COUNSELOR_STATUSES.includes(lead.status)) {
    throw new ApiError(403, 'Lead is not at Counselor stage');
  }

  const updates = {};
  if (payload.registrationStatus !== undefined) updates.registrationStatus = payload.registrationStatus;
  if (payload.registrationDate !== undefined) updates.registrationDate = payload.registrationDate ? new Date(payload.registrationDate) : null;
  if (payload.agreementStatus !== undefined) updates.agreementStatus = payload.agreementStatus;
  if (payload.feeStatus !== undefined) updates.feeStatus = payload.feeStatus;

  if (Object.keys(updates).length > 0) {
    await Lead.updateOne({ _id: leadId }, { $set: updates });
  }

  // Sync referral status when registration lifecycle changes
  syncReferralStatus(leadId, userId).catch(() => {});

  const updated = await Lead.findById(leadId)
    .populate('countryPreferred', 'name code')
    .lean();

  return {
    lead: {
      _id: updated._id,
      referenceId: updated.referenceId,
      studentName: updated.studentName,
      mobile: updated.mobile,
      email: updated.email,
      status: updated.status,
      intake: updated.intake,
      countryPreferred: updated.countryPreferred,
    },
    registration: {
      status: updated.registrationStatus || 'not-started',
      registrationDate: updated.registrationDate,
      agreementStatus: updated.agreementStatus || 'not-started',
      feeStatus: updated.feeStatus || 'not-applicable',
      lastUpdated: updated.updatedAt,
    },
  };
};

const completeCounseling = async (leadId, userId) => {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!COUNSELOR_STATUSES.includes(lead.status)) {
    throw new ApiError(403, 'Lead is not at Counselor stage');
  }

  const now = new Date();
  const updates = {
    counselingStatus: 'completed',
    counselingCompletedAt: now,
    counselingCompletedBy: userId,
  };

  if (!lead.registrationStatus || lead.registrationStatus === 'not-started') {
    updates.registrationStatus = 'not-started';
  }

  await Lead.updateOne({ _id: leadId }, { $set: updates });

  // Sync referral status when counseling completes
  syncReferralStatus(leadId, userId).catch(() => {});

  const updated = await Lead.findById(leadId)
    .populate('countryPreferred', 'name code')
    .lean();

  return {
    lead: {
      _id: updated._id,
      referenceId: updated.referenceId,
      studentName: updated.studentName,
      status: updated.status,
      counselingStatus: updated.counselingStatus,
      counselingCompletedAt: updated.counselingCompletedAt,
      registrationStatus: updated.registrationStatus || 'not-started',
    },
  };
};

const getRegistrationQueue = async (rawQuery = {}) => {
  const page = Math.max(1, parseInt(rawQuery.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(rawQuery.limit) || 25));
  const skip = (page - 1) * limit;

  const query = { counselingStatus: 'completed', ...activeLeadsFilter() };

  if (rawQuery.registrationStatus) {
    query.registrationStatus = rawQuery.registrationStatus;
  }

  if (rawQuery.status) {
    const filtered = COUNSELOR_STATUSES.filter(s => s === rawQuery.status);
    if (filtered.length) query.status = { $in: filtered };
  }

  if (rawQuery.search) {
    const searchRegex = new RegExp(rawQuery.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { studentName: searchRegex },
      { referenceId: searchRegex },
      { mobile: { $regex: rawQuery.search.replace(/[^\d]/g, ''), $options: 'i' } },
    ];
  }

  const sort = {};
  if (rawQuery.sort) {
    const parts = rawQuery.sort.split(':');
    sort[parts[0]] = parts[1] === 'desc' ? -1 : 1;
  } else {
    sort.counselingCompletedAt = -1;
  }

  const [leads, total] = await Promise.all([
    Lead.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('countryPreferred', 'name code')
      .lean(),
    Lead.countDocuments(query),
  ]);

  const mapped = leads.map(l => ({
    _id: l._id,
    referenceId: l.referenceId,
    studentName: l.studentName,
    mobile: l.mobile,
    email: l.email,
    status: l.status,
    intake: l.intake,
    countryPreferred: l.countryPreferred,
    registrationStatus: l.registrationStatus || 'not-started',
    registrationDate: l.registrationDate,
    agreementStatus: l.agreementStatus || 'not-started',
    feeStatus: l.feeStatus || 'not-applicable',
    counselingCompletedAt: l.counselingCompletedAt,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }));

  return {
    students: mapped,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};

module.exports = {
  getMyStudents,
  getCounselorDashboard,
  getRegistrationDetail,
  updateRegistration,
  completeCounseling,
  getRegistrationQueue,
};
