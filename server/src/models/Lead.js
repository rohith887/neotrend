const mongoose = require('mongoose');

const LEAD_STATUS = [
  'new',
  'assigned',
  'fetched',
  'in-progress',
  'callback',
  'callback-completed',
  'follow-up',
  'completed',
  'submitted',
  'documents-pending',
  'offer-received',
  'visa-process',
  'lost',
  'dropped',
];

// Counselor lifecycle sub-statuses (non-exclusive with LEAD_STATUS)
const REGISTRATION_STATUS = [
  'not-started',
  'registration-pending',
  'agreement-pending',
  'fee-pending',
  'fee-received',
  'submitted',
  'completed',
  'failed',
  'cancelled',
];
const REGISTRATION_AGREEMENT_STATUS = ['not-started', 'pending', 'signed'];
const REGISTRATION_FEE_STATUS = ['not-applicable', 'pending', 'received'];
const DOCUMENT_STATUS     = ['pending', 'gathering', 'submitted', 'verified'];
const APPLICATION_STATUS  = ['not-started', 'draft', 'submitted', 'under-review', 'offer-received', 'accepted', 'rejected'];
const VISA_STATUS         = ['not-started', 'gathering', 'filed', 'interview', 'received', 'denied'];
const MARITAL_STATUS      = ['Married', 'Unmarried', 'Other'];
const APPLICATION_APP_STATUS = ['not-started', 'draft', 'submitted', 'under-review', 'offer-received', 'accepted', 'rejected'];
const VISA_APP_STAGE      = ['not-started', 'gathering', 'filed', 'interview', 'received', 'denied'];
const COUNSELING_STATUS   = ['not-started', 'in-progress', 'completed'];

// Drop-lead workflow — a controlled status/workflow layer on the lead.
// A lead is NEVER deleted/unassigned; it is only marked via the 'Drop Lead'
// disposition (with a mandatory reason). Flow:
//   active → (disposition saved) → dropped → (revived) → active
// dropped leads stay assigned + visible in the agent/counselor bucket but
// are excluded from every active calling queue.
// dropHistory is the immutable audit trail of every DROPPED / REVIVED event
// (who, why, when) — never edited after append. Legacy REQUESTED / APPROVED /
// DENIED entries are kept so archived records remain readable.
const LEAD_DROP_STATUSES = ['active', 'drop-requested', 'dropped'];
const LEAD_DROP_ACTIONS  = ['REQUESTED', 'APPROVED', 'DENIED', 'REVIVED', 'DROPPED'];

/* ── Student lifecycle engine (Phase 2) ────────────────────────────
   ONE canonical journey stage per student, stored on the lead itself.
   Ordered stages advance only through real business actions; terminal
   states are non-linear exits. Existing disposition/status fields stay
   untouched — lifecycle is derived from and coexists with them.      */
const LIFECYCLE_STAGES = [
  'NEW_LEAD',
  'ASSIGNED',
  'CONTACTED',
  'COUNSELLING',
  'INTERESTED',
  'PREFERENCES',
  'UNIVERSITY_SHORTLIST',
  'APPLICATION',
  'SUBMITTED',
  'OFFER_RECEIVED',
  'DEPOSIT_PAYMENT',
  'VISA',
  'ENROLLED',
];
const LIFECYCLE_TERMINAL_STAGES = ['NOT_INTERESTED', 'LOST', 'ON_HOLD', 'DEFERRED', 'REJECTED'];
const LIFECYCLE_ALL_STAGES = [...LIFECYCLE_STAGES, ...LIFECYCLE_TERMINAL_STAGES];
const WAITING_ON_OPTIONS = [
  'Student', 'Counselor', 'University', 'Finance', 'Visa Team', 'Internal Team', 'Vendor',
];

const preferredCountrySchema = new mongoose.Schema(
  {
    order: { type: Number, min: 1, max: 3 },
    country: { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
  },
  { _id: false }
);

const preferredUniversitySchema = new mongoose.Schema(
  {
    order: { type: Number, min: 1, max: 3 },
    university: { type: mongoose.Schema.Types.ObjectId, ref: 'University' },
  },
  { _id: false }
);

const dispositionHistorySchema = new mongoose.Schema(
 {
    disposition: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Disposition'
    },

    dispositionName: {
        type: String,
        trim: true
    },

    note: {
        type: String,
        trim: true
    },

    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    changedAt: {
        type: Date,
        default: Date.now
    }
},
  { _id: false }
);

// Shared operational tag on a lead — one source of truth visible across
// Agent (disposition desk), Counselor (journey workspace) and Supervisor.
// A tag is an active label on the lead, independent of remarks/notes.
const leadTagSchema = new mongoose.Schema(
  {
    label:      { type: String, required: true, trim: true, maxlength: 40 },
    color:      { type: String, default: '#6366f1' },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt:  { type: Date, default: Date.now },
  },
  { _id: true }
);

// Immutable audit trail: every add/remove is appended and never modified or
// deleted, so the history always reflects reality even if a tag is re-added.
const leadTagHistorySchema = new mongoose.Schema(
  {
    action:       { type: String, enum: ['added', 'removed'], required: true },
    label:        { type: String, required: true, trim: true, maxlength: 40 },
    color:        { type: String, default: '#6366f1' },
    performedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedAt:  { type: Date, default: Date.now },
  },
  { _id: false }
);

// Drop-lead lifecycle event — appended on request / approve / deny / revive.
// Reason is required on every transition so the audit trail always explains
// WHY the status changed (repeated RNRs, unproductive callbacks, etc.).
const leadDropEventSchema = new mongoose.Schema(
  {
    action: { type: String, enum: LEAD_DROP_ACTIONS, required: true },
    by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, required: true },
    at:     { type: Date, default: Date.now },
  },
  { _id: true }
);

const addressSchema = new mongoose.Schema(
  {
    address1: { type: String, trim: true, default: '' },
    address2: { type: String, trim: true, default: '' },
    country:  { type: String, trim: true, default: '' },
    state:    { type: String, trim: true, default: '' },
    city:     { type: String, trim: true, default: '' },
    pincode:  { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const passportSchema = new mongoose.Schema(
  {
    passportNumber: { type: String, trim: true, default: '' },
    issueDate:      { type: String, trim: true, default: '' },
    expiryDate:     { type: String, trim: true, default: '' },
    issueCountry:   { type: String, trim: true, default: '' },
    cityOfBirth:    { type: String, trim: true, default: '' },
    countryOfBirth: { type: String, trim: true, default: '' },
    nationality:    { type: String, trim: true, default: '' },
    citizenship:    { type: String, trim: true, default: '' },
    dualCitizen:    { type: String, trim: true, default: '' },
    livingAbroad:   { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const backgroundSchema = new mongoose.Schema(
  {
    immigrationApplied:      { type: String, trim: true, default: '' },
    seriousMedicalCondition: { type: String, trim: true, default: '' },
    visaRefusal:             { type: String, trim: true, default: '' },
    criminalOffence:         { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const emergencyContactSchema = new mongoose.Schema(
  {
    name:     { type: String, trim: true, default: '' },
    phone:    { type: String, trim: true, default: '' },
    relation: { type: String, trim: true, default: '' },
    email:    { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const educationHistorySchema = new mongoose.Schema(
  {
    country:       { type: String, trim: true, default: '' },
    organisation:  { type: String, trim: true, default: '' },
    address:       { type: String, trim: true, default: '' },
    position:      { type: String, trim: true, default: '' },
    jobProfile:    { type: String, trim: true, default: '' },
    modeOfSalary:  { type: String, trim: true, default: '' },
    workingFrom:   { type: String, trim: true, default: '' },
    workingUpto:   { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const testScoresSchema = new mongoose.Schema(
  {
    GRE:   { type: String, trim: true, default: '' },
    GMAT:  { type: String, trim: true, default: '' },
    TOEFL: { type: String, trim: true, default: '' },
    IELTS: { type: String, trim: true, default: '' },
    PTE:   { type: String, trim: true, default: '' },
    DET:   { type: String, trim: true, default: '' },
    SAT:   { type: String, trim: true, default: '' },
    ACT:   { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    university:      { type: String, trim: true, default: '' },
    country:         { type: String, trim: true, default: '' },
    course:          { type: String, trim: true, default: '' },
    status:          { type: String, enum: APPLICATION_APP_STATUS, default: 'not-started' },
    applicationDate: { type: String, trim: true, default: '' },
    offerStatus:     { type: String, trim: true, default: '' },
    importantDates:  { type: String, trim: true, default: '' },
    remarks:         { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const visaDetailSchema = new mongoose.Schema(
  {
    country:            { type: String, trim: true, default: '' },
    type:               { type: String, trim: true, default: '' },
    stage:              { type: String, enum: VISA_APP_STAGE, default: 'not-started' },
    documentReadiness:  { type: String, trim: true, default: '' },
    appointment:        { type: String, trim: true, default: '' },
    biometrics:         { type: String, trim: true, default: '' },
    interview:          { type: String, trim: true, default: '' },
    decision:           { type: String, trim: true, default: '' },
    outcome:            { type: String, trim: true, default: '' },
    remarks:            { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const documentChecklistSchema = new mongoose.Schema(
  {
    type:      { type: String, trim: true, default: '' },
    name:      { type: String, trim: true, default: '' },
    status:    { type: String, trim: true, default: 'pending' },
    notes:     { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const leadSchema = new mongoose.Schema(
  {
    referenceId: { type: String, required: true, unique: true, index: true },
    studentName: { type: String, required: true, trim: true, index: true },
    mobile: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    countryPreferred: { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
    intake: { type: String, trim: true },
    highestEducation: { type: String, trim: true },
    gender: { type: String, trim: true },
    collegeName: { type: String, trim: true },
    passingYear: { type: String, trim: true },
    workExperience: { type: String, trim: true },
    gpa: { type: String, trim: true },
    preferredCountries: { type: [preferredCountrySchema], default: [] },
    preferredUniversities: { type: [preferredUniversitySchema], default: [] },
    referenceName: { type: String, trim: true },
    referenceMobile: { type: String, trim: true },
    interestLevel: { type: String, trim: true },
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadSource', index: true },
    marketingAgency: { type: String, trim: true, default: '' },
    currentDisposition: { type: mongoose.Schema.Types.ObjectId, ref: 'Disposition', index: true },
    dispositionHistory: { type: [dispositionHistorySchema], default: [] },

    // ── Shared operational tags (Agent / Counselor / Supervisor) ───────
    // tags = the active set shown in every workspace header; tagHistory =
    // the full audit trail of who added/removed what and when. Both live on
    // the lead itself so every role reads the exact same state.
    tags:       { type: [leadTagSchema], default: [] },
    tagHistory: { type: [leadTagHistorySchema], default: [] },

    // ── Drop-lead workflow ─────────────────────────────────────────
    // dropStatus is the soft-drop state marker (default 'active'); dropped
    // leads stay assigned and preserved but are excluded from active queues.
    // dropHistory keeps the full drop → revive lifecyle. droppedFromStatus /
    // droppedFromDisposition snapshot the pre-drop state so a revive can
    // restore the lead's working status + disposition exactly.
    dropStatus:              { type: String, enum: LEAD_DROP_STATUSES, default: 'active', index: true },
    dropHistory:             { type: [leadDropEventSchema], default: [] },
    droppedFromStatus:       { type: String, enum: LEAD_STATUS, default: null },
    droppedFromDisposition:  { type: mongoose.Schema.Types.ObjectId, ref: 'Disposition', default: null },
    status: { type: String, enum: LEAD_STATUS, default: 'new', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    fetchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fetchedAt: { type: Date },
    counselorAssigned: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    counselorAssignedAt: { type: Date },
    lastCallAt: { type: Date },
    submittedAt: { type: Date },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ── Counselor lifecycle fields ──────────────────────────────────
    counselingStatus:     { type: String, enum: COUNSELING_STATUS, default: 'not-started' },
    counselingCompletedAt: { type: Date, default: null },
    counselingCompletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registrationStatus:   { type: String, enum: REGISTRATION_STATUS, default: 'not-started' },
    registrationDate:     { type: Date, default: null },
    agreementStatus:      { type: String, enum: REGISTRATION_AGREEMENT_STATUS, default: 'not-started' },
    feeStatus:            { type: String, enum: REGISTRATION_FEE_STATUS, default: 'not-applicable' },
    documentStatus:       { type: String, enum: DOCUMENT_STATUS,     default: null },
    applicationStatus:    { type: String, enum: APPLICATION_STATUS,  default: null },
    visaStatus:           { type: String, enum: VISA_STATUS,         default: null },
    counselorNotes: {
      type: [{
        text:     { type: String, trim: true },
        category: { type: String, trim: true },   // 'general' | 'registration' | 'documents' | 'application' | 'visa'
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
    },

    // ── Extended counselor fields (personal, address, passport, etc.)
    middleName:    { type: String, trim: true, default: '' },
    dateOfBirth:   { type: String, trim: true, default: '' },
    maritalStatus: { type: String, trim: true, default: '' },
    mailingAddress:  { type: addressSchema, default: () => ({}) },
    permanentAddress: { type: addressSchema, default: () => ({}) },
    sameAsMailing: { type: Boolean, default: false },
    passport:      { type: passportSchema, default: () => ({}) },
    background:    { type: backgroundSchema, default: () => ({}) },
    emergencyContacts: { type: [emergencyContactSchema], default: [] },
    countryOfEducation: { type: String, trim: true, default: '' },
    workQualifications: { type: String, trim: true, default: '' },
    educationHistory: { type: [educationHistorySchema], default: [] },
    testScores:    { type: testScoresSchema, default: () => ({}) },
    applications:  { type: [applicationSchema], default: [] },
    visaDetails:   { type: visaDetailSchema, default: () => ({}) },
    documents:     { type: [documentChecklistSchema], default: [] },

    // ── Lifecycle engine (single source of truth for the student journey) ──
    // lastContactAt reuses `lastCallAt`; owner reuses `assignedTo`;
    // lastActivityAt reuses the schema's `updatedAt` timestamp.
    lifecycleStage:      { type: String, enum: LIFECYCLE_ALL_STAGES, default: 'NEW_LEAD', index: true },
    lifecycleSubStatus:  { type: String, trim: true, default: '' },
    waitingOn:           { type: String, enum: [...WAITING_ON_OPTIONS, null], default: null },
    nextAction:          { type: String, trim: true, default: '' },
    nextActionDue:       { type: Date, default: null },
    lifecycleUpdatedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
module.exports.LIFECYCLE_STAGES = LIFECYCLE_STAGES;
module.exports.LIFECYCLE_TERMINAL_STAGES = LIFECYCLE_TERMINAL_STAGES;
module.exports.LIFECYCLE_ALL_STAGES = LIFECYCLE_ALL_STAGES;
module.exports.WAITING_ON_OPTIONS = WAITING_ON_OPTIONS;
module.exports.LEAD_DROP_STATUSES = LEAD_DROP_STATUSES;
module.exports.LEAD_DROP_ACTIONS = LEAD_DROP_ACTIONS;
