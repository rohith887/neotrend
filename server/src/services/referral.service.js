const QRCode = require('qrcode');
const Referral = require('../models/Referral');
const Lead = require('../models/Lead');
const LeadSource = require('../models/LeadSource');
const Country = require('../models/Country');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const config = require('../config');
const { nextReferenceId } = require('../utils/referenceId');
const { parseListQuery } = require('../middleware/paginate');

const ALLOWED_FILTER_FIELDS = ['status', 'rewardStatus', 'referrerStudent', 'referredLead', 'source'];

/* ── Reward transition map ──────────────────────────────────────── */
const VALID_REWARD_TRANSITIONS = {
  pending: ['eligible'],
  'not-eligible': ['eligible'],
  eligible: ['processing', 'cancelled'],
  processing: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

const buildSearchFilter = (search) => {
  if (!search) return {};
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: escaped, $options: 'i' };
  return {
    $or: [
      { referredName: regex },
      { referredMobile: regex },
      { referredEmail: regex },
      { referralCode: regex },
      { employeeName: regex },
      { employeeId: regex },
    ],
  };
};

const buildReferralLink = (code) => {
  const base = config.referralBaseUrl.replace(/\/+$/, '');
  return `${base}/refer/${code}`;
};

const listReferrals = async (queryObj) => {
  const { query: fieldQuery, sort, meta } = parseListQuery(queryObj, ALLOWED_FILTER_FIELDS);

  const searchFilter = buildSearchFilter(queryObj.search);
  const filter = { ...fieldQuery, ...searchFilter };

  /* Source groups — UI-facing buckets backed by real stored values:
     Employee Referral = employee QR submissions + public QR form;
     Student Referral  = student codes (individual/common) incl. legacy docs missing the field. */
  if (filter.source === 'employee-referral') {
    filter.source = { $in: ['employee', 'public-qr'] };
  } else if (filter.source === 'student-referral') {
    delete filter.source;
    const studentOr = [
      { source: { $in: ['individual', 'common'] } },
      { source: { $exists: false } },
      { source: null },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: studentOr }];
      delete filter.$or;
    } else {
      filter.$or = studentOr;
    }
  }

  if (filter.source === 'individual') {
    delete filter.source;
    const sourceOr = [{ source: 'individual' }, { source: { $exists: false } }];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: sourceOr }];
      delete filter.$or;
    } else {
      filter.$or = sourceOr;
    }
  }

  const [docs, total] = await Promise.all([
    Referral.find(filter)
      .populate('referrerStudent', 'studentName referenceId mobile email')
      .populate('referrerUser', 'firstName lastName email')
      .populate('referredLead', 'studentName referenceId mobile email status')
      .populate('preferredCountry', 'name code')
      .sort(sort)
      .skip(meta.skip)
      .limit(meta.limit)
      .lean(),
    Referral.countDocuments(filter),
  ]);

  return {
    docs,
    meta: {
      page: meta.page,
      limit: meta.limit,
      total,
      pages: Math.ceil(total / meta.limit),
    },
  };
};

const getReferralById = async (id) => {
  const referral = await Referral.findById(id)
    .populate('referrerStudent', 'studentName referenceId mobile email status')
    .populate('referrerUser', 'firstName lastName email')
    .populate('referredLead', 'studentName referenceId mobile email status assignedTo')
    .populate('preferredCountry', 'name code')
    .lean();

  if (!referral) {
    throw new ApiError(404, 'Referral not found');
  }
  return referral;
};

const getOrCreateReferral = async (studentId) => {
  const lead = await Lead.findById(studentId).select('studentName referenceId mobile email').lean();
  if (!lead) {
    throw new ApiError(404, 'Student not found');
  }

  let referral = await Referral.findOne({ referrerStudent: studentId })
    .populate('referrerStudent', 'studentName referenceId mobile email')
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code')
    .lean();

  if (!referral) {
    let code;
    let attempts = 0;
    do {
      code = Referral.generateCode();
      attempts += 1;
      if (attempts > 10) {
        throw new ApiError(500, 'Failed to generate unique referral code');
      }
    } while (await Referral.findOne({ referralCode: code }));

    const doc = await Referral.create({
      referrerStudent: studentId,
      referralCode: code,
    });

    referral = await Referral.findById(doc._id)
      .populate('referrerStudent', 'studentName referenceId mobile email')
      .populate('referredLead', 'studentName referenceId mobile email status')
      .populate('preferredCountry', 'name code')
      .lean();
  }

  referral.referralLink = buildReferralLink(referral.referralCode);
  return referral;
};

const getReferralByCode = async (code) => {
  const referral = await Referral.findOne({ referralCode: code })
    .populate('referrerStudent', 'studentName referenceId mobile email status')
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code')
    .lean();

  if (!referral) {
    throw new ApiError(404, 'Referral not found');
  }
  return referral;
};

const generateQRCode = async (studentId) => {
  const referral = await getOrCreateReferral(studentId);
  const link = buildReferralLink(referral.referralCode);

  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 300,
    margin: 2,
    color: { dark: '#1e1b4b', light: '#ffffff' },
  });

  return {
    referralCode: referral.referralCode,
    referralLink: link,
    qrDataUrl,
    referral,
  };
};

const validateReferralCode = async (code) => {
  const referral = await Referral.findOne({ referralCode: code })
    .populate('referrerStudent', 'studentName')
    .lean();

  if (!referral) {
    throw new ApiError(404, 'Invalid referral link');
  }
  if (referral.isActive === false) {
    throw new ApiError(400, 'This referral link is no longer active');
  }
  return {
    referralCode: referral.referralCode,
    referrerName: referral.referrerStudent?.studentName || null,
  };
};

const submitPublicReferral = async (code, { studentName, mobile, email, preferredCountry, intake }) => {
  const referral = await Referral.findOne({ referralCode: code })
    .populate('referrerStudent', 'studentName referenceId mobile email')
    .lean();

  if (!referral) {
    throw new ApiError(404, 'Invalid referral link');
  }
  if (referral.isActive === false) {
    throw new ApiError(400, 'This referral link is no longer active');
  }

  const referrerLead = referral.referrerStudent;
  const trimmedMobile = String(mobile).trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedName = String(studentName).trim();

  if (referrerLead && trimmedMobile === referrerLead.mobile) {
    throw new ApiError(400, 'You cannot refer yourself');
  }

  if (trimmedEmail && referrerLead && referrerLead.email && trimmedEmail === referrerLead.email) {
    throw new ApiError(400, 'You cannot refer yourself');
  }

  const existingLeadByMobile = await Lead.findOne({ mobile: trimmedMobile }).lean();
  if (existingLeadByMobile) {
    throw new ApiError(409, 'This mobile number is already registered');
  }

  if (trimmedEmail) {
    const existingLeadByEmail = await Lead.findOne({ email: trimmedEmail }).lean();
    if (existingLeadByEmail) {
      throw new ApiError(409, 'This email address is already registered');
    }
  }

  const alreadyReferred = await Referral.findOne({
    referralCode: code,
    $or: [
      { referredMobile: trimmedMobile },
      ...(trimmedEmail ? [{ referredEmail: trimmedEmail }] : []),
    ],
  }).lean();

  if (alreadyReferred) {
    throw new ApiError(409, 'This person has already been referred');
  }

  let countryId = null;
  if (preferredCountry) {
    const country = await Country.findOne({ name: preferredCountry }).lean();
    countryId = country?._id || null;
  }

  const referenceId = await nextReferenceId();

  let source = await LeadSource.findOne({ name: 'Referral Leads' }).lean();
  if (!source) {
    source = await LeadSource.findOneAndUpdate(
      { name: 'Employee Referrals' },
      { name: 'Referral Leads', description: 'Referred by existing students', isActive: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  }

  const newLead = await Lead.create({
    referenceId,
    studentName: trimmedName,
    mobile: trimmedMobile,
    email: trimmedEmail || undefined,
    countryPreferred: countryId || undefined,
    intake: intake || undefined,
    source: source?._id,
    referenceName: referrerLead?.studentName || undefined,
    referenceMobile: referrerLead?.mobile || undefined,
    status: 'new',
  });

  const updatedReferral = await Referral.findByIdAndUpdate(
    referral._id,
    {
      referredLead: newLead._id,
      referredName: trimmedName,
      referredMobile: trimmedMobile,
      referredEmail: trimmedEmail,
      preferredCountry: countryId || referral.preferredCountry,
      intake: intake || referral.intake,
      status: 'pending',
      rewardStatus: 'pending',
    },
    { new: true, runValidators: true }
  )
    .populate('referrerStudent', 'studentName referenceId mobile email')
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code')
    .lean();

  return updatedReferral;
};

/* ── Employee QR functions ────────────────────────────────────── */

const generateEmployeeQR = async (userId) => {
  const user = await User.findById(userId).select('firstName lastName email').lean();
  if (!user) throw new ApiError(404, 'Employee not found');

  const base = config.referralBaseUrl.replace(/\/+$/, '');
  const link = `${base}/refer/emp/${user._id}`;

  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 300,
    margin: 2,
    color: { dark: '#1e1b4b', light: '#ffffff' },
  });

  const employeeName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return { referralLink: link, qrDataUrl, employeeName, employeeId: String(user._id) };
};

/* ── Public QR functions ─────────────────────────────────────── */

const generatePublicQR = async () => {
  const base = config.referralBaseUrl.replace(/\/+$/, '');
  const link = `${base}/refer`;

  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 300,
    margin: 2,
    color: { dark: '#1e1b4b', light: '#ffffff' },
  });

  return { referralLink: link, qrDataUrl };
};

const submitPublicQRReferral = async ({ employeeName, employeeId, employeeNumber, studentName, mobile, email, preferredCountry, intake }) => {
  const trimmedEmployeeName = String(employeeName).trim();
  const trimmedEmployeeId = String(employeeId).trim();
  const trimmedEmployeeNumber = String(employeeNumber).trim();
  const trimmedMobile = String(mobile).trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedName = String(studentName).trim();

  const existingByMobile = await Lead.findOne({ mobile: trimmedMobile }).lean();
  if (existingByMobile) {
    throw new ApiError(409, 'This mobile number is already registered');
  }
  if (trimmedEmail) {
    const existingByEmail = await Lead.findOne({ email: trimmedEmail }).lean();
    if (existingByEmail) {
      throw new ApiError(409, 'This email address is already registered');
    }
  }

  const alreadyReferred = await Referral.findOne({
    source: 'public-qr',
    $or: [
      { referredMobile: trimmedMobile },
      ...(trimmedEmail ? [{ referredEmail: trimmedEmail }] : []),
    ],
  }).lean();
  if (alreadyReferred) {
    throw new ApiError(409, 'This person has already been referred');
  }

  let countryId = null;
  if (preferredCountry) {
    const country = await Country.findOne({ name: preferredCountry }).lean();
    countryId = country?._id || null;
  }

  const referenceId = await nextReferenceId();

  let source = await LeadSource.findOne({ name: 'Referral Leads' }).lean();
  if (!source) {
    source = await LeadSource.findOneAndUpdate(
      { name: 'Employee Referrals' },
      { name: 'Employee Referrals', description: 'Referred via employee QR', isActive: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  }

  const newLead = await Lead.create({
    referenceId,
    studentName: trimmedName,
    mobile: trimmedMobile,
    email: trimmedEmail || undefined,
    countryPreferred: countryId || undefined,
    intake: intake || undefined,
    source: source?._id,
    status: 'new',
  });

  let code;
  let attempts = 0;
  do {
    code = Referral.generateCode();
    attempts += 1;
    if (attempts > 10) throw new ApiError(500, 'Failed to generate unique referral code');
  } while (await Referral.findOne({ referralCode: code }));

  const doc = await Referral.create({
    referralCode: code,
    referredLead: newLead._id,
    referredName: trimmedName,
    referredMobile: trimmedMobile,
    referredEmail: trimmedEmail,
    preferredCountry: countryId || undefined,
    intake: intake || undefined,
    status: 'pending',
    rewardStatus: 'pending',
    source: 'public-qr',
    employeeName: trimmedEmployeeName,
    employeeId: trimmedEmployeeId,
    employeeNumber: trimmedEmployeeNumber,
  });

  const referral = await Referral.findById(doc._id)
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code')
    .lean();

  return referral;
};

const validateEmployeeReferrer = async (userId) => {
  if (!userId) throw new ApiError(400, 'Employee ID is required');

  let user = null;

  if (/^[0-9a-fA-F]{24}$/.test(userId)) {
    user = await User.findById(userId).select('firstName lastName email').lean();
  }

  if (!user) {
    throw new ApiError(404, 'Employee not found');
  }

  return {
    _id: String(user._id),
    employeeName: [user.firstName, user.lastName].filter(Boolean).join(' '),
    email: user.email,
  };
};

const submitEmployeeReferral = async (userId, { studentName, mobile, email, preferredCountry, intake }) => {
  const user = await User.findById(userId).select('firstName lastName email').lean();
  if (!user) throw new ApiError(404, 'Employee not found');

  const employeeName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const trimmedMobile = String(mobile).trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedName = String(studentName).trim();

  const existingByMobile = await Lead.findOne({ mobile: trimmedMobile }).lean();
  if (existingByMobile) {
    throw new ApiError(409, 'This mobile number is already registered');
  }
  if (trimmedEmail) {
    const existingByEmail = await Lead.findOne({ email: trimmedEmail }).lean();
    if (existingByEmail) {
      throw new ApiError(409, 'This email address is already registered');
    }
  }

  const alreadyReferred = await Referral.findOne({
    referrerUser: userId,
    $or: [
      { referredMobile: trimmedMobile },
      ...(trimmedEmail ? [{ referredEmail: trimmedEmail }] : []),
    ],
  }).lean();
  if (alreadyReferred) {
    throw new ApiError(409, 'This person has already been referred by this employee');
  }

  let countryId = null;
  if (preferredCountry) {
    const country = await Country.findOne({ name: preferredCountry }).lean();
    countryId = country?._id || null;
  }

  const referenceId = await nextReferenceId();

  let source = await LeadSource.findOne({ name: 'Referral Leads' }).lean();
  if (!source) {
    source = await LeadSource.findOneAndUpdate(
      { name: 'Referral Leads' },
      { name: 'Referral Leads', description: 'Referred by employees', isActive: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  }

  const newLead = await Lead.create({
    referenceId,
    studentName: trimmedName,
    mobile: trimmedMobile,
    email: trimmedEmail || undefined,
    countryPreferred: countryId || undefined,
    intake: intake || undefined,
    source: source?._id,
    referenceName: employeeName,
    referenceMobile: user.mobile || undefined,
    status: 'new',
  });

  let code;
  let attempts = 0;
  do {
    code = Referral.generateCode();
    attempts += 1;
    if (attempts > 10) throw new ApiError(500, 'Failed to generate unique referral code');
  } while (await Referral.findOne({ referralCode: code }));

  const doc = await Referral.create({
    referrerUser: userId,
    referralCode: code,
    referredLead: newLead._id,
    referredName: trimmedName,
    referredMobile: trimmedMobile,
    referredEmail: trimmedEmail,
    preferredCountry: countryId || undefined,
    intake: intake || undefined,
    status: 'pending',
    rewardStatus: 'pending',
    source: 'employee',
  });

  const referral = await Referral.findById(doc._id)
    .populate('referrerUser', 'firstName lastName email')
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code')
    .lean();

  return referral;
};

const updateStatus = async (id, status) => {
  const referral = await Referral.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  )
    .populate('referrerStudent', 'studentName referenceId mobile email')
    .populate('referrerUser', 'firstName lastName email')
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code');

  if (!referral) {
    throw new ApiError(404, 'Referral not found');
  }
  return referral;
};

const updateRewardStatus = async (id, rewardStatus, user) => {
  const referral = await Referral.findById(id);
  if (!referral) {
    throw new ApiError(404, 'Referral not found');
  }

  const current = referral.rewardStatus;
  if (current === rewardStatus) {
    throw new ApiError(400, `Reward is already ${rewardStatus}`);
  }

  const allowed = VALID_REWARD_TRANSITIONS[current] || [];
  if (!allowed.includes(rewardStatus)) {
    throw new ApiError(400, `Cannot transition reward from "${current}" to "${rewardStatus}"`);
  }

  const update = { rewardStatus };

  update.$push = {
    rewardHistory: {
      from: current,
      to: rewardStatus,
      at: new Date(),
      by: user
        ? { userId: user._id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email }
        : undefined,
    },
  };

  if (rewardStatus === 'processing') {
    update.processingAt = new Date();
    update.processedBy = user
      ? { userId: user._id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email }
      : undefined;
  }

  if (rewardStatus === 'paid') {
    update.paidAt = new Date();
    update.paidBy = user
      ? { userId: user._id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email }
      : undefined;
  }

  const updated = await Referral.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .populate('referrerStudent', 'studentName referenceId mobile email')
    .populate('referrerUser', 'firstName lastName email')
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code')
    .lean();

  return updated;
};

/* ── Referral management (edit / deactivate / delete) ─────────── */

const REFERRAL_EDITABLE_FIELDS = [
  'referredName',
  'referredMobile',
  'referredEmail',
  'intake',
  'rewardAmount',
];

const updateReferral = async (id, updates = {}) => {
  const patch = {};
  REFERRAL_EDITABLE_FIELDS.forEach((f) => {
    if (updates[f] !== undefined) patch[f] = updates[f];
  });

  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, 'No editable fields provided');
  }

  const referral = await Referral.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
    .populate('referrerStudent', 'studentName referenceId mobile email')
    .populate('referrerUser', 'firstName lastName email')
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code')
    .lean();

  if (!referral) {
    throw new ApiError(404, 'Referral not found');
  }
  referral.referralLink = buildReferralLink(referral.referralCode);
  return referral;
};

const setReferralActive = async (id, isActive) => {
  const referral = await Referral.findByIdAndUpdate(
    id,
    { isActive },
    { new: true, runValidators: true }
  )
    .populate('referrerStudent', 'studentName referenceId mobile email')
    .populate('referrerUser', 'firstName lastName email')
    .populate('referredLead', 'studentName referenceId mobile email status')
    .populate('preferredCountry', 'name code')
    .lean();

  if (!referral) {
    throw new ApiError(404, 'Referral not found');
  }
  return referral;
};

const deleteReferral = async (id) => {
  const referral = await Referral.findByIdAndDelete(id).lean();
  if (!referral) {
    throw new ApiError(404, 'Referral not found');
  }
  return referral;
};

/**
 * Compute the derived referral status and reward status from a Lead's current
 * lifecycle state.  This is the single source of truth for how Lead progression
 * maps to Referral progression — no fields are duplicated inside Referral.
 *
 * Priority order (highest wins):
 *   lead.status → registrationStatus → applicationStatus → visaStatus
 */
const computeReferralFromLead = (lead) => {
  const s = lead.status;
  const rs = lead.registrationStatus || 'not-started';
  const as = lead.applicationStatus || 'not-started';
  const vs = lead.visaStatus || 'not-started';

  // Terminal: lead lost / rejected
  if (s === 'lost') return { status: 'rejected', rewardStatus: 'cancelled' };

  // Converted: student enrolled, visa process, or offer received
  if (s === 'submitted' || s === 'visa-process' || s === 'offer-received')
    return { status: 'converted', rewardStatus: 'eligible' };

  // Converted via counselor lifecycle (application accepted or visa received)
  if (as === 'offer-received' || as === 'accepted' || vs === 'received')
    return { status: 'converted', rewardStatus: 'eligible' };

  // Qualified: registration complete/submitted, or application under review,
  // or documents submitted / verified, or visa filed / interview scheduled
  if (
    rs === 'completed' ||
    rs === 'submitted' ||
    as === 'submitted' ||
    as === 'under-review' ||
    as === 'draft' ||
    vs === 'filed' ||
    vs === 'interview' ||
    vs === 'gathering'
  )
    return { status: 'qualified', rewardStatus: 'eligible' };

  // Qualified via lead status (agent completed their workflow)
  if (s === 'completed' || s === 'documents-pending')
    return { status: 'qualified', rewardStatus: 'pending' };

  // Contacted: agent actively working
  if (
    s === 'fetched' ||
    s === 'in-progress' ||
    s === 'callback' ||
    s === 'callback-completed' ||
    s === 'follow-up'
  )
    return { status: 'contacted', rewardStatus: 'pending' };

  // Pending: new or assigned, no contact yet
  return { status: 'pending', rewardStatus: 'pending' };
};

/**
 * Synchronise the Referral linked to a given Lead.  Finds any Referral whose
 * `referredLead` matches the leadId, recomputes the derived status from the
 * Lead's current lifecycle fields, and persists changes only when they differ.
 *
 * Designed to be called fire-and-forget from Lead mutation points — errors are
 * silently swallowed so they never break the caller's flow.
 */
const syncReferralStatus = async (leadId, actor) => {
  try {
    if (!leadId) return;
    const referral = await Referral.findOne({ referredLead: leadId });
    if (!referral) return;

    const lead = await Lead.findById(leadId)
      .select('status registrationStatus applicationStatus visaStatus')
      .lean();
    if (!lead) return;

    const { status, rewardStatus } = computeReferralFromLead(lead);

    const needsStatusUpdate = referral.status !== status;
    const needsRewardUpdate = referral.rewardStatus !== rewardStatus;

    if (!needsStatusUpdate && !needsRewardUpdate) return;

    const update = {};
    if (needsStatusUpdate) update.status = status;
    if (needsRewardUpdate) {
      update.rewardStatus = rewardStatus;

      let userInfo;
      if (actor && typeof actor === 'object' && actor.firstName !== undefined) {
        userInfo = { userId: actor._id, name: [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email };
      } else if (actor) {
        const u = await User.findById(actor).select('firstName lastName email').lean();
        userInfo = u
          ? { userId: u._id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email }
          : { name: 'System' };
      } else {
        userInfo = { name: 'System' };
      }

      update.$push = {
        rewardHistory: {
          from: referral.rewardStatus,
          to: rewardStatus,
          at: new Date(),
          by: userInfo,
        },
      };

      if (rewardStatus === 'eligible' && (referral.rewardStatus === 'not-eligible' || referral.rewardStatus === 'pending')) {
        update.processingAt = null;
        update.paidAt = null;
        update.processedBy = null;
        update.paidBy = null;
      }
    }

    await Referral.updateOne({ _id: referral._id }, update);
  } catch (_) {
    // Intentionally swallowed — referral sync must never block the caller.
  }
};

module.exports = {
  listReferrals,
  getReferralById,
  getOrCreateReferral,
  getReferralByCode,
  generateQRCode,
  generateEmployeeQR,
  validateEmployeeReferrer,
  submitEmployeeReferral,
  generatePublicQR,
  submitPublicQRReferral,
  validateReferralCode,
  submitPublicReferral,
  updateStatus,
  updateRewardStatus,
  updateReferral,
  setReferralActive,
  deleteReferral,
  syncReferralStatus,
  computeReferralFromLead,
};
