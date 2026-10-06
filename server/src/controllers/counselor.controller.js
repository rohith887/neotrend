const counselorService = require('../services/counselor.service');
const counselorOpsService = require('../services/counselor.ops.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/ApiResponse');

const isSupervisor = (req) => req.role && String(req.role.name).toUpperCase() === 'SUPERVISOR';

const ensureOwnProfile = (req, userId) => {
  if (isSupervisor(req)) return;
  if (String(userId) !== String(req.user._id)) {
    throw new ApiError(403, 'Forbidden: you can only access your own counselor profile');
  }
};

const createCounselor = asyncHandler(async (req, res) => {
  const data = await counselorService.createCounselorProfile(req.body.userId, req.body);
  return success(res, data, 'Counselor profile created', 201);
});

const getCounselor = asyncHandler(async (req, res) => {
  const data = await counselorService.getCounselorById(req.params.id);
  ensureOwnProfile(req, data.user ? data.user._id : data.user);
  return success(res, data, 'Counselor profile fetched');
});

const getCounselorByUser = asyncHandler(async (req, res) => {
  ensureOwnProfile(req, req.params.userId);
  const data = await counselorService.getCounselorByUserId(req.params.userId);
  return success(res, data, 'Counselor profile fetched');
});

const listCounselors = asyncHandler(async (req, res) => {
  const data = await counselorService.listCounselors(req.query);
  return success(res, data.docs, 'Counselors fetched', 200, data.meta);
});

const updateCounselor = asyncHandler(async (req, res) => {
  const data = await counselorService.updateCounselorProfile(req.params.id, req.body);
  return success(res, data, 'Counselor profile updated');
});

const getMyStudents = asyncHandler(async (req, res) => {
  const data = await counselorOpsService.getMyStudents(req.user._id, req.query);
  return success(res, data, 'Students fetched');
});

const getCounselorDashboard = asyncHandler(async (req, res) => {
  const data = await counselorOpsService.getCounselorDashboard(req.user._id);
  return success(res, data, 'Dashboard data fetched');
});

const getRegistrationDetail = asyncHandler(async (req, res) => {
  const data = await counselorOpsService.getRegistrationDetail(req.params.leadId, req.user._id);
  return success(res, data, 'Registration detail fetched');
});

const updateRegistration = asyncHandler(async (req, res) => {
  const data = await counselorOpsService.updateRegistration(req.params.leadId, req.body, req.user._id);
  return success(res, data, 'Registration updated');
});

const completeCounseling = asyncHandler(async (req, res) => {
  const data = await counselorOpsService.completeCounseling(req.params.leadId, req.user._id);
  return success(res, data, 'Counseling completed');
});

const getRegistrationQueue = asyncHandler(async (req, res) => {
  const data = await counselorOpsService.getRegistrationQueue(req.query);
  return success(res, data, 'Registration queue fetched');
});

module.exports = {
  createCounselor, getCounselor, getCounselorByUser, listCounselors, updateCounselor,
  getMyStudents, getCounselorDashboard, getRegistrationDetail, updateRegistration,
  completeCounseling, getRegistrationQueue,
};
