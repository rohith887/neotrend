const Payment = require('../models/Payment');
const Lead = require('../models/Lead');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/ApiResponse');

const PAYMENT_TYPES  = ['Registration Fee', 'Application Fee', 'Other Fee'];
const PAYMENT_STATUSES = ['pending', 'link-sent', 'partially-paid', 'paid', 'failed', 'refunded'];

/* ── Helpers ──────────────────────────────────────────────────────────── */

const isSupervisor = (req) =>
  String(req.role?.name || '').toUpperCase() === 'SUPERVISOR';

const isCounselor = (req) =>
  String(req.role?.name || '').toUpperCase() === 'COUNSELOR';

/**
 * Returns an array of Lead _id values the current user is allowed to see.
 * Counselors see only their assigned leads. Supervisors see all.
 */
async function allowedLeadIds(req) {
  if (isSupervisor(req)) {
    const leads = await Lead.find({}, '_id').lean();
    return leads.map((l) => l._id);
  }
  const leads = await Lead.find({ assignedTo: req.user._id }, '_id').lean();
  return leads.map((l) => l._id);
}

/* ── GET /api/payments — list payments (scoped, searchable, paginated) ── */

const listPayments = asyncHandler(async (req, res) => {
  const leadIds = await allowedLeadIds(req);
  if (leadIds.length === 0) {
    return success(res, { payments: [], total: 0, page: 1, pages: 1 }, 'Payments fetched');
  }

  const {
    search = '',
    status = '',
    paymentType = '',
    page = 1,
    limit = 25,
    sort = '-createdAt',
  } = req.query;

  const filter = { lead: { $in: leadIds } };

  if (status) {
    filter.status = status;
  }

  if (paymentType) {
    filter.paymentType = paymentType;
  }

  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { studentName: re },
      { referenceId: re },
      { transactionRef: re },
    ];
  }

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const skip     = (pageNum - 1) * pageSize;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return success(
    res,
    { payments, total, page: pageNum, pages: Math.ceil(total / pageSize) },
    'Payments fetched'
  );
});

/* ── GET /api/payments/summary — KPI metrics ─────────────────────────── */

const getSummary = asyncHandler(async (req, res) => {
  const leadIds = await allowedLeadIds(req);
  if (leadIds.length === 0) {
    return success(res, {
      totalStudents: 0,
      totalPayments: 0,
      pending: 0,
      linkSent: 0,
      partiallyPaid: 0,
      paid: 0,
      failed: 0,
      refunded: 0,
      totalCollected: 0,
    }, 'Summary fetched');
  }

  const match = { lead: { $in: leadIds } };

  const [agg] = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalStudents: { $addToSet: '$lead' },
        totalPayments: { $sum: 1 },
        pending:       { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        linkSent:      { $sum: { $cond: [{ $eq: ['$status', 'link-sent'] }, 1, 0] } },
        partiallyPaid: { $sum: { $cond: [{ $eq: ['$status', 'partially-paid'] }, 1, 0] } },
        paid:          { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        failed:        { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        refunded:      { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
        totalCollected:{ $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
      },
    },
  ]);

  if (!agg) {
    return success(res, {
      totalStudents: 0,
      totalPayments: 0,
      pending: 0,
      linkSent: 0,
      partiallyPaid: 0,
      paid: 0,
      failed: 0,
      refunded: 0,
      totalCollected: 0,
    }, 'Summary fetched');
  }

  return success(res, {
    totalStudents: (agg.totalStudents || []).length,
    totalPayments: agg.totalPayments || 0,
    pending:       agg.pending || 0,
    linkSent:      agg.linkSent || 0,
    partiallyPaid: agg.partiallyPaid || 0,
    paid:          agg.paid || 0,
    failed:        agg.failed || 0,
    refunded:      agg.refunded || 0,
    totalCollected: agg.totalCollected || 0,
  }, 'Summary fetched');
});

/* ── GET /api/payments/:id — single payment ──────────────────────────── */

const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('createdBy', 'firstName lastName email')
    .lean();
  if (!payment) throw new ApiError(404, 'Payment not found');

  const leadIds = await allowedLeadIds(req);
  if (!leadIds.some((id) => String(id) === String(payment.lead))) {
    throw new ApiError(403, 'Forbidden: you do not have access to this payment');
  }

  return success(res, { payment }, 'Payment fetched');
});

/* ── POST /api/payments — create a payment record ────────────────────── */

const createPayment = asyncHandler(async (req, res) => {
  const { leadId, paymentType, amount, currency, dueDate, remarks } = req.body;

  if (!leadId) throw new ApiError(400, 'leadId is required');
  if (!paymentType || !PAYMENT_TYPES.includes(paymentType)) {
    throw new ApiError(400, `paymentType must be one of: ${PAYMENT_TYPES.join(', ')}`);
  }
  if (amount == null || Number(amount) < 0) {
    throw new ApiError(400, 'amount is required and must be >= 0');
  }

  const lead = await Lead.findById(leadId).lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  const leadIds = await allowedLeadIds(req);
  if (!leadIds.some((id) => String(id) === String(lead._id))) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this student');
  }

  const payment = await Payment.create({
    lead: lead._id,
    studentName: lead.studentName,
    referenceId: lead.referenceId,
    paymentType,
    amount: Number(amount),
    currency: currency || 'INR',
    status: 'pending',
    dueDate: dueDate || null,
    remarks: remarks || '',
    createdBy: req.user._id,
  });

  return success(res, { payment: payment.toObject() }, 'Payment created', 201);
});

/* ── PATCH /api/payments/:id — update a payment record ───────────────── */

const PAYMENT_UPDATE_FIELDS = [
  'status',
  'amount',
  'dueDate',
  'paidDate',
  'transactionRef',
  'paymentLink',
  'remarks',
  'paymentType',
  'currency',
];

const updatePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');

  const leadIds = await allowedLeadIds(req);
  if (!leadIds.some((id) => String(id) === String(payment.lead))) {
    throw new ApiError(403, 'Forbidden: you do not have access to this payment');
  }

  const body = req.body ?? {};
  for (const field of PAYMENT_UPDATE_FIELDS) {
    if (body[field] !== undefined) {
      payment[field] = body[field];
    }
  }

  // Auto-set paidDate when status changes to 'paid'
  if (body.status === 'paid' && !payment.paidDate) {
    payment.paidDate = new Date();
  }

  await payment.save();
  const updated = await Payment.findById(payment._id)
    .populate('createdBy', 'firstName lastName email')
    .lean();

  return success(res, { payment: updated }, 'Payment updated');
});

/* ── DELETE /api/payments/:id — delete a payment record ──────────────── */

const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');

  const leadIds = await allowedLeadIds(req);
  if (!leadIds.some((id) => String(id) === String(payment.lead))) {
    throw new ApiError(403, 'Forbidden: you do not have access to this payment');
  }

  await Payment.deleteOne({ _id: payment._id });
  return success(res, null, 'Payment deleted');
});

module.exports = {
  listPayments,
  getSummary,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
};
