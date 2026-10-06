const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const LeadSource = require('../models/LeadSource');
const Country = require('../models/Country');
const University = require('../models/University');
const User = require('../models/User');
const Role = require('../models/Role');
const Interaction = require('../models/Interaction');
const Callback = require('../models/Callback');
const Notification = require('../models/Notification');
const { nextReferenceId } = require('../utils/referenceId');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { syncReferralStatus } = require('../services/referral.service');
const { activeLeadsFilter } = require('../services/leadDrop.service');
const lifecycle = require('../services/lifecycle.service');
const reportExport = require('../services/reportExport.service');
const { logEvent } = require('../services/systemLog.service');

// Actor display name for the audit trail — prefers a person's name over the
// email so supervisor reports read naturally ("Kiran Rao" not an address).
const auditActor = (req) => {
  const named = [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ').trim();
  return named || req.user?.email || req.user?.username || '';
};

const auditRole = (req) => String(req.role?.name || '').toUpperCase();

// Attach the inline lifecycle view (stage / waiting-on / next action …)
// to any lean lead document — no extra queries, list-endpoint safe.
const withLifecycle = (lead) => ({ ...lead, lifecycle: lifecycle.inlineLifecycle(lead) });

// Tag access mirrors each role's existing workspace visibility — it grants
// nothing the role could not already see:
//   • Supervisor / Admin  → any lead
//   • Agent               → leads they own or are actively fetching
//   • Counselor           → workflow-stage students (the same set the
//                           Counselor portal's "My Students" returns) or
//                           leads explicitly assigned to them
const COUNSELOR_TAG_STATUSES = ['completed', 'documents-pending', 'offer-received', 'visa-process'];

const canManageLead = (lead, req) => {
  const role = String(req.role.name).toUpperCase();
  const me = String(req.user._id);
  if (role === 'SUPERVISOR' || role === 'ADMIN') return true;
  if (role === 'AGENT') {
    return Boolean(
      (lead.assignedTo && String(lead.assignedTo) === me) ||
      (lead.fetchedBy && String(lead.fetchedBy) === me)
    );
  }
  if (role === 'COUNSELOR') {
    return (
      COUNSELOR_TAG_STATUSES.includes(String(lead.status || '')) ||
      Boolean(
        (lead.assignedTo && String(lead.assignedTo) === me) ||
        (lead.counselorAssigned && String(lead.counselorAssigned) === me)
      )
    );
  }
  return false;
};


const TEXT_FIELDS = [
  'studentName',
  'intake',
  'highestEducation',
  'gender',
  'collegeName',
  'passingYear',
  'workExperience',
  'gpa',
  'referenceName',
  'referenceMobile',
  'middleName',
  'dateOfBirth',
  'maritalStatus',
  'countryOfEducation',
  'workQualifications',
];

// Editable reference fields (stored as ObjectId, nullable).
const REF_FIELDS = ['countryPreferred', 'source'];

const toObjectId = (id) =>
  id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;

// Rebuild ordered preference slots (max 3) from [{ order, country|university }].
const buildOrderedRefs = (items, field) =>
  (Array.isArray(items) ? items : [])
    .filter((it) => it && it[field] && mongoose.isValidObjectId(it[field]))
    .slice(0, 3)
    .map((it, i) => ({ order: i + 1, [field]: new mongoose.Types.ObjectId(it[field]) }));

const updateProfile = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const isSupervisor = String(req.role.name).toUpperCase() === 'SUPERVISOR';
  const isAssigned = lead.assignedTo && String(lead.assignedTo) === String(req.user._id);
  if (!isSupervisor && !isAssigned) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  const body = req.body ?? {};
  const updates = {};
  const now = new Date();

  for (const key of TEXT_FIELDS) {
    if (body[key] !== undefined) updates[key] = String(body[key] ?? '').trim();
  }

  if (updates.studentName !== undefined && !updates.studentName) {
    throw new ApiError(400, 'Student name is required');
  }

  // Contact details (Lead Management form sends `phone`, API sends `mobile`).
  if (body.mobile !== undefined || body.phone !== undefined) {
    updates.mobile = String(body.mobile || body.phone || '').trim();
    if (!updates.mobile) throw new ApiError(400, 'Phone number is required');
  }
  if (body.email !== undefined) {
    updates.email = String(body.email ?? '').trim().toLowerCase() || undefined;
  }

  for (const key of REF_FIELDS) {
    if (body[key] !== undefined) updates[key] = toObjectId(body[key]);
  }

  if (body.preferredCountries !== undefined) {
    updates.preferredCountries = buildOrderedRefs(body.preferredCountries, 'country');
  }
  if (body.preferredUniversities !== undefined) {
    updates.preferredUniversities = buildOrderedRefs(body.preferredUniversities, 'university');
  }

  // Country / university by NAME (Lead Management edit form sends display
  // names, not ObjectIds).
  if (body.countryInterested !== undefined) {
    const name = String(body.countryInterested || '').trim();
    const country = name ? await Country.findOne({ name }).select('_id') : null;
    updates.countryPreferred = country?._id ?? null;
    updates.preferredCountries = country ? [{ order: 1, country: country._id }] : [];
  }
  if (body.preferredUniversity !== undefined) {
    const name = String(body.preferredUniversity || '').trim();
    const university = name ? await University.findOne({ institutionName: name }).select('_id') : null;
    updates.preferredUniversities = university ? [{ order: 1, university: university._id }] : [];
  }

  // Lead source by name (created on demand, mirrors createLead).
  if (body.leadSource !== undefined) {
    const name = String(body.leadSource || '').trim();
    updates.source = name
      ? await LeadSource.findOneAndUpdate(
          { name },
          { $setOnInsert: { name, description: `Enquiries captured via ${name}` } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      : null;
  }

  // Marketing agency — free text stored verbatim (mirrors createLead).
  if (body.marketingAgency !== undefined) {
    updates.marketingAgency = String(body.marketingAgency || '').trim() || null;
  }

  // Stage change — client display vocabulary → backend lifecycle status.
  if (body.status !== undefined) {
    const display = String(body.status || '').trim();
    const raw = STATUS_REVERSE[display];
    if (!raw) throw new ApiError(400, `Unknown status: ${display}`);
    updates.status = raw;
    if (raw === 'completed' || raw === 'submitted' || raw === 'lost') {
      updates.submittedAt = lead.submittedAt || now;
    }
  }

  // Assigned agent by name ('' or null clears the assignment; an
  // unresolvable name leaves the current assignment untouched).
  // Uses isAgentOnly to prevent Supervisors from being set as assignedTo.
  if (body.assignedAgent !== undefined) {
    const name = String(body.assignedAgent || '').trim();
    if (!name) {
      updates.assignedTo = null;
      updates.assignedBy = req.user?._id;
      updates.assignedAt = now;
    } else {
      const agentRoleId = await getAgentRoleId();
      const matched = await User.findOne(agentMatch(name, { isAgentOnly: true, agentRoleId })).select('_id');
      if (matched) {
        updates.assignedTo = matched._id;
        updates.assignedBy = req.user?._id;
        updates.assignedAt = now;
      }
    }
  }

  // Display priority (Low / Medium / High / Urgent) → interestLevel.
  if (body.priority !== undefined) {
    const priority = String(body.priority || '').trim();
    updates.interestLevel = DISPLAY_PRIORITIES.has(priority) ? priority : null;
  }

  // ── Embedded subdoc updates (counselor fields) ──────────────────
  const SUBDOC_FIELDS = ['mailingAddress', 'permanentAddress', 'passport', 'background', 'visaDetails'];
  for (const field of SUBDOC_FIELDS) {
    if (body[field] !== undefined && typeof body[field] === 'object' && body[field] !== null) {
      const clean = {};
      for (const [k, v] of Object.entries(body[field])) {
        clean[k] = String(v ?? '').trim();
      }
      updates[field] = clean;
    }
  }

  // sameAsMailing checkbox
  if (body.sameAsMailing !== undefined) {
    updates.sameAsMailing = !!body.sameAsMailing;
    if (updates.sameAsMailing && updates.mailingAddress) {
      updates.permanentAddress = { ...updates.mailingAddress };
    }
  }

  // Array fields
  if (body.emergencyContacts !== undefined) {
    updates.emergencyContacts = Array.isArray(body.emergencyContacts) ? body.emergencyContacts.map((c) => ({
      name: String(c.name ?? '').trim(),
      phone: String(c.phone ?? '').trim(),
      relation: String(c.relation ?? '').trim(),
      email: String(c.email ?? '').trim(),
    })) : [];
  }

  if (body.educationHistory !== undefined) {
    updates.educationHistory = Array.isArray(body.educationHistory) ? body.educationHistory.map((e) => ({
      country: String(e.country ?? '').trim(),
      organisation: String(e.organisation ?? '').trim(),
      address: String(e.address ?? '').trim(),
      position: String(e.position ?? '').trim(),
      jobProfile: String(e.jobProfile ?? '').trim(),
      modeOfSalary: String(e.modeOfSalary ?? '').trim(),
      workingFrom: String(e.workingFrom ?? '').trim(),
      workingUpto: String(e.workingUpto ?? '').trim(),
    })) : [];
  }

  if (body.testScores !== undefined && typeof body.testScores === 'object' && body.testScores !== null) {
    const scores = {};
    for (const [k, v] of Object.entries(body.testScores)) {
      scores[k] = String(v ?? '').trim();
    }
    updates.testScores = scores;
  }

  if (body.applications !== undefined) {
    updates.applications = Array.isArray(body.applications) ? body.applications.map((a) => ({
      university: String(a.university ?? '').trim(),
      country: String(a.country ?? '').trim(),
      course: String(a.course ?? '').trim(),
      status: a.status || 'not-started',
      applicationDate: String(a.applicationDate ?? '').trim(),
      offerStatus: String(a.offerStatus ?? '').trim(),
      importantDates: String(a.importantDates ?? '').trim(),
      remarks: String(a.remarks ?? '').trim(),
    })) : [];
  }

  if (body.documents !== undefined) {
    updates.documents = Array.isArray(body.documents) ? body.documents.map((d) => ({
      type: String(d.type ?? '').trim(),
      name: String(d.name ?? '').trim(),
      status: d.status || 'pending',
      notes: String(d.notes ?? '').trim(),
    })) : [];
  }

  // Notes — appended to the lead's disposition audit trail.
  const op = {};
  if (Object.keys(updates).length) op.$set = updates;
  if (body.notes !== undefined && String(body.notes).trim()) {
    op.$push = {
      dispositionHistory: {
        dispositionName: 'Profile Updated',
        note: String(body.notes).trim(),
        changedBy: req.user?._id,
        changedAt: now,
      },
    };
  }

  if (Object.keys(op).length) {
    await Lead.updateOne({ _id: lead._id }, op);
  }

  // ── Lifecycle transitions from real business actions in this save ──
  const previousStage = lifecycle.deriveStage(lead);
  let lifecycleLead = null;

  // 1. Explicit stage change via the display-status vocabulary
  //    (supervisor action — deliberate, may move backwards e.g. to Lost).
  const STATUS_TO_STAGE = {
    lost: 'LOST',
    submitted: 'ENROLLED',
    completed: 'APPLICATION',
    'documents-pending': 'APPLICATION',
    'offer-received': 'OFFER_RECEIVED',
    'visa-process': 'VISA',
  };
  if (updates.status && STATUS_TO_STAGE[updates.status]) {
    const target = STATUS_TO_STAGE[updates.status];
    lifecycleLead = await lifecycle.applyTransition({
      leadId: lead._id,
      actorId: req.user?._id,
      toStage: target,
      source: 'status-change',
      subStatus: updates.status === 'documents-pending' ? 'Documents Pending' : undefined,
      note: `Stage set via status → ${updates.status}`,
      forwardOnly: false,
    }).catch(() => null);
  }

  // 2. Application records updated → furthest real application state.
  if (!lifecycleLead && Array.isArray(updates.applications)) {
    const target = lifecycle.stageFromApplications(updates.applications);
    if (target) {
      lifecycleLead = await lifecycle.applyTransition({
        leadId: lead._id,
        actorId: req.user?._id,
        toStage: target,
        source: 'application',
        forwardOnly: true,
      }).catch(() => null);
    }
  }

  // 3. Study preferences / university shortlist captured on the profile.
  if (
    !lifecycleLead &&
    lifecycle.rankOf(previousStage) === lifecycle.STAGE_ORDER.INTERESTED &&
    ((updates.preferredCountries?.length ?? 0) > 0 ||
      lead.preferredCountries?.length > 0)
  ) {
    lifecycleLead = await lifecycle.applyTransition({
      leadId: lead._id,
      actorId: req.user?._id,
      toStage: 'PREFERENCES',
      source: 'preferences',
      forwardOnly: true,
    }).catch(() => null);
  }
  if (
    !lifecycleLead &&
    [lifecycle.STAGE_ORDER.INTERESTED, lifecycle.STAGE_ORDER.PREFERENCES].includes(
      lifecycle.rankOf(previousStage)
    ) &&
    (updates.preferredUniversities?.length ?? 0) > 0
  ) {
    lifecycleLead = await lifecycle.applyTransition({
      leadId: lead._id,
      actorId: req.user?._id,
      toStage: 'UNIVERSITY_SHORTLIST',
      source: 'shortlist',
      forwardOnly: true,
    }).catch(() => null);
  }

  // 4. Fresh assignment of an untouched lead → ASSIGNED.
  if (!lifecycleLead && updates.assignedTo && previousStage === 'NEW_LEAD') {
    lifecycleLead = await lifecycle.applyTransition({
      leadId: lead._id,
      actorId: req.user?._id,
      toStage: 'ASSIGNED',
      source: 'assignment',
      forwardOnly: true,
    }).catch(() => null);
  }

  const updated = await Lead.findById(lead._id)
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source', 'name')
    .populate('assignedTo', 'firstName lastName email')
    .populate('currentDisposition', 'name label color')
    .lean();

  // Sync referral status when the lead's lifecycle stage changes
  if (updates.status) syncReferralStatus(lead._id, req.user).catch(() => {});

  // Audit trail — lead details edited/saved. Only field NAMES are recorded,
  // never the values (so contact data stays out of the logs).
  const changedFields = Object.keys(updates).filter((k) => !['applications', 'documents', 'educationHistory', 'emergencyContacts', 'testScores'].includes(k));
  logEvent({
    module: 'crud',
    action: 'LEAD_UPDATED',
    username: auditActor(req),
    userId: String(req.user?._id || ''),
    role: auditRole(req),
    leadId: String(lead._id),
    leadName: String(lead.studentName || '').trim(),
    message: `Lead details updated (${Object.keys(updates).length} field${Object.keys(updates).length === 1 ? '' : 's'})`,
    apiPath: '/api/leads/:id',
    statusCode: 200,
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
    metadata: { changedFields: changedFields.length ? changedFields : undefined, hasNote: Boolean(body.notes && String(body.notes).trim()) },
  });

  return success(res, { lead: withLifecycle(lifecycleLead || updated) }, 'Lead updated successfully');
});

const stripPhone = (phone) => String(phone || '').replace(/[^\d]/g, '');

// 10-digit core (India): strips a leading 91 country code or leading 0.
const normalizePhone = (phone) => {
  const digits = stripPhone(phone);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
};

// Candidate formats to match against stored mobile numbers.
const phoneVariants = (phone) => {
  const digits = stripPhone(phone);
  if (!digits) return [];
  const variants = new Set([String(phone).trim(), digits, `+${digits}`]);
  const core = normalizePhone(phone);
  if (core.length === 10) {
    variants.add(core);
    variants.add(`+91${core}`);
    variants.add(`+91 ${core.slice(0, 5)} ${core.slice(5)}`);
  }
  return [...variants].filter(Boolean);
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const parseWhatsappPayload = (body) => {
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const contact = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
  if (!message && !contact) return null;

  const text = message?.text?.body ?? message?.body ?? '';
  const emailMatch = String(text).match(EMAIL_RE);

  return {
    studentName: (contact?.profile?.name ?? '').trim(),
    phone:       message?.from ?? contact?.wa_id ?? '',
    email:       emailMatch ? emailMatch[0].toLowerCase() : '',
    notes:       String(text).trim(),
  };
};

const createWhatsappLead = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const meta = parseWhatsappPayload(body);

  const studentName = String((meta?.studentName || body.studentName) || '').trim();
  const mobile      = String((meta?.phone || body.phone || body.mobile) || '').trim();

  if (!studentName) throw new ApiError(400, 'Student name is required');
  if (!mobile)      throw new ApiError(400, 'Phone number is required');

  // ── Deduplicate by phone — WEBHOOKS ONLY (Meta re-delivers; idempotent).
  //    Direct form submissions (lead.html) always create a fresh lead.
  if (meta) {
    const variants = phoneVariants(mobile);
    const existing = variants.length ? await Lead.findOne({ mobile: { $in: variants } }) : null;
    if (existing) {
      return success(res, { lead: existing, created: false }, 'Lead already exists for this number');
    }
  }

  // ── WhatsApp lead source (created on demand) ────────────────
  const source = await LeadSource.findOneAndUpdate(
    { name: 'WhatsApp' },
    {
      $setOnInsert: {
        name: 'WhatsApp',
        description: 'Enquiries captured via WhatsApp (Meta Cloud API)',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // ── Resolve optional country / university refs by name ─────
  const countryName   = String(body.countryInterested || body.countryPreferred || '').trim();
  const universityName = String(body.preferredUniversity || '').trim();
  const [country, university] = await Promise.all([
    countryName   ? Country.findOne({ name: countryName })   : null,
    universityName ? University.findOne({ institutionName: universityName }) : null,
  ]);

  const referenceId = await nextReferenceId();

  // ── Initial note (form notes / raw WhatsApp message) ───────
  const noteText = String(meta?.notes || body.notes || '').trim();

  const lead = await Lead.create({
    referenceId,
    studentName,
    mobile,
    email:           String(body.email || meta?.email || '').trim().toLowerCase() || undefined,
    gender:          String(body.gender || '').trim() || undefined,
    intake:          String(body.intake || '').trim() || undefined,
    highestEducation: String(body.highestEducation || '').trim() || undefined,
    collegeName:     String(body.collegeName || '').trim() || undefined,
    passingYear:     String(body.passingYear || '').trim() || undefined,
    workExperience:  String(body.workExperience || '').trim() || undefined,
    gpa:             String(body.gpa || '').trim() || undefined,
    countryPreferred: country?._id,
    source:          source._id,
    preferredCountries:     country    ? [{ order: 1, country: country._id }] : [],
    preferredUniversities:  university ? [{ order: 1, university: university._id }] : [],
    dispositionHistory: noteText
      ? [{ dispositionName: 'WhatsApp Enquiry', note: noteText, changedAt: new Date() }]
      : [],
    status: 'new',
  });

  return success(res, { lead, created: true }, 'WhatsApp lead created successfully', 201);
});

// Public helper for lead.html — tells the form whether a mobile number and/or
// email has already submitted an enquiry (so the UI can warn before a
// duplicate). Backwards compatible: phone-only lookups still work.
const checkMobileExists = asyncHandler(async (req, res) => {
  const mobile = String(req.query.phone || '').trim();
  const email  = String(req.query.email || '').trim().toLowerCase();
  if (!mobile && !email) throw new ApiError(400, 'Phone number or email is required');

  const variants = phoneVariants(mobile);
  const [phoneHit, emailHit] = await Promise.all([
    variants.length ? Lead.exists({ mobile: { $in: variants } }) : false,
    email ? Lead.exists({ email }) : false,
  ]);

  const existing = await findDuplicateLead({ mobile, email });
  const matchedBy = [phoneHit && 'phone', emailHit && 'email'].filter(Boolean);

  return success(res, {
    exists: !!existing,
    referenceId: existing?.referenceId || null,
    matchedBy,
  }, 'Checked successfully');
});

/* ==========================================================================
   GET /api/leads  —  list leads for the Lead Management table + dashboard
   --------------------------------------------------------------------------
   Returns the full roster (newest first) mapped to the client shape:
   populated source name/description, preferred country and university names,
   assigned agent name, createdAt as the table date, plus derived analytics
   fields consumed by the dashboard:

     • status       — display status (title-case) in the client's stage
                      vocabulary (New → Contacted → Qualified →
                      Application Started → Enrolled), derived from the raw
                      backend lifecycle status.
     • priority     — Urgent / Medium / Low, derived from the latest
                      interaction's dispositionPriority (P1/P2/P3), else the
                      lead's interestLevel, else Low.
     • nextFollowUp — earliest future Interaction.callbackDateTime, else the
                      most recent one, else the earliest pending Callback.
     • lastCallOutcome — disposition name of the latest interaction.
     • timeline     — derived feed (lead created + interactions + pending
                      callbacks), newest first.

   Refs are resolved manually (not via .populate()) so that a single legacy
   row holding a plain-string ref (e.g. countryPreferred: "Canada") can never
   throw a CastError and 400 the whole roster.
   ========================================================================== */

// Backend lifecycle → client display stage (keeps the client stage maps
// unchanged: STATUS_TONE / QUICK_MATCH / TASA_DONE / pipeline segments).
const STATUS_DISPLAY = {
  new: 'New',
  assigned: 'Contacted',
  fetched: 'Contacted',
  'in-progress': 'Qualified',
  callback: 'Qualified',
  'follow-up': 'Qualified',
  completed: 'Application Started',
  submitted: 'Enrolled',
  'documents-pending': 'Documents Pending',
  'offer-received': 'Offer Received',
  'visa-process': 'Visa Process',
  lost: 'Lost',
};

// Client display stage → backend lifecycle status (reverse of STATUS_DISPLAY).
const STATUS_REVERSE = {
  'New': 'new',
  'Contacted': 'assigned',
  'Qualified': 'in-progress',
  'Application Started': 'completed',
  'Documents Pending': 'documents-pending',
  'Offer Received': 'offer-received',
  'Visa Process': 'visa-process',
  'Enrolled': 'submitted',
  'Lost': 'lost',
};

const PRIORITY_FROM_P = { P1: 'Urgent', P2: 'Medium', P3: 'Low' };
const DISPLAY_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Urgent']);

// Shared helper: given a leads array, fetch interactions/callbacks/refs and
// map them to the client shape used by Lead Management. Used by both the
// paginated and backward-compatible (all) code paths.
const mapLeads = async (leads) => {
  const strId = (v) => (v && mongoose.isValidObjectId(v) ? String(v) : null);
  const leadIds = leads.map((l) => l._id);

  const [interactions, callbacks] = await Promise.all([
    Interaction.find({ lead: { $in: leadIds } }).sort({ calledAt: -1 }).lean(),
    Callback.find({ lead: { $in: leadIds } }).sort({ scheduledAt: 1 }).lean(),
  ]);

  const ids = { country: new Set(), source: new Set(), agent: new Set(), university: new Set() };
  const push = (set, v) => { const id = strId(v); if (id) set.add(id); };
  for (const l of leads) {
    push(ids.country, l.countryPreferred);
    push(ids.source, l.source);
    push(ids.agent, l.assignedTo);
    push(ids.agent, l.counselorAssigned);
    for (const pc of l.preferredCountries || []) push(ids.country, pc?.country);
    for (const pu of l.preferredUniversities || []) push(ids.university, pu?.university);
  }
  for (const it of interactions) push(ids.agent, it.agent);

  const [countries, sources, agents, universities] = await Promise.all([
    Country.find({ _id: { $in: [...ids.country] } }).lean(),
    LeadSource.find({ _id: { $in: [...ids.source] } }).lean(),
    User.find({ _id: { $in: [...ids.agent] } }).lean(),
    University.find({ _id: { $in: [...ids.university] } }).lean(),
  ]);
  const byId = (arr) => Object.fromEntries(arr.map((x) => [String(x._id), x]));
  const [countryById, sourceById, agentById, universityById] = [
    byId(countries), byId(sources), byId(agents), byId(universities),
  ];

  const interactionsByLead = new Map();
  for (const it of interactions) {
    const key = String(it.lead);
    const list = interactionsByLead.get(key) || [];
    list.push(it);
    interactionsByLead.set(key, list);
  }
  const callbacksByLead = new Map();
  for (const cb of callbacks) {
    const key = String(cb.lead);
    const list = callbacksByLead.get(key) || [];
    list.push(cb);
    callbacksByLead.set(key, list);
  }

  return leads.map((l) => {
    const its = interactionsByLead.get(String(l._id)) || [];
    const latest = its[0];
    const cbs = callbacksByLead.get(String(l._id)) || [];
    const pendingCbs = cbs.filter((c) => c.status === 'pending');

    const priority =
      PRIORITY_FROM_P[latest?.dispositionPriority] ||
      PRIORITY_FROM_P[latest?.interestLevel] ||
      PRIORITY_FROM_P[l.interestLevel] ||
      (DISPLAY_PRIORITIES.has(l.interestLevel) ? l.interestLevel : 'Low');

    const now = Date.now();
    const callbackDates = its
      .map((i) => (i.callbackDateTime ? new Date(i.callbackDateTime).getTime() : null))
      .filter(Boolean);
    const nextDue = callbackDates.filter((t) => t > now).sort((a, b) => a - b)[0]
      || callbackDates.sort((a, b) => b - a)[0]
      || (pendingCbs.map((c) => new Date(c.scheduledAt).getTime()).sort((a, b) => a - b)[0])
      || null;

    const timeline = [
      { id: `created-${l._id}`, tone: 'primary', icon: 'bi-person-plus', title: 'Lead created', detail: 'Enquiry received', time: l.createdAt },
      ...its.map((it) => ({
        id: `it-${it._id}`,
        tone: it.dispositionType === 'priority' ? 'danger' : 'info',
        icon: it.dispositionType === 'priority' ? 'bi-star' : 'bi-telephone-outbound',
        title: it.dispositionName || 'Call logged',
        detail: [userName(agentById[strId(it.agent)]), it.remarks].filter(Boolean).join(' — '),
        time: it.calledAt,
      })),
      ...pendingCbs.map((cb) => ({
        id: `cb-${cb._id}`,
        tone: 'warning',
        icon: 'bi-calendar2-check',
        title: 'Callback scheduled',
        detail: cb.note || 'Follow-up scheduled',
        time: cb.scheduledAt,
      })),
    ].sort((a, b) => new Date(b.time) - new Date(a.time));

    return {
      id:                String(l._id),
      referenceId:       l.referenceId,
      studentName:       l.studentName,
      phone:             l.mobile,
      email:             l.email,
      gender:            l.gender,
      highestEducation:  l.highestEducation,
      collegeName:       l.collegeName,
      passingYear:       l.passingYear,
      workExperience:    l.workExperience,
      gpa:               l.gpa,
      referenceName:     l.referenceName,
      referenceMobile:   l.referenceMobile,
      countryInterested: countryById[strId(l.countryPreferred)]?.name
        || (l.countryPreferred && mongoose.isValidObjectId(l.countryPreferred) ? 'Unknown country' : null),
      preferredCountries: (l.preferredCountries || [])
        .map((c) => countryById[strId(c?.country)]?.name)
        .filter(Boolean),
      preferredUniversity: (l.preferredUniversities || [])
        .map((u) => universityById[strId(u?.university)]?.institutionName)
        .find(Boolean),
      intake:            l.intake,
      leadSource:        sourceById[strId(l.source)]?.name,
      sourceDetail:      sourceById[strId(l.source)]?.description,
      assignedAgent:     userName(agentById[strId(l.assignedTo)]),
      counselorName:     userName(agentById[strId(l.counselorAssigned)]),
      status:            STATUS_DISPLAY[l.status] || l.status,
      rawStatus:         l.status,
      lifecycleStage:    l.lifecycleStage || null,
      lifecycle:         lifecycle.inlineLifecycle(l, { suggestedDue: nextDue ? new Date(nextDue).toISOString() : null }),
      dropStatus:        l.dropStatus || 'active',
      priority,
      createdDate:       l.createdAt,
      lastFollowUp:      l.lastCallAt,
      nextFollowUp:      nextDue ? new Date(nextDue).toISOString() : null,
      lastCallOutcome:   latest?.dispositionName || null,
      timeline:          timeline.slice(0, 12),
      documents:         [],
      counsellingNotes:  [],
    };
  });
};

// Compute the set of lead IDs that match the dashboard "Callbacks Today"
// definition: status='callback' AND nextFollowUp falls on today.
// Mirrors the exact logic in supervisor.controller.js getDashboardSummary.
const getTodayCallbackLeadIds = async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const callbackLeads = await Lead.find({ status: 'callback' }).lean();
  const callbackLeadIds = callbackLeads.map((l) => l._id);
  if (!callbackLeadIds.length) return [];

  const [interactions, pendingCallbacks] = await Promise.all([
    Interaction.find({ lead: { $in: callbackLeadIds }, callbackDateTime: { $ne: null } })
      .sort({ calledAt: -1 })
      .lean(),
    Callback.find({ lead: { $in: callbackLeadIds }, status: 'pending' })
      .sort({ scheduledAt: 1 })
      .lean(),
  ]);

  const itsByLead = new Map();
  for (const it of interactions) {
    const key = String(it.lead);
    if (!itsByLead.has(key)) itsByLead.set(key, []);
    itsByLead.get(key).push(it);
  }
  const cbsByLead = new Map();
  for (const cb of pendingCallbacks) {
    const key = String(cb.lead);
    if (!cbsByLead.has(key)) cbsByLead.set(key, []);
    cbsByLead.get(key).push(cb);
  }

  const todayIds = [];
  for (const lead of callbackLeads) {
    const key = String(lead._id);
    const its = itsByLead.get(key) || [];
    const cbs = cbsByLead.get(key) || [];

    const callbackDates = its
      .map((i) => (i.callbackDateTime ? new Date(i.callbackDateTime).getTime() : null))
      .filter(Boolean);
    const nowMs = Date.now();
    const nextDue = callbackDates.filter((t) => t > nowMs).sort((a, b) => a - b)[0]
      || callbackDates.sort((a, b) => b - a)[0]
      || (cbs.map((c) => new Date(c.scheduledAt).getTime()).sort((a, b) => a - b)[0])
      || null;

    if (nextDue) {
      const d = new Date(nextDue);
      if (d >= todayStart && d <= todayEnd) todayIds.push(lead._id);
    }
  }
  return todayIds;
};

const getLeads = asyncHandler(async (req, res) => {
  const { page, limit: rawLimit, search, sort: sortField, sortDir, stage, rawStatus, priority, specialFilter, assignedTo, counselorAssigned } = req.query;

  // Kick the idempotent lifecycle backfill once per server boot so legacy
  // rows become filterable/reportable without a manual migration.
  lifecycle.ensureStagesBackfilled();

  // Restrict to a specific owner's leads. `assignedTo` targets calling agents
  // (leads owned by that agent), `counselorAssigned` targets counselors. Only
  // valid ObjectIds are honoured so malformed query strings are simply ignored.
  const filterByOwner = (filter) => {
    if (assignedTo && mongoose.isValidObjectId(String(assignedTo))) {
      filter.assignedTo = String(assignedTo);
    }
    if (counselorAssigned && mongoose.isValidObjectId(String(counselorAssigned))) {
      filter.counselorAssigned = String(counselorAssigned);
    }
    return filter;
  };

  // Backward compatible: when no page param is supplied, return the full list
  // (preserves existing behaviour for SupervisorDashboard, ReferralManagement, etc.).
  if (!page) {
    const filter = filterByOwner({});
    if (rawStatus) {
      // "Callbacks Today" uses a date-based filter matching the dashboard
      // summary definition — not just status='callback'.
      if (rawStatus === 'callback') {
        const todayIds = await getTodayCallbackLeadIds();
        if (!todayIds.length) {
          return success(res, { leads: [] }, 'Leads fetched successfully');
        }
        filter._id = { $in: todayIds };
      } else {
        filter.status = String(rawStatus);
      }
    }
    if (stage && lifecycle.LIFECYCLE_ALL_STAGES.includes(String(stage))) {
      filter.lifecycleStage = String(stage);
    }
    // Canonical stalled definition — mirrors task.service.js exactly:
    // assigned, non-terminal, no contact in 14+ days.
    if (specialFilter === 'stalled') {
      const STALLED_DAYS = 14;
      const stalledCutoff = new Date(Date.now() - STALLED_DAYS * 86400000);
      const TERMINAL = ['submitted', 'lost', 'callback-completed'];
      Object.assign(filter, {
        status: { $nin: TERMINAL },
        assignedTo: { $exists: true, $ne: null },
        ...activeLeadsFilter(),
        $expr: {
          $lte: [
            { $ifNull: ['$lastCallAt', { $ifNull: ['$assignedAt', '$createdAt'] }] },
            stalledCutoff,
          ],
        },
      });
    }
    // Canonical unassigned definition — mirrors task.service.js's dashboard
    // "Unassigned Leads" count exactly (new + no owner + not dropped).
    if (specialFilter === 'unassigned') {
      Object.assign(filter, {
        status: 'new',
        $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
        ...activeLeadsFilter(),
      });
    }
    const leads = await Lead.find(filter).sort({ createdAt: -1 }).lean();
    const mapped = await mapLeads(leads);
    return success(res, { leads: mapped }, 'Leads fetched successfully');
  }

  // ── Paginated mode ────────────────────────────────────────────────
  const pageNum  = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 100);
  const skip     = (pageNum - 1) * limitNum;

  const filter = filterByOwner({});
  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    filter.$or = [
      { studentName: re },
      { email: re },
      { mobile: re },
      { referenceId: re },
    ];
  }
  if (stage && lifecycle.LIFECYCLE_ALL_STAGES.includes(String(stage))) {
    filter.lifecycleStage = String(stage);
  }
  if (rawStatus) {
    // "Callbacks Today" uses a date-based filter matching the dashboard
    // summary definition — not just status='callback'.
    if (rawStatus === 'callback') {
      const todayIds = await getTodayCallbackLeadIds();
      if (!todayIds.length) {
        return success(res, {
          leads: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
        }, 'Leads fetched successfully');
      }
      filter._id = { $in: todayIds };
    } else {
      filter.status = String(rawStatus);
    }
  }

  // Canonical stalled definition — mirrors task.service.js exactly:
  // assigned, non-terminal, no contact in 14+ days.
  if (specialFilter === 'stalled') {
    const STALLED_DAYS = 14;
    const stalledCutoff = new Date(Date.now() - STALLED_DAYS * 86400000);
    const TERMINAL = ['submitted', 'lost', 'callback-completed'];
    Object.assign(filter, {
      status: { $nin: TERMINAL },
      assignedTo: { $exists: true, $ne: null },
      ...activeLeadsFilter(),
      $expr: {
        $lte: [
          { $ifNull: ['$lastCallAt', { $ifNull: ['$assignedAt', '$createdAt'] }] },
          stalledCutoff,
        ],
      },
    });
  }

  // Canonical unassigned definition — mirrors task.service.js's dashboard
  // "Unassigned Leads" count exactly (new + no owner + not dropped). Combines
  // with an existing search $or (rather than overwriting it) via $and, so
  // "search while filtered to unassigned" still works.
  if (specialFilter === 'unassigned') {
    const ownerOr = [{ assignedTo: null }, { assignedTo: { $exists: false } }];
    if (filter.$or) {
      filter.$and = [...(filter.$and || []), { $or: filter.$or }, { $or: ownerOr }];
      delete filter.$or;
    } else {
      filter.$or = ownerOr;
    }
    Object.assign(filter, { status: 'new', ...activeLeadsFilter() });
  }

  // Priority filter requires a lookup on interactions to compute effective
  // priority (latest dispositionPriority / interestLevel → lead interestLevel).
  // Reuses the same derivation logic as the supervisor dashboard summary.
  if (priority) {
    const pVal = String(priority).trim();
    if (pVal && pVal !== 'all') {
      // Build a pipeline that computes effectivePriority per lead, then
      // filter and paginate in one pass.
      const PRIORITY_MAP = { P1: 'Urgent', P2: 'Medium', P3: 'Low' };
      const displayPriority = PRIORITY_MAP[pVal] || pVal; // 'P1' → 'Urgent', 'Urgent' stays

      const pipeline = [
        { $match: { ...filter, status: { $ne: 'lost' } } },
        {
          $lookup: {
            from: 'interactions',
            let: { leadId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$lead', '$$leadId'] } } },
              { $sort: { calledAt: -1 } },
              { $limit: 1 },
              { $project: { dispositionPriority: 1, interestLevel: 1 } },
            ],
            as: 'latestInteraction',
          },
        },
        { $addFields: { latestInter: { $arrayElemAt: ['$latestInteraction', 0] } } },
        {
          $addFields: {
            effectivePriority: {
              $let: {
                vars: {
                  fromInterDisp: '$latestInter.dispositionPriority',
                  fromInterInterest: '$latestInter.interestLevel',
                  fromLead: '$interestLevel',
                },
                in: {
                  $switch: {
                    branches: [
                      { case: { $in: ['$$fromInterDisp', ['P1']] }, then: 'Urgent' },
                      { case: { $in: ['$$fromInterDisp', ['P2']] }, then: 'Medium' },
                      { case: { $in: ['$$fromInterDisp', ['P3']] }, then: 'Low' },
                      { case: { $in: ['$$fromInterInterest', ['P1']] }, then: 'Urgent' },
                      { case: { $in: ['$$fromInterInterest', ['P2']] }, then: 'Medium' },
                      { case: { $in: ['$$fromInterInterest', ['P3']] }, then: 'Low' },
                      { case: { $in: ['$$fromLead', ['Low', 'Medium', 'High', 'Urgent']] }, then: '$$fromLead' },
                    ],
                    default: 'Low',
                  },
                },
              },
            },
          },
        },
        { $match: { effectivePriority: displayPriority } },
        { $sort: { createdAt: -1 } },
        { $facet: {
          count: [{ $count: 'total' }],
          page: [
            { $skip: skip },
            { $limit: limitNum },
            { $project: { latestInteraction: 0, latestInter: 0, effectivePriority: 0 } },
          ],
        }},
      ];

      const [result] = await Lead.aggregate(pipeline);
      const total = result?.count?.[0]?.total || 0;
      const leads = result?.page || [];
      const mapped = await mapLeads(leads);

      return success(res, {
        leads: mapped,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      }, 'Leads fetched successfully');
    }
  }

  // ── Standard path (no priority aggregation needed) ──────────────────
  const sort = {};
  const sField = sortField || 'createdAt';
  sort[sField] = sortDir === 'asc' ? 1 : -1;

  const total = await Lead.countDocuments(filter);
  const leads = await Lead.find(filter).sort(sort).skip(skip).limit(limitNum).lean();
  const mapped = await mapLeads(leads);

  return success(res, {
    leads: mapped,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  }, 'Leads fetched successfully');
});

const userName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : null);

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Cached Agent role ID — fetched once per server start, reused across
// all assignment lookups to prevent Supervisors from being set as assignedTo.
let _agentRoleId = null;
let _agentRoleIdFetched = false;
const getAgentRoleId = async () => {
  if (_agentRoleIdFetched) return _agentRoleId;
  _agentRoleIdFetched = true;
  const agentRole = await Role.findOne({ code: 'agent' }).select('_id').lean();
  _agentRoleId = agentRole?._id || null;
  return _agentRoleId;
};

// Role ObjectIds a supervisor may mention (Agent + Counselor + Supervisor).
// Cached after first fetch so repeated mention resolution stays cheap.
let _mentionableRoleIdsFetched = false;
let _mentionableRoleIds = null;
const getMentionableRoleIds = async () => {
  if (_mentionableRoleIdsFetched) return _mentionableRoleIds || [];
  _mentionableRoleIdsFetched = true;
  const roles = await Role.find({ code: { $in: MENTIONABLE_ROLE_CODES }, isActive: true })
    .select('_id')
    .lean();
  _mentionableRoleIds = (roles || []).map((r) => r._id);
  return _mentionableRoleIds;
};

// Match a User by first/last name, full name, or email (case-insensitive).
// When isAgentOnly=true (default), restricts to users whose role has the
// 'lead:fetch' permission — i.e. Agents only. Supervisors and Admins are
// excluded from lead assignment to enforce single-owner-per-stage.
// agentRoleId: pre-fetched Agent role ObjectId (cached caller-side).
const agentMatch = (name, { isAgentOnly = true, agentRoleId = null } = {}) => {
  const nameMatch = {
    $or: [
      { firstName: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
      { lastName:  new RegExp(`^${escapeRegExp(name)}$`, 'i') },
      { $expr: { $eq: [{ $toLower: { $concat: ['$firstName', ' ', '$lastName'] } }, name.toLowerCase()] } },
      { email:     String(name).toLowerCase() },
    ],
  };
  if (!isAgentOnly || !agentRoleId) return nameMatch;
  return { ...nameMatch, role: agentRoleId };
};

// Map a single (populated) lead to the exact client shape used by the Lead
// Management table (GET /api/leads) so a freshly created lead renders inline.
const mapSingleLead = (l) => {
  const pc = l.preferredCountries || [];
  const pu = l.preferredUniversities || [];
  const firstNote = l.dispositionHistory?.[0];
  return {
    id:                String(l._id),
    referenceId:       l.referenceId,
    studentName:       l.studentName,
    phone:             l.mobile,
    email:             l.email || '',
    gender:            l.gender || '',
    highestEducation:  l.highestEducation || '',
    collegeName:       l.collegeName || '—',
    passingYear:       l.passingYear || '—',
    workExperience:    l.workExperience || 'Fresher',
    gpa:               l.gpa || '—',
    referenceName:     l.referenceName || '',
    referenceMobile:   l.referenceMobile || '',
    countryInterested: l.countryPreferred?.name,
    preferredCountries: pc.map((c) => c.country?.name).filter(Boolean),
    preferredUniversity: pu.map((u) => u.university?.institutionName).find(Boolean),
    intake:            l.intake || '',
    leadSource:        l.source?.name,
    sourceDetail:      l.source?.description,
    assignedAgent:     userName(l.assignedTo),
    status:            STATUS_DISPLAY[l.status] || l.status,
    rawStatus:         l.status,
    lifecycleStage:    l.lifecycleStage || 'NEW_LEAD',
    lifecycle:         lifecycle.inlineLifecycle(l),
    priority:          DISPLAY_PRIORITIES.has(l.interestLevel) ? l.interestLevel : 'Low',
    createdDate:       l.createdAt,
    lastFollowUp:      l.lastCallAt || null,
    nextFollowUp:      null,
    lastCallOutcome:   null,
    timeline:          [{
      id: `created-${l._id}`,
      tone: 'primary',
      icon: 'bi-person-plus',
      title: 'Lead created',
      detail: 'Enquiry received',
      time: l.createdAt,
    }],
    documents:         [],
    counsellingNotes:  firstNote?.note
      ? [{ id: `n-${l._id}`, at: firstNote.changedAt, agent: userName(l.assignedTo) || 'Unassigned', text: firstNote.note }]
      : [],
  };
};

/* ==========================================================================
   POST /api/leads  —  create a lead from the Lead Management "New Lead" form
   --------------------------------------------------------------------------
   Protected. Accepts the Lead Management form payload:

     { studentName, phone, email, gender, intake, leadSource,
       assignedAgent, priority, highestEducation, marketingAgency,
       collegeName, passingYear, workExperience, gpa, notes }

   Resolves source / country / university by name (creating the source on
   demand), assigns the agent by name when a matching user exists, and returns
   the new lead mapped to the same client shape as GET /api/leads so the table
   can render it immediately.
   ========================================================================== */
const createLead = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  const studentName = String(body.studentName || '').trim();
  const mobile      = String(body.phone || body.mobile || '').trim();

  if (!studentName) throw new ApiError(400, 'Student name is required');
  if (!mobile)      throw new ApiError(400, 'Phone number is required');

  // ── Lead source (resolve by name, create on demand) ─────────────
  const sourceName = String(body.leadSource || '').trim();
  const source = sourceName
    ? await LeadSource.findOneAndUpdate(
        { name: sourceName },
        { $setOnInsert: { name: sourceName, description: `Enquiries captured via ${sourceName}` } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    : null;

  // ── Optional country / university refs by name ──────────────────
  const countryName    = String(body.countryInterested || body.countryPreferred || '').trim();
  const universityName = String(body.preferredUniversity || '').trim();
  const [country, university] = await Promise.all([
    countryName    ? Country.findOne({ name: countryName })           : null,
    universityName ? University.findOne({ institutionName: universityName })     : null,
  ]);

  // ── Assign agent by name when a matching user exists ─────────────
  // Uses isAgentOnly to prevent Supervisors from being set as assignedTo.
  const agentName = String(body.assignedAgent || '').trim();
  const agentRoleId = await getAgentRoleId();
  const agent = agentName
    ? await User.findOne(agentMatch(agentName, { isAgentOnly: true, agentRoleId })).select('firstName lastName email')
    : null;

  const referenceId = await nextReferenceId();
  const noteText = String(body.notes || '').trim();
  const priority = String(body.priority || '').trim();

  const lead = await Lead.create({
    referenceId,
    studentName,
    mobile,
    email:           String(body.email || '').trim().toLowerCase() || undefined,
    gender:          String(body.gender || '').trim() || undefined,
    intake:          String(body.intake || '').trim() || undefined,
    highestEducation: String(body.highestEducation || '').trim() || undefined,
    marketingAgency: String(body.marketingAgency || '').trim() || undefined,
    collegeName:     String(body.collegeName || '').trim() || undefined,
    passingYear:     String(body.passingYear || '').trim() || undefined,
    workExperience:  String(body.workExperience || '').trim() || undefined,
    gpa:             String(body.gpa || '').trim() || undefined,
    interestLevel:   DISPLAY_PRIORITIES.has(priority) ? priority : undefined,
    countryPreferred: country?._id,
    source:          source?._id,
    preferredCountries:    country    ? [{ order: 1, country: country._id }] : [],
    preferredUniversities: university ? [{ order: 1, university: university._id }] : [],
    dispositionHistory: noteText
      ? [{ dispositionName: 'New Enquiry', note: noteText, changedAt: new Date() }]
      : [],
    status: 'new',
    assignedTo:  agent?._id,
    assignedBy:  agent ? req.user?._id : undefined,
    assignedAt:  agent ? new Date() : undefined,
    createdBy:   req.user?._id,
  });

  const mapped = await Lead.findById(lead._id)
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source', 'name description')
    .populate('assignedTo', 'firstName lastName')
    .lean();

  return success(res, { lead: mapSingleLead(mapped) }, 'Lead created successfully', 201);
});

/* ==========================================================================
   LEAD BULK IMPORT — POST /api/leads/import (multipart/form-data)
   --------------------------------------------------------------------------
   Supervisor import flow. The same endpoint serves two passes:

     mode = 'validate'  → parse + validate only. Returns a preview with
                          per-row status (valid / duplicate / invalid /
                          update) and never mutates the database.
     mode = 'import'    → parse + validate, then insert new leads with
                          insertMany() and optionally update existing ones.

   Duplicate handling (field `duplicateMode`):
     skip   (default) → rows whose mobile already exists are skipped.
     update           → existing rows are updated with the provided fields.
     allow            → duplicates are imported as fresh leads.

   Parsing is done with ExcelJS (.xlsx + .csv). Legacy binary .xls is
   rejected with an actionable message because ExcelJS cannot read it.
   ========================================================================== */

const ExcelJS = require('exceljs');
const { Readable } = require('stream');

// Normalized column key (lowercase, alphanumeric only) so headers like
// "Student Name", "student_name" or "STUDENTNAME" all map to one field.
const colKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Field → accepted header aliases (first alias is the display label).
const COLUMN_ALIASES = {
  studentName:        ['Student Name', 'name', 'fullname', 'full name', 'student'],
  mobile:             ['Mobile', 'phone', 'mobile number', 'phone number', 'mobile no', 'contact'],
  email:              ['Email', 'email address', 'mail'],
  gender:             ['Gender'],
  countryInterested:  ['Country Interested', 'country', 'preferred country', 'destination'],
  preferredUniversity:['Preferred University', 'university', 'institution'],
  intake:             ['Intake', 'session', 'term', 'semester'],
  leadSource:         ['Lead Source', 'source', 'source of lead', 'origin'],
  assignedAgent:      ['Assigned Agent', 'agent', 'assigned to', 'owner', 'counsellor'],
  priority:           ['Priority', 'lead priority'],
  highestEducation:   ['Highest Education', 'highest qualification', 'education', 'education level'],
  collegeName:        ['College Name', 'college', 'institute'],
  passingYear:        ['Passing Year', 'year of passing', 'graduation year'],
  workExperience:     ['Work Experience', 'experience'],
  gpa:                ['GPA', 'cgpa', 'grade', 'marks'],
  notes:              ['Notes', 'remarks', 'comments', 'additional notes'],
};

const FIELD_BY_KEY = new Map();
for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const alias of aliases) FIELD_BY_KEY.set(colKey(alias), field);
}
const FIELD_LABEL = Object.fromEntries(
  Object.entries(COLUMN_ALIASES).map(([field, aliases]) => [field, aliases[0]])
);

const REQUIRED_IMPORT_FIELDS = ['studentName', 'mobile'];

const IMPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMPORT_GENDERS = new Set(['Male', 'Female', 'Other']);
const IMPORT_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Urgent']);

const titleCase = (s) =>
  String(s).replace(/\b\w/g, (c) => c.toUpperCase());

// Legacy .xls magic bytes (OLE2 compound document). ExcelJS cannot read
// these, so we detect them up front and give the user a clear message.
const isLegacyXls = (buffer) =>
  buffer.length > 8 &&
  buffer[0] === 0xd0 && buffer[1] === 0xcf &&
  buffer[2] === 0x11 && buffer[3] === 0xe0 &&
  buffer[4] === 0xa1 && buffer[5] === 0xb1 &&
  buffer[6] === 0x1a && buffer[7] === 0xe1;

// Parse the uploaded buffer into { headers, records } where each record is
// { row: <sheet row number>, m: <normalized field → value map> }.
const parseWorkbook = async (buffer, filename) => {
  const ext = String(filename || '').split('.').pop()?.toLowerCase();

  if (isLegacyXls(buffer)) {
    throw new ApiError(
      400,
      'Legacy .xls files are not supported — please open the file in Excel and re-save it as .xlsx or .csv.'
    );
  }

  const workbook = new ExcelJS.Workbook();
  if (ext === 'csv') {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    try {
      await workbook.xlsx.load(buffer);
    } catch (err) {
      throw new ApiError(400, 'Could not read the Excel file — is it a valid .xlsx file?');
    }
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, 'The file does not contain any data.');

  const values = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    values.push({ row: rowNumber, vals: row.values });
  });

  if (!values.length) throw new ApiError(400, 'The file is empty.');

  // Map header cells → fields.
  const headerRow = values[0];
  const colToField = new Map();
  (headerRow.vals || []).slice(1).forEach((cell, idx) => {
    const field = FIELD_BY_KEY.get(colKey(cell));
    if (field) colToField.set(idx + 1, field);
  });

  const missing = REQUIRED_IMPORT_FIELDS.filter(
    (f) => ![...colToField.values()].includes(f)
  );
  if (missing.length) {
    throw new ApiError(
      400,
      `Missing required column(s): ${missing.map((f) => FIELD_LABEL[f]).join(', ')}.`
    );
  }

  const records = values.slice(1).map(({ row, vals }) => {
    const m = {};
    for (const [col, field] of colToField) {
      const raw = vals ? vals[col] : undefined;
      m[field] = raw == null || raw === '' ? '' : String(raw).trim();
    }
    return { row, m };
  });

  if (!records.length) {
    throw new ApiError(400, 'The file has a header row but no data rows to import.');
  }

  const headers = [...colToField.values()].map((field) => ({
    field,
    label: FIELD_LABEL[field],
  }));

  return { headers, records };
};

// Normalize field values for storage (keeps raw values so validation can
// still flag anything it could not coerce).
const normalizeRecord = (m) => {
  const out = { ...m };
  out.studentName = String(out.studentName || '').trim();
  out.mobile = String(out.mobile || '').trim();
  out.email = String(out.email || '').trim().toLowerCase() || '';
  out.gender = String(out.gender || '').trim();
  if (out.gender) {
    const g = titleCase(out.gender);
    out.gender = IMPORT_GENDERS.has(g) ? g : out.gender;
  }
  out.priority = String(out.priority || '').trim();
  if (out.priority) {
    const p = titleCase(out.priority);
    out.priority = IMPORT_PRIORITIES.has(p) ? p : out.priority;
  }
  return out;
};

const validateRecord = (m) => {
  const errors = [];
  if (!m.studentName) errors.push(`${FIELD_LABEL.studentName} is required`);
  if (!m.mobile) errors.push(`${FIELD_LABEL.mobile} is required`);
  else if (stripPhone(m.mobile).length < 7) errors.push(`${FIELD_LABEL.mobile} is invalid`);
  if (m.email && !IMPORT_EMAIL_RE.test(m.email)) errors.push('Email is invalid');
  if (m.gender && !IMPORT_GENDERS.has(m.gender)) errors.push('Gender must be Male, Female or Other');
  if (m.priority && !IMPORT_PRIORITIES.has(m.priority)) errors.push('Priority must be Low, Medium, High or Urgent');
  return errors;
};

// Index every stored lead mobile (by full digits and last-10 digits) so
// rows can be matched regardless of how the phone was originally formatted.
const buildExistingMobileIndex = async () => {
  const leads = await Lead.find({}, { mobile: 1 }).lean();
  const byDigits = new Map();
  for (const lead of leads) {
    const digits = stripPhone(lead.mobile);
    if (!digits) continue;
    if (!byDigits.has(digits)) byDigits.set(digits, lead);
    if (digits.length >= 10) {
      const tail = digits.slice(-10);
      if (!byDigits.has(tail)) byDigits.set(tail, lead);
    }
  }
  return byDigits;
};

const matchExistingMobile = (byDigits, mobile) => {
  const digits = stripPhone(mobile);
  if (!digits) return null;
  if (byDigits.has(digits)) return byDigits.get(digits);
  if (digits.length >= 10) return byDigits.get(digits.slice(-10)) || null;
  return null;
};

// Classify each record: valid / duplicate / invalid / update.
const classifyRecords = async (records, duplicateMode) => {
  const [byDigits, normalized] = await Promise.all([
    buildExistingMobileIndex(),
    Promise.all(records.map(async (rec) => normalizeRecord(rec.m))),
  ]);

  const seen = new Map();
  const out = [];

  records.forEach((rec, idx) => {
    const m = normalized[idx];
    const errors = validateRecord(m);
    const digits = stripPhone(m.mobile);

    let status = 'valid';
    let errorList = errors;
    let existing = null;

    if (errors.length) {
      status = 'invalid';
    } else if (digits && seen.has(digits)) {
      status = 'duplicate';
      errorList = ['Duplicate mobile number within the file'];
    } else {
      if (digits) seen.set(digits, rec.row);
      existing = matchExistingMobile(byDigits, m.mobile);
      if (existing) {
        if (duplicateMode === 'update') status = 'update';
        else if (duplicateMode === 'allow') status = 'valid';
        else {
          status = 'duplicate';
          errorList = ['Lead already exists for this mobile number'];
        }
      }
    }

    out.push({ row: rec.row, m, status, errors: errorList, existing });
  });

  return out;
};

// Resolve country / university / source / agent references by name for the
// rows that will actually be written. Sources are created on demand.
const resolveImportRefs = async (classed) => {
  const wanted = classed.filter((r) => r.status === 'valid' || r.status === 'update');
  const unique = (field) => [...new Set(wanted.map((r) => r.m[field]).filter(Boolean))];

  const countryNames = unique('countryInterested');
  const universityNames = unique('preferredUniversity');
  const sourceNames = unique('leadSource');

  const [countries, universities, users, agentRoleId] = await Promise.all([
    countryNames.length ? Country.find({ name: { $in: countryNames } }).lean() : [],
    universityNames.length ? University.find({ institutionName: { $in: universityNames } }).lean() : [],
    User.find({}, 'firstName lastName email role').populate('role', 'code').lean(),
    getAgentRoleId(),
  ]);

  const countryByName = new Map(countries.map((c) => [c.name, c]));
  const universityByName = new Map(universities.map((u) => [u.institutionName, u]));

  const sourceByName = {};
  for (const name of sourceNames) {
    sourceByName[name] = await LeadSource.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, description: `Enquiries captured via ${name}` } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const findAgent = (name) => {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return (
      users.find((u) => {
        // Only match users with Agent role (lead:fetch permission).
        if (agentRoleId && String(u.role?._id) !== String(agentRoleId)) return false;
        return [u.firstName, u.lastName, [u.firstName, u.lastName].filter(Boolean).join(' '), u.email]
          .map((x) => String(x || '').toLowerCase())
          .includes(n);
      }) || null
    );
  };

  return wanted.map((rec) => ({
    country:    countryByName.get(rec.m.countryInterested) || null,
    university: universityByName.get(rec.m.preferredUniversity) || null,
    source:     sourceByName[rec.m.leadSource] || null,
    agent:      findAgent(rec.m.assignedAgent),
  }));
};

// In-memory error-report store, keyed by job id. Reports live for the
// server session (re-downloadable), and the map is capped at 50 entries
// with the oldest evicted first.
const errorReports = new Map();
const makeJobId = () => `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const storeErrorReport = (rows) => {
  if (errorReports.size > 50) {
    const oldest = errorReports.keys().next().value;
    errorReports.delete(oldest);
  }
  const jobId = makeJobId();
  errorReports.set(jobId, { rows, createdAt: new Date() });
  return jobId;
};

const importLeads = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded');

  const mode = req.body?.mode === 'import' ? 'import' : 'validate';
  const duplicateMode = ['update', 'allow'].includes(req.body?.duplicateMode)
    ? req.body.duplicateMode
    : 'skip';

  const { headers, records } = await parseWorkbook(req.file.buffer, req.file.originalname);
  const classed = await classifyRecords(records, duplicateMode);

  // ── VALIDATE PASS ────────────────────────────────────────────────
  if (mode === 'validate') {
    const rows = classed.map(({ row, m, status, errors }) => ({
      row,
      status,
      errors,
      values: m,
    }));

    return success(res, {
      filename: req.file.originalname,
      duplicateMode,
      headers,
      totalRows: rows.length,
      validRows: rows.filter((r) => r.status === 'valid').length,
      duplicateRows: rows.filter((r) => r.status === 'duplicate').length,
      updateRows: rows.filter((r) => r.status === 'update').length,
      invalidRows: rows.filter((r) => r.status === 'invalid').length,
      rows,
    }, 'File validated successfully');
  }

  // ── IMPORT PASS ──────────────────────────────────────────────────
  const now = new Date();
  const refs = await resolveImportRefs(classed);
  const refByRow = new Map(
    classed.filter((r) => r.status === 'valid' || r.status === 'update').map((rec, idx) => [rec.row, refs[idx]])
  );
  const failed = [];

  // New leads (insertMany).
  const newDocs = [];
  const newWanted = classed.filter((rec) => rec.status === 'valid');
  for (const rec of newWanted) {
    const m = rec.m;
    const ref = refByRow.get(rec.row);
    const referenceId = await nextReferenceId();
    newDocs.push({
      referenceId,
      studentName: m.studentName,
      mobile: m.mobile,
      email: m.email || undefined,
      gender: m.gender || undefined,
      intake: m.intake || undefined,
      highestEducation: m.highestEducation || undefined,
      collegeName: m.collegeName || undefined,
      passingYear: m.passingYear || undefined,
      workExperience: m.workExperience || undefined,
      gpa: m.gpa || undefined,
      interestLevel: m.priority || undefined,
      countryPreferred: ref.country?._id,
      source: ref.source?._id,
      preferredCountries: ref.country ? [{ order: 1, country: ref.country._id }] : [],
      preferredUniversities: ref.university ? [{ order: 1, university: ref.university._id }] : [],
      assignedTo: ref.agent?._id,
      assignedBy: ref.agent ? req.user?._id : undefined,
      assignedAt: ref.agent ? now : undefined,
      status: 'new',
      createdBy: req.user?._id,
      dispositionHistory: [{
        dispositionName: 'Imported',
        note: m.notes || 'Bulk imported',
        changedBy: req.user?._id,
        changedAt: now,
      }],
    });
  }

  let imported = 0;
  if (newDocs.length) {
    try {
      imported = (await Lead.insertMany(newDocs, { ordered: false })).length;
    } catch (err) {
      // Bulk insert failed (e.g. a race on a unique key) — retry one-by-one
      // so each row is attributed precisely.
      for (const doc of newDocs) {
        try {
          await Lead.create(doc);
          imported += 1;
        } catch (e) {
          failed.push({
            row: newWanted[newDocs.indexOf(doc)].row,
            studentName: doc.studentName,
            mobile: doc.mobile,
            error: e.message,
          });
        }
      }
    }
  }

  // Existing leads (update mode) via bulkWrite.
  let updated = 0;
  const updateWanted = classed.filter((rec) => rec.status === 'update');
  const updateOps = updateWanted.map((rec) => {
    const m = rec.m;
    const ref = refByRow.get(rec.row);
    const $set = {};
    if (m.studentName) $set.studentName = m.studentName;
    if (m.mobile) $set.mobile = m.mobile;
    if (m.email) $set.email = m.email;
    if (m.gender) $set.gender = m.gender;
    if (m.countryInterested) {
      $set.countryPreferred = ref.country?._id ?? null;
      $set.preferredCountries = ref.country ? [{ order: 1, country: ref.country._id }] : [];
    }
    if (m.preferredUniversity) {
      $set.preferredUniversities = ref.university ? [{ order: 1, university: ref.university._id }] : [];
    }
    if (m.intake) $set.intake = m.intake;
    if (m.leadSource) $set.source = ref.source?._id ?? null;
    if (m.assignedAgent && ref.agent) {
      $set.assignedTo = ref.agent._id;
      $set.assignedBy = req.user?._id;
      $set.assignedAt = now;
    }
    if (m.priority) $set.interestLevel = m.priority;
    if (m.highestEducation) $set.highestEducation = m.highestEducation;
    if (m.collegeName) $set.collegeName = m.collegeName;
    if (m.passingYear) $set.passingYear = m.passingYear;
    if (m.workExperience) $set.workExperience = m.workExperience;
    if (m.gpa) $set.gpa = m.gpa;
    return {
      updateOne: {
        filter: { _id: rec.existing._id },
        update: {
          $set,
          $push: {
            dispositionHistory: {
              dispositionName: 'Import Updated',
              note: m.notes || 'Updated via bulk import',
              changedBy: req.user?._id,
              changedAt: now,
            },
          },
        },
      },
    };
  });

  if (updateOps.length) {
    try {
      const result = await Lead.bulkWrite(updateOps, { ordered: false });
      updated = result.modifiedCount || result.matchedCount || 0;
    } catch (err) {
      for (let i = 0; i < updateOps.length; i += 1) {
        try {
          const r = await Lead.updateOne(updateOps[i].updateOne.filter, updateOps[i].updateOne.update);
          if (r.modifiedCount) updated += 1;
        } catch (e) {
          failed.push({
            row: updateWanted[i].row,
            studentName: updateWanted[i].m.studentName,
            mobile: updateWanted[i].m.mobile,
            error: e.message,
          });
        }
      }
    }
  }

  const skipped = classed.filter((r) => r.status !== 'valid' && r.status !== 'update').length;

  const jobId = failed.length ? storeErrorReport(failed) : null;

  return success(res, {
    filename: req.file.originalname,
    duplicateMode,
    totalRows: records.length,
    imported,
    updated,
    skipped,
    failed: failed.length,
    jobId,
    details: failed,
  }, 'Import completed');
});

/* ==========================================================================
   SAMPLE TEMPLATE — GET /api/leads/import/template
   Returns a downloadable .xlsx template with the expected columns and an
   example row, plus an Instructions sheet.
   ========================================================================== */
const downloadImportTemplate = asyncHandler(async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TASA CRM';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Leads');
  ws.columns = Object.entries(COLUMN_ALIASES).map(([field, aliases]) => ({
    header: aliases[0],
    key: field,
    width: Math.max(16, aliases[0].length + 4),
  }));

  ws.addRow({
    studentName: 'Priya Verma',
    mobile: '+91 98765 43210',
    email: 'priya.verma@example.com',
    gender: 'Female',
    countryInterested: 'Canada',
    preferredUniversity: 'University of Toronto',
    intake: 'Fall 2026',
    leadSource: 'Website',
    assignedAgent: 'Meera Nair',
    priority: 'High',
    highestEducation: "Bachelor's Degree",
    collegeName: "St. Xavier's College",
    passingYear: '2024',
    workExperience: '1 year',
    gpa: '8.2',
    notes: 'Interested in Masters in Data Science',
  });

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEF0FD' },
  };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const notes = workbook.addWorksheet('Instructions');
  notes.columns = [{ header: 'Instructions', key: 'text', width: 120 }];
  notes.addRows([
    { text: '1. Fill in one row per lead. Only Student Name and Mobile are required.' },
    { text: '2. Supported formats: .xlsx, .xls and .csv. Legacy binary .xls must be re-saved as .xlsx.' },
    { text: '3. Keep the header row as-is — column names are matched loosely (case and spacing are ignored).' },
    { text: '4. Duplicate handling is chosen in the Import Leads dialog (skip / update / allow).' },
    { text: '5. Country, Preferred University, Lead Source and Assigned Agent are matched by name; unmatched values are left empty.' },
    { text: '6. Gender is optional — if provided it must be Male, Female or Other. Priority must be Low, Medium, High or Urgent.' },
    { text: '7. Mobile numbers are matched by digits only, so +91 98765 43210 and 9876543210 are treated as the same number.' },
  ]);
  notes.getColumn(1).width = 140;

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="lead-import-template.xlsx"');
  return res.send(Buffer.from(buffer));
});

/* ==========================================================================
   ERROR REPORT — GET /api/leads/import/errors/:jobId
   Downloads the failed rows from an import as an .xlsx report.
   ========================================================================== */
const downloadErrorReport = asyncHandler(async (req, res) => {
  const job = errorReports.get(req.params.jobId);
  if (!job) throw new ApiError(404, 'Error report not found or expired');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TASA CRM';
  const ws = workbook.addWorksheet('Import Errors');
  ws.columns = [
    { header: 'Row #', key: 'row', width: 8 },
    { header: 'Student Name', key: 'studentName', width: 30 },
    { header: 'Mobile', key: 'mobile', width: 22 },
    { header: 'Error', key: 'error', width: 70 },
  ];
  for (const r of job.rows) ws.addRow(r);
  ws.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="import-error-report-${req.params.jobId}.xlsx"`);
  return res.send(Buffer.from(buffer));
});

/* ==========================================================================
   COUNSELOR ENDPOINTS — lifecycle stage updates + counselor notes
   ========================================================================== */

const COUNSELOR_STATUS_FIELDS = ['registrationStatus', 'documentStatus', 'applicationStatus', 'visaStatus'];

const updateCounselorStatus = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const upperRole = String(req.role.name).toUpperCase();
  const isSupervisor = upperRole === 'SUPERVISOR';
  const isCounselor  = upperRole === 'COUNSELOR';
  const isAssigned   = lead.assignedTo && String(lead.assignedTo) === String(req.user._id);
  if (!isSupervisor && !(isCounselor && isAssigned)) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  const body = req.body ?? {};
  const updates = {};
  for (const field of COUNSELOR_STATUS_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field] || null;
  }
  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, 'No valid counselor status fields provided');
  }

  await Lead.updateOne({ _id: lead._id }, { $set: updates });

  // ── Lifecycle transition from real counselor actions ─────────────
  // Documents gathered, applications submitted, fees received and visa
  // filings are genuine milestones. Automatic moves are forward-only and
  // never resurrect a deliberately-closed student (Lost / Not Interested /
  // Rejected) — that requires an explicit supervisor decision.
  const previousStage = lifecycle.deriveStage(lead);
  const nextValues = {
    registrationStatus: updates.registrationStatus ?? lead.registrationStatus,
    documentStatus:     updates.documentStatus ?? lead.documentStatus,
    applicationStatus:  updates.applicationStatus ?? lead.applicationStatus,
    visaStatus:         updates.visaStatus ?? lead.visaStatus,
    feeStatus:          updates.feeStatus ?? lead.feeStatus,
  };
  let lifecycleLead = null;
  const manualOnlyStages = ['NOT_INTERESTED', 'LOST', 'REJECTED'];
  if (!manualOnlyStages.includes(previousStage)) {
    const target = lifecycle.stageFromCounselorFields(nextValues);
    if (target) {
      lifecycleLead = await lifecycle.applyTransition({
        leadId: lead._id,
        actorId: req.user._id,
        toStage: target,
        source: 'counselor-status',
        subStatus:
          target === 'APPLICATION' && nextValues.documentStatus && nextValues.documentStatus !== 'pending'
            ? `Documents ${String(nextValues.documentStatus).charAt(0).toUpperCase()}${String(nextValues.documentStatus).slice(1)}`
            : undefined,
        forwardOnly: true,
      }).catch(() => null);
    }
  }

  const updated = await Lead.findById(lead._id)
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source', 'name')
    .populate('assignedTo', 'firstName lastName email')
    .populate('currentDisposition', 'name label color')
    .lean();

  // Sync referral status when counselor lifecycle fields change
  syncReferralStatus(lead._id, req.user).catch(() => {});

  return success(res, { lead: withLifecycle(lifecycleLead || updated) }, 'Counselor status updated');
});

const addCounselorNote = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const upperRole = String(req.role.name).toUpperCase();
  const isSupervisor = upperRole === 'SUPERVISOR';
  const isCounselor  = upperRole === 'COUNSELOR';
  const isAssigned   = lead.assignedTo && String(lead.assignedTo) === String(req.user._id);
  if (!isSupervisor && !(isCounselor && isAssigned)) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  const { text, category = 'general' } = req.body ?? {};
  if (!text || !String(text).trim()) throw new ApiError(400, 'Note text is required');

  const noteText = String(text).trim();

  const note = {
    text: noteText,
    category,
    createdBy: req.user._id,
    createdAt: new Date(),
  };

  await Lead.updateOne({ _id: lead._id }, { $push: { counselorNotes: note } });

  // ── Supervisor @mention → connected CRM alerts ──────────────────
  // When a supervisor mentions one or more users with @Name, resolve each
  // mention to a real, active CRM user (Agent / Counselor / Supervisor) and
  // create a persistent supervisor-mention notification addressed to that
  // user and linked to this lead. Arbitrary/invalid @names and notes without
  // a valid mention produce no alert. Regular remarks keep working exactly as
  // before. Recipients are resolved from the frontend-provided user ids first
  // (the picker preserves each user's real id), with name-based resolution as
  // a fallback — so the notification always targets the correct user id.
  if (isSupervisor) {
    const roleIds = await getMentionableRoleIds();
    const byName = await resolveMentionedUsersByName(noteText, roleIds);
    const byId = await resolveMentionedUsersById(req.body?.mentionedUserIds ?? req.body?.mentionedAgentIds, roleIds);
    const seen = new Set();
    const recipients = [];
    for (const a of [...byId, ...byName]) {
      if (!seen.has(String(a._id))) {
        seen.add(String(a._id));
        recipients.push(a);
      }
    }
    if (recipients.length) {
      const senderName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || 'Supervisor';
      const leadLabel = String(lead.studentName || '').trim() || 'Student';
      const leadRef = String(lead.referenceId || lead._id);
      const roleByName = new Map(
        (
          await Role.find({ _id: { $in: recipients.map((r) => r.role) } }).select('code').lean()
        ).map((r) => [String(r._id), r.code])
      );
      for (const recipient of recipients) {
        await createSupervisorMentionNotification({
          user: recipient,
          roleCode: roleByName.get(String(recipient.role)) || 'agent',
          senderId: req.user._id,
          senderName,
          leadId: lead._id,
          leadRef,
          leadLabel,
          message: noteText,
        });
      }
    }
  }

  // Audit trail — counselor remarks / call notes added to a lead. Only the
  // category and presence of a note are recorded, never the note text.
  logEvent({
    module: 'workflow',
    action: 'COUNSELOR_NOTE_ADDED',
    username: auditActor(req),
    userId: String(req.user?._id || ''),
    role: auditRole(req),
    leadId: String(lead._id),
    leadName: String(lead.studentName || '').trim(),
    message: 'Counselor note added to lead',
    apiPath: '/api/leads/:id/counselor-notes',
    statusCode: 201,
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
    metadata: { category: String(category || 'general') },
  });

  return success(res, { note }, 'Counselor note added', 201);
});

// @mention token → candidate user names. Matches "@FirstName LastName" (or a
// single name) without consuming trailing sentence text, so "@Diya Katti Please
// follow up" resolves to "Diya Katti", never the whole sentence.
const MENTION_RE = /@([A-Za-z][A-Za-z'.]*)(?:\s+([A-Za-z][A-Za-z'.]*))?/g;
const extractMentionCandidates = (text) => {
  const candidates = [];
  const re = new RegExp(MENTION_RE.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const first = m[1];
    const second = m[2];
    if (second) {
      candidates.push(`${first} ${second}`);
      if (first !== second) candidates.push(first);
    } else {
      candidates.push(first);
    }
  }
  return candidates;
};

// Roles a supervisor may mention. Unlike lead assignment (which must stay
// Agent-only to preserve single-owner-per-stage), mentions span the whole
// connected CRM: Agent + Counselor + Supervisor.
const MENTIONABLE_ROLE_CODES = ['agent', 'counselor', 'supervisor'];

// Resolve @mention recipient candidates to real, active CRM users across the
// Agent / Counselor / Supervisor roles. Mentions are addressed to any of
// these, not just Agents, so a Supervisor can flag a Counselor (or another
// Supervisor) for attention on a lead.
const resolveMentionedUsersByName = async (text, roleIds) => {
  const candidates = extractMentionCandidates(text);
  const seen = new Set();
  const users = [];
  for (const name of candidates) {
    const user = await User.findOne({
      ...agentMatch(name, { isAgentOnly: false }),
      role: { $in: roleIds },
    })
      .select('_id firstName lastName status')
      .lean();
    if (user && user.status === 'active' && !seen.has(String(user._id))) {
      seen.add(String(user._id));
      users.push(user);
    }
  }
  return users;
};

// Resolve frontend-provided user ids (the picker preserves each user's real
// id) to real, active CRM users. Unknown/inactive/non-mentionable ids are
// ignored. Accepts Agent / Counselor / Supervisor ids.
const resolveMentionedUsersById = async (ids, roleIds) => {
  if (!Array.isArray(ids) || !ids.length) return [];
  const validIds = ids
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id) => /^[0-9a-fA-F]{24}$/.test(id));
  if (!validIds.length) return [];
  return User.find({
    _id: { $in: validIds },
    role: { $in: roleIds },
    status: 'active',
  })
    .select('_id firstName lastName status')
    .lean();
};

// Persist a single supervisor-mention Notification for one mentioned user
// (Agent, Counselor, or Supervisor). The recipient is a real user id, so the
// mentioned user sees the alert in their Alerts and can navigate back to this
// lead.
const createSupervisorMentionNotification = async ({ user, roleCode, senderId, senderName, leadId, leadRef, leadLabel, message }) => {
  await Notification.create({
    user: user._id,
    type: 'supervisor-mention',
    title: `${senderName} mentioned you`,
    body: message,
    lead: leadId,
    sender: senderId,
    meta: new Map(Object.entries({
      senderName: String(senderName),
      leadRef: String(leadRef),
      leadStudent: String(leadLabel),
      ...(roleCode ? { userRole: String(roleCode).toUpperCase() } : {}),
    }).map(([k, v]) => [k, String(v)])),
  });
};

const getCounselorNotes = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id)
    .populate('counselorNotes.createdBy', 'firstName lastName email')
    .lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  return success(res, { notes: lead.counselorNotes || [] }, 'Counselor notes fetched');
});

/* ═══════════════════════════════════════════════════════════════════════
   SHARED LEAD TAGS — one tag set per lead, visible and editable across the
   Agent, Counselor and Supervisor workspaces. `tags` is the active set;
   `tagHistory` is an immutable audit trail (who + when + added/removed).
   There are no role-specific tag collections — the lead IS the source of
   truth, so every role always reads identical state.
   ═══════════════════════════════════════════════════════════════════════ */
const TAG_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];

const populateTagPeople = (query) =>
  query
    .populate('tags.createdBy', 'firstName lastName')
    .populate('tagHistory.performedBy', 'firstName lastName');

const getLeadTags = asyncHandler(async (req, res) => {
  const lead = await populateTagPeople(Lead.findById(req.params.id)).lean();
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!canManageLead(lead, req)) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }
  return success(res, { tags: lead.tags || [], history: lead.tagHistory || [] }, 'Tags fetched');
});

const addLeadTag = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!canManageLead(lead, req)) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  const label = String(req.body?.label ?? '').trim();
  const color = String(req.body?.color ?? TAG_COLORS[0]).trim();
  if (!label) throw new ApiError(400, 'Tag label is required');
  if (label.length > 40) throw new ApiError(400, 'Tag label must be 40 characters or fewer');

  const dup = (lead.tags || []).some((t) => String(t.label).toLowerCase() === label.toLowerCase());
  if (dup) throw new ApiError(409, 'This tag already exists on the lead');

  lead.tags.push({ label, color, createdBy: req.user._id });
  lead.tagHistory.push({ action: 'added', label, color, performedBy: req.user._id });
  await lead.save();

  const updated = await populateTagPeople(Lead.findById(lead._id)).lean();
  return success(res, { tags: updated.tags || [], history: updated.tagHistory || [] }, 'Tag added');
});

const removeLeadTag = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!canManageLead(lead, req)) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  const tagId = String(req.params.tagId);
  const tag = (lead.tags || []).find((t) => String(t._id) === tagId);
  if (!tag) throw new ApiError(404, 'Tag not found on this lead');

  lead.tags.pull(tagId);
  lead.tagHistory.push({ action: 'removed', label: tag.label, color: tag.color, performedBy: req.user._id });
  await lead.save();

  const updated = await populateTagPeople(Lead.findById(lead._id)).lean();
  return success(res, { tags: updated.tags || [], history: updated.tagHistory || [] }, 'Tag removed');
});

const getLeadById = asyncHandler(async (req, res) => {
  lifecycle.ensureStagesBackfilled();
  const lead = await Lead.findById(req.params.id)
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source', 'name')
    .populate('assignedTo', 'firstName lastName email')
    .populate('currentDisposition', 'name label color')
    .populate('dispositionHistory.changedBy', 'firstName lastName')
    .populate('tags.createdBy', 'firstName lastName')
    .populate('tagHistory.performedBy', 'firstName lastName')
    .lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  // Legacy lead without a stored stage — persist the derived one lazily
  // (idempotent; keeps filtering and reporting accurate over time).
  if (!lead.lifecycleStage) {
    const derived = lifecycle.deriveStage(lead);
    lead.lifecycleStage = derived;
    Lead.updateOne({ _id: lead._id }, { $set: { lifecycleStage: derived } })
      .catch(() => {});
  }

  // Audit trail — lead / student viewed or opened by a CRM user.
  logEvent({
    module: 'crud',
    action: 'LEAD_OPENED',
    username: auditActor(req),
    userId: String(req.user?._id || ''),
    role: auditRole(req),
    leadId: String(lead._id),
    leadName: String(lead.studentName || '').trim(),
    message: `Lead opened: ${String(lead.studentName || lead._id).slice(0, 80)}`,
    apiPath: '/api/leads/:id',
    statusCode: 200,
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
  });

  return success(res, { lead: withLifecycle(lead) }, 'Lead fetched');
});

/* ==========================================================================
   GET /api/leads/:id/lifecycle — current workflow state + event history
   --------------------------------------------------------------------------
   The lightweight read powering the workspace lifecycle strip timeline.
   State comes from the lead document itself (single source of truth);
   events come from real recorded Activity documents, newest first —
   nothing is fabricated. History is loaded separately from list
   endpoints so tables never wait on it.
   ========================================================================== */
const getLeadLifecycle = asyncHandler(async (req, res) => {
  lifecycle.ensureStagesBackfilled();

  const lead = await Lead.findById(req.params.id)
    .populate('assignedTo', 'firstName lastName email')
    .lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  if (!lead.lifecycleStage) {
    const derived = lifecycle.deriveStage(lead);
    lead.lifecycleStage = derived;
    Lead.updateOne({ _id: lead._id }, { $set: { lifecycleStage: derived } }).catch(() => {});
  }

  const [ownerName, events] = await Promise.all([
    lead.assignedTo
      ? Promise.resolve(
          [lead.assignedTo.firstName, lead.assignedTo.lastName].filter(Boolean).join(' ') || null
        )
      : Promise.resolve(null),
    lifecycle.getLeadEvents(lead._id),
  ]);

  const state = lifecycle.inlineLifecycle({ ...lead, ownerName });
  if (!state.nextAction && !lifecycle.isTerminalStage(state.stage)) {
    state.nextAction = null; // UI renders "No next action"
  }

  return success(res, { lifecycle: state, events }, 'Lead lifecycle fetched');
});

const updateLeadLifecycle = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id).lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  const upperRole = String(req.role.name).toUpperCase();
  const isSupervisor = upperRole === 'SUPERVISOR';
  const isCounselor = upperRole === 'COUNSELOR';
  const isAssigned = lead.assignedTo && String(lead.assignedTo) === String(req.user._id);
  if (!isSupervisor && !(isCounselor && isAssigned)) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  const body = req.body ?? {};

  let targetStage = lifecycle.deriveStage(lead); // default: update details only
  if (body.stage !== undefined) {
    const wanted = String(body.stage || '').trim().toUpperCase();
    if (!lifecycle.LIFECYCLE_ALL_STAGES.includes(wanted)) {
      throw new ApiError(400, `Unknown lifecycle stage: ${body.stage}`);
    }
    targetStage = wanted;
  }

  if (
    body.waitingOn !== undefined &&
    body.waitingOn !== null &&
    body.waitingOn !== '' &&
    !lifecycle.WAITING_ON_OPTIONS.includes(String(body.waitingOn))
  ) {
    throw new ApiError(400, `waitingOn must be one of: ${lifecycle.WAITING_ON_OPTIONS.join(', ')}`);
  }

  let nextActionDue;
  if (body.nextActionDue !== undefined) {
    nextActionDue = body.nextActionDue ? new Date(body.nextActionDue) : null;
    if (nextActionDue && Number.isNaN(nextActionDue.getTime())) {
      throw new ApiError(400, 'nextActionDue must be a valid date');
    }
  }

  const updated = await lifecycle.applyTransition({
    leadId: lead._id,
    actorId: req.user._id,
    toStage: targetStage,
    source: 'manual',
    subStatus: body.subStatus,
    waitingOn:
      body.waitingOn === undefined
        ? undefined
        : body.waitingOn === '' ? null : String(body.waitingOn),
    nextAction: body.nextAction !== undefined ? String(body.nextAction || '') : undefined,
    nextActionDue: body.nextActionDue !== undefined ? nextActionDue : undefined,
    forwardOnly: false, // deliberate human decision
    note: String(body.note || ''),
  });

  return success(res, { lead: withLifecycle(updated), lifecycle: lifecycle.inlineLifecycle(updated) }, 'Lifecycle updated');
});

// ── GET /api/leads/options ─────────────────────────────────────────
// Lightweight dropdown list for components that only need id + name.
// Used by ReferralManagement student picker — avoids fetching full
// leads with all subdocuments.
const getLeadOptions = asyncHandler(async (req, res) => {
  const leads = await Lead.find({}, { _id: 1, studentName: 1, referenceId: 1 })
    .sort({ studentName: 1 })
    .lean();
  return success(res, leads, 'Lead options fetched');
});

/* ==========================================================================
   POST /leads/export  — Export the current Lead Management selection as a
   single XLSX workbook with two sheets:
     1. "Lead Management" — the same lead data/columns the UI exports today.
     2. "Remarks" — one row per lead with the first two interaction remarks
        (text, author, date, time).
   The client sends the explicit set of lead ids it currently has filtered,
   so the workbook matches exactly what the user sees (filters respected).
   ========================================================================== */
const exportReports = asyncHandler(async (req, res) => {
  const leadIds = Array.isArray(req.body?.leadIds) ? req.body.leadIds.filter((id) => mongoose.isValidObjectId(id)) : [];

  if (!leadIds.length) {
    return success(res, { exported: false, rowCount: 0 }, 'No leads selected for export');
  }

  const leads = await Lead.find({ _id: { $in: leadIds } }).sort({ createdAt: -1 }).lean();
  const rows = await mapLeads(leads);

  const leadKey = new Set(leads.map((l) => String(l._id)));
  const interactions = await Interaction.find({ lead: { $in: [...leadKey] } })
    .sort({ calledAt: 1 })
    .lean();

  const agentIds = new Set();
  for (const it of interactions) agentIds.add(String(it.agent));
  const agents = await User.find({ _id: { $in: [...agentIds] } }).lean();
  const agentNameById = Object.fromEntries(
    agents.map((a) => [String(a._id), [a.firstName, a.lastName].filter(Boolean).join(' ')])
  );

  const statusByLead = Object.fromEntries(rows.map((r) => [r.id, r.status]));
  const interactionsByLead = new Map();
  for (const it of interactions) {
    const key = String(it.lead);
    const list = interactionsByLead.get(key) || [];
    list.push(it);
    interactionsByLead.set(key, list);
  }

  const remarkRows = leads.map((l) => {
    const its = (interactionsByLead.get(String(l._id)) || [])
      .filter((i) => i.remarks && String(i.remarks).trim());
    const pick = (i) => ({
      text: String(i.remarks || '').trim(),
      author: agentNameById[String(i.agent)] || '',
      date: new Date(i.calledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: new Date(i.calledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    });
    const r1 = its[0] ? pick(its[0]) : { text: '', author: '', date: '', time: '' };
    const r2 = its[1] ? pick(its[1]) : { text: '', author: '', date: '', time: '' };
    return {
      referenceId: l.referenceId || '',
      studentName: l.studentName || '',
      disposition: statusByLead[String(l._id)] || '',
      r1_text: r1.text,
      r1_author: r1.author,
      r1_date: r1.date,
      r1_time: r1.time,
      r2_text: r2.text,
      r2_author: r2.author,
      r2_date: r2.date,
      r2_time: r2.time,
    };
  });

  const wb = await reportExport.buildWorkbook({ rows, remarkRows });
  const buffer = await reportExport.writeBuffer(wb);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="tasa-export.xlsx"');
  return res.send(Buffer.from(buffer));
});

module.exports = {
  getLeads,
  getLeadById,
  getLeadLifecycle,
  updateLeadLifecycle,
  updateProfile,
  createLead,
  createWhatsappLead,
  checkMobileExists,
  importLeads,
  downloadImportTemplate,
  downloadErrorReport,
  updateCounselorStatus,
  addCounselorNote,
  getCounselorNotes,
  getLeadTags,
  addLeadTag,
  removeLeadTag,
  getLeadOptions,
  exportReports,
};