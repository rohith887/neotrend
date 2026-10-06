const Break = require('../models/Break');
const Activity = require('../models/Activity');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { parseListQuery } = require('../middleware/paginate');

const roundUpMinutes = (ms) => Math.max(1, Math.ceil(ms / 60000));

// Break policy — the single source of truth for permitted break lengths.
// Agents/Counselors have exactly 3 scheduled breaks per working day: Morning
// Tea 15 min, Lunch 60 min, Evening Tea 15 min. Only these three scheduled
// types generate break-exceed alerts; every other type is unscheduled and
// never alerts. The supervisor break report reads this same map so the
// "Exceeded" flag and the alerts can never disagree.
const BREAK_ALLOWANCE_MINUTES = {
  'Morning Tea Break': 15,
  'Lunch Break': 60,
  'Evening Tea Break': 15,
  'Tea Break': 15,
  'Bio Break': 10,
  'Meeting / Briefing': 15,
  Training: 30,
  'Personal Break': 15,
  Other: 15,
};

const BREAK_ALERT_ELIGIBLE = new Set(['Morning Tea Break', 'Lunch Break', 'Evening Tea Break']);

const isBreakExceeded = (breakDoc) =>
  breakDoc &&
  breakDoc.status === 'completed' &&
  breakDoc.durationMinutes != null &&
  BREAK_ALERT_ELIGIBLE.has(breakDoc.type) &&
  breakDoc.durationMinutes > BREAK_ALLOWANCE_MINUTES[breakDoc.type];

const writeActivity = async (userId, type, breakDoc) => {
  await Activity.create({
    user: userId,
    type,
    metadata: new Map([
      ['breakId', String(breakDoc._id)],
      ['breakType', breakDoc.type],
    ]),
  });
};

const startBreak = async (userId, { type, note }) => {
  const active = await Break.findOne({ user: userId, status: 'active' });
  if (active) {
    throw new ApiError(409, 'You already have an active break in progress');
  }

  const breakDoc = await Break.create({
    user: userId,
    type,
    note: note || undefined,
    startedAt: new Date(),
    status: 'active',
  });

  await User.updateOne({ _id: userId }, { $set: { availability: 'break' } });
  await writeActivity(userId, 'BREAK_IN', breakDoc);

  return breakDoc;
};

const endBreak = async (userId) => {
  const breakDoc = await Break.findOne({ user: userId, status: 'active' });
  if (!breakDoc) {
    throw new ApiError(400, 'No active break to end');
  }

  const endedAt = new Date();
  breakDoc.endedAt = endedAt;
  breakDoc.durationMinutes = roundUpMinutes(endedAt - breakDoc.startedAt);
  breakDoc.status = 'completed';
  await breakDoc.save();

  await User.updateOne({ _id: userId }, { $set: { availability: 'available' } });
  await writeActivity(userId, 'BREAK_OUT', breakDoc);

  return breakDoc;
};

const getActiveBreak = async (userId) => Break.findOne({ user: userId, status: 'active' });

const listBreaks = async (userId, rawQuery, opts = {}) => {
  const { query: filter, sort, meta } = parseListQuery(rawQuery, ['type', 'status']);
  filter.user = userId;
  if (!opts.includeStatusFilter && filter.status === undefined) filter.status = 'completed';

  const [docs, total] = await Promise.all([
    Break.find(filter)
      .sort(sort)
      .skip(meta.skip)
      .limit(meta.limit)
      .lean(),
    Break.countDocuments(filter),
  ]);

  return { docs, meta: { ...meta, total, pages: Math.ceil(total / meta.limit) } };
};

const summarize = async ({ userId, from, to }) => {
  const match = { user: userId, status: 'completed', endedAt: { $ne: null } };
  if (from) match.endedAt.$gte = new Date(from);
  if (to) match.endedAt.$lte = new Date(to);

  const byType = await Break.aggregate([
    { $match: match },
    { $group: { _id: '$type', count: { $sum: 1 }, totalMinutes: { $sum: '$durationMinutes' } } },
    { $sort: { totalMinutes: -1 } },
  ]);

  const total = await Break.aggregate([
    { $match: match },
    { $group: { _id: null, count: { $sum: 1 }, totalMinutes: { $sum: '$durationMinutes' } } },
  ]);

  const latest = await Break.find(match).sort({ startedAt: -1 }).limit(5).lean();

  return {
    totalCount: total[0]?.count || 0,
    totalMinutes: total[0]?.totalMinutes || 0,
    byType: byType.map((r) => ({
      type: r._id,
      count: r.count,
      totalMinutes: r.totalMinutes,
    })),
    latest,
  };
};

module.exports = {
  startBreak,
  endBreak,
  getActiveBreak,
  listBreaks,
  summarize,
  BREAK_ALLOWANCE_MINUTES,
  BREAK_ALERT_ELIGIBLE,
  isBreakExceeded,
};
