const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const { logEvent } = require('../services/systemLog.service');
const User = require('../models/User');

const login = asyncHandler(async (req, res) => {
  const email = (req.body && req.body.email) || '';
  try {
    const data = await authService.login(req.body);
    logEvent({
      level: 'INFO',
      module: 'auth',
      action: 'LOGIN_SUCCESS',
      username: data.user?.email || email,
      role: data.user?.role?.name || '',
      userId: data.user?._id ? String(data.user._id) : '',
      message: `${data.user?.firstName || 'User'} signed in`,
      ipAddress: req.ip,
      metadata: { method: 'email' },
    });
    return success(res, data, 'Login successful');
  } catch (err) {
    // Best-effort role lookup so the log scope gate can filter supervisor
    // attempts too; for unknown accounts the role stays empty (still logged).
    let roleName = '';
    let resolvedUserId = '';
    try {
      const account = await User.findOne({ email: String(email).toLowerCase() }).populate('role');
      if (account) {
        roleName = account.role?.name || '';
        resolvedUserId = account._id ? String(account._id) : '';
      }
    } catch {
    }
    logEvent({
      level: 'WARN',
      module: 'auth',
      action: 'LOGIN_FAILED',
      username: email,
      role: roleName,
      userId: resolvedUserId,
      message: `Failed sign-in: ${err.message}`,
      ipAddress: req.ip,
    });
    throw err;
  }
});

const otpRequest = asyncHandler(async (req, res) => {
  const data = await authService.requestOtp(req.body?.email);
  return success(res, data, 'OTP sent');
});

const otpVerify = asyncHandler(async (req, res) => {
  const email = (req.body && req.body.email) || '';
  try {
    const data = await authService.verifyOtp(req.body);
    logEvent({
      level: 'INFO',
      module: 'auth',
      action: 'LOGIN_SUCCESS',
      username: data.user?.email || email,
      role: data.user?.role?.name || '',
      userId: data.user?._id ? String(data.user._id) : '',
      message: `${data.user?.firstName || 'User'} signed in`,
      ipAddress: req.ip,
      metadata: { method: 'otp' },
    });
    return success(res, data, 'Login successful');
  } catch (err) {
    let roleName = '';
    let resolvedUserId = '';
    try {
      const account = await User.findOne({ email: String(email).toLowerCase() }).populate('role');
      if (account) {
        roleName = account.role?.name || '';
        resolvedUserId = account._id ? String(account._id) : '';
      }
    } catch {
    }
    logEvent({
      level: 'WARN',
      module: 'auth',
      action: 'LOGIN_FAILED',
      username: email,
      role: roleName,
      userId: resolvedUserId,
      message: `Failed sign-in: ${err.message}`,
      ipAddress: req.ip,
      metadata: { method: 'otp' },
    });
    throw err;
  }
});

const getProfile = asyncHandler(async (req, res) => {
  const data = await authService.getProfile(req.user._id);
  return success(res, data, 'Profile fetched');
});

const updateProfile = asyncHandler(async (req, res) => {
  const data = await authService.updateProfile(req.user._id, req.body);
  return success(res, data, 'Profile updated');
});

module.exports = { login, otpRequest, otpVerify, getProfile, updateProfile };
