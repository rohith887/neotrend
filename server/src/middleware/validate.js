const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const formatted = errors.array().map((e) => ({ field: e.path || e.param, message: e.msg }));
  return next(new ApiError(422, 'Validation failed', formatted));
};

module.exports = { validate };
