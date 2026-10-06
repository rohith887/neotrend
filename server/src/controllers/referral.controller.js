const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const referralService = require('../services/referral.service');

const listReferrals = asyncHandler(async (req, res) => {
  const result = await referralService.listReferrals(req.query);
  return success(res, result.docs, 'Referrals fetched', 200, result.meta);
});

const getReferral = asyncHandler(async (req, res) => {
  const referral = await referralService.getReferralById(req.params.id);
  return success(res, referral, 'Referral fetched');
});

const getOrCreateReferral = asyncHandler(async (req, res) => {
  const referral = await referralService.getOrCreateReferral(req.params.studentId);
  return success(res, referral, 'Referral fetched');
});

const getQRCode = asyncHandler(async (req, res) => {
  const result = await referralService.generateQRCode(req.params.studentId);
  return success(res, result, 'QR code generated');
});

const getEmployeeQR = asyncHandler(async (req, res) => {
  const result = await referralService.generateEmployeeQR(req.params.userId);
  return success(res, result, 'Employee QR code generated');
});

const getPublicQR = asyncHandler(async (req, res) => {
  const result = await referralService.generatePublicQR();
  return success(res, result, 'Public QR code generated');
});

const publicValidateEmployee = asyncHandler(async (req, res) => {
  const result = await referralService.validateEmployeeReferrer(req.params.userId);
  return success(res, result, 'Employee validated');
});

const submitEmployeeReferralHandler = asyncHandler(async (req, res) => {
  const referral = await referralService.submitEmployeeReferral(req.params.userId, req.body);
  return success(res, referral, 'Referral submitted successfully', 201);
});

const submitPublicQRReferralHandler = asyncHandler(async (req, res) => {
  const referral = await referralService.submitPublicQRReferral(req.body);
  return success(res, referral, 'Referral submitted successfully', 201);
});

const publicValidateReferral = asyncHandler(async (req, res) => {
  const result = await referralService.validateReferralCode(req.params.referralCode);
  return success(res, result, 'Referral validated');
});

const submitPublicReferral = asyncHandler(async (req, res) => {
  const referral = await referralService.submitPublicReferral(req.params.referralCode, req.body);
  return success(res, referral, 'Referral submitted successfully', 201);
});

const updateStatus = asyncHandler(async (req, res) => {
  const referral = await referralService.updateStatus(req.params.id, req.body.status);
  return success(res, referral, 'Referral status updated');
});

const updateRewardStatus = asyncHandler(async (req, res) => {
  const referral = await referralService.updateRewardStatus(req.params.id, req.body.rewardStatus, req.user);
  return success(res, referral, 'Reward status updated');
});

const updateReferral = asyncHandler(async (req, res) => {
  const referral = await referralService.updateReferral(req.params.id, req.body);
  return success(res, referral, 'Referral updated');
});

const setActive = asyncHandler(async (req, res) => {
  const referral = await referralService.setReferralActive(req.params.id, req.body.isActive);
  return success(res, referral, referral.isActive ? 'Referral activated' : 'Referral deactivated');
});

const remove = asyncHandler(async (req, res) => {
  await referralService.deleteReferral(req.params.id);
  return success(res, null, 'Referral deleted');
});

module.exports = {
  listReferrals,
  getReferral,
  getOrCreateReferral,
  getQRCode,
  getEmployeeQR,
  getPublicQR,
  publicValidateReferral,
  publicValidateEmployee,
  submitEmployeeReferralHandler,
  submitPublicQRReferralHandler,
  submitPublicReferral,
  updateStatus,
  updateRewardStatus,
  updateReferral,
  setActive,
  remove,
};
