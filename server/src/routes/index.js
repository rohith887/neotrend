const router = require('express').Router();

router.use('/auth',         require('./auth.routes'));
router.use('/users',        require('./user.routes'));
router.use('/audit',        require('./audit.routes'));
router.use('/supervisor',   require('./supervisor.routes'));
router.use('/breaks',       require('./break.routes'));
router.use('/dispositions', require('./disposition.routes'));
router.use('/interactions', require('./interaction.routes'));
router.use('/leads',        require('./lead.routes'));
router.use('/whatsapp',     require('./whatsapp.routes'));
router.use('/lookups',      require('./lookup.routes'));
router.use('/activity',     require('./activity.routes'));
router.use('/agent',        require('./agent.routes'));
router.use('/agent/dashboard', require('./dashboard.routes'));
router.use('/counselor',    require('./counselor.routes'));
router.use('/payments',     require('./payment.routes'));
router.use('/documents',    require('./document.routes'));
router.use('/universities', require('./university.routes'));
router.use('/applications', require('./application.routes'));
router.use('/referrals',    require('./referral.routes'));
router.use('/whatsapp-students', require('./whatsappStudent.routes'));
router.use('/calls',        require('./call.routes'));

// Phase 6 operational infrastructure (tasks / SLA).
router.use('/tasks',        require('./task.routes'));

// Per-user notifications (task alerts + supervisor @mentions).
router.use('/notifications', require('./notification.routes'));

// Logout-control (break-exceed / logout-blocked / supervisor override).
router.use('/logout', require('./logout.routes'));

module.exports = router;
