const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const config = require('./config');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const systemLogMiddleware = require('./middleware/systemLogMiddleware');
const ApiError = require('./utils/ApiError');

const app = express();

app.use(helmet());
// CORS is path-aware: the public WhatsApp intake endpoints (POST /api/leads/whatsapp,
// POST /api/whatsapp-students, duplicate-mobile GET /api/leads/check-mobile, and the
// /api/referrals/public pages) must accept requests from any origin (standalone forms
// opened from WhatsApp, any static host, Meta webhooks). All other routes stay
// restricted to the CRM client origin.
app.use((req, res, next) => {
  const isPublicIntake = req.path === '/api/leads/whatsapp'
    || req.path === '/api/leads/check-mobile'
    || req.path === '/api/whatsapp-students'
    || req.path.startsWith('/api/referrals/public');
  cors(isPublicIntake ? {} : { origin: config.clientUrl, credentials: true })(req, res, next);
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv !== 'test') app.use(morgan('dev'));

// Audit trail — records every /api request into the SystemLog store.
app.use(systemLogMiddleware);

app.get('/api/health', (req, res) =>
  res.json({ success: true, message: 'TASA CRM API is healthy', data: { uptime: process.uptime() } })
);

app.use('/api', routes);

/* ── SPA fallback ─────────────────────────────────────────────── */
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) {
    return next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((req, res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`)));
app.use(errorHandler);

module.exports = app;
