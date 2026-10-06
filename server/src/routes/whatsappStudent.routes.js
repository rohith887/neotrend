const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/whatsappStudent.controller');
const { validate } = require('../middleware/validate');
const { whatsappStudentSubmitRules } = require('../validation/whatsappStudent.validation');

const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many submissions. Please try again later.' },
});

/* ── Public WhatsApp student form submission (no auth) ──────────── */
router.post('/', publicSubmitLimiter, whatsappStudentSubmitRules, validate, controller.submitWhatsAppStudent);

module.exports = router;