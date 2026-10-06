const User = require('../models/User');
const Role = require('../models/Role');
const Counselor = require('../models/Counselor');
const freepbxService = require('./freepbx.service');
const ApiError = require('../utils/ApiError');

const MANAGED_ROLE_CODES = new Set(['agent', 'counselor', 'supervisor']);

const fullName = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'CRM user';

const resolveRole = async (value) => {
  const code = String(value || '').trim().toLowerCase();
  if (!MANAGED_ROLE_CODES.has(code)) {
    throw new ApiError(422, 'Role must be agent, counselor, or supervisor');
  }
  const role = await Role.findOne({ code, isActive: true });
  if (!role) throw new ApiError(422, `Active ${code} role is not configured`);
  return role;
};

const hasProvisionedSip = (user) =>
  user?.sipProvisionStatus === 'provisioned' &&
  user?.sipExtension != null &&
  Boolean(user?.sipUsername) &&
  Boolean(user?.sipPassword) &&
  Boolean(user?.sipDomain) &&
  Boolean(user?.sipWssUrl);

const applySip = (user, sip) => {
  user.sipExtension = Number(sip.extension);
  user.sipUsername = String(sip.username).trim();
  user.sipPassword = String(sip.password);
  user.sipDomain = String(sip.domain).trim();
  user.sipWssUrl = String(sip.wssUrl).trim();
  user.sipProvisionStatus = 'provisioned';
  user.sipProvisionedAt = new Date();
};

const removeProvisionedExtension = async (user) => {
  if (user.sipExtension != null) {
    await freepbxService.deleteExtension(user.sipExtension);
  }
};

const provision = async (user, extension) => {
  let sip;
  try {
    sip = await freepbxService.createExtension({
      name: fullName(user),
      email: user.email,
      extension,
    });
  } catch (err) {
    if (!user.isNew) {
      user.sipProvisionStatus = 'failed';
      try {
        await user.save();
      } catch {}
    }
    throw err;
  }

  applySip(user, sip);
  try {
    await user.save();
  } catch {
    let cleanupSucceeded = false;
    try {
      await removeProvisionedExtension(user);
      cleanupSucceeded = true;
    } catch {}
    if (!cleanupSucceeded) {
      throw new ApiError(502, 'SIP provisioning could not be saved and remote cleanup failed');
    }
    throw new ApiError(502, 'SIP provisioning could not be saved; remote extension was removed');
  }
  return user;
};

const rollbackProvision = async (user) => {
  try {
    await removeProvisionedExtension(user);
  } catch {
    throw new ApiError(502, 'User creation failed and the remote SIP extension could not be removed');
  }
  await User.deleteOne({ _id: user._id });
};

const createUser = async (payload) => {
  const role = await resolveRole(payload.role);
  const email = String(payload.email || '').trim().toLowerCase();
  const requestedExtension = payload.extension ? Number(payload.extension) : null;

  if (await User.exists({ email })) {
    throw new ApiError(409, 'A user with this email already exists');
  }
  if (requestedExtension && await User.exists({ sipExtension: requestedExtension })) {
    throw new ApiError(409, 'This SIP extension is already assigned');
  }

  const user = new User({
    firstName: String(payload.firstName || '').trim(),
    lastName: String(payload.lastName || '').trim(),
    email,
    role: role._id,
    mobile: String(payload.mobile || '').trim(),
    status: 'active',
  });

  await provision(user, requestedExtension);

  if (role.code === 'counselor') {
    try {
      await Counselor.create({ user: user._id, status: 'active' });
    } catch {
      await rollbackProvision(user);
      throw new ApiError(500, 'User creation failed while creating the counselor profile');
    }
  }

  await user.populate('role');
  return user;
};

const provisionSip = async (id) => {
  const user = await User.findById(id).select('+sipPassword +sipUsername').populate('role');
  if (!user) throw new ApiError(404, 'User not found');

  const roleCode = String(user.role?.code || '').toLowerCase();
  if (!MANAGED_ROLE_CODES.has(roleCode)) {
    throw new ApiError(422, 'SIP provisioning is only available for agents, counselors, and supervisors');
  }
  if (hasProvisionedSip(user)) {
    throw new ApiError(409, 'SIP is already provisioned for this user');
  }

  return provision(user, user.sipExtension || null);
};

const updateUser = async (id, payload) => {
  const user = await User.findById(id).populate('role');
  if (!user) throw new ApiError(404, 'User not found');

  if (payload.firstName !== undefined) user.firstName = String(payload.firstName).trim();
  if (payload.lastName !== undefined) user.lastName = String(payload.lastName).trim();
  if (payload.email !== undefined) {
    const email = String(payload.email).trim().toLowerCase();
    if (email !== user.email && await User.exists({ email, _id: { $ne: user._id } })) {
      throw new ApiError(409, 'A user with this email already exists');
    }
    user.email = email;
  }
  if (payload.mobile !== undefined) user.mobile = String(payload.mobile).trim();

  let nextRole = user.role;
  if (payload.role !== undefined) {
    nextRole = await resolveRole(payload.role);
    user.role = nextRole._id;
  }
  if (payload.status !== undefined) user.status = payload.status;

  await user.save();

  if (nextRole?.code === 'counselor') {
    await Counselor.findOneAndUpdate(
      { user: user._id },
      { $setOnInsert: { user: user._id, status: 'active' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } else if (payload.role !== undefined) {
    await Counselor.updateOne({ user: user._id }, { status: 'inactive' });
  }

  await user.populate('role');
  return user;
};

const setUserStatus = async (id, status) => {
  const user = await User.findById(id).select('+sipPassword +sipUsername').populate('role');
  if (!user) throw new ApiError(404, 'User not found');

  if (status === 'inactive') {
    if (user.sipExtension && user.sipProvisionStatus !== 'disabled') {
      await freepbxService.deleteExtension(user.sipExtension);
    }
    user.sipUsername = '';
    user.sipPassword = '';
    user.sipDomain = '';
    user.sipWssUrl = '';
    user.sipProvisionStatus = 'disabled';
    user.sipProvisionedAt = null;
    user.status = 'inactive';
    user.availability = 'offline';
    user.isOnCall = false;
    await user.save();
  } else {
    const roleCode = String(user.role?.code || '').toLowerCase();
    if (!MANAGED_ROLE_CODES.has(roleCode)) {
      throw new ApiError(422, 'SIP provisioning is only available for agents, counselors, and supervisors');
    }
    if (!hasProvisionedSip(user) || user.sipProvisionStatus === 'disabled') {
      await provision(user, user.sipExtension || null);
    }
    user.status = 'active';
    await user.save();
  }

  await user.populate('role');
  return user;
};

const resetPassword = async (id, password) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  user.password = password;
  await user.save();
  return user;
};

module.exports = { createUser, provisionSip, updateUser, setUserStatus, resetPassword };
