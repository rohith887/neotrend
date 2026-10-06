/**
 * System Log controller — supervisor-facing audit log store.
 *
 *   GET /api/supervisor/system-logs    — paginated, filterable log listing
 *   GET /api/supervisor/system-log/meta — filter vocabulary (levels/modules/actions)
 *   GET /api/supervisor/system-log/export — CSV / plain-text dump of current filters
 *
 * Every route is gated by report:read in the route file.
 */
const SystemLog = require('../models/SystemLog');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const { toCsv } = require('../utils/toCsv');
const { ALLOWED_ROLES_LIST } = require('../services/systemLog.service');

// The audit trail covers CRM staff activity. Unknown-role rows remain visible.
const AUDITED_ROLES = ALLOWED_ROLES_LIST;
const ROLE_SCOPE = { $in: [...AUDITED_ROLES, ''] };

const LOG_LEVELS = SystemLog.LOG_LEVELS || ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
const LOG_MODULES = SystemLog.LOG_MODULES || ['crud', 'auth', 'workflow', 'system', 'api'];
const BUSINESS_MODULES = LOG_MODULES.filter((m) => m !== 'api');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildFilter = (query) => {
  const filter = {};

  const level = String(query.level || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => LOG_LEVELS.includes(s));
  if (level.length === 1) filter.level = level[0];
  else if (level.length > 1) filter.level = { $in: level };

  const module = String(query.module || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => LOG_MODULES.includes(s));

  // Source type toggle: api requests vs business events vs everything.
  const type = String(query.type || 'all').toLowerCase();
  if (type === 'api') filter.module = 'api';
  else if (type === 'business') {
    filter.module = BUSINESS_MODULES.length === 1 ? BUSINESS_MODULES[0] : { $in: BUSINESS_MODULES };
  } else if (module.length === 1) filter.module = module[0];
  else if (module.length > 1) filter.module = { $in: module };

  if (query.action) filter.action = String(query.action);

  // Audit filters — "who" (role / user) and "which lead". With no role chosen
  // the store is scoped to Agent/Counselor rows (+ unknown-actor login rows).
  if (query.role) filter.role = String(query.role).toUpperCase();
  else filter.role = ROLE_SCOPE;
  if (query.userId) filter.userId = String(query.userId);
  if (query.leadId) filter.leadId = String(query.leadId);

  if (query.from || query.to) {
    filter.timestamp = {};
    if (query.from && !isNaN(Date.parse(query.from))) filter.timestamp.$gte = new Date(query.from);
    if (query.to && !isNaN(Date.parse(query.to))) filter.timestamp.$lte = new Date(query.to);
  }

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [
      { message: rx },
      { username: rx },
      { action: rx },
      { apiPath: rx },
      { requestId: rx },
      { logId: rx },
      { exception: rx },
      { role: rx },
      { leadId: rx },
      { leadName: rx },
    ];
  }

  return filter;
};

const countByLevel = async (filter) => {
  const rows = await SystemLog.aggregate([
    { $match: filter },
    { $group: { _id: '$level', count: { $sum: 1 } } },
  ]);
  const counts = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
  rows.forEach((r) => { if (counts[r._id] !== undefined) counts[r._id] = r.count; });
  return counts;
};

const listLogs = asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);

  const [total, logs, counts, fresh] = await Promise.all([
    SystemLog.countDocuments(filter),
    SystemLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    countByLevel(filter),
    SystemLog.countDocuments(),
  ]);

  return success(res, logs, 'System logs fetched', 200, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    counts: { total, ...counts },
    storeTotal: fresh,
  });
});

// Distinct actors recorded in the store, newest first. Optional role narrows
// the list so the UI can cascade Role → User. Bound to keep the endpoint cheap.
const buildUsers = (role) => {
  const match = { userId: { $nin: ['', null] }, role: { $in: AUDITED_ROLES } };
  if (role && role !== 'ALL') match.role = role;
  return SystemLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$userId',
        username: { $last: '$username' },
        role: { $last: '$role' },
        lastSeen: { $max: '$timestamp' },
      },
    },
    { $sort: { lastSeen: -1 } },
    { $limit: 500 },
  ]);
};

// Distinct leads recorded in the store, newest first. Cascades with the
// selected role and/or user so the supervisor can drill Role → User → Lead.
const buildLeads = (role, userId) => {
  const match = { leadId: { $nin: ['', null] }, role: { $in: AUDITED_ROLES } };
  if (userId) match.userId = userId;
  else if (role && role !== 'ALL') match.role = role;
  return SystemLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$leadId',
        name: { $last: '$leadName' },
        lastSeen: { $max: '$timestamp' },
      },
    },
    { $sort: { lastSeen: -1 } },
    { $limit: 500 },
  ]);
};

const getMeta = asyncHandler(async (req, res) => {
  const roleQ = String(req.query.role || '').toUpperCase();
  const userIdQ = String(req.query.userId || '');

  const [levels, modules, actions, users, leads] = await Promise.all([
    SystemLog.distinct('level'),
    SystemLog.distinct('module'),
    SystemLog.distinct('action'),
    buildUsers(roleQ),
    buildLeads(roleQ, userIdQ),
  ]);

  const knownActors = users.map((u) => ({
    userId: String(u._id),
    username: String(u.username || ''),
    role: String(u.role || ''),
    lastSeen: u.lastSeen || null,
  }));

  const knownLeads = leads.map((l) => ({
    leadId: String(l._id),
    leadName: String(l.name || ''),
  }));

  return success(res, {
    levels: LOG_LEVELS,
    modules: LOG_MODULES,
    roles: AUDITED_ROLES.slice(),
    users: knownActors,
    leads: knownLeads,
    actions: [...new Set(actions)].filter(Boolean).sort(),
    counts: { total: 0 },
  }, 'Log metadata fetched');
});

const exportLogs = asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  const filter = buildFilter(req.query);
  const max = Math.min(parseInt(req.query.max, 10) || 5000, 20000);

  const logs = await SystemLog.find(filter).sort({ timestamp: -1 }).limit(max).lean();

  if (format === 'txt') {
    const lines = logs.map((l) => {
      const parts = [
        `[${new Date(l.timestamp).toISOString()}]`,
        `[${l.level}]`,
        `[${l.module}]`,
        l.role ? `role=${l.role}` : '',
        l.username ? `user=${l.username}` : '',
        l.leadId ? `lead=${l.leadId}` : '',
        l.action ? `action=${l.action}` : '',
        l.message ? `message=${l.message}` : '',
        l.apiPath ? `path=${l.apiPath}` : '',
        l.statusCode != null ? `status=${l.statusCode}` : '',
        l.durationMs != null ? `duration=${l.durationMs}ms` : '',
        l.requestId ? `requestId=${l.requestId}` : '',
        l.ipAddress ? `ip=${l.ipAddress}` : '',
      ].filter(Boolean);
      return parts.join(' ');
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="system-logs.txt"');
    return res.send(lines.join('\r\n'));
  }

  const columns = [
    { label: 'Log ID', value: (l) => l.logId },
    { label: 'Timestamp', value: (l) => new Date(l.timestamp).toISOString() },
    { label: 'Level', value: (l) => l.level },
    { label: 'Role', value: (l) => l.role },
    { label: 'User', value: (l) => l.username },
    { label: 'User ID', value: (l) => l.userId },
    { label: 'Lead', value: (l) => l.leadName || l.leadId },
    { label: 'Lead ID', value: (l) => l.leadId },
    { label: 'Module', value: (l) => l.module },
    { label: 'Action', value: (l) => l.action },
    { label: 'Message', value: (l) => l.message },
    { label: 'API Path', value: (l) => l.apiPath },
    { label: 'Status Code', value: (l) => (l.statusCode != null ? l.statusCode : '') },
    { label: 'Duration (ms)', value: (l) => (l.durationMs != null ? l.durationMs : '') },
    { label: 'IP Address', value: (l) => l.ipAddress },
    { label: 'Request ID', value: (l) => l.requestId },
    { label: 'Exception', value: (l) => l.exception },
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="system-logs.csv"');
  return res.send(toCsv(logs, columns));
});

module.exports = { listLogs, getMeta, exportLogs };