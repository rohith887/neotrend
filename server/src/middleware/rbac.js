const ApiError = require('../utils/ApiError');

/**
 * RBAC gate.
 * Usage: allowRoles('SUPERVISOR') or allowPermissions('lead:read-all')
 */
const allowRoles = (...roles) => (req, res, next) => {
  if (!req.role) return next(new ApiError(401, 'Not authenticated'));
  const allowed = roles.map((r) => String(r).toUpperCase());
  if (!allowed.includes(String(req.role.name).toUpperCase())) {
    return next(new ApiError(403, 'Forbidden: insufficient role'));
  }
  return next();
};

const allowPermissions = (...perms) => (req, res, next) => {
  if (!req.role) return next(new ApiError(401, 'Not authenticated'));
  const hasAll = perms.every((p) => (req.role.permissions || []).includes(p));
  if (!hasAll) {
    return next(new ApiError(403, 'Forbidden: missing permission'));
  }
  return next();
};

module.exports = { allowRoles, allowPermissions };
