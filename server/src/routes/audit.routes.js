const router = require('express').Router();
const controller = require('../controllers/audit.controller');
const { protect } = require('../middleware/auth');

// Client-initiated audit events (View Email/Mobile, call state changes, etc.).
// Any authenticated role may record an event; the actor identity is always
// resolved server-side from the request, never from the client payload.
router.post('/event', protect, controller.recordEvent);

module.exports = router;