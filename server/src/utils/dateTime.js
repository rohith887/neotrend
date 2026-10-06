const { businessTimezone } = require('../config');

// DAY BOUNDS
// Local midnight / end-of-day in the business timezone, expressed as UTC
// Date objects. All interaction timestamps are stored in UTC; converting the
// business-day boundaries to UTC lets every module filter identical rows.
const startOfDayInTz = (date, tz = businessTimezone) => {
  const local = new Date(new Date(date).toLocaleString('en-US', { timeZone: tz }));
  local.setHours(0, 0, 0, 0);
  return local;
};

const endOfDayInTz = (date, tz = businessTimezone) => {
  const end = startOfDayInTz(date, tz);
  end.setHours(23, 59, 59, 999);
  return end;
};

// { start, end } for the current business "today".
const todayBounds = (tz = businessTimezone) => {
  const now = new Date();
  return { start: startOfDayInTz(now, tz), end: endOfDayInTz(now, tz) };
};

// YYYY-MM-DD key for a Date in the business timezone. Must agree with
// MongoDB's $dateToString timezone bucketing so JS-side day-by-day grouping
// (buildPerfDays) and the DB aggregation place every call on the same day.
const dateKeyInTz = (date, tz = businessTimezone) => {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

// { start, end } for the "start of today" common with any range resolution
// that ends today (used by last-7-days aggregates: from N-6 days ago 00:00
// business TZ through the end of today).
const startOfDayNDaysAgoInTz = (daysAgo, tz = businessTimezone) => {
  const now = new Date();
  const start = startOfDayInTz(now, tz);
  start.setDate(start.getDate() - daysAgo);
  return start;
};

// ── Business-timezone local↔UTC clock helpers ─────────────────────
// Used to compute range boundaries in the business calendar regardless of the
// server's own timezone (server may run in any TZ; business TZ is canonical).

// UTC offset (minutes) of a timezone at the given instant.
const offsetMinutesAt = (tz, date) => {
  const wall = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  return (wall.getTime() - date.getTime()) / 60000;
};

// Build a UTC Date from business-local clock components.
const localClockToUtc = (tz, y, mo, d, h = 0, mi = 0, s = 0, ms = 0) => {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  return new Date(naive - offsetMinutesAt(tz, new Date(naive)) * 60000);
};

// Business-local Y/M/D components for an instant.
const localYmd = (date, tz = businessTimezone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(date));
  const get = (t) => parseInt(parts.find((p) => p.type === t)?.value, 10);
  return { y: get('year'), mo: get('month'), d: get('day') };
};

// Business-local weekday index (0=Sun … 6=Sat) for an instant in the business
// calendar. Week-range math (Reports "This Week"/"Last Week", Agent Dashboard
// periods) must use this — never localYmd().d, which is the day of month.
const localWeekday = (date, tz = businessTimezone) => {
  const { y, mo, d } = localYmd(date, tz);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
};

// Add N calendar days in the business calendar, returning a UTC Date at local
// midnight of the shifted day.
const addLocalDays = (date, n, tz = businessTimezone) => {
  const { y, mo, d } = localYmd(date, tz);
  const base = new Date(Date.UTC(y, mo - 1, d)); // naive local midnight
  base.setUTCDate(base.getUTCDate() + n);
  return localClockToUtc(
    tz,
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate()
  );
};

// ── Working week (Monday–Saturday) and calendar-month windows ────────
// The call centre's working week runs Monday→Saturday; Sunday is excluded
// from the daily Performance Summary rows. All boundaries are expressed as
// UTC instants of the business-timezone calendar, so 00:00:00 belongs to the
// day it starts and 23:59:59.999 belongs to the day it ends — no UTC shift.

// { days[6], thisWeek, lastWeek } for the current working week. days[0] is
// Monday … days[5] is Saturday; on a Sunday the "current" working week is the
// Monday–Saturday that just ended. Each bound is a { start, end } pair.
const workingWeekWindows = (now, tz = businessTimezone) => {
  const dow = localWeekday(now, tz); // 0=Sun … 6=Sat
  const sinceMonday = (dow + 6) % 7; // calendar days since the week's Monday
  const monday = addLocalDays(now, -sinceMonday); // business-local midnight, Monday
  const days = [];
  for (let i = 0; i < 6; i += 1) {
    const d = addLocalDays(monday, i);
    days.push({ start: startOfDayInTz(d, tz), end: endOfDayInTz(d, tz) });
  }
  return {
    days,
    thisWeek: { start: days[0].start, end: days[5].end },
    lastWeek: {
      start: startOfDayInTz(addLocalDays(monday, -7), tz),
      end: endOfDayInTz(addLocalDays(monday, -2), tz),
    },
  };
};

// { thisMonth, lastMonth } calendar-month windows: thisMonth runs from the 1st
// of the current business month through today; lastMonth is the whole previous
// calendar month.
const monthWindows = (now, tz = businessTimezone) => {
  const { d } = localYmd(now, tz);
  const firstThisMonth = addLocalDays(now, -(d - 1)); // business-local 1st of the month
  const lastDayLastMonth = addLocalDays(firstThisMonth, -1);
  const prev = localYmd(lastDayLastMonth, tz);
  const firstLastMonth = addLocalDays(lastDayLastMonth, -(prev.d - 1));
  return {
    thisMonth: { start: startOfDayInTz(firstThisMonth, tz), end: endOfDayInTz(now, tz) },
    lastMonth: {
      start: startOfDayInTz(firstLastMonth, tz),
      end: endOfDayInTz(lastDayLastMonth, tz),
    },
  };
};

module.exports = {
  businessTimezone,
  startOfDayInTz,
  endOfDayInTz,
  todayBounds,
  dateKeyInTz,
  startOfDayNDaysAgoInTz,
  offsetMinutesAt,
  localClockToUtc,
  localYmd,
  localWeekday,
  addLocalDays,
  workingWeekWindows,
  monthWindows,
};
