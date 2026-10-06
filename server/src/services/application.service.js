const mongoose = require('mongoose');
const Application = require('../models/Application');
const Shortlist = require('../models/Shortlist');
const Lead = require('../models/Lead');
const University = require('../models/University');
const Activity = require('../models/Activity');
const ApiError = require('../utils/ApiError');
const { parseListQuery } = require('../middleware/paginate');
const lifecycle = require('./lifecycle.service');
const taskService = require('./task.service');

/* ==========================================================================
   APPLICATION SERVICE (Phase 4)
   --------------------------------------------------------------------------
   Canonical application workflow built on top of Phases 1â€“3:
   â€¢ Applications are born ONLY from a Confirmed shortlist entry.
   â€¢ The canonical Application collection is the source of truth. A mapped
     mirror is written through to the legacy embedded lead.applications[]
     array + lead.applicationStatus so Phase 1â€“2 derivations
     (deriveStage fallback, dashboards) stay coherent untouched.
   â€¢ Lifecycle changes go exclusively through the Phase 2 engine
     (forward-only). One university's rejection/withdrawal never regresses
     or terminates the student journey.
   â€¢ Every meaningful action records an Activity event; preparation,
     document follow-up and submission triggers create tasks through the
     existing Task service contract (non-blocking).
   ========================================================================== */

const assertValidId = (value, label) => {
  if (!mongoose.Types.ObjectId.isValid(String(value))) {
    throw new ApiError(400, `${label} must be a valid id`);
  }
};

/* Counselor queue is workflow-stage driven (see counselor.ops.service
   getMyStudents) â€” the same status set grants shortlist/application
   management for students currently in the counselor stage. */
const COUNSELOR_WORKFLOW_STATUSES = ['completed', 'documents-pending', 'offer-received', 'visa-process'];

/* Supervisors manage any application; counselors/agents manage students
   they own or are actively working (mirrors the Phase 2/3 guard). */
const assertCanManage = (lead, req) => {
  const upperRole = String(req.role?.name || '').toUpperCase();
  if (upperRole === 'SUPERVISOR') return;
  if (upperRole === 'COUNSELOR' && COUNSELOR_WORKFLOW_STATUSES.includes(lead.status)) return;
  const uid = String(req.user._id);
  const isAssigned = lead.assignedTo && String(lead.assignedTo) === uid;
  const isFetcher = lead.fetchedBy && String(lead.fetchedBy) === uid;
  if (!isAssigned && !isFetcher) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this student');
  }
};

const recordEvent = async ({ leadId, actorId, action, application, extra = {} }) => {
  await Activity.create({
    user: actorId,
    type: 'APPLICATION_UPDATED',
    lead: leadId,
    metadata: new Map(Object.entries({
      action,
      applicationId: String(application?._id || ''),
      universityId: String(application?.university?._id || application?.university || ''),
      universityName: application?.university?.institutionName || undefined,
      status: application?.status || undefined,
      ...extra,
    }).filter(([, v]) => v !== undefined && v !== '')),
  });
};

const POPULATE = [
  { path: 'university', select: 'institutionName country city stateRegion ownership isActive' },
  { path: 'university.country', select: 'name code' },
  { path: 'owner', select: 'firstName lastName' },
];

const populatedApplication = (id) =>
  Application.findById(id).populate(POPULATE).populate('shortlist', 'status').lean();

const loadLeadForAccess = async (leadId, req) => {
  const lead = await Lead.findById(leadId).select('assignedTo fetchedBy status studentName').lean();
  if (!lead) throw new ApiError(404, 'Student not found');
  assertCanManage(lead, req);
  return lead;
};

const appByIdOr404 = async (applicationId) => {
  assertValidId(applicationId, 'Application');
  const app = await Application.findById(applicationId)
    .populate('university', 'institutionName isActive country city stateRegion')
    .populate('university.country', 'name code')
    .lean();
  if (!app) throw new ApiError(404, 'Application not found');
  return app;
};

/* â”€â”€ Legacy mirror â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Keeps lead.applications[] (string-name entries) and lead.applicationStatus
   aligned with the canonical collection. Rejection deliberately does NOT
   propagate to applicationStatus so legacy fallback derivation can never
   drag the whole student into the REJECTED terminal stage because one
   university said no.                                                     */

const LEGACY_RANK = ['not-started', 'draft', 'submitted', 'under-review', 'offer-received'];

const syncLegacyMirror = async (leadId) => {
  const apps = await Application.find({ lead: leadId })
    .populate('university', 'institutionName country')
    .lean();

  const entries = apps.map((a) => ({
    university: a.university?.institutionName || '',
    country: a.university?.country?.name || '',
    course: '',
    status: Application.LEGACY_STATUS_MAP[a.status] || 'draft',
    applicationDate: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : '',
    offerStatus: a.status === 'Offer Received' ? 'Offer Received' : '',
    importantDates: '',
    remarks: a.status === 'Withdrawn' ? 'Application withdrawn' : '',
  }));

  const positiveStatuses = apps
    .map((a) => Application.LEGACY_STATUS_MAP[a.status])
    .filter((s) => s && s !== 'rejected');
  const furthest = positiveStatuses.reduce(
    (best, s) => (LEGACY_RANK.indexOf(s) > LEGACY_RANK.indexOf(best) ? s : best),
    null
  );

  await Lead.updateOne(
    { _id: leadId },
    { $set: { applications: entries, applicationStatus: furthest } }
  );
};

/* â”€â”€ Non-blocking task triggers (existing Task service contract) â”€â”€â”€â”€â”€â”€ */
const createWorkflowTask = ({ actorId, leadId, applicationId, type, title }) => {
  taskService
    .createTask(actorId, {
      title,
      type,
      leadId,
      applicationId,
      assignedTo: undefined, // defaults to the acting owner
    })
    .catch(() => {});
};

/* â”€â”€ Student-level next-action helper (same-stage skip path â€” no event) â”€â”€ */
const setLeadNextAction = async (leadId, actorId, nextAction) => {
  try {
    const lead = await Lead.findById(leadId).select('lifecycleStage').lean();
    if (!lead) return;
    await lifecycle.applyTransition({
      leadId,
      actorId,
      toStage: lifecycle.deriveStage(lead),
      skipIfEqual: true,
      nextAction,
      source: 'application',
    });
  } catch {
    /* non-blocking */
  }
};

const remainingActiveCount = (application) =>
  Application.countDocuments({
    _id: { $ne: application._id },
    lead: application.lead,
    status: { $in: Application.APPLICATION_ACTIVE_STATUSES },
  });

const continueNextAction = async (application, actorId) => {
  const others = await remainingActiveCount(application);
  await setLeadNextAction(
    application.lead,
    actorId,
    others > 0 ? 'Continue with remaining applications' : 'Start a new application'
  );
};

/* â•â• PUBLIC API â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/**
 * GET /leads/:id/applications â€” paginated list for one student.
 * Filters: status, owner, university, createdFrom/createdTo; search across
 * university name. Never loads everything â€” server-side pagination.
 */
const listForLead = async ({ leadId, query = {} }) => {
  assertValidId(leadId, 'Student');
  const { query: parsed, sort, meta } = parseListQuery(query, ['status', 'owner']);

  const filter = { lead: leadId, ...parsed };
  if (query.createdFrom || query.createdTo) {
    filter.createdAt = {};
    if (query.createdFrom) filter.createdAt.$gte = new Date(query.createdFrom);
    if (query.createdTo) filter.createdAt.$lte = new Date(query.createdTo);
  }

  let universityFilter = null;
  if (query.university && mongoose.Types.ObjectId.isValid(String(query.university))) {
    filter.university = query.university;
  } else if (query.search && String(query.search).trim()) {
    // Search by university name within this student's applications.
    const rx = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    universityFilter = await University.find({ institutionName: rx }).select('_id').lean();
    filter.university = { $in: universityFilter.map((u) => u._id) };
  }

  const [apps, total] = await Promise.all([
    Application.find(filter).sort(sort).skip(meta.skip).limit(meta.limit).populate(POPULATE).lean(),
    Application.countDocuments(filter),
  ]);

  return {
    applications: apps,
    total,
    page: meta.page,
    pages: Math.ceil(total / meta.limit) || 0,
    limit: meta.limit,
  };
};

/**
 * POST /leads/:id/applications  body: { shortlistId }
 * Only a CONFIRMED shortlist entry can start an application.
 */
const create = async ({ leadId, shortlistId, req }) => {
  assertValidId(leadId, 'Student');
  assertValidId(shortlistId, 'Shortlist entry');

  const [lead, entry] = await Promise.all([
    Lead.findById(leadId).lean(),
    Shortlist.findById(shortlistId).populate('university', 'institutionName isActive').lean(),
  ]);
  if (!lead) throw new ApiError(404, 'Student not found');
  if (!entry) throw new ApiError(404, 'Shortlist entry not found');
  if (String(entry.lead) !== String(lead._id)) {
    throw new ApiError(400, 'This shortlist entry belongs to a different student');
  }
  if (entry.status !== 'Confirmed') {
    throw new ApiError(400, 'Only universities on the confirmed shortlist can start an application');
  }
  const university = await University.findById(entry.university._id).lean();
  if (!university) throw new ApiError(404, 'University not found');
  if (!university.isActive) {
    throw new ApiError(400, 'This university is inactive â€” a new application cannot be started');
  }

  assertCanManage(lead, req);

  const existingActive = await Application.findOne({
    lead: lead._id,
    university: university._id,
    status: { $in: Application.APPLICATION_ACTIVE_STATUSES },
  }).lean();
  if (existingActive) {
    throw new ApiError(409, 'An active application for this university already exists');
  }

  let app;
  try {
    app = await Application.create({
      lead: lead._id,
      university: university._id,
      shortlist: entry._id,
      owner: req.user._id,
      status: 'Draft',
      nextAction: 'Complete application documents',
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ApiError(409, 'An active application for this university already exists');
    }
    throw err;
  }

  await syncLegacyMirror(lead._id);

  await recordEvent({ leadId: lead._id, actorId: req.user._id, action: 'created', application: app });

  // Lifecycle: forward-only advance to APPLICATION on real creation only.
  const updatedLead = await lifecycle
    .ensureStageReached({
      leadId: lead._id,
      actorId: req.user._id,
      toStage: 'APPLICATION',
      source: 'application-created',
    })
    .catch(() => null);

  createWorkflowTask({
    actorId: req.user._id,
    leadId: lead._id,
    applicationId: app._id,
    type: 'application',
    title: `Prepare application â€” ${university.institutionName}`,
  });

  return { application: await populatedApplication(app._id), lead: updatedLead };
};

/** GET /applications/:id */
const getById = async ({ applicationId, req }) => {
  const app = await appByIdOr404(applicationId);
  await loadLeadForAccess(app.lead, req);
  return populatedApplication(app._id);
};

// PATCH-allowed transitions. Submission goes through POST /submit;
// withdrawal through POST /withdraw.
const TRANSITIONS = {
  'Draft':            ['Preparing', 'Documents Pending', 'Ready to Submit'],
  'Preparing':        ['Draft', 'Documents Pending', 'Ready to Submit'],
  'Documents Pending':['Draft', 'Preparing', 'Ready to Submit'],
  'Ready to Submit':  ['Draft', 'Preparing', 'Documents Pending'],
  'Submitted':        ['Under Review'],
  'Under Review':     ['Offer Received', 'Rejected'],
  'Offer Received':   [],
  'Rejected':         [],
  'Withdrawn':        [],
};

/**
 * PATCH /applications/:id  body: { status?, nextAction? }
 */
const updateStatus = async ({ applicationId, payload = {}, req }) => {
  const current = await appByIdOr404(applicationId);
  await loadLeadForAccess(current.lead, req);

  const doc = await Application.findById(applicationId);
  const events = [];
  let lifecycleLead = null;

  if (payload.nextAction !== undefined) {
    doc.nextAction = String(payload.nextAction || '').trim().slice(0, 200);
  }

  if (payload.status !== undefined && payload.status !== doc.status) {
    const target = String(payload.status || '').trim();
    if (!Application.APPLICATION_STATUSES.includes(target)) {
      throw new ApiError(400, `status must be one of: ${Application.APPLICATION_STATUSES.join(', ')}`);
    }
    if (target === 'Submitted') {
      throw new ApiError(400, 'Use the submit action to mark an application as Submitted');
    }
    if (target === 'Withdrawn') {
      throw new ApiError(400, 'Use the withdraw action to withdraw an application');
    }
    const allowed = TRANSITIONS[doc.status] || [];
    if (!allowed.includes(target)) {
      throw new ApiError(400, `Cannot move an application from "${doc.status}" to "${target}"`);
    }

    const from = doc.status;
    doc.status = target;

    if (target === 'Offer Received') {
      doc.offerReceivedAt = new Date();
      doc.decidedAt = new Date();
    }
    if (target === 'Rejected') {
      doc.decidedAt = new Date();
      doc.closedAt = new Date();
      doc.closureReason = String(payload.reason || '').trim().slice(0, 500);
    }

    events.push({
      action: target === 'Offer Received' ? 'offer' : target === 'Rejected' ? 'rejected' : 'status_changed',
      from,
      to: target,
      reason: doc.closureReason,
    });
  }

  if (!events.length && payload.nextAction === undefined) {
    throw new ApiError(400, 'Nothing to update â€” provide status or nextAction');
  }

  await doc.save();
  await syncLegacyMirror(doc.lead);

  for (const ev of events) {
    await recordEvent({
      leadId: doc.lead,
      actorId: req.user._id,
      action: ev.action,
      application: { ...doc.toObject(), university: current.university },
      extra: { from: ev.from, to: ev.to, reason: ev.reason },
    });

    if (ev.to === 'Offer Received') {
      // Forward-only advance; when already at OFFER_RECEIVED the details
      // patch below still lands without a duplicate stage event.
      lifecycleLead = await lifecycle
        .applyTransition({
          leadId: doc.lead,
          actorId: req.user._id,
          toStage: 'OFFER_RECEIVED',
          skipIfEqual: true,
          forwardOnly: true,
          source: 'application-offer',
          nextAction: 'Review offer with student',
          note: 'Offer received',
        })
        .catch(() => null);
    }
    if (ev.to === 'Rejected' || ev.to === 'Withdrawn') {
      await continueNextAction(doc, req.user._id);
    }
  }

  // Documents pending â†’ document follow-up task trigger.
  if (events.some((ev) => ev.to === 'Documents Pending')) {
    createWorkflowTask({
      actorId: req.user._id,
      leadId: doc.lead,
      applicationId: doc._id,
      type: 'documents',
      title: `Follow up documents â€” ${current.university?.institutionName || ''}`.trim(),
    });
  }

  return { application: await populatedApplication(doc._id), lead: lifecycleLead };
};

/** POST /applications/:id/submit */
const submit = async ({ applicationId, req }) => {
  const current = await appByIdOr404(applicationId);
  await loadLeadForAccess(current.lead, req);

  if (!['Draft', 'Preparing', 'Documents Pending', 'Ready to Submit'].includes(current.status)) {
    throw new ApiError(400, `An application in status "${current.status}" cannot be submitted`);
  }

  const doc = await Application.findById(applicationId);
  doc.status = 'Submitted';
  doc.submittedAt = new Date();
  doc.submittedBy = req.user._id;
  doc.nextAction = 'Await university response';
  await doc.save();

  await syncLegacyMirror(doc.lead);

  await recordEvent({
    leadId: doc.lead,
    actorId: req.user._id,
    action: 'submitted',
    application: { ...doc.toObject(), university: current.university },
  });

  // Forward-only: APPLICATION â†’ SUBMITTED (first submission wins). When
  // already at SUBMITTED (second application) only the workflow details
  // are refreshed â€” no duplicate stage event; when beyond, silent no-op.
  await lifecycle
    .applyTransition({
      leadId: doc.lead,
      actorId: req.user._id,
      toStage: 'SUBMITTED',
      skipIfEqual: true,
      forwardOnly: true,
      source: 'application-submitted',
      waitingOn: 'University',
      nextAction: 'Await university response',
      note: 'Application submitted',
    })
    .catch(() => {});
  const freshLead = await lifecycle.populatedLead(Lead.findById(doc.lead)).catch(() => null);

  createWorkflowTask({
    actorId: req.user._id,
    leadId: doc.lead,
    applicationId: doc._id,
    type: 'application',
    title: `University follow-up â€” ${current.university?.institutionName || ''}`.trim(),
  });

  return { application: await populatedApplication(doc._id), lead: freshLead };
};

/** POST /applications/:id/withdraw  body: { reason? } */
const withdraw = async ({ applicationId, payload = {}, req }) => {
  const current = await appByIdOr404(applicationId);
  await loadLeadForAccess(current.lead, req);

  if (current.status === 'Withdrawn') {
    return { application: await populatedApplication(applicationId), lead: null };
  }

  const doc = await Application.findById(applicationId);
  const from = doc.status;
  doc.status = 'Withdrawn';
  doc.closedAt = new Date();
  doc.closureReason = String(payload.reason || '').trim().slice(0, 500);
  await doc.save();

  await syncLegacyMirror(doc.lead);

  await recordEvent({
    leadId: doc.lead,
    actorId: req.user._id,
    action: 'withdrawn',
    application: { ...doc.toObject(), university: current.university },
    extra: { from, reason: doc.closureReason },
  });

  await continueNextAction(doc, req.user._id);

  return { application: await populatedApplication(doc._id), lead: null };
};

/**
 * GET /applications/:id/timeline — audited history for ONE application.
 * Same access contract as every other application read (supervisor or
 * counselor-eligible owner of the student). Returns the exact event shape
 * the unified Activity timeline already renders ({ id, type, at, user,
 * metadata }) so clients need no adapter.
 */
const getTimeline = async ({ applicationId, req }) => {
  assertValidId(applicationId, 'Application');
  const app = await appByIdOr404(applicationId);
  const lead = await Lead.findById(app.lead).select('assignedTo fetchedBy status').lean();
  if (!lead) throw new ApiError(404, 'Student not found');
  assertCanManage(lead, req);

  const docs = await Activity
    .find({
      type: 'APPLICATION_UPDATED',
      lead: app.lead,
      'metadata.applicationId': String(app._id),
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('user', 'firstName lastName')
    .lean();

  const events = docs.map((doc) => ({
    id: String(doc._id),
    type: doc.type,
    at: doc.createdAt,
    user: doc.user ? [doc.user.firstName, doc.user.lastName].filter(Boolean).join(' ') : null,
    metadata: Object.fromEntries(
      Object.entries(doc.metadata || {}).map(([k, v]) => [k, v])
    ),
  }));

  return {
    application: {
      _id: String(app._id),
      status: app.status,
      nextAction: app.nextAction || '',
      submittedAt: app.submittedAt,
      offerReceivedAt: app.offerReceivedAt,
      closedAt: app.closedAt,
      closureReason: app.closureReason,
    },
    events,
  };
};

const SUPERVISOR_ONLY_MSG = 'Forbidden: supervisor access required';
const STALE_DAYS_DEFAULT = 14;

/**
 * GET /api/applications — supervisor OPERATIONAL overview (read-only).
 * Counts by status, derived attention buckets, stale-active detection and
 * a paginated list with student/university resolution. Counselors/agents
 * are explicitly rejected here — their surface stays lead-scoped.
 */
const overview = async ({ query = {}, req }) => {
  const upperRole = String(req.role?.name || '').toUpperCase();
  if (upperRole !== 'SUPERVISOR') throw new ApiError(403, SUPERVISOR_ONLY_MSG);

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  const staleDays = Math.max(1, parseInt(query.staleDays, 10) || STALE_DAYS_DEFAULT);

  const filter = {};
  if (query.status && Application.APPLICATION_STATUSES.includes(String(query.status))) {
    filter.status = query.status;
  }
  let universityFilter = null;
  if (query.search && String(query.search).trim()) {
    const rx = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    universityFilter = await University.find({ institutionName: rx }).select('_id').lean();
    filter.university = { $in: universityFilter.map((u) => u._id) };
  }

  const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const [apps, total, byStatusRaw, staleCount, recentDocs] = await Promise.all([
    Application.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE)
      .populate('lead', 'studentName referenceId')
      .lean(),
    Application.countDocuments(filter),
    Application.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Application.countDocuments({
      status: { $in: Application.APPLICATION_ACTIVE_STATUSES },
      updatedAt: { $lt: staleCutoff },
    }),
    Activity.find({ type: 'APPLICATION_UPDATED' })
      .sort({ createdAt: -1 })
      .limit(15)
      .populate('user', 'firstName lastName')
      .populate('lead', 'studentName referenceId')
      .lean(),
  ]);

  const byStatus = Object.fromEntries(byStatusRaw.map((r) => [r._id, r.n]));
  const PRE_SUBMISSION = ['Draft', 'Preparing', 'Documents Pending', 'Ready to Submit'];
  const sumOf = (keys) => keys.reduce((acc, k) => acc + (byStatus[k] || 0), 0);

  return {
    summary: {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      inPreparation: sumOf(['Draft', 'Preparing']),
      awaitingDocuments: byStatus['Documents Pending'] || 0,
      readyToSubmit: byStatus['Ready to Submit'] || 0,
      awaitingAction: sumOf(PRE_SUBMISSION),
      submittedInFlight: sumOf(['Submitted', 'Under Review']),
      offers: byStatus['Offer Received'] || 0,
      rejections: byStatus['Rejected'] || 0,
      withdrawals: byStatus['Withdrawn'] || 0,
      staleCount,
      staleDays,
    },
    applications: apps,
    total,
    page,
    pages: Math.ceil(total / limit) || 0,
    limit,
    recentActivity: recentDocs.map((doc) => ({
      id: String(doc._id),
      at: doc.createdAt,
      user: doc.user ? [doc.user.firstName, doc.user.lastName].filter(Boolean).join(' ') : null,
      leadName: doc.lead?.studentName || null,
      referenceId: doc.lead?.referenceId || null,
      metadata: Object.fromEntries(
        Object.entries(doc.metadata || {}).map(([k, v]) => [k, v])
      ),
    })),
  };
};

module.exports = {
  listForLead,
  create,
  getById,
  getTimeline,
  overview,
  updateStatus,
  submit,
  withdraw,
};
