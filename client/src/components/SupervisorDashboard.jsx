import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import GroupsIcon from '@mui/icons-material/Groups';
import HeadsetIcon from '@mui/icons-material/Headset';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { useToast } from '../context/ToastContext.jsx';
import { useCachedFetch } from '../context/CacheContext.jsx';
import { fetchSupervisorUsers, fetchSupervisorQueues, fetchSupervisorReports, fetchSupervisorDashboardSummary, fetchSupervisorAttention } from '../api/supervisor.js';
import { fetchApplicationsOverview } from '../api/applications.js';
import { fetchReferrals } from '../api/referrals.js';
import { SecondaryButton, AppCard } from '../ui/mui/index.js';
import PerformanceSummaryTable from './dashboard/PerformanceSummaryTable.jsx';
import RoleLeadExplorer from './supervisor/RoleLeadExplorer.jsx';
import CallAssistFeedbackSummary from './supervisor/CallAssistFeedbackSummary.jsx';
// DropRequestsPanel removed — dropping is disposition-driven, no approval.
import { buildDashboardPerformance } from '../utils/performance.js';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
} from 'recharts';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const AVAIL_ORDER = { available: 0, break: 1, offline: 2 };

const STATUS_DONUT_COLORS = ['#0f766e', '#6f42c1', '#0dcaf0', '#ff9f43', '#ff4d4d', '#2eca6a', '#6c757d', '#ffc107'];

const DELTA_SHOW_MS = 30_000;
const SNAPSHOT_KEY = 'superDash:lastVisitSnapshot';
const SNAPSHOT_TS_KEY = 'superDash:lastVisitTime';

/* ═══════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

const initials = (name) =>
  String(name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

const fmtShortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`;
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const userName = (u) => {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
};

/* ═══════════════════════════════════════════════════════════════════
   CUSTOM HOOKS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Tracks "Since Last Visit" deltas.
 * On mount, loads previous snapshot from localStorage, computes deltas.
 * After DELTA_SHOW_MS, saves current state and clears deltas.
 */
function useSinceLastVisit(currentMetrics) {
  const [deltas, setDeltas] = useState(null);
  const savedRef = useRef(null);

  useEffect(() => {
    if (!currentMetrics) return;

    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        const prev = JSON.parse(raw);
        const d = {};
        for (const [k, v] of Object.entries(currentMetrics)) {
          if (typeof v === 'number' && typeof prev[k] === 'number') {
            d[k] = v - prev[k];
          }
        }
        setDeltas(d);
        savedRef.current = false;
      }
    } catch { /* ignore corrupt storage */ }
  }, []);

  useEffect(() => {
    if (!currentMetrics || savedRef.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(currentMetrics));
        localStorage.setItem(SNAPSHOT_TS_KEY, String(Date.now()));
      } catch { /* quota */ }
      savedRef.current = true;
      setDeltas(null);
    }, DELTA_SHOW_MS);
    return () => clearTimeout(t);
  }, [currentMetrics]);

  return deltas;
}

/**
 * Computes operational health state from attention snapshot.
 */
function useHealthState(attention) {
  return useMemo(() => {
    if (!attention) return 'amber';
    const t = attention.tasks ?? {};
    const l = attention.leads ?? {};
    const critical = (t.slaBreached ?? 0) + (t.overdue ?? 0);
    const warnings = (l.unassigned ?? 0) + (l.stalled ?? 0);
    if (critical > 0) return 'red';
    if (warnings > 2) return 'amber';
    return 'green';
  }, [attention]);
}

/* ═══════════════════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   3 · COMPACT APPLICATIONS SUMMARY — inline in Lead Pipeline row
   ═══════════════════════════════════════════════════════════════════ */

const DonutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1, boxShadow: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 600 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: d.payload.fill || d.color }} />
        {d.name}: {d.value}
      </Box>
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   1 · OPERATIONS PULSE — compact KPI strip with deltas + health
   ═══════════════════════════════════════════════════════════════════ */

const HEALTH_META = {
  green:  { label: 'All Systems Operational', color: 'success.main', glow: 'success.light' },
  amber:  { label: 'Attention Recommended',   color: 'warning.main', glow: 'warning.light' },
  red:    { label: 'Action Required Now',      color: 'error.main',   glow: 'error.light' },
};

/* ═══════════════════════════════════════════════════════════════════
   1 · OPERATIONS PULSE — premium enterprise KPI strip
   ═══════════════════════════════════════════════════════════════════ */

const ACCENT = {
  green:   { dot: 'success.main', iconBg: 'rgba(46,202,106,0.08)',  iconColor: 'success.dark' },
  blue:    { dot: 'primary.main', iconBg: 'rgba(15,118,110,0.08)',  iconColor: 'primary.dark' },
  amber:   { dot: 'warning.main', iconBg: 'rgba(255,159,67,0.08)',  iconColor: 'warning.dark' },
  red:     { dot: 'error.main',   iconBg: 'rgba(255,77,77,0.08)',   iconColor: 'error.dark' },
  neutral: { dot: 'text.disabled', iconBg: 'rgba(0,0,0,0.03)',      iconColor: 'text.secondary' },
};

const OperationsPulse = ({ kpis, deltas, health, onKpiClick, lastVisitAt }) => {
  const theme = useTheme();
  const h = HEALTH_META[health] ?? HEALTH_META.amber;

  return (
    <Box>
      {/* Health bar + last visit */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{
            width: 7, height: 7, borderRadius: '50%', bgcolor: h.color,
            boxShadow: `0 0 5px 1.5px ${alpha(theme.palette[health === 'green' ? 'success' : health === 'red' ? 'error' : 'warning'].main, 0.35)}`,
          }} />
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: h.color, letterSpacing: '0.01em' }}>{h.label}</Typography>
        </Box>
        {lastVisitAt && (
          <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
            Last visit: {fmtShortDate(lastVisitAt)}
          </Typography>
        )}
      </Box>

      {/* KPI grid */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' },
        gap: { xs: 0.75, sm: 1 },
      }}>
        {kpis.map((kpi) => {
          const a = ACCENT[kpi.accent] || ACCENT.neutral;
          const delta = deltas?.[kpi.key];
          return (
            <Card
              key={kpi.label}
              component="article"
              elevation={0}
              role="button"
              tabIndex={0}
              aria-label={`${kpi.label}: ${kpi.value}. ${kpi.title}`}
              onClick={() => onKpiClick(kpi)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKpiClick(kpi); } }}
              title={kpi.title}
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                px: 1.5, pt: 1.5, pb: 1.25,
                cursor: 'pointer',
                borderRadius: '12px',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
                '&:hover': {
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  borderColor: alpha(theme.palette.primary.main, 0.25),
                  transform: 'translateY(-1px)',
                },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
              }}
            >
              {/* Icon + label row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <Box aria-hidden="true" sx={{
                  width: 30, height: 30, borderRadius: '8px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: a.iconBg, color: a.iconColor,
                }}>
                  {kpi.icon || null}
                </Box>
                <Box sx={{
                  fontSize: 10.5, fontWeight: 600, color: 'text.secondary',
                  lineHeight: 1.2, letterSpacing: '0.04em', textTransform: 'uppercase',
                  flex: 1,
                }}>
                  {kpi.label}
                </Box>
              </Box>

              {/* Hero number */}
              <Box sx={{
                fontSize: { xs: 26, sm: 28 }, fontWeight: 700, lineHeight: 1,
                letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
                color: 'text.primary', mb: 0.35,
              }}>
                {kpi.value}
              </Box>

              {/* Secondary context */}
              <Box sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.3 }}>
                {kpi.sub}
              </Box>

              {/* Delta badge */}
              {typeof delta === 'number' && delta !== 0 && (
                <Box sx={{
                  position: 'absolute', top: 8, right: 8,
                  fontSize: 9, fontWeight: 700, lineHeight: 1,
                  px: 0.5, py: 0.25, borderRadius: '6px',
                  color: delta > 0 ? 'success.dark' : 'error.dark',
                  bgcolor: delta > 0 ? 'rgba(46,202,106,0.1)' : 'rgba(255,77,77,0.1)',
                }}>
                  {delta > 0 ? '+' : ''}{delta}
                </Box>
              )}

              {/* Subtle accent dot */}
              <Box sx={{
                position: 'absolute', bottom: 8, right: 10,
                width: 5, height: 5, borderRadius: '50%',
                bgcolor: a.dot, opacity: 0.5,
              }} />
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   3 · COMPACT APPLICATIONS SUMMARY — inline in Lead Pipeline row
   ═══════════════════════════════════════════════════════════════════ */

const ApplicationsSummary = () => {
  const fetcher = useCallback(() => fetchApplicationsOverview({ page: 1, limit: 1 }), []);
  const { data, loading } = useCachedFetch('apps-summary', fetcher, { refetchInterval: 60_000 });
  const summary = data?.summary ?? null;
  const total = data?.total ?? 0;

  if (loading && !data) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={16} /></Box>;
  if (!summary) return null;

  if (total === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Box aria-hidden="true" sx={{
          width: 40, height: 40, borderRadius: '50%', mx: 'auto', mb: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'action.hover', color: 'text.disabled',
        }}>
          <AssignmentOutlinedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 650, color: 'text.primary' }}>No Applications Yet</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
          No application activity is available for the selected period.
        </Typography>
      </Box>
    );
  }

  const rows = [
    { label: 'Preparation', value: summary.inPreparation, color: 'info.main' },
    { label: 'Docs Pending', value: summary.awaitingDocuments, color: 'warning.main' },
    { label: 'Ready', value: summary.readyToSubmit, color: 'primary.main' },
    { label: 'Submitted / Review', value: summary.submittedInFlight, color: 'secondary.main' },
    { label: 'Offers', value: summary.offers, color: 'success.main' },
  ];

  return (
    <Box>
      <Box sx={{ fontSize: 22, fontWeight: 700, mb: 1, fontVariantNumeric: 'tabular-nums' }}>{total}</Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {rows.map((r) => (
          <Box key={r.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: r.color, flexShrink: 0 }} />
            <Box sx={{ flex: 1, fontSize: 12, color: 'text.secondary' }}>{r.label}</Box>
            <Box sx={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.value}</Box>
          </Box>
        ))}
      </Box>
      {(summary.awaitingDocuments ?? 0) > 0 && (
        <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider', fontSize: 11, color: 'warning.main', fontWeight: 600 }}>
          {summary.awaitingDocuments} require document action
        </Box>
      )}
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   4 · TEAM LIVE TABLE — compact, polished monitoring panel
   ═══════════════════════════════════════════════════════════════════ */

const EFFECTIVE_STATUS = {
  available: { label: 'Available', soft: 'success.soft', main: 'success.main' },
  busy:      { label: 'Busy',      soft: 'warning.soft', main: 'warning.main' },
  break:     { label: 'On Break',  soft: 'warning.soft', main: 'warning.main' },
  offline:   { label: 'Offline',   soft: 'action.hover', main: 'text.secondary' },
};

const effectiveStatus = (u) => {
  if (u.availability === 'offline' || u.status === 'Suspended') return 'offline';
  if (u.availability === 'break') return 'break';
  if (u.currentLead) return 'busy';
  return 'available';
};

const EFFECTIVE_ACTIVITY = {
  available: { label: 'Idle',    color: 'text.secondary' },
  busy:      { label: 'On Call', color: 'warning.main'   },
  break:     { label: 'Break',   color: 'warning.main'   },
  offline:   { label: '—',       color: 'text.disabled'  },
};

const TeamLiveTable = ({ rows }) => {
  const theme = useTheme();
  if (rows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 5 }}>
        <GroupsIcon sx={{ fontSize: 22, color: 'text.disabled' }} />
        <Box sx={{ mt: 1, fontSize: 13, color: 'text.secondary' }}>No team members found.</Box>
      </Box>
    );
  }
  return (
    <TableContainer sx={{ maxHeight: 320, overflowX: 'auto', '&::-webkit-scrollbar': { height: 4, width: 4 }, '& .MuiTableCell-root:first-of-type': { pl: 1.25 }, '& .MuiTableCell-root:last-of-type':  { pr: 1.25 } }}>
      <Table size="small" stickyHeader sx={{ width: '100%', minWidth: 0, tableLayout: 'fixed' }} aria-label="Team live">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: '38%', px: '1.25 !important', py: 0.5, fontWeight: 700, fontSize: 10.5, color: 'text.secondary', letterSpacing: 0.04, borderBottom: '1px solid', borderColor: 'divider' }}>Team Member</TableCell>
            <TableCell sx={{ width: '22%', px: '1.25 !important', py: 0.5, fontWeight: 700, fontSize: 10.5, color: 'text.secondary', letterSpacing: 0.04, borderBottom: '1px solid', borderColor: 'divider' }}>Status</TableCell>
            <TableCell sx={{ width: '16%', px: '1.25 !important', py: 0.5, fontWeight: 700, fontSize: 10.5, color: 'text.secondary', letterSpacing: 0.04, borderBottom: '1px solid', borderColor: 'divider' }}>Activity</TableCell>
            <TableCell sx={{ width: '24%', px: '1.25 !important', py: 0.5, fontWeight: 700, fontSize: 10.5, color: 'text.secondary', letterSpacing: 0.04, borderBottom: '1px solid', borderColor: 'divider', textAlign: 'right' }}>Current Lead</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((u) => {
            const statusKey = effectiveStatus(u);
            const status = EFFECTIVE_STATUS[statusKey];
            const activity = EFFECTIVE_ACTIVITY[statusKey];
            const offline = statusKey === 'offline';
            const onCall  = statusKey === 'busy';
            return (
              <TableRow
                key={u.id}
                hover
                sx={{
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                  ...(statusKey === 'break' && { bgcolor: alpha(theme.palette.warning.main, 0.04) }),
                }}
              >
                <TableCell sx={{ px: '1.25 !important', py: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.875, minWidth: 0 }}>
                    <Avatar
                      sx={{
                        width: 24, height: 24, fontSize: 10, fontWeight: 700,
                        bgcolor: offline ? 'action.hover' : 'primary.soft',
                        color: offline ? 'text.disabled' : 'primary.main',
                        flexShrink: 0,
                      }}
                    >
                      {initials(u.name)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        noWrap
                        sx={{
                          fontSize: 13,
                          fontWeight: 650,
                          lineHeight: 1.25,
                          color: offline ? 'text.disabled' : 'text.primary',
                        }}
                      >
                        {u.name}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>

                <TableCell sx={{ px: '1.25 !important', py: 0.5 }}>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 0.625,
                      px: 0.875, py: 0.25, borderRadius: '999px',
                      bgcolor: status.soft, color: status.main,
                      fontSize: 11.5, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap',
                    }}
                  >
                    <Box
                      aria-hidden="true"
                      sx={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        bgcolor: status.main,
                        ...(onCall && { animation: 'pulse 2s ease-in-out infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } } }),
                      }}
                    />
                    {status.label}
                  </Box>
                </TableCell>

                <TableCell sx={{ px: '1.25 !important', py: 0.5 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: activity.color, whiteSpace: 'nowrap' }}>
                    {activity.label}
                  </Typography>
                </TableCell>

                <TableCell sx={{ px: '1.25 !important', py: 0.5, textAlign: 'right' }}>
                  {u.currentLead ? (
                    <Tooltip title={`${u.currentLead.name} (${u.currentLead.ref})`} arrow placement="top">
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.5,
                          px: 0.875, py: 0.25, borderRadius: 1,
                          bgcolor: 'primary.soft', color: 'primary.main',
                          fontSize: 11.5, fontWeight: 600, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                          lineHeight: 1.3,
                          maxWidth: '100%',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'default',
                        }}
                      >
                        <CallReceivedIcon sx={{ fontSize: 12, flexShrink: 0 }} />
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.currentLead.ref}
                        </Box>
                      </Box>
                    </Tooltip>
                  ) : (
                    <Typography component="span" sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT — SUPERVISOR DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */

export default function SupervisorDashboard({ onNavigate }) {
  const theme = useTheme();
  const { push } = useToast();
  const [summaryRole, setSummaryRole] = useState('All');
  const [summaryIndividual, setSummaryIndividual] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [lastVisitAt, setLastVisitAt] = useState(() => {
    try { return localStorage.getItem(SNAPSHOT_TS_KEY); } catch { return null; }
  });

  /* ── Fetchers ── */
  const fetchUsers = useCallback(async () => {
    const result = await fetchSupervisorUsers();
    return result;
  }, []);

  const fetchQueues = useCallback(async () => {
    const result = await fetchSupervisorQueues();
    return result;
  }, []);

  const fetchReports = useCallback(async () => {
    const result = await fetchSupervisorReports('Today');
    return result;
  }, []);

  const fetchDashboardSummary = useCallback(async () => {
    const result = await fetchSupervisorDashboardSummary();
    return result;
  }, []);

  const fetchReferralsData = useCallback(async () => {
    const { referrals } = await fetchReferrals({ page: 1, limit: 10, sort: '-createdAt' });
    return referrals;
  }, []);

  const fetchAttention = useCallback(async () => {
    const result = await fetchSupervisorAttention();
    return result;
  }, []);

  /* ── Data hooks — tiered polling ──
       Very Live:  5s  (agent status, calls)
       Operational: 10s (attention, queues, summary, apps)
       Analytics:  30s (reports, referrals) */
  const { data: usersRaw, error: usersErr, loading: usersLoading, refetch: refetchUsers } = useCachedFetch(
    'supervisor-users', fetchUsers, { refetchInterval: 5000 }
  );
  const { data: queuesRaw, error: queuesErr, loading: queuesLoading, refetch: refetchQueues } = useCachedFetch(
    'supervisor-queues', fetchQueues, { refetchInterval: 10000 }
  );
  const { data: reportsRaw, error: reportsErr, loading: reportsLoading, refetch: refetchReports } = useCachedFetch(
    'supervisor-reports', fetchReports, { refetchInterval: 30000 }
  );
  const { data: summaryRaw, error: summaryErr, loading: summaryLoading, refetch: refetchSummary } = useCachedFetch(
    'supervisor-dashboard-summary', fetchDashboardSummary, { refetchInterval: 10000 }
  );
  const { data: referralsRaw, error: referralsErr, loading: referralsLoading, refetch: refetchReferrals } = useCachedFetch(
    'supervisor-dashboard-referrals', fetchReferralsData, { refetchInterval: 30000 }
  );
  const { data: attentionRaw, refetch: refetchAttention } = useCachedFetch(
    'supervisor-attention', fetchAttention, { refetchInterval: 10000 }
  );

  /* ── Derived data ── */
  const users = usersRaw ?? [];
  const queues = queuesRaw ?? [];
  const summary = summaryRaw ?? {};
  const referrals = referralsRaw ?? [];
  const attentionRaw2 = attentionRaw;

  const teamPerformance = useMemo(
    () => (reportsRaw?.periods ? buildDashboardPerformance(reportsRaw) : null),
    [reportsRaw]
  );

  const summaryPerformance = useMemo(() => {
    if (summaryIndividual && summaryRole !== 'All') {
      const periods = reportsRaw?.periodsByUser?.[summaryIndividual];
      return periods ? buildDashboardPerformance({ periods, todayDayKey: reportsRaw?.todayDayKey }) : null;
    }
    return teamPerformance;
  }, [summaryIndividual, summaryRole, reportsRaw, teamPerformance]);

  const anyLoading = usersLoading || queuesLoading || reportsLoading || summaryLoading;
  const anyError = usersErr || queuesErr || reportsErr || summaryErr;

  // Canonical calling-agent set: role === 'Agent' (title-case from backend listUsers)
  const callingAgents = useMemo(
    () => users.filter((u) => u.role === 'Agent' && u.status === 'Active'),
    [users]
  );

  /* ── Health state ── */
  const health = useHealthState(attentionRaw2);

  /* ── "Since Last Visit" deltas ── */
  const currentMetrics = useMemo(() => {
    if (!callingAgents.length) return null;
    const online = callingAgents.filter((u) => u.availability === 'available').length;
    const byStatus = (s) => queues.find((q) => q.status === s)?.leads ?? 0;
    return {
      online,
      activeCalls: byStatus('fetched'),
      unassigned: attentionRaw2?.leads?.unassigned ?? 0,
      hotLeads: summary.hotLeads ?? 0,
      callbacksDue: summary.callbacksToday ?? 0,
      stalled: attentionRaw2?.leads?.stalled ?? 0,
    };
  }, [callingAgents, queues, summary, attentionRaw2]);

  const deltas = useSinceLastVisit(currentMetrics);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const online = callingAgents.filter((u) => u.availability === 'available').length;
    const byStatus = (s) => queues.find((q) => q.status === s)?.leads ?? 0;
    const activeCalls = byStatus('fetched');
    const hotLeads = summary.hotLeads ?? 0;
    const callbacksDue = summary.callbacksToday ?? 0;
    const unassigned = attentionRaw2?.leads?.unassigned ?? 0;
    const stalled = attentionRaw2?.leads?.stalled ?? 0;

    return [
      {
        key: 'online',
        icon: <HeadsetIcon sx={{ fontSize: 16 }} />,
        label: 'Agents Online',
        value: online,
        sub: `${callingAgents.length} total`,
        accent: online > 0 ? 'green' : 'amber',
        view: 'users',
        title: 'View user management',
      },
      {
        key: 'activeCalls',
        icon: <CallReceivedIcon sx={{ fontSize: 16 }} />,
        label: 'Active Calls',
        value: activeCalls,
        sub: activeCalls === 1 ? 'in progress' : 'in progress',
        accent: activeCalls > 0 ? 'blue' : 'neutral',
        view: 'leads',
        filter: { rawStatus: 'fetched' },
        title: 'View active calls',
      },
      {
        key: 'unassigned',
        icon: <InventoryIcon sx={{ fontSize: 16 }} />,
        label: 'Unassigned Leads',
        value: unassigned,
        sub: unassigned > 0 ? 'need assignment' : 'all assigned',
        accent: unassigned > 0 ? 'amber' : 'green',
        view: 'leads',
        filter: { specialFilter: 'unassigned' },
        title: 'View unassigned leads',
      },
      {
        key: 'hotLeads',
        icon: <LocalFireDepartmentIcon sx={{ fontSize: 16 }} />,
        label: 'Hot Leads',
        value: hotLeads,
        sub: hotLeads > 0 ? 'need attention' : 'none urgent',
        accent: hotLeads > 0 ? 'red' : 'green',
        view: 'leads',
        filter: { priority: 'Urgent' },
        title: 'View urgent leads',
      },
      {
        key: 'callbacksDue',
        icon: <EventAvailableIcon sx={{ fontSize: 16 }} />,
        label: 'Callbacks Due',
        value: callbacksDue,
        sub: callbacksDue === 1 ? 'scheduled today' : 'scheduled today',
        accent: callbacksDue > 0 ? 'amber' : 'green',
        view: 'leads',
        filter: { rawStatus: 'callback' },
        title: 'View callbacks',
      },
      {
        key: 'stalled',
        icon: <WarningAmberIcon sx={{ fontSize: 16 }} />,
        label: 'Stalled Leads',
        value: stalled,
        sub: stalled > 0 ? '>14 days inactive' : 'none stalled',
        accent: stalled > 0 ? 'red' : 'green',
        view: 'leads',
        filter: { specialFilter: 'stalled' },
        title: 'View stalled leads',
      },
    ];
  }, [callingAgents, queues, summary, attentionRaw2]);

  /* ── Chart data ── */
  const donutData = useMemo(() => {
    return queues.filter((q) => q.leads > 0).map((q) => ({
      name: q.name, value: q.leads, status: q.status,
    }));
  }, [queues]);

  const teamRows = useMemo(
    () => [...callingAgents].sort((a, b) => {
      const pa = AVAIL_ORDER[a.availability] ?? 2;
      const pb = AVAIL_ORDER[b.availability] ?? 2;
      if (pa !== pb) return pa - pb;
      if (a.currentLead && !b.currentLead) return -1;
      if (!a.currentLead && b.currentLead) return 1;
      return String(a.name).localeCompare(String(b.name));
    }),
    [callingAgents]
  );

  const teamCounts = useMemo(() => ({
    active: callingAgents.filter((u) => u.availability === 'available').length,
    onBreak: callingAgents.filter((u) => u.availability === 'break').length,
    offline: callingAgents.filter((u) => u.availability === 'offline').length,
    onCall: callingAgents.filter((u) => u.currentLead).length,
  }), [callingAgents]);

  /* ── Navigation ── */
  const go = (kpi) => {
    if (!kpi?.view) return;
    onNavigate?.(kpi.view, kpi.filter ? { initialFilters: kpi.filter } : null);
  };

  const lastUpdated = updatedAt ? updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;

  const retryAll = useCallback(() => {
    refetchUsers();
    refetchQueues();
    refetchReports();
    refetchSummary();
    refetchReferrals();
    refetchAttention();
    setUpdatedAt(new Date());
    push('Refreshing dashboard…', 'info');
  }, [refetchUsers, refetchQueues, refetchReports, refetchSummary, refetchReferrals, refetchAttention, push]);

  const sectionLoading = (loading) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3, justifyContent: 'center' }}>
      <CircularProgress size={16} />
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Loading…</Typography>
    </Box>
  );

  const sectionError = (msg, retry) => (
    <Box sx={{ textAlign: 'center', py: 3 }}>
      <WarningAmberIcon sx={{ fontSize: 20, color: 'error.main', mb: 0.5 }} />
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1 }}>Failed to load: {msg}</Typography>
      <SecondaryButton size="small" onClick={retry}>Retry</SecondaryButton>
    </Box>
  );

  return (
    <Box>
      {/* ── Global error banner ── */}
      {anyError && !anyLoading && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<SecondaryButton size="small" onClick={retryAll}>Retry All</SecondaryButton>}
        >
          {usersErr && 'Users. '}{queuesErr && 'Queues. '}{reportsErr && 'Reports. '}{summaryErr && 'Dashboard summary.'}
          {' '}Could not load some dashboard data.
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

        {/* ═══════════════════════════════════════════════════════════
            1 · OPERATIONS PULSE — FULL WIDTH
            Six KPI cards in one horizontal row across full width.
            ═══════════════════════════════════════════════════════════ */}
        <Box>
          {usersLoading && !usersRaw ? (
            sectionLoading('users')
          ) : usersErr && !usersRaw ? (
            sectionError(usersErr, refetchUsers)
          ) : (
            <OperationsPulse kpis={kpis} deltas={deltas} health={health} onKpiClick={go} lastVisitAt={lastVisitAt} />
          )}
        </Box>

        <PerformanceSummaryTable
          data={summaryPerformance}
          loading={reportsLoading && !reportsRaw}
          compact
          filter={
            <RoleLeadExplorer
              role={summaryRole}
              onRoleChange={setSummaryRole}
              individual={summaryIndividual}
              onIndividualChange={setSummaryIndividual}
              users={users}
              showLeads={false}
              hideTitle
            />
          }
        />

        {/* ═══════════════════════════════════════════════════════════
            4 · OPERATIONS MONITORING — 50/50
            LEFT: Team Live  |  RIGHT: Lead Distribution
            ═══════════════════════════════════════════════════════════ */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'stretch' }}>
          <AppCard
            title="Team Live"
            subtitle={`${callingAgents.length} agents · ${teamCounts.active} available · ${teamCounts.onBreak} on break`}
            icon={<GroupsIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
            actions={
              <Button variant="text" size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />} onClick={() => onNavigate?.('users')}>
                User Management
              </Button>
            }
            contentSx={{ p: 0, overflowX: 'auto' }}
          >
            {usersLoading && !usersRaw ? (
              sectionLoading('users')
            ) : usersErr && !usersRaw ? (
              sectionError(usersErr, refetchUsers)
            ) : (
              <TeamLiveTable rows={teamRows} />
            )}
          </AppCard>

          <AppCard
            title="Lead Distribution"
            subtitle="Leads by status"
            icon={<InventoryIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
            contentSx={{ p: 1.5 }}
          >
            {queuesLoading && !queuesRaw ? (
              sectionLoading('queues')
            ) : queuesErr && !queuesRaw ? (
              sectionError(queuesErr, refetchQueues)
            ) : donutData.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <InventoryIcon sx={{ fontSize: 24, color: 'text.disabled' }} />
                <Box sx={{ mt: 1, fontSize: 13, color: 'text.secondary' }}>No lead data available.</Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value" nameKey="name">
                        {donutData.map((entry, index) => (
                          <Cell key={entry.status} fill={STATUS_DONUT_COLORS[index % STATUS_DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <RTooltip content={<DonutTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, flexShrink: 0, pr: 0.5 }}>
                  {donutData.map((entry, index) => (
                    <Box key={entry.status} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATUS_DONUT_COLORS[index % STATUS_DONUT_COLORS.length], flexShrink: 0 }} />
                      <Box sx={{ fontSize: 11.5, color: 'text.secondary', maxWidth: 90, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</Box>
                      <Box sx={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{entry.value}</Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </AppCard>
        </Box>

        <CallAssistFeedbackSummary />

        {/* ═══════════════════════════════════════════════════════════
            5 · APPLICATIONS — FULL WIDTH
            ═══════════════════════════════════════════════════════════ */}
        <AppCard
          title="Applications"
          subtitle="Application pipeline overview"
          icon={<AssignmentOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
          contentSx={{ p: 1.25, pb: 0.75 }}
        >
          <ApplicationsSummary onNavigate={onNavigate} />
        </AppCard>

      </Box>
    </Box>
  );
}
