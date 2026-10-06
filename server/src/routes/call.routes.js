const router = require('express').Router();
const controller = require('../controllers/call.controller');
const { protect } = require('../middleware/auth');
const { allowPermissions, allowRoles } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { startCallRules, reportStatusRules } = require('../validation/call.validation');

// Read-only telephony health (booleans + field names only, no secrets).
router.get('/config', protect, allowRoles('SUPERVISOR', 'AGENT', 'COUNSELOR'), controller.configStatus);

// The CALLING USER's own browser-phone WSS + SIP credentials (authed session;
// never bundled into the client). Must precede /:callId.
router.get('/sip-config', protect, allowRoles('SUPERVISOR', 'AGENT', 'COUNSELOR'), controller.sipConfig);

// Agent click-to-call. In the default browser-origination mode the server
// persists the Call record and returns the dial string; the agent's SIP.js
// softphone then dials the student. With CALL_ORIGINATOR=ami the same endpoint
// originates the leg server-side over AMI.
router.post('/start', protect, allowPermissions('lead:fetch'), startCallRules, validate, controller.startCall);

// The agent's OWN still-live call, if any (server truth — survives client
// reloads; must be declared BEFORE the /:callId route).
router.get('/active', protect, allowPermissions('lead:fetch'), controller.getActiveForCaller);

// End whatever live call the agent actually has on the server (authoritative
// fallback when the client lost its in-memory call id). Must precede /:callId.
router.post('/end-active', protect, allowPermissions('lead:fetch'), controller.endActiveCall);

router.get('/:callId', protect, allowPermissions('lead:fetch'), controller.getStatus);

// Lifecycle reported BY the agent's own softphone for a browser-originated call
// (ringing / answered / connected / terminal outcome). No-op for gateway calls.
router.post('/:callId/status', protect, allowPermissions('lead:fetch'), reportStatusRules, validate, controller.reportStatus);

router.post('/:callId/end', protect, allowPermissions('lead:fetch'), controller.endCall);

module.exports = router;