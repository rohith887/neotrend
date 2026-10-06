import { Fragment } from 'react';
import { Box, Chip, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import CallMadeIcon from '@mui/icons-material/CallMade';
import ChecklistIcon from '@mui/icons-material/Checklist';
import HeadsetIcon from '@mui/icons-material/Headset';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { AppCard } from '../../ui/mui/index.js';



// `drilldownMetric` is the server-side metric enum (GET .../report/drilldown)
// each column maps to.
const METRICS = [
  { key: 'totalCalls',      label: 'Total Calls',      icon: <CallMadeIcon sx={{ fontSize: 14 }} />,           tone: 'primary', drilldownMetric: 'calls' },
  { key: 'connectedCalls',  label: 'Calls Connected',  icon: <HeadsetIcon sx={{ fontSize: 14 }} />,            tone: 'success', drilldownMetric: 'connected' },
  { key: 'qualifiedLeads',  label: 'Qualified Leads',  icon: <ChecklistIcon sx={{ fontSize: 14 }} />,          tone: 'info',    drilldownMetric: 'qualified' },
  { key: 'p1Created',       label: 'P1 Created',       icon: <LocalFireDepartmentIcon sx={{ fontSize: 14 }} />, tone: 'danger', drilldownMetric: 'p1' },
];

// day1…day6 are always the calendar dates of the current Monday–Saturday
// working week (Sunday excluded) — see utils/performance.js.
const DAY_PERIODS = [
  { key: 'day1', label: 'Monday' },
  { key: 'day2', label: 'Tuesday' },
  { key: 'day3', label: 'Wednesday' },
  { key: 'day4', label: 'Thursday' },
  { key: 'day5', label: 'Friday' },
  { key: 'day6', label: 'Saturday' },
];

const SUMMARY_PERIODS = [
  { key: 'thisWeek',  label: 'This Week',  divider: true },
  { key: 'lastWeek',  label: 'Last Week' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
];

const PERIODS = [...DAY_PERIODS, ...SUMMARY_PERIODS];

// Weekly/monthly rows are the "summary" group — visually set apart from the
// per-day rows with a subtle divider and slightly emphasized labels.
const SUMMARY_KEYS = new Set(['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth']);

// Reorders the per-day rows so today (when it falls Mon–Sat) is first,
// followed by the rest of the week in normal order, then the weekly/monthly
// summary rows untouched. `todayDayKey` comes from the server (business
// timezone) — never computed from the browser's local date.
const orderPeriods = (todayDayKey) => {
  if (!todayDayKey || !DAY_PERIODS.some((p) => p.key === todayDayKey)) return PERIODS;
  const today = DAY_PERIODS.find((p) => p.key === todayDayKey);
  const rest = DAY_PERIODS.filter((p) => p.key !== todayDayKey);
  return [{ ...today, isToday: true }, ...rest, ...SUMMARY_PERIODS];
};

const TONE = {
  primary: { main: 'primary.main', soft: 'primary.soft' },
  success: { main: 'success.main', soft: 'success.soft' },
  info:    { main: 'info.main',    soft: 'info.soft' },
  danger:  { main: 'error.main',   soft: 'error.soft' },
};

const fmt = (n) => (n ?? 0).toLocaleString('en-GB');

// Comfortable cells — the Agent Dashboard default.
const cell = { px: 1.75, py: 0.875, fontSize: 13.5, lineHeight: 1.25 };

const SummarySkeleton = () => (
  <Box sx={{ px: 2, py: 1 }} role="status" aria-label="Loading performance summary">
    {PERIODS.map((p) => (
      <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
        <Skeleton variant="text" width={70} sx={{ fontSize: 12.5 }} />
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'flex-end' }}>
          {METRICS.map((m) => (
            <Skeleton key={m.key} variant="text" sx={{ fontSize: 12.5, width: 30 }} />
          ))}
        </Box>
      </Box>
    ))}
  </Box>
);


const headCell = {
  py: 0.625,
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'text.disabled',
  whiteSpace: 'nowrap',
  verticalAlign: 'bottom',
  borderBottom: '1px solid',
  borderColor: 'divider',
};

const CompactSummaryTable = ({ data, maxHeight }) => (
  <TableContainer sx={{ height: '100%', minHeight: 0, maxHeight, overflowX: 'hidden', overflowY: 'auto' }}>
    <Table size="small" stickyHeader sx={{ minWidth: 0, width: '100%', tableLayout: 'fixed' }} aria-label="Performance summary">
      <TableHead>
        <TableRow>
          <TableCell sx={{ ...headCell, width: '22%', pl: 1.5, pr: 1 }}>Period</TableCell>
          {METRICS.map((m) => (
            <TableCell key={m.key} align="right" sx={{ ...headCell, width: '19.5%', px: 1 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.375, whiteSpace: 'nowrap' }}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: '4.5px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: TONE[m.tone].soft,
                    color: TONE[m.tone].main,
                  }}
                >
                  {m.icon}
                </Box>
                <Box>{m.label}</Box>
              </Box>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {orderPeriods(data?.todayDayKey).map((p) => {
          const agg = SUMMARY_KEYS.has(p.key);
          return (
            <TableRow
              key={p.key}
              hover
              sx={{
                bgcolor: p.isToday ? 'primary.soft' : agg ? 'action.hover' : 'transparent',
                ...(p.isToday && { '& > th, & > td': { borderLeft: '2px solid', borderLeftColor: 'primary.main' } }),
                ...(p.divider && { '& > th, & > td': { borderTop: '1px solid', borderTopColor: 'divider' } }),
              }}
            >
              <TableCell
                component="th"
                scope="row"
                sx={{
                  pl: p.isToday ? 1.25 : 1.5,
                  pr: 1,
                  py: 0.55,
                  fontSize: 12,
                  fontWeight: p.isToday ? 700 : agg ? 650 : 500,
                  color: p.isToday ? 'primary.main' : agg ? 'text.primary' : 'text.secondary',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.label}
                {p.isToday && (
                  <Box component="span" sx={{
                    ml: 0.625, px: 0.5, py: '1px', borderRadius: '999px', fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.03em', textTransform: 'uppercase', bgcolor: 'primary.main', color: '#fff',
                  }}>
                    Today
                  </Box>
                )}
              </TableCell>
              {METRICS.map((m) => (
                <TableCell
                  key={m.key}
                  align="right"
                  sx={{
                    px: 1,
                    py: 0.55,
                    fontSize: 12.5,
                    fontWeight: p.isToday ? 700 : agg ? 650 : 500,
                    color: p.isToday ? 'primary.main' : agg ? 'text.primary' : 'text.secondary',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmt(data?.[m.key]?.[p.key])}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </TableContainer>
);

/* ══════════════════════════════════════════════════════════════════════
   DEFAULT — comfortable table used on the Agent Dashboard.
   ══════════════════════════════════════════════════════════════════════ */
const cellClickSx = {
  cursor: 'pointer',
  borderRadius: 1,
  transition: 'background-color 100ms ease',
  '&:hover': { bgcolor: 'primary.soft' },
};

const ComfortableSummaryTable = ({ data, maxHeight, onCellClick }) => (
  <TableContainer sx={{ height: '100%', minHeight: 0, maxHeight, overflowX: 'auto', overflowY: 'auto' }}>
    <Table size="small" stickyHeader sx={{ minWidth: 0, tableLayout: 'auto' }} aria-label="Performance summary">
      <TableHead>
        <TableRow>
          <TableCell sx={{ ...cell, fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Period</TableCell>
          {METRICS.map((m) => (
            <TableCell key={m.key} align="right" sx={{ ...cell, whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: '5px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: TONE[m.tone].soft,
                    color: TONE[m.tone].main,
                  }}
                >
                  {m.icon}
                </Box>
                <Box sx={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{m.label}</Box>
              </Box>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {orderPeriods(data?.todayDayKey).map((p) => (
          <Fragment key={p.key}>
            {p.divider && (
              <TableRow sx={{ '& td': { borderBottom: '1px solid', borderColor: 'divider', py: 0.4, px: 0 } }}>
                <TableCell colSpan={1 + METRICS.length} />
              </TableRow>
            )}
            <TableRow
              hover
              sx={{
                bgcolor: p.isToday ? 'primary.soft' : 'transparent',
                ...(p.isToday && { '& > th, & > td': { borderLeft: '2px solid', borderLeftColor: 'primary.main' } }),
              }}
            >
              <TableCell
                component="th"
                scope="row"
                sx={{
                  ...cell,
                  pl: p.isToday ? 1.375 : cell.px,
                  whiteSpace: 'nowrap',
                  fontWeight: p.isToday ? 700 : SUMMARY_KEYS.has(p.key) ? 600 : 400,
                  color: p.isToday ? 'primary.main' : 'text.primary',
                }}
              >
                {p.label}
                {p.isToday && (
                  <Box component="span" sx={{
                    ml: 0.75, px: 0.625, py: '2px', borderRadius: '999px', fontSize: 9.5, fontWeight: 700,
                    letterSpacing: '0.03em', textTransform: 'uppercase', bgcolor: 'primary.main', color: '#fff',
                  }}>
                    Today
                  </Box>
                )}
              </TableCell>
              {METRICS.map((m) => (
                <TableCell
                  key={m.key}
                  align="right"
                  onClick={() => onCellClick?.({ period: p.key, periodLabel: p.label, metric: m.drilldownMetric, metricLabel: m.label })}
                  sx={{ ...cell, fontVariantNumeric: 'tabular-nums', fontWeight: p.isToday ? 700 : 400, color: p.isToday ? 'primary.main' : 'text.primary', ...(onCellClick ? cellClickSx : {}) }}
                >
                  {fmt(data?.[m.key]?.[p.key])}
                </TableCell>
              ))}
            </TableRow>
          </Fragment>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);


export default function PerformanceSummaryTable({ data = null, loading = false, actions, tableMaxHeight = 400, filter = null, compact = false, onCellClick = null }) {
  const periodChip = compact && !loading && data ? (
    <Chip size="small" label={`${PERIODS.length} periods`} sx={{ height: 20, fontSize: 11 }} />
  ) : undefined;

  return (
    <AppCard
      title="Performance Summary"
      icon={<TrendingUpIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
      actions={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {filter}
          {actions ?? periodChip}
        </Box>
      }
      sx={{ width: '100%', minWidth: 0, boxShadow: 'none' }}
      contentSx={compact ? { p: 0 } : undefined}
    >
      {loading ? (
        <SummarySkeleton />
      ) : !data ? (
        <Box sx={{ textAlign: 'center', py: 3, px: 1.5 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 36,
              height: 36,
              mx: 'auto',
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'primary.soft',
              color: 'primary.main',
            }}
          >
            <TrendingUpIcon sx={{ fontSize: 18 }} />
          </Box>
          <Typography variant="h6" component="h4" sx={{ mt: 1, fontSize: 13.5 }}>
            No performance data yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: 12.5 }}>
            Once you start logging calls, your activity across time periods will appear here.
          </Typography>
        </Box>
      ) : compact ? (
        <CompactSummaryTable data={data} maxHeight={tableMaxHeight} />
      ) : (
        <ComfortableSummaryTable data={data} maxHeight={tableMaxHeight} onCellClick={onCellClick} />
      )}
    </AppCard>
  );
}