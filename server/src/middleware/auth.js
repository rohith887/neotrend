const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const Role = require('../models/Role');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'Not authorized, no token provided');
  }
  const token = header.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    throw new ApiError(401, 'Not authorized, token invalid or expired');
  }

  const user = await User.findById(decoded.id).select('-password');
  if (!user) throw new ApiError(401, 'Not authorized, user not found');
  if (user.status !== 'active') throw new ApiError(403, 'Account is deactivated');

  const role = await Role.findById(user.role);
  if (!role || !role.isActive) throw new ApiError(403, 'Role is not active');

  req.user = user;
  req.role = role;
  return next();
});

module.exports = { protect };
