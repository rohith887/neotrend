/* ══════════════════════════════════════════════════════════════════════
   Performance Summary — derivation of the dashboard's performance table
   data from the /agent/dashboard/report payload.

   The server resolves every period boundary in the configured business
   timezone and returns canonical per-period values (`report.periods`) for:
     today / yesterday / last7Days / day1…day6 / thisWeek / lastWeek /
     thisMonth / lastMonth, each with calls / connected / p1 / qualified.
   Day 1…Day 6 are the calendar dates of the current Monday–Saturday working
   week (Sunday excluded); days that have not happened yet carry 0 because no
   interactions can fall inside their windows. thisWeek/lastWeek are the
   current/previous Monday–Saturday working week — never a rolling 7-day or
   Sunday-start window. All mapping below reads the payload directly; this
   file performs no client-side date arithmetic, so browser/local timezones
   can never shift a value between days. If the payload has no `periods`, the
   shape returns zeros rather than guessing dates from another source.
   ══════════════════════════════════════════════════════════════════════ */

const NONE = {
  today: 0, yesterday: 0, last7Days: 0,
  day1: 0, day2: 0, day3: 0, day4: 0, day5: 0, day6: 0,
  thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0,
};

const buildMetric = (periods, field) => {
  if (!periods) return NONE;
  const pick = (key) => periods[key]?.[field] ?? 0;
  return {
    today: pick('today'),
    yesterday: pick('yesterday'),
    last7Days: pick('last7Days'),
    day1: pick('day1'),
    day2: pick('day2'),
    day3: pick('day3'),
    day4: pick('day4'),
    day5: pick('day5'),
    day6: pick('day6'),
    thisWeek: pick('thisWeek'),
    lastWeek: pick('lastWeek'),
    thisMonth: pick('thisMonth'),
    lastMonth: pick('lastMonth'),
  };
};

export const buildDashboardPerformance = (report) => {
  const periods = report?.periods || null;
  return {
    totalCalls: buildMetric(periods, 'calls'),
    connectedCalls: buildMetric(periods, 'connected'),
    qualifiedLeads: buildMetric(periods, 'qualified'),
    p1Created: buildMetric(periods, 'p1'),
    todayDayKey: report?.todayDayKey ?? null,
  };
};