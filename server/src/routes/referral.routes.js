const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/referral.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const {
  studentIdParam,
  referralCodeParam,
  publicSubmitRules,
  publicQRSubmitRules,
  validateEmployeeRules,
  employeeSubmitRules,
  updateStatusRules,
  updateRewardStatusRules,
  updateReferralRules,
  setActiveRules,
  listReferralsRules,
} = require('../validation/referral.validation');

const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many referral submissions. Please try again later.' },
});

/* ── Public QR submission (no auth) ──────────────────────────── */
router.post(
  '/public',
  publicSubmitLimiter,
  publicQRSubmitRules,
  validate,
  controller.submitPublicQRReferralHandler
);

router.get(
  '/public/validate-employee/:userId',
  validateEmployeeRules,
  validate,
  controller.publicValidateEmployee
);

router.post(
  '/public/employee-submit/:userId',
  publicSubmitLimiter,
  employeeSubmitRules,
  validate,
  controller.submitEmployeeReferralHandler
);

router.get(
  '/public/:referralCode',
  referralCodeParam,
  validate,
  controller.publicValidateReferral
);

router.post(
  '/public/:referralCode',
  publicSubmitLimiter,
  publicSubmitRules,
  validate,
  controller.submitPublicReferral
);

/* ── Public QR endpoint (no auth — permanent QR for /refer) ─── */
router.get(
  '/public-qr',
  controller.getPublicQR
);

router.get(
  '/employee-qr/:userId',
  protect,
  allowPermissions('referral:read'),
  validateEmployeeRules,
  validate,
  controller.getEmployeeQR
);

router.get(
  '/',
  protect,
  allowPermissions('referral:read'),
  listReferralsRules,
  validate,
  controller.listReferrals
);

router.get(
  '/student/:studentId',
  protect,
  allowPermissions('referral:read'),
  studentIdParam,
  validate,
  controller.getOrCreateReferral
);

router.get(
  '/student/:studentId/qr',
  protect,
  allowPermissions('referral:read'),
  studentIdParam,
  validate,
  controller.getQRCode
);

router.get(
  '/:id',
  protect,
  allowPermissions('referral:read'),
  controller.getReferral
);

router.patch(
  '/:id/status',
  protect,
  allowPermissions('referral:manage'),
  updateStatusRules,
  validate,
  controller.updateStatus
);

router.patch(
  '/:id/reward-status',
  protect,
  allowPermissions('referral:manage'),
  updateRewardStatusRules,
  validate,
  controller.updateRewardStatus
);

/* ── Referral management (edit / activate / delete) ──────────── */
router.patch(
  '/:id',
  protect,
  allowPermissions('referral:manage'),
  updateReferralRules,
  validate,
  controller.updateReferral
);

router.patch(
  '/:id/active',
  protect,
  allowPermissions('referral:manage'),
  setActiveRules,
  validate,
  controller.setActive
);

router.delete(
  '/:id',
  protect,
  allowPermissions('referral:manage'),
  controller.remove
);

module.exports = router;
