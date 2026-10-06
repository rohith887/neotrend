const mongoose = require('mongoose');

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
const LOG_MODULES = ['crud', 'auth', 'workflow', 'system', 'api', 'telephony'];
const RETENTION_SECONDS = 90 * 24 * 60 * 60; // 90 days

const systemLogSchema = new mongoose.Schema(
  {
    logId: { type: String, required: true, unique: true },
    timestamp: { type: Date, required: true, default: Date.now },
    level: { type: String, enum: LOG_LEVELS, required: true, default: 'INFO', index: true },
    module: { type: String, enum: LOG_MODULES, required: true, default: 'system', index: true },
    action: { type: String, default: '', index: true },
    username: { type: String, default: '', index: true },
    // Actor identity for the audit trail — userId/role let supervisors
    // filter "who did this" without relying on display-name strings.
    userId: { type: String, default: '', index: true },
    role: { type: String, default: '', index: true },
    // Lead/student context. NOTE: only the id + student name are stored here —
    // contact values (email/phone) are deliberately never written to logs.
    leadId: { type: String, default: '', index: true },
    leadName: { type: String, default: '' },
    message: { type: String, default: '' },
    apiPath: { type: String, default: '' },
    statusCode: { type: Number },
    durationMs: { type: Number },
    ipAddress: { type: String, default: '' },
    requestId: { type: String, default: '', index: true },
    exception: { type: String, default: '' },
    stackTrace: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

systemLogSchema.index({ module: 1, timestamp: -1 });
systemLogSchema.index({ level: 1, timestamp: -1 });
systemLogSchema.index({ role: 1, timestamp: -1 });
systemLogSchema.index({ userId: 1, timestamp: -1 });
systemLogSchema.index({ leadId: 1, timestamp: -1 });
// TTL — old logs expire automatically after the retention window.
systemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

module.exports = mongoose.model('SystemLog', systemLogSchema);
module.exports.LOG_LEVELS = LOG_LEVELS;
module.exports.LOG_MODULES = LOG_MODULES;