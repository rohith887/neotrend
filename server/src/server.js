const app = require('./app');
const config = require('./config');
const { connectDB } = require('./config/database');
const { ensureDefaultDispositions } = require('./services/disposition.service');
const telephonyService = require('./services/telephony.service');
const mongoose = require('mongoose');

const start = async () => {
  try {
    await connectDB();
    console.log("Registered Models:");
console.log(mongoose.modelNames());
    await ensureDefaultDispositions();

    // Outbound calls are placed by the agent's OWN browser softphone over WSS
    // (default), so no server-side PBX socket is opened at all. Set
    // CALL_ORIGINATOR=ami to boot the legacy Asterisk AMI bridge instead
    // (non-blocking — it reconnects in the background forever).
    if (config.telephony.originator === 'ami') {
      if (config.telephony.isConfigured) {
        telephonyService.init();
        console.log(`AMI telephony bridge starting (${config.telephony.ami.host}:${config.telephony.ami.port})`);
      } else {
        console.log('CALL_ORIGINATOR=ami but AMI is not configured — call origination will be unavailable');
      }
    } else {
      console.log('Browser-originated calls (CALL_ORIGINATOR=browser) — no AMI bridge is started');
    }

    app.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`TASA CRM API running on http://localhost:${config.port} (${config.nodeEnv})`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

const shutdown = (signal) => {
  // eslint-disable-next-line no-console
  console.log(`${signal} received — shutting down AMI telephony bridge...`);
  try {
    telephonyService.shutdown();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('AMI shutdown error:', err.message);
  }
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
