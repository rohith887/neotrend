import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip as MuiTooltip,
  Typography,
  useTheme,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from 'recharts';
import PageHeader from '../ui/PageHeader.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fetchSupervisorReports } from '../api/supervisor.js';
import {
  AppCard,
  AppDialog,
  AppIconButton,
  DataTable,
  FilterSelect,
  SecondaryButton,
  SearchField,
  StatusChip,
} from '../ui/mui/index.js';

/* ==========================================================================
   Reports — analytics workspace.
   Existing data from GET /supervisor/reports. No invented metrics.

   Metric definitions (from supervisor.controller.listReports):
   - calls          — interactions logged for the advisor in the period
   - dispositions   — interactions with a disposition saved
   - conversions    — interactions tagged dispositionPriority P1/P2
   - conversionRate — conversions / calls
   ========================================================================== */

const DATE_RANGES = ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Quarter to Date'];

/* Activity Report event → StatusChip tone, so the feed is scannable at a
   glance instead of every row reading as identical plain text. Matches the
   full EVENT_LABELS vocabulary from supervisor.controller.js. */
const ACTIVITY_EVENT_TONE = {
  'Lead Fetched': 'info',
  'Disposition Saved': 'success',
  'Callback Completed': 'success',
  'Break Started': 'warning',
  'Break Ended': 'neutral',
  'Application Updated': 'info',
  'Shortlist Updated': 'info',
  'Lifecycle Changed': 'violet',
};

/* A Mongo ObjectId's first 4 bytes (8 hex chars) encode its creation time —
   the same trick the `time` column's sort `accessor` below already uses.
   Reading it back out gives an exact date with no extra API field needed. */
const dateFromObjectId = (id) =>
  typeof id === 'string' && id.length >= 8 ? new Date(parseInt(id.slice(0, 8), 16) * 1000) : null;

/* ── Report definitions (original columns) ────────────────────────────── */
const REPORT_DEFS = [
  {
    id: 'advisor-performance',
    label: 'Advisor Performance',
    dataKey: 'advisorPerformance',
    filters: ['dateRange', 'agent'],
    searchKey: 'name',
    searchPlaceholder: 'Search advisors…',
    emptyText: 'No performance data for the selected period.',
    hideHeader: true,
    columns: [
      { key: 'name',           label: 'Advisor',         sortable: true,  bold: true },
      { key: 'calls',          label: 'Calls',           sortable: true,  num: true  },
      { key: 'dispositions',   label: 'Dispositions',    sortable: true,  num: true  },
      { key: 'conversions',    label: 'Conversions',     sortable: true,  num: true  },
      { key: 'conversionRate', label: 'Conversion %',    sortable: true,  num: true  },
      { key: 'avgDuration',    label: 'Avg Handle Time', sortable: true,  num: true  },
      { key: 'qaScore',        label: 'QA Score',        sortable: true,  num: true  },
    ],
  },
  {
    id: 'lead-conversion',
    label: 'Lead Conversion',
    dataKey: 'advisorPerformance',
    filters: ['dateRange', 'agent'],
    searchKey: 'name',
    searchPlaceholder: 'Search advisors…',
    emptyText: 'No conversion data for the selected period.',
    hideHeader: true,
    initialSortKey: 'conversions',
    initialSortDir: 'desc',
    columns: [
      { key: 'name',           label: 'Advisor',        sortable: true, bold: true },
      { key: 'calls',          label: 'Calls',          sortable: true, num: true  },
      { key: 'dispositions',   label: 'Dispositions',   sortable: true, num: true  },
      { key: 'conversions',    label: 'Conversions',    sortable: true, num: true  },
      { key: 'conversionRate', label: 'Conversion %',   sortable: true, num: true  },
    ],
  },
  {
    id: 'call-analytics',
    label: 'Call Analytics',
    dataKey: 'advisorPerformance',
    filters: ['dateRange', 'agent'],
    searchKey: 'name',
    searchPlaceholder: 'Search advisors…',
    emptyText: 'No call data for the selected period.',
    hideHeader: true,
    initialSortKey: 'calls',
    initialSortDir: 'desc',
    columns: [
      { key: 'name',         label: 'Advisor',         sortable: true, bold: true },
      { key: 'calls',        label: 'Calls',           sortable: true, num: true  },
      { key: 'dispositions', label: 'Dispositions',    sortable: true, num: true  },
      { key: 'conversions',  label: 'Conversions',     sortable: true, num: true  },
      { key: 'avgDuration',  label: 'Avg Handle Time', sortable: true, num: true  },
    ],
  },
  {
    id: 'break-report',
    label: 'Break Report',
    dataKey: 'breakReport',
    filters: ['dateRange', 'agent'],
    searchKey: 'agent',
    searchPlaceholder: 'Search agents…',
    emptyText: 'No breaks recorded for the selected period.',
    hideHeader: true,
    columns: [
      { key: 'agent',    label: 'Agent',       sortable: true,  bold: true },
      { key: 'type',     label: 'Break Type',  sortable: true               },
      { key: 'started',  label: 'Started',     sortable: true,  num: true, summable: false },
      { key: 'ended',    label: 'Ended',       sortable: false, num: true, summable: false },
      { key: 'duration', label: 'Duration',    sortable: true,  num: true  },
      { key: 'exceeded', label: 'Exceeded',    sortable: true               },
    ],
  },
  {
    id: 'activity-report',
    label: 'Activity Report',
    dataKey: 'activityReport',
    filters: ['dateRange', 'agent'],
    searchKey: 'agent',
    searchPlaceholder: 'Search agents…',
    emptyText: 'No activity recorded for the selected period.',
    hideHeader: true,
    initialSortKey: 'time',
    initialSortDir: 'desc',
    columns: [
      { key: 'agent',  label: 'Agent',  sortable: true, bold: true },
      {
        key: 'event',
        label: 'Event',
        sortable: true,
        render: (_v, row) => (
          <StatusChip
            status={row.event}
            tone={ACTIVITY_EVENT_TONE[row.event] || 'neutral'}
            size="small"
            sx={{ height: 22, fontSize: 11.5 }}
          />
        ),
      },
      { key: 'queue',  label: 'Queue',  sortable: true              },
      {
        key: 'time',
        label: 'Time',
        sortable: true,
        num: true,
        // Only sort order / right-alignment, never the footer summary — a
        // clock time like "7:18 pm" is not a quantity to add up.
        summable: false,
        accessor: (row) =>
          typeof row.id === 'string' && row.id.length >= 8 ? parseInt(row.id.slice(0, 8), 16) : 0,
        // The API only sends a time-of-day string (no date) — with "Last
        // Week"/"This Month" etc. spanning multiple days, two rows at the
        // same clock time on different days would otherwise be
        // indistinguishable. The row's own id already encodes its exact
        // creation date, so read it back rather than adding an API field.
        render: (_v, row) => {
          const d = dateFromObjectId(row.id);
          const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
          return dateStr ? `${dateStr}, ${row.time}` : row.time;
        },
      },
      {
        key: 'detail',
        label: 'Detail',
        sortable: false,
        render: (_v, row) => {
          const raw = row.detail;
          if (!raw || raw === '—') return '—';
          // activityDetail() on the server joins "<leadRef> · <disposition>"
          // with this exact separator only for DISPOSITION_SAVED rows —
          // split it back out so the outcome reads as a status pill instead
          // of flat text indistinguishable from a bare lead code.
          const parts = raw.split(' · ');
          if (parts.length === 2) {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'text.secondary', flexShrink: 0 }}>
                  {parts[0]}
                </Typography>
                <StatusChip status={parts[1]} size="small" dot={false} sx={{ height: 20, fontSize: 10.5 }} />
              </Box>
            );
          }
          return raw;
        },
      },
    ],
  },
  {
    id: 'quality-scores',
    label: 'Quality Report',
    dataKey: 'qualityScores',
    filters: ['dateRange', 'agent'],
    searchKey: 'name',
    searchPlaceholder: 'Search agents…',
    emptyText: 'No quality data for the selected period.',
    hideHeader: true,
    columns: [
      { key: 'name',         label: 'Agent',          sortable: true,  bold: true },
      { key: 'qaScore',      label: 'QA Score',       sortable: true,  num: true  },
      { key: 'reviewedCalls',label: 'Reviewed Calls', sortable: true,  num: true  },
      { key: 'rating',       label: 'Rating',         sortable: true              },
    ],
  },
  {
    id: 'time-share',
    label: 'Time Share',
    dataKey: 'timeShare',
    filters: ['dateRange', 'agent'],
    searchKey: 'name',
    searchPlaceholder: 'Search agents…',
    emptyText: 'No time-share data for the selected period.',
    hideHeader: true,
    columns: [
      { key: 'name',        label: 'Agent',      sortable: true,  bold: true },
      { key: 'loggedIn',    label: 'Login Time', sortable: true,  num: true  },
      { key: 'callTime',    label: 'Talk Time',  sortable: true,  num: true  },
      { key: 'breakTime',   label: 'Break Time', sortable: true,  num: true  },
      { key: 'idleTime',    label: 'Idle Time',  sortable: true,  num: true  },
      {
        key: 'utilization',
        label: 'Occupancy',
        sortable: true,
        num: true,
        render: (v) =>
          v === '—' || v == null || v === '' ? (
            <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 2, bgcolor: 'action.hover', color: 'text.disabled', fontSize: 12, fontWeight: 600 }}>
              —
            </Box>
          ) : (
            <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 2, bgcolor: 'primary.soft', color: 'primary.main', fontSize: 12, fontWeight: 700 }}>
              {v}%
            </Box>
          ),
      },
      {
        key: 'dist',
        label: 'Distribution',
        sortable: false,
        skipExport: true,
        render: (v, row) => <TimeShareBar row={row} />,
      },
    ],
  },
];

/* ── CSV export ───────────────────────────────────────────────────────── */
function exportCsv(report, rows) {
  const cols = report.columns.filter((c) => !c.skipExport);
  const header = cols.map((c) => c.label).join(',');
  const body = rows.map((r) =>
    cols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');
  const blob = new Blob([`${header}\r\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${report.id}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ── Export dropdown button ──────────────────────────────────────────── */
function ExportButton({ size = 'small', onExport }) {
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  const close = (cb) => () => {
    setAnchor(null);
    cb();
  };

  return (
    <Box>
      <SecondaryButton
        size={size}
        aria-haspopup="menu"
        aria-expanded={open}
        startIcon={<FileDownloadIcon sx={{ fontSize: 15 }} />}
        endIcon={<ArrowDropDownIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        Export
      </SecondaryButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={close(onExport)}>Export as CSV</MenuItem>
        <MenuItem onClick={close(onExport)}>Export as Excel</MenuItem>
        <MenuItem onClick={close(onExport)}>Export as PDF</MenuItem>
      </Menu>
    </Box>
  );
}

/* ── Advisor bar chart — compact horizontal bars ────────────────────── */
const CHART_ROW_H = 34;
const CHART_VIEWPORT_H = 190;

function AdvisorBarChart({ rows, loading, config }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { valueKey, valueName, compute, formatTick } = config;

  const data = useMemo(
    () => [...rows]
      .sort((a, b) => {
        const va = compute ? compute(a) : Number(a[valueKey]) || 0;
        const vb = compute ? compute(b) : Number(b[valueKey]) || 0;
        return vb - va;
      })
      .map((r) => ({
        name: r.name,
        value: compute ? compute(r) : Number(r[valueKey]) || 0,
      })),
    [rows, valueKey, compute]
  );

  if (loading && data.length === 0) {
    return (
      <Box sx={{ height: CHART_VIEWPORT_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: 'text.secondary' }}>
        Loading…
      </Box>
    );
  }
  if (data.length === 0) return null;

  const height = Math.max(data.length * CHART_ROW_H + 16, CHART_VIEWPORT_H);
  const truncate = (s) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);

  return (
    <Box
      sx={{
        height: CHART_VIEWPORT_H,
        overflowY: 'auto',
        overflowX: 'hidden',
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'action.disabled', borderRadius: 3 },
      }}
    >
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
            <CartesianGrid horizontal={false} stroke={theme.palette.divider} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tickFormatter={formatTick}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={116}
              tick={{ fontSize: 11.5, fill: theme.palette.text.primary }}
              axisLine={false}
              tickLine={false}
              tickFormatter={truncate}
            />
            <RTooltip
              cursor={{ fill: theme.palette.action.hover }}
              formatter={(v) => [formatTick ? formatTick(v) : v, valueName]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: 'none',
                padding: '6px 10px',
              }}
            />
            <Bar dataKey="value" name={valueName} fill={primary} barSize={14} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
    </Box>
  );
}

/* ── Call trend chart — time-series from performance.last7Days ──────── */
const TREND_VIEWPORT_H = 240;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function CallTrendChart({ series, loading }) {
  const theme = useTheme();
  const blue = theme.palette.primary.main;
  const green = theme.palette.success.main;

  const fmtDay = (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    if (!y || !m || !d) return String(key);
    return `${d} ${MONTHS_SHORT[m - 1]}`;
  };

  if (loading && (!series || series.length === 0)) {
    return (
      <Box
        sx={{
          height: TREND_VIEWPORT_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12.5,
          color: 'text.secondary',
        }}
      >
        Loading…
      </Box>
    );
  }
  if (!series || series.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={TREND_VIEWPORT_H}>
      <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDay}
          tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
          axisLine={false}
          tickLine={false}
          minTickGap={12}
          padding={{ left: 8, right: 8 }}
        />
        <YAxis
          allowDecimals={false}
          width={34}
          tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
          axisLine={false}
          tickLine={false}
        />
        <RTooltip
          cursor={{ stroke: theme.palette.divider }}
          labelFormatter={fmtDay}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: 'none',
            padding: '6px 10px',
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
        <Line
          type="monotone"
          dataKey="calls"
          name="Total Calls"
          stroke={blue}
          strokeWidth={2}
          dot={{ r: 2.5, fill: blue, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="connected"
          name="Connected"
          stroke={green}
          strokeWidth={2}
          dot={{ r: 2.5, fill: green, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Advisor detail dialog ──────────────────────────────────────────── */
function AdvisorDetailDialog({ row, onClose }) {
  if (!row) return null;
  const cells = [
    ['Calls', row.calls],
    ['Dispositions', row.dispositions],
    ['Conversions', row.conversions],
    ['Conversion %', row.conversionRate],
    ['Avg Handle Time', row.avgDuration],
    ['QA Score', row.qaScore],
  ];
  return (
    <AppDialog open onClose={onClose} title={row.name} subtitle="Advisor performance" maxWidth="xs">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          columnGap: 2,
          rowGap: 1.5,
        }}
      >
        {cells.map(([label, value]) => (
          <Box key={label} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
              {label}
            </Typography>
            <Typography sx={{ mt: 0.25, fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {value ?? '—'}
            </Typography>
          </Box>
        ))}
      </Box>
    </AppDialog>
  );
}

/* ── Time Share helpers ─────────────────────────────────────────────── */
const toMinutes = (str) => {
  if (typeof str !== 'string' || str === '—') return 0;
  let total = 0;
  const h = str.match(/(\d+)h/);
  if (h) total += parseInt(h[1], 10) * 60;
  const m = str.match(/(\d+)m/);
  if (m) total += parseInt(m[1], 10);
  const s = str.match(/(\d+)s/);
  if (s) total += parseInt(s[1], 10) / 60;
  return Math.round(total);
};

const TALK_COLOR = '#4f8ef7';
const BREAK_COLOR = '#f7b500';
const IDLE_COLOR = '#bdbdbd';

function TimeShareBar({ row }) {
  const talk = toMinutes(row.callTime);
  const brk = toMinutes(row.breakTime);
  const idle = toMinutes(row.idleTime);
  const total = talk + brk + idle;
  const pct = (v) => (total > 0 ? (v / total) * 100 : 0);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 150, maxWidth: 240 }}>
      <MuiTooltip
        title={`Talk ${talk}m · Break ${brk}m${idle > 0 ? ` · Idle ${idle}m` : ''}`}
        arrow
      >
        <Box
          sx={{
            flex: 1, height: 9, borderRadius: 5, overflow: 'hidden',
            display: 'flex', bgcolor: 'action.hover', minWidth: 96,
          }}
        >
          <Box sx={{ width: `${pct(talk)}%`, bgcolor: TALK_COLOR }} />
          <Box sx={{ width: `${pct(brk)}%`, bgcolor: BREAK_COLOR }} />
          <Box sx={{ width: `${pct(idle)}%`, bgcolor: IDLE_COLOR }} />
        </Box>
      </MuiTooltip>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap', fontSize: 11, color: 'text.secondary' }}>
        <Box component="span" sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: TALK_COLOR, display: 'inline-block' }} />
        <span>{talk}m</span>
        <Box component="span" sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: BREAK_COLOR, display: 'inline-block' }} />
        <span>{brk}m</span>
      </Box>
    </Box>
  );
}

/* ── Summary footer ─────────────────────────────────────────────────── */
function SummaryFooter({ report, rows }) {
  if (rows.length === 0) return null;
  if (report.id === 'time-share') {
    const totalTalk = rows.reduce((s, r) => s + toMinutes(r.callTime), 0);
    const totalBreak = rows.reduce((s, r) => s + toMinutes(r.breakTime), 0);
    const occs = rows.map((r) => r.utilization).filter((v) => v !== '—' && v != null && v !== '');
    const avgOcc = occs.length ? Math.round(occs.reduce((a, b) => a + Number(b), 0) / occs.length) : null;
    const fmtM = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
    return (
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
        {rows.length} Advisors | {fmtM(totalTalk)} Talk | {fmtM(totalBreak)} Break | Avg Occupancy {avgOcc != null ? `${avgOcc}%` : '—'}
      </Typography>
    );
  }
  let text = `Summary · ${rows.length} record${rows.length !== 1 ? 's' : ''}`;
  report.columns.forEach((col, ci) => {
    // `num` drives right-alignment and sort order for clock-time columns
    // (e.g. "7:18 pm") too — those are marked `summable: false` so this
    // summary never sums their digits into a meaningless total.
    if (ci === 0 || !col.num || col.summable === false) return;
    const numVals = rows
      .map((r) => parseFloat(String(r[col.key] ?? '').replace(/[^0-9.]/g, '')))
      .filter((v) => !isNaN(v));
    if (numVals.length === 0) return;
    const isRate = String(rows[0]?.[col.key] ?? '').includes('%');
    const avg = numVals.reduce((s, v) => s + v, 0) / numVals.length;
    const sum = numVals.reduce((s, v) => s + v, 0);
    const display = isRate
      ? `${avg.toFixed(1)}% avg`
      : Number.isInteger(sum) ? `${sum} total` : `${avg.toFixed(1)} avg`;
    text += ` | ${display}`;
  });
  return (
    <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
      {text}
    </Typography>
  );
}

/* ── Chart configuration per tab ────────────────────────────────────── */
const CHART_CONFIGS = {
  'advisor-performance': {
    title: 'Advisor Call Performance',
    caption: 'Advisors ranked by calls handled · highest first',
    valueKey: 'calls',
    valueName: 'Calls',
  },
  'lead-conversion': {
    title: 'Conversion by Advisor',
    caption: 'Advisors ranked by conversions · highest first',
    valueKey: 'conversions',
    valueName: 'Conversions',
  },
};

/* ── Main page ──────────────────────────────────────────────────────── */
export default function Reports({ reportId }) {
  const { push } = useToast();

  const activeId = REPORT_DEFS.some((r) => r.id === reportId) ? reportId : REPORT_DEFS[0].id;
  const [dateRange,   setDateRange]   = useState('This Week');
  const [agentFilter, setAgentFilter] = useState('all');
  const [search,      setSearch]      = useState('');
  const [detailRow,   setDetailRow]   = useState(null);
  const [view,        setView]        = useState('table');

  // When the report route changes, reset per-report UI state so filters,
  // search and view don't leak from one report into the next.
  useEffect(() => {
    setAgentFilter('all');
    setSearch('');
    setView('table');
    setDetailRow(null);
  }, [activeId]);

  const fetcher = useCallback(async () => {
    return await fetchSupervisorReports(dateRange);
  }, [dateRange]);

  // "Today"/"This Week" are week/day-to-date windows that reset to genuinely
  // empty at the start of each period (most visibly right after a week
  // rolls over, before any calls have been logged yet) — not a sign anything
  // is broken. Make that explicit instead of showing a bare "no data" that
  // reads the same as an actual failure.
  const freshRangeHint = (dateRange === 'Today' || dateRange === 'This Week')
    ? ' No calls logged yet in this period — try "Last Week" or "This Month" to see recent activity.'
    : '';

  // Reports must always reflect the latest backend data. The shared cache can
  // hold a stale payload from an earlier session/backend state (e.g. activity
  // rows with unresolved agent names), so fetch fresh on every mount and
  // whenever the date range changes — never from cache.
  const [reportsData, setReportsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchNonce, setFetchNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((res) => {
        if (cancelled) return;
        const normalized = res?.activityReport
          ? {
              ...res,
              activityReport: res.activityReport.map((row) => ({
                ...row,
                agent: row.agent ?? row.name ?? row.userName ?? row.actorName ?? '—',
              })),
            }
          : res;
        setReportsData(normalized);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || 'Failed to load data');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetcher, fetchNonce]);

  const refetch = useCallback(() => setFetchNonce((n) => n + 1), []);

  const refresh = async () => {
    await refetch();
    push('Report refreshed', 'success');
  };

  const def = REPORT_DEFS.find((r) => r.id === activeId) ?? REPORT_DEFS[0];
  const report = { ...def, data: reportsData?.[def.dataKey] ?? [] };

  const agentOptions = useMemo(() => {
    const names = [...new Set(report.data.map((r) => r.name ?? r.agent).filter(Boolean))];
    return names;
  }, [report]);

  const rows = useMemo(() => {
    let list = report.data;
    if (agentFilter !== 'all') {
      list = list.filter((r) => (r.name ?? r.agent) === agentFilter);
    }
    return list;
  }, [report, agentFilter]);

  const searchRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !report.searchKey) return rows;
    return rows.filter((r) => String(r[report.searchKey] ?? '').toLowerCase().includes(q));
  }, [rows, search, report.searchKey]);

  const tableColumns = useMemo(
    () =>
      report.columns.map((c) => ({
        key: c.key,
        label: c.label,
        sortable: c.sortable,
        strong: c.bold,
        align: c.num ? 'right' : undefined,
        render: c.render,
        accessor: c.accessor,
      })),
    [report]
  );

  const needsFilter = (key) => report.filters.includes(key);

  const chartConfig = CHART_CONFIGS[activeId] ?? null;
  const chartKind = activeId === 'call-analytics' ? 'trend' : chartConfig ? 'bar' : null;

  const trendSeries = useMemo(() => {
    if (activeId !== 'call-analytics') return [];
    const perf = reportsData?.performance ?? [];
    const row = agentFilter === 'all'
      ? perf.find((p) => p.id === 'all' || p.name === 'All Agents')
      : perf.find((p) => p.name === agentFilter);
    return row?.last7Days ?? [];
  }, [activeId, reportsData, agentFilter]);

  const viewSwitch = chartKind ? (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={view}
      onChange={(e, v) => { if (v) setView(v); }}
      aria-label="Report view"
      sx={{
        flexShrink: 0,
        '& .MuiToggleButton-root': {
          py: 0.35,
          px: 1.75,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.4,
          textTransform: 'none',
          border: 1,
          borderColor: 'divider',
          '&.Mui-selected': {
            bgcolor: 'primary.soft',
            borderColor: 'divider',
            color: 'primary.main',
            '&:hover': { bgcolor: 'primary.soft' },
          },
        },
      }}
    >
      <ToggleButton value="table" aria-label="Table view">Table</ToggleButton>
      <ToggleButton value="chart" aria-label="Chart view">Chart</ToggleButton>
    </ToggleButtonGroup>
  ) : null;

  const reportToolbar = (
    <Box
      sx={{
        flexShrink: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 0.75,
        px: 1,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
        {viewSwitch}
        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={report.searchPlaceholder}
          fullWidth={false}
          sx={{ width: { xs: '100%', sm: 220 }, '& .MuiOutlinedInput-root': { minHeight: 30 } }}
        />
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          Total Records: {searchRows.length}
        </Typography>

        {needsFilter('dateRange') && (
          <FilterSelect
            label="Date range"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            options={DATE_RANGES.map((d) => ({ value: d, label: d }))}
            sx={{ minWidth: 132, height: 30 }}
          />
        )}
        {needsFilter('agent') && agentOptions.length > 0 && (
          <FilterSelect
            label="Advisor"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Advisors' },
              ...agentOptions.map((a) => ({ value: a, label: a })),
            ]}
            sx={{ minWidth: 148, maxWidth: 200, height: 30 }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <AppIconButton title="Refresh" ariaLabel="Refresh report" onClick={refresh}>
          <RefreshIcon fontSize="small" />
        </AppIconButton>
        <ExportButton onExport={() => exportCsv(report, rows)} />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      <PageHeader
        title={report.label}
      />

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, flexShrink: 0 }}
          action={
            <SecondaryButton size="small" onClick={refresh}>
              Retry
            </SecondaryButton>
          }
        >
          {error}
        </Alert>
      )}

        <AppCard
          sx={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flex: 1,
            minHeight: 0,
          }}
          contentSx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {reportToolbar}

        <Box
          sx={{
            display: chartKind && view === 'chart' ? 'none' : 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          <DataTable
            key={activeId}
            columns={tableColumns}
            data={searchRows}
            loading={loading}
            dense
            initialPageSize={100}
            pageSizeOptions={[25, 50, 100]}
            initialSortKey={report.initialSortKey ?? report.columns[0]?.key}
            initialSortDir={report.initialSortDir ?? 'asc'}
            emptyTitle=""
            emptyText={(report.emptyText ?? 'No records match the current filters.') + freshRangeHint}
            onRowClick={activeId === 'advisor-performance' ? setDetailRow : undefined}
            tfoot={<SummaryFooter report={report} rows={searchRows} />}
          />
        </Box>

        {chartKind && view === 'chart' && (
          <Box sx={{ px: 2, pt: 1.25, pb: 1.5 }}>
            {chartKind === 'trend' ? (
              <>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mb: 0.75 }}>
                  {agentFilter === 'all'
                    ? 'Team call activity per day · trailing 7 days (fixed window)'
                    : `${agentFilter} — call activity per day · trailing 7 days (fixed window)`}
                </Typography>
                {(loading || trendSeries.length > 0) ? (
                  <CallTrendChart series={trendSeries} loading={loading} />
                ) : (
                  <Box
                    sx={{
                      height: TREND_VIEWPORT_H,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12.5,
                      color: 'text.secondary',
                    }}
                  >
                    No call activity data available.{freshRangeHint}
                  </Box>
                )}
              </>
            ) : (
              <>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mb: 0.75 }}>
                  {chartConfig.caption}
                </Typography>
                {(loading || rows.length > 0) ? (
                  <AdvisorBarChart rows={rows} loading={loading} config={chartConfig} />
                ) : (
                  <Box
                    sx={{
                      height: CHART_VIEWPORT_H,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12.5,
                      color: 'text.secondary',
                    }}
                  >
                    {report.emptyText}{freshRangeHint}
                  </Box>
                )}
              </>
            )}
          </Box>
        )}
      </AppCard>

      <AdvisorDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
    </Box>
  );
}
