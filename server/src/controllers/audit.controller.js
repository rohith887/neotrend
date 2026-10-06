/**
 * Audit controller — client-initiated business events.
 *
 *   POST /api/audit/event — record an action that happens purely in the UI
 *   (e.g. View Email / View Mobile reveal, simulated call start/end, opening
 *   the WhatsApp composer) into the SystemLog store.
 *
 * The actor identity is NEVER trusted from the client. userId / username /
 * role / ip / requestId are always derived server-side from the authenticated
 * request, so a client cannot impersonate another user in the audit trail.
 * Only the action vocabulary, module, message and non-sensitive context
 * (leadId/leadName/metadata) come from the payload.
 */
const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { logEvent } = require('../services/systemLog.service');
const notificationService = require('../services/notification.service');

const ALLOWED_MODULES = ['crud', 'auth', 'workflow'];
const ALLOWED_LEVELS = ['INFO', 'WARN'];
const OBJECT_ID_RX = /^[a-f0-9]{24}$/i;

// Privacy protection: revealing a candidate's masked email/mobile is a
// PII-access event every supervisor needs visibility into, same broadcast
// path as break-exceeded/drop-request.
const PII_REVEAL_ACTIONS = {
  VIEW_MOBILE: 'Mobile',
  VIEW_EMAIL: 'Email',
};

const actorName = (user) => {
  if (!user) return '';
  const named = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return named || user.email || user.username || '';
};

const recordEvent = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  const action = String(body.action || '').trim().slice(0, 200);
  if (!action) throw new ApiError(400, 'action is required');

  const module = String(body.module || 'workflow').toLowerCase();
  if (!ALLOWED_MODULES.includes(module)) {
    throw new ApiError(400, `module must be one of: ${ALLOWED_MODULES.join(', ')}`);
  }

  const requestedLevel = String(body.level || 'INFO').toUpperCase();
  const level = ALLOWED_LEVELS.includes(requestedLevel) ? requestedLevel : 'INFO';

  const leadId = String(body.leadId || '');
  const leadCandidate = OBJECT_ID_RX.test(leadId) ? leadId : '';

  const metadata =
    body.metadata && typeof body.metadata === 'object' ? body.metadata : null;

  const requestId =
    String(req.headers['x-request-id'] || req._tasaRequestId || '')
      .slice(0, 64) ||
    `REQ-${crypto.randomBytes(8).toString('hex')}`;

  const leadName = String(body.leadName || '').trim().slice(0, 160);
  const message = String(body.message || action).trim().slice(0, 500);

  logEvent({
    level,
    module,
    action,
    username: actorName(req.user),
    userId: req.user ? String(req.user._id) : '',
    role: req.role ? String(req.role.name || '').toUpperCase() : '',
    leadId: leadCandidate,
    leadName,
    message,
    ipAddress: req.ip,
    requestId,
    metadata,
  });

  const piiField = PII_REVEAL_ACTIONS[action];
  if (piiField && req.user) {
    notificationService
      .notifyAllSupervisors({
        type: 'contact-viewed',
        title: `${piiField} viewed`,
        body: message,
        lead: leadCandidate || null,
        sender: req.user._id,
        targetUser: req.user._id,
        meta: {
          targetName: actorName(req.user),
          targetRole: req.role ? String(req.role.name || '').toUpperCase() : '',
          senderName: actorName(req.user),
          leadStudent: leadName,
          field: piiField,
        },
      })
      .catch(() => {});
  }

  return success(res, { accepted: true }, 'Audit event recorded');
});

module.exports = { recordEvent };