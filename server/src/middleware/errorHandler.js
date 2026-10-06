const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (err.name === 'CastError') {
    error = new ApiError(400, `Invalid ${err.path}`);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    error = new ApiError(409, `${field} already exists`);
  }
  if (err.name === 'ValidationError') {
    const errors = Object.entries(err.errors).map(([field, e]) => ({ field, message: e.message }));
    error = new ApiError(422, 'Validation failed', errors);
  }
  if (err.name === 'JsonWebTokenError') {
    error = new ApiError(401, 'Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    error = new ApiError(401, 'Token expired');
  }

  const statusCode = error.statusCode || 500;

  // HTTP responses NEVER carry a stack trace. The full stack is written to the
  // server-side log only — never echoed to clients, in any environment.
  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[http-error] ${statusCode} ${req.method} ${req.originalUrl} — ${error.message}`);
    if (error.stack) {
      // eslint-disable-next-line no-console
      console.error(error.stack);
    }
  }

  const body = {
    success: false,
    message: error.message || 'Internal Server Error',
  };
  if (error.errors) body.errors = error.errors;

  return res.status(statusCode).json(body);
};

module.exports = { errorHandler };
