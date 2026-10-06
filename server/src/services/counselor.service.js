const Counselor = require('../models/Counselor');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { parseListQuery } = require('../middleware/paginate');

const USER_FIELDS = 'firstName lastName email mobile';

const createCounselorProfile = async (userId, payload = {}) => {
  const user = await User.findById(userId).populate('role', 'code').lean();
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role?.code !== 'counselor') {
    throw new ApiError(422, 'Counselor profile can only be created for a counselor user');
  }

  const existing = await Counselor.findOne({ user: userId });
  if (existing) throw new ApiError(409, 'Counselor profile already exists for this user');

  return Counselor.create({
    user: userId,
    status: payload.status === 'inactive' ? 'inactive' : 'active',
  });
};

const getCounselorById = async (id) => {
  const profile = await Counselor.findById(id).populate('user', USER_FIELDS).lean();
  if (!profile) throw new ApiError(404, 'Counselor profile not found');
  return profile;
};

const getCounselorByUserId = async (userId) => {
  const profile = await Counselor.findOne({ user: userId }).populate('user', USER_FIELDS).lean();
  if (!profile) throw new ApiError(404, 'Counselor profile not found');
  return profile;
};

const listCounselors = async (rawQuery) => {
  const { query, sort, meta } = parseListQuery(rawQuery, ['status']);

  const [docs, total] = await Promise.all([
    Counselor.find(query)
      .sort(sort)
      .skip(meta.skip)
      .limit(meta.limit)
      .populate('user', USER_FIELDS)
      .lean(),
    Counselor.countDocuments(query),
  ]);

  return { docs, meta: { ...meta, total, pages: Math.ceil(total / meta.limit) } };
};

const updateCounselorProfile = async (id, payload = {}) => {
  const profile = await Counselor.findById(id);
  if (!profile) throw new ApiError(404, 'Counselor profile not found');

  if (payload.status && ['active', 'inactive'].includes(payload.status)) {
    profile.status = payload.status;
  }

  await profile.save();
  return Counselor.findById(id).populate('user', USER_FIELDS).lean();
};

module.exports = {
  createCounselorProfile,
  getCounselorById,
  getCounselorByUserId,
  listCounselors,
  updateCounselorProfile,
};
