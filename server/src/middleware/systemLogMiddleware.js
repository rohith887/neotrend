const crypto = require('crypto');

/**
 * systemLogMiddleware — request-id plumbing for the SystemLog audit trail.
 *
 * Generic per-request API logging is intentionally NOT performed here. The
 * System Logs page records only important Agent/Counselor business events
 * (view email/mobile, lead opened/updated, disposition submitted, remarks,
 * calls, breaks, WhatsApp, logins) — never routine UI/API activity.
 *
 * What this middleware does is generate a stable request id (`req._tasaRequestId`)
 * for every request so controllers that emit business events can stamp all rows
 * produced by a single request with the same correlation id.
 */

const requestIdFor = (req) => {
  const header = req.headers['x-request-id'];
  if (header) return String(header).slice(0, 64);
  if (!req._tasaRequestId) {
    req._tasaRequestId = `REQ-${crypto.randomBytes(8).toString('hex')}`;
  }
  return req._tasaRequestId;
};

// Any Express handler can read the current request's correlation id.
const requestIdFrom = (req) => req._tasaRequestId || '';

const systemLogMiddleware = (req, res, next) => {
  requestIdFor(req);
  return next();
};

module.exports = systemLogMiddleware;
module.exports.requestIdFrom = requestIdFrom;