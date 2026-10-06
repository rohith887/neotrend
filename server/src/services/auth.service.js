const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role ? user.role.code : null }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

const findAuthUser = (email, select) => {
  let query = User.findOne({ email: String(email || '').trim().toLowerCase() });
  if (select) query = query.select(select);
  return query.populate('role');
};

const assertLoginUser = (user, invalidMessage = 'Invalid email or password') => {
  if (!user || !user.role || !user.role.isActive) {
    throw new ApiError(401, invalidMessage);
  }
  if (user.status !== 'active') {
    throw new ApiError(403, 'Your account has been deactivated. Contact your supervisor.');
  }
};

const issueSession = async (user) => {
  user.lastActiveAt = new Date();
  user.availability = 'available';
  await user.save();

  return {
    token: signToken(user),
    user: user.toSafeJSON(),
  };
};

const assertOtpEnabled = () => {
  if (!config.sharedOtp.enabled) {
    throw new ApiError(404, 'OTP login is not enabled');
  }
};

const login = async ({ email, password }) => {
  const user = await findAuthUser(email, '+password');
  assertLoginUser(user);

  const isMatch = user.password ? await user.comparePassword(password) : false;
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password');
  }

  return issueSession(user);
};

const requestOtp = async (email) => {
  assertOtpEnabled();
  const user = await findAuthUser(email);
  assertLoginUser(user, 'Invalid email or OTP');
  return { sent: true };
};

const verifyOtp = async ({ email, otp }) => {
  assertOtpEnabled();
  const user = await findAuthUser(email);
  assertLoginUser(user, 'Invalid email or OTP');
  if (String(otp || '') !== config.sharedOtp.code) {
    throw new ApiError(401, 'Invalid OTP');
  }

  return issueSession(user);
};

const getProfile = async (userId) => {
  const user = await User.findById(userId).populate('role');
  if (!user) throw new ApiError(404, 'User not found');
  return user.toSafeJSON();
};

const updateProfile = async (userId, payload) => {
  const { firstName, lastName, mobile, currentPassword, newPassword } = payload;

  const user = await User.findById(userId).select('+password');
  if (!user) throw new ApiError(404, 'User not found');

  if (firstName) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (mobile !== undefined) user.mobile = mobile;

  if (newPassword) {
    if (!currentPassword) throw new ApiError(400, 'Current password is required');
    const ok = user.password ? await user.comparePassword(currentPassword) : false;
    if (!ok) throw new ApiError(400, 'Current password is incorrect');
    user.password = newPassword;
  }

  await user.save();
  const updated = await User.findById(userId).populate('role');
  return updated.toSafeJSON();
};

module.exports = { login, requestOtp, verifyOtp, getProfile, updateProfile };
