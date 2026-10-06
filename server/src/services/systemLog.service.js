const crypto = require('crypto');
const SystemLog = require('../models/SystemLog');

/**
 * systemLog.service — fire-and-forget structured logging for the CRM.
 * Emits business events into the SystemLog store so supervisors can audit
 * Agent/Counselor/Supervisor activity. Logging never throws or blocks the request.
 *
 * Scope: only AGENT, COUNSELOR, and SUPERVISOR activity is recorded. Generic
 * per-request API logging is intentionally absent, and events whose actor is
 * any other role are dropped here.
 * Events without a resolvable role (e.g. a failed login against an unknown
 * account) still pass through so login attempts stay visible.
 */

const ALLOWED_ROLES = new Set(['AGENT', 'COUNSELOR', 'SUPERVISOR']);
const ALLOWED_ROLES_LIST = ['AGENT', 'COUNSELOR', 'SUPERVISOR'];

const generateLogId = () =>
  `LOG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const logEvent = (entry = {}) => {
  const {
    level = 'INFO',
    module = 'system',
    action = '',
    username = '',
    userId = '',
    role = '',
    leadId = '',
    leadName = '',
    message = '',
    apiPath = '',
    statusCode,
    durationMs,
    ipAddress = '',
    requestId = '',
    exception = '',
    stackTrace = '',
    metadata = null,
  } = entry;

  const normalizedRole = role != null ? String(role).toUpperCase() : '';

  // Scope gate: record CRM staff activity. A missing role is only allowed for
  // events without an actor, such as failed logins against unknown accounts.
  if (normalizedRole && !ALLOWED_ROLES.has(normalizedRole)) {
    return;
  }

  const doc = {
    logId: generateLogId(),
    timestamp: new Date(),
    level,
    module,
    action,
    username,
    userId: userId != null ? String(userId) : '',
    role: normalizedRole,
    leadId: leadId != null ? String(leadId) : '',
    leadName: leadName != null ? String(leadName) : '',
    message,
    apiPath,
    statusCode,
    durationMs,
    ipAddress,
    requestId,
    exception: exception || (metadata && typeof metadata === 'object' && metadata.exception) || '',
    stackTrace,
    metadata: metadata ?? null,
  };

  // Best-effort write — a logging failure must never take down a request.
  try {
    SystemLog.create(doc).catch(() => {});
  } catch (err) {
    /* swallow */
  }
};

module.exports = { logEvent, generateLogId, ALLOWED_ROLES_LIST };