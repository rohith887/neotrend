import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ContactsIcon from '@mui/icons-material/Contacts';
import EscalatorWarningIcon from '@mui/icons-material/EscalatorWarning';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import PhoneDisabledIcon from '@mui/icons-material/PhoneDisabled';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import SendIcon from '@mui/icons-material/Send';
import VerifiedIcon from '@mui/icons-material/Verified';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useToast } from '../context/ToastContext.jsx';
import { CALL_ACTIVE, useAgent } from '../context/AgentContext.jsx';
import { useCachedFetch } from '../context/CacheContext.jsx';
import { registerAgentRefresh } from '../components/Layout.jsx';
import AssignedLeadsDrawer from '../components/workqueue/AssignedLeadsDrawer.jsx';
import PerformanceSummaryTable from '../components/dashboard/PerformanceSummaryTable.jsx';
import PerformanceDrilldownDrawer from '../components/dashboard/PerformanceDrilldownDrawer.jsx';
import NextBestActionCard from '../components/dashboard/NextBestActionCard.jsx';
import { buildDashboardPerformance } from '../utils/performance.js';
import { PrimaryButton, SecondaryButton, StatusChip } from '../ui/mui/index.js';
import {
  fetchSummary,
  fetchCallbacks,
  fetchReadyToCall,
  fetchNextAction,
  fetchReport,
  fetchAssignedLeads,
} from '../api/dashboard.js';


// Approved color system — each KPI carries a distinct identity; primary
// workflow buttons use brand indigo; secondary/utility actions are neutral.
const BRAND = '#0f766e';
const BRAND_HOVER = '#115e59';
const GRAY_LINE = '#e5e7eb';

// Brand filled primary overrides (Resume / Next Best Action workflow CTAs).
const primaryBrandSx = {
  bgcolor: BRAND,
  color: '#ffffff',
  boxShadow: 'none',
  '&:hover': { bgcolor: BRAND_HOVER, boxShadow: 'none' },
};

// Neutral white/gray "outlined secondary" overrides (View / Clear / utility).
const secondaryNeutralSx = {
  color: 'text.secondary',
  bgcolor: '#ffffff',
  borderColor: GRAY_LINE,
  '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f9fafb', color: 'text.primary' },
};

// Work Queue: the Resume action inherits the row's work type identity —
// Callback → Deep Orange, RNR → Deep Purple. Never a universal blue.
const WORK_TYPE_RESUME = {
  Callback: { bgcolor: '#C2410C', color: '#ffffff', '&:hover': { bgcolor: '#9A3412' }, '&:focus-visible': { outlineColor: '#C2410C' } },
  RNR:      { bgcolor: '#475569', color: '#ffffff', '&:hover': { bgcolor: '#334155' }, '&:focus-visible': { outlineColor: '#475569' } },
  'Not Reachable': { bgcolor: '#7C3AED', color: '#ffffff', '&:hover': { bgcolor: '#6D28D9' }, '&:focus-visible': { outlineColor: '#7C3AED' } },
};

// KPI tone roles — theme tokens, so this page rides the app's actual palette
// (and any future theme change) instead of a disconnected hardcoded set.
const KPI_TONE = {
  primary: { color: 'primary.main', tint: 'primary.soft' },     // Total Assigned
  info:    { color: 'info.main',    tint: 'info.soft' },        // Ready to Call
  warning: { color: 'warning.main', tint: 'warning.soft' },     // Pending Callbacks
  danger:  { color: 'error.main',   tint: 'error.soft' },       // Hot Leads / P1
  success: { color: 'success.main', tint: 'success.soft' },    // Qualified Leads
  violet:  { color: 'secondary.main', tint: 'secondary.soft' }, // Ready for Registration
  // No theme equivalent for this one — kept as a distinct 7th identity.
  maroon:  { color: '#881337', tint: '#fdf2f8' },               // Dropped Leads
  // RNR family — the dashboard's existing RNR identity (Callbacks & RNR
  // badges, RNR Resume buttons) is slate #475569. RNRs uses it verbatim;
  // RNR 6+ Leads uses the darker escalation step of the same family so the two
  // read as RNR while staying visually distinct.
  rnr:     { color: '#475569', tint: 'rgba(71, 85, 105, 0.10)' }, // RNRs
  // Not Reachable is its OWN queue, so it gets its own identity (violet) rather
  // than borrowing RNR's slate — the two must never read as the same thing.
  notreachable: { color: '#7C3AED', tint: 'rgba(124, 58, 237, 0.10)' }, // Not Reachable
  rnr6:    { color: '#0F172A', tint: '#E2E8F0' },                 // RNR 6+ Leads
  neutral: { color: 'text.secondary', tint: 'action.hover' },
};

/* ── P1/P2/P3 priority chip — shared StatusChip, matching every other
   status/priority pill in the app instead of a page-local raw Chip. ── */
const PRIO_CHIP = {
  P1: { tone: 'danger',  label: 'P1 HOT' },
  P2: { tone: 'warning', label: 'P2 WARM' },
  P3: { tone: 'info',    label: 'P3 COLD' },
};

const PriorityChip = ({ priority }) => {
  const key = String(priority || '').trim().toUpperCase();
  const meta = PRIO_CHIP[key];
  return meta ? (
    <StatusChip status={meta.label} tone={meta.tone} size="small" sx={{ height: 20, fontSize: 11 }} />
  ) : (
    <StatusChip status="No Priority" tone="neutral" dot={false} variant="outlined" size="small" sx={{ height: 20, fontSize: 11 }} />
  );
};

/* ── Workload KPIs — every tile opens the Assigned Leads drawer ── */
// Ten tiles, one horizontal carousel row. The first eight are the agent's
// primary workload and fit the content width outright; the last two are
// reporting views that scroll in from the right (Dropped Leads and the RNR 6+
// escalation bucket), so nothing is hidden behind a menu or a tab — it is one
// flick or one arrow press away, with an arrow always on screen to say so.
// Order is deliberate: the two phone-outcome queues (RNRs, Not Reachable) sit
// side by side because they are sibling queues the agent triages in the same
// pass, and the pipeline stages follow in order.
//
// `preset` drives the Assigned Leads drawer filter for each KPI so the drawer
// reflects the same category the count represents. `status` arrays carry the
// RAW status values (matching the server's LEAD_GROUP_FILTERS definitions) —
// the drawer expands them via the same statusToRaw logic on the server, and
// renders friendly labels for the chips.
//
// The three RNR-family tiles use DIFFERENT server-side filters (rnr.service):
//   rnrLeads          → rnr:'current'       — latest disposition is RNR, and not
//                       yet closed for today by the 3-per-day RNR cap
//   notReachableLeads → rnr:'not-reachable' — latest disposition is
//                       "Switched Off / Not Reachable", with its own independent
//                       daily cap. Never merged with rnrLeads.
//   rnr6PlusLeads     → rnr:'escalated'     — lifetime RNR attempts >= 6,
//                       whether or not the lead is in RNR state right now
const KPI_DEFS = [
  { key: 'totalAssignedLeads',   label: 'Total Assigned',    icon: <ContactsIcon sx={{ fontSize: 16 }} />,             tone: 'primary', preset: null },
  { key: 'readyToCall',          label: 'Ready to Call',     icon: <PhoneInTalkIcon sx={{ fontSize: 16 }} />,          tone: 'info',    preset: { status: ['new'] } },
  { key: 'pendingCallbacks',     label: 'Pending Callbacks', icon: <EventAvailableIcon sx={{ fontSize: 16 }} />,       tone: 'warning', preset: { status: ['callback'] } },
  // RNRs — latest disposition is RNR (3 RNRs/day cap enforced).
  { key: 'rnrLeads',             label: 'RNRs',             icon: <PhoneMissedIcon sx={{ fontSize: 16 }} />,            tone: 'rnr',     preset: { rnr: 'current' } },
  // Not Reachable — latest disposition is "Switched Off / Not Reachable".
  // A SEPARATE queue from RNRs, with its own independent daily cap.
  { key: 'notReachableLeads',    label: 'Not Reachable',  icon: <PhoneDisabledIcon sx={{ fontSize: 16 }} />,               tone: 'notreachable', preset: { rnr: 'not-reachable' } },
  { key: 'p1Leads',              label: 'Hot Leads (P1)',    icon: <LocalFireDepartmentIcon sx={{ fontSize: 16 }} />,  tone: 'danger',  preset: { priority: 'P1' } },
  { key: 'qualifiedLeads',       label: 'Qualified Leads',   icon: <VerifiedIcon sx={{ fontSize: 16 }} />,             tone: 'success', preset: { status: ['in-progress', 'callback', 'follow-up'] } },
  { key: 'readyForRegistration', label: 'Ready for Registration', icon: <SendIcon sx={{ fontSize: 16 }} />,            tone: 'violet',  preset: { status: ['completed', 'documents-pending', 'offer-received', 'visa-process'] } },
  // Dropped Leads — filtered by the lead's drop marker (dropStatus: 'dropped'),
  // the same condition the Assigned Leads drawer applies for this preset.
  // Scrolls in past the eight that fit.
  { key: 'droppedLeads',        label: 'Dropped Leads',  icon: <PersonOffIcon sx={{ fontSize: 16 }} />,             tone: 'maroon',  preset: { dropStatus: 'dropped' } },
  // RNR 6+ Leads — lifetime escalation bucket (6+ RNR attempts, ever).
  // Scrolls in past the eight that fit.
  { key: 'rnr6PlusLeads',        label: 'RNR 6+ Leads',  icon: <EscalatorWarningIcon sx={{ fontSize: 16 }} />,       tone: 'rnr6',    preset: { rnr: 'escalated' } },
];

/* ── KPI strip — one horizontal row, never a second row ────────────────────
   The KPI tiles used to be a 2/3/9-column grid, so the strip's height — and
   therefore the vertical budget the queues below it get — changed shape every
   time a KPI was added or removed, and on small screens the extra rows pushed
   the actual work queues off-screen. It is now a single-row carousel: nowrap
   flex, horizontal overflow, fixed height. Any number of KPIs costs exactly one
   row of height, never two.

   All ten tiles stay in the strip. The basis is a share of 100% minus the
   gaps — sized so exactly EIGHT tiles span the content width at any monitor
   size, and the remaining two overflow into a scrollable tail rather than
   being dropped, tucked behind a menu, or pushed onto a second row. Because
   the basis is proportional rather than a fixed pixel width, "eight visible"
   holds from a 1280 laptop to a 2560 display instead of drifting to 5 or 12.
   Below ~1.2kpx there is no longer room for eight readable tiles, so the
   clamp's 140px floor takes over and more of them scroll. The 240px ceiling
   stops an ultrawide from stretching every tile into a sparse slab.

   56px is the seven 8px gaps between those eight visible tiles, which is why
   the divisor is 8 and not the tile count. Tiles stay left-aligned inside that
   width, so a tile's own contents, height, icon and type are untouched.

   Scrolling itself is deliberately NOT set to `scroll-behavior: smooth`: that
   property also applies to scrollLeft assignment, which turns a continuous
   wheel/trackpad gesture into a queue of retargeting animations and reads as
   lag. Direct manipulation (wheel, trackpad, touch, shift+wheel, scrollbar
   keys) stays 1:1 native and therefore maximally responsive; the two arrow
   buttons animate their jumps with behavior:'smooth' instead. */
const KPI_TILE_BASIS = 'clamp(140px, calc((100% - 56px) / 8), 240px)';

// Positioning context for the two edge arrows. The track already spans the
// page's full content width (the page Box, not the track, owns the 18px side
// padding), so an arrow at left:4 sits 4px inside the padding edge and no
// scroll-padding offset is needed.
const KPI_STRIP_SX = {
  position: 'relative',
  width: '100%',
  minWidth: 0,
};

const KPI_TRACK_SX = {
  display: 'flex',
  flexWrap: 'nowrap',
  gap: { xs: 0.75, sm: 1 },
  overflowX: 'auto',
  overflowY: 'hidden',
  // Contain the gesture so an overscrolling trackpad flick that runs past
  // either end can't trigger the browser's back/forward navigation.
  overscrollBehaviorX: 'contain',
  // Hide the scrollbar without losing the scroll: scrollbar-width is the
  // standardised property (Firefox), msOverflowStyle covers old Edge, and the
  // pseudo-element rules cover WebKit/Blink. A Firefox user still gets the
  // standard wheel/trackpad/keyboard scrolling this box keeps.
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
};

// Deliberately quiet: the arrows are a convenience, not the primary affordance
// (the strip itself scrolls), so they read as a paper disc with a hairline ring
// rather than as chrome. They carry no backdrop so a card scrolling underneath
// stays legible.
const KPI_ARROW_SX = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 1,
  width: 26,
  height: 26,
  p: 0,
  borderRadius: '50%',
  color: 'text.secondary',
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.16)',
  transition: 'color 150ms ease, border-color 150ms ease, background-color 150ms ease',
  '&:hover': { color: 'text.primary', borderColor: 'text.disabled', bgcolor: 'background.paper' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
};

const QueueSkeleton = ({ rows = 3 }) => (
  <Box role="status" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
        <Skeleton variant="text" width="18%" />
        <Skeleton variant="text" width="22%" />
        <Skeleton variant="text" width="16%" />
        <Skeleton variant="text" width="20%" />
        <Skeleton variant="text" width="12%" />
      </Box>
    ))}
  </Box>
);

const QueueError = ({ message, onRetry }) => (
  <Alert
    severity="error"
    sx={{ py: 0.5, px: 1, fontSize: 12.5 }}
    action={
      <SecondaryButton size="small" onClick={onRetry} sx={{ ml: 1 }}>
        Retry
      </SecondaryButton>
    }
  >
    {message}
  </Alert>
);

// Callbacks and RNR are two DISTINCT work queues, each with its own table
// below — never merged into one list or one count. A lead can legitimately
// appear in both: the Callbacks table is every lead with a pending scheduled
// callback (workqueue.service), and the RNR table is every lead CURRENTLY in
// RNR workload (rnr.service's 'current' set — latest disposition is RNR and
// today's 3-per-day allowance isn't used up yet). Membership in one queue is
// never derived from the other, and a lead's lifetime RNR history never
// promotes it into the RNR queue — only its current disposition does.

const fmtDue = (c) => {
  if (c.callbackDate) return `${c.callbackDate}${c.callbackTime ? ` ${c.callbackTime}` : ''}`;
  if (c.dueAt) {
    const d = new Date(c.dueAt);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) return `Today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
  }
  return 'Retry ready';
};

// Last RNR attempt — the RNR table's due/retry equivalent (RNR has no
// scheduled datetime; it just shows when the last attempt happened).
const fmtLastAttempt = (r) => {
  if (!r.lastCallAt) return 'Ready to retry';
  const d = new Date(r.lastCallAt);
  if (Number.isNaN(d.getTime())) return 'Ready to retry';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const stamp = sameDay
    ? `Today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `Last tried ${stamp}`;
};

export default function AgentDashboard({ onGoToWorkspace }) {
  const { push } = useToast();
  const { availability, lead, callStatus, fetchCall, fetchingLead } = useAgent();

  const [assignedOpen, setAssignedOpen] = useState(false);
  const [assignedPreset, setAssignedPreset] = useState(null);
  const [assignedKey, setAssignedKey] = useState(null);

  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownCtx, setDrilldownCtx] = useState(null);

  // Which work queue is showing in the tabbed card
  // — 'callbacks' | 'rnr' | 'not-reachable'.
  // Purely a display toggle: switching tabs never merges the queues'
  // underlying data or counts. Each tab has its OWN backend filter.
  const [queueTab, setQueueTab] = useState('callbacks');

  const fetchSummaryCb = useCallback(async () => fetchSummary(), []);
  const fetchNextActionCb = useCallback(async () => fetchNextAction(), []);
  const fetchCallbacksCb = useCallback(async () => fetchCallbacks(), []);
  // Separate RNR queue fetch — the agent's CURRENT RNR workload (rnr.service's
  // 'current' set: latest disposition is RNR), resolved through the same
  // assigned-leads endpoint and filter the "RNR Leads" KPI/drawer already use,
  // so this list and that count can never drift apart.
  const fetchRnrQueueCb = useCallback(
    async () => fetchAssignedLeads({ rnr: 'current', pageSize: 20 }),
    []
  );
  // Separate Not Reachable queue fetch — a genuinely DIFFERENT backend filter
  // (rnr:'not-reachable'). NOT derived by filtering the RNR result in React.
  const fetchNotReachableQueueCb = useCallback(
    async () => fetchAssignedLeads({ rnr: 'not-reachable', pageSize: 20 }),
    []
  );
  const fetchReadyToCallCb = useCallback(async () => fetchReadyToCall(), []);
  const fetchReportCb = useCallback(async () => {
    const r = await fetchReport();
    return buildDashboardPerformance(r);
  }, []);

  /* ── Auto-refresh ───────────────────────────────────────────────────────
     Every panel on this page polls off the SAME 30s cadence, so the KPI tiles,
     work queue, Callbacks, RNRs, Not Reachable and the performance table can
     never disagree with each other by more than one tick. useCachedFetch
     skips the tick while the tab is hidden and refetches the moment it comes
     back, so a backgrounded dashboard costs nothing and returns current.
     Polling only re-runs these fetchers — no reload, no filter reset, and no
     interaction with call state, so an in-progress call is never disturbed. */
const { data: summary, error: summaryError, loading: summaryLoading, refetch: refetchSummary } = useCachedFetch('agent-dashboard-summary', fetchSummaryCb, { refetchInterval: 30000 });
  const { data: nextAction, refetch: refetchNextAction } = useCachedFetch('agent-dashboard-next-action', fetchNextActionCb, { refetchInterval: 30000 });
  const { data: callbacks, error: callbacksError, refetch: refetchCallbacks } = useCachedFetch('agent-dashboard-callbacks', fetchCallbacksCb, { refetchInterval: 30000 });
  const { data: rnrQueue, error: rnrError, refetch: refetchRnrQueue } = useCachedFetch('agent-dashboard-rnr-queue', fetchRnrQueueCb, { refetchInterval: 30000 });
  const { data: notReachableQueue, error: notReachableError, refetch: refetchNotReachableQueue } = useCachedFetch('agent-dashboard-not-reachable-queue', fetchNotReachableQueueCb, { refetchInterval: 30000 });
  const { data: readyLeads, refetch: refetchReady } = useCachedFetch('agent-dashboard-ready-to-call', fetchReadyToCallCb, { refetchInterval: 30000 });
  const { data: performance, refetch: refetchPerformance } = useCachedFetch('agent-dashboard-report', fetchReportCb, { refetchInterval: 30000 });

  const refresh = () => {
    Promise.all([refetchSummary(), refetchNextAction(), refetchCallbacks(), refetchRnrQueue(), refetchNotReachableQueue(), refetchReady(), refetchPerformance()]).then(() =>
      push('Dashboard refreshed', 'success')
    );
  };

  // Unregister on unmount. Without the cleanup the module-level bridge in
  // Layout.jsx keeps pointing at the previous session's refresh closure after
  // logout, so the next agent's Refresh button would fire the old fetches.
  useEffect(() => {
    registerAgentRefresh(refresh);
    return () => registerAgentRefresh(null);
  }, [refresh]);

  /* ── KPI carousel ──────────────────────────────────────────────────────
     Arrow visibility is derived from the strip's LIVE scroll offset rather
     than from a breakpoint guess or a hardcoded KPI count, so it stays
     correct through window resize, the theme switch, a vertical scrollbar
     appearing, and the summary values landing. An arrow exists only while
     there is genuinely more strip in that direction to reveal. */
  const kpiTrackRef = useRef(null);
  const [kpiEdges, setKpiEdges] = useState({ atStart: true, atEnd: false });

  const syncKpiEdges = useCallback(() => {
    const el = kpiTrackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 1px tolerance: fractional layout widths leave a sub-pixel remainder that
    // would otherwise leave a right arrow stranded on a fully-scrolled strip.
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft >= max - 1;
    setKpiEdges((prev) => (prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }));
  }, []);

  useEffect(() => {
    const el = kpiTrackRef.current;
    if (!el) return undefined;
    // Observe the track itself: it is the only box whose width changes, and a
    // track width change is what re-bases every tile's percentage basis (and
    // therefore scrollWidth). This is also what catches the vertical scrollbar
    // on the page Box appearing when the summary error alert shows up.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncKpiEdges);
    ro?.observe(el);
    el.addEventListener('scroll', syncKpiEdges, { passive: true });
    syncKpiEdges();
    return () => {
      el.removeEventListener('scroll', syncKpiEdges);
      ro?.disconnect();
    };
  }, [syncKpiEdges]);

  useEffect(() => {
    const el = kpiTrackRef.current;
    if (!el) return undefined;
    // A plain mouse only ever reports deltaY, so hovering the strip would do
    // nothing without this. Feed that into the horizontal axis while the strip
    // still has room to move in that direction — and once it hits either end,
    // stop claiming the event so the page underneath scrolls normally. Bailing
    // out is what keeps the strip from becoming a scroll trap.
    const onWheel = (e) => {
      if (e.deltaX || e.shiftKey) return;         // trackpad swipe / shift+wheel — native
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;                       // nothing to scroll at all
      if (e.deltaY < 0 && el.scrollLeft <= 1) return;
      if (e.deltaY > 0 && el.scrollLeft >= max - 1) return;
      e.preventDefault();
      // deltaMode 1 reports LINES not pixels; without the scale factor a plain
      // mouse would move the strip by 1px per notch.
      el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    };
    // Must be non-passive: React attaches wheel at the root as passive, so
    // preventDefault() would be ignored (and log a warning) from onWheel.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Page roughly four tiles per press. Derived from the track's own width so
  // the step matches what's actually on screen instead of a fixed pixel count.
  const nudgeKpiStrip = useCallback((dir) => {
    const el = kpiTrackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  }, []);

  const handleKpiClick = (kpi) => {
    setAssignedKey(kpi.key);
    setAssignedPreset(kpi.preset || null);
    setAssignedOpen(true);
  };

  const handlePerformanceCellClick = (ctx) => {
    setDrilldownCtx(ctx);
    setDrilldownOpen(true);
  };

  const openDrilldownLead = useCallback(
    async (leadId) => {
      setDrilldownOpen(false);
      const ok = await fetchCall(leadId);
      if (ok) onGoToWorkspace();
    },
    [fetchCall, onGoToWorkspace]
  );

  const openAssignedLead = useCallback(
    async (lk) => {
      setAssignedOpen(false);
      const ok = await fetchCall(lk.id);
      if (ok) onGoToWorkspace();
    },
    [fetchCall, onGoToWorkspace]
  );

  const openLead = useCallback(
    async (leadId) => {
      const ok = await fetchCall(leadId);
      if (ok) onGoToWorkspace();
    },
    [fetchCall, onGoToWorkspace]
  );

  const runNextAction = useCallback(async () => {
    const na = nextAction;
    if (!na) return;
    if (na.action === 'clear') { onGoToWorkspace(); return; }
    const ok = na.leadId ? await fetchCall(na.leadId) : await fetchCall();
    if (ok) onGoToWorkspace();
  }, [nextAction, fetchCall, onGoToWorkspace]);

  const onBreak = availability === 'break';
  const callActive = CALL_ACTIVE.has(callStatus);

  /* ── Callbacks queue — leads with a pending/scheduled callback ── */
  const cbOverdue = callbacks?.overdue || [];
  const cbToday = callbacks?.today || [];
  const cbDueNow = callbacks?.dueNow || [];
  const cbUpcomingRaw = callbacks?.upcoming || [];
  const cbOverdueIds = new Set(cbOverdue.map((e) => e.id));
  const cbTodayIds = new Set(cbToday.map((e) => e.id));
  const cbUnscheduled = cbDueNow.filter((e) => !e.dueAt && !cbOverdueIds.has(e.id) && !cbTodayIds.has(e.id));
  const cbUpcoming = cbUpcomingRaw.filter((e) => !cbOverdueIds.has(e.id) && !cbTodayIds.has(e.id));

  const allCallbacks = [
    ...cbOverdue.map((c) => ({ ...c, _status: 'Overdue', _tone: 'error' })),
    ...cbUnscheduled.map((c) => ({ ...c, _status: 'Overdue', _tone: 'error' })),
    ...cbToday.map((c) => ({ ...c, _status: 'Due Today', _tone: 'warning' })),
    ...cbUpcoming.map((c) => ({ ...c, _status: 'Upcoming', _tone: 'info' })),
  ];

  const overdueCount = cbOverdue.length + cbUnscheduled.length;
  const todayCount = cbToday.length;
  const cbTotal = allCallbacks.length;

  /* ── RNR queue — leads whose latest disposition is RNR (separate surface,
     separate count; never derived from Callback data or Not Reachable) ── */
  const rnrRows = rnrQueue?.rows || [];
  const rnrTotal = rnrQueue?.total ?? rnrRows.length;

  /* ── Not Reachable queue — leads whose latest disposition is
     "Switched Off / Not Reachable". Its own backend filter and its own
     count; never derived from the RNR result. ── */
  const notReachableRows = notReachableQueue?.rows || [];
  const notReachableTotal = notReachableQueue?.total ?? notReachableRows.length;

  return (
    <Box sx={{ height: '100%', minHeight: 0, overflowY: 'auto', p: '12px 18px 20px', display: 'flex', flexDirection: 'column' }}>

      {/* ── 1 · Compact top action bar ── */}
      {summaryError && (
        <Alert severity="error" sx={{ mb: 1.25, flexShrink: 0 }} action={<SecondaryButton size="small" onClick={refresh}>Retry</SecondaryButton>}>
          {summaryError}
        </Alert>
      )}

      {/* ── 2 · Next Best Action — compact strip ── */}
      <Box sx={{ mb: 1.25, flexShrink: 0 }}>
        <NextBestActionCard
          action={nextAction}
          student={lead}
          callActive={callActive}
          disabled={fetchingLead}
          onAction={runNextAction}
          onReturnToCall={onGoToWorkspace}
        />
      </Box>

      {/* ── 3 · KPI row — all ten tiles in one horizontal carousel row, the first
             eight spanning the width and the rest scrolling in from the
             right. Tile contents, colours, values, click behaviour and the
             KPI APIs are unchanged; only the row's layout is. ── */}
      <Box sx={{ ...KPI_STRIP_SX, mb: 1.25, flexShrink: 0 }} aria-label="Workload shortcuts">
        <Box ref={kpiTrackRef} sx={KPI_TRACK_SX}>
          {KPI_DEFS.map((kpi) => {
            const value = summary?.[kpi.key] ?? 0;
            const tone = KPI_TONE[kpi.tone];
            return (
              <Box
                key={kpi.key}
                role="button"
                tabIndex={0}
                onClick={() => handleKpiClick(kpi)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleKpiClick(kpi); } }}
                title={`Open ${kpi.label.toLowerCase()} in Assigned Leads`}
                sx={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  pl: 1.25,
                  pr: 1,
                  py: 1,
                  // Carousel sizing: fixed basis + no grow/shrink, so tiles never
                  // stretch to fill the row and never wrap onto a second one.
                  flex: `0 0 ${KPI_TILE_BASIS}`,
                  height: 62,
                  cursor: 'pointer',
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.25,
                  transition: 'border-color 150ms ease, background-color 150ms ease',
                  '&:hover': { bgcolor: 'action.hover', borderColor: 'text.disabled' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 0 },
                }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: '7px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: tone.tint,
                    color: tone.color,
                  }}
                >
                  {kpi.icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: { xs: 20, sm: 22 }, fontWeight: 700, lineHeight: 1.02, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                    {summaryLoading ? '…' : value}
                  </Box>
                  <Box sx={{ mt: 0.4, fontSize: { xs: 10.5, sm: 11.5 }, fontWeight: 500, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {kpi.label}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* Edge arrows — rendered only while there is more strip to reveal in
            that direction. Kept out of the tab order until they exist by
            construction, and they never cover a tile's hit area for long. */}
        {!kpiEdges.atStart && (
          <IconButton
            size="small"
            aria-label="Scroll KPI tiles left"
            onClick={() => nudgeKpiStrip(-1)}
            sx={{ ...KPI_ARROW_SX, left: 4 }}
          >
            <KeyboardArrowLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
        {!kpiEdges.atEnd && (
          <IconButton
            size="small"
            aria-label="Scroll KPI tiles right"
            onClick={() => nudgeKpiStrip(1)}
            sx={{ ...KPI_ARROW_SX, right: 4 }}
          >
            <KeyboardArrowRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      {/* ── 4 · Main content: Callbacks + RNR (two separate queues) | Performance (compact) ── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '11fr 9fr' },
          gap: 1.25,
          alignItems: 'stretch',
          flex: '1 1 auto',
          minHeight: 0,
          maxHeight: 'calc(100vh - 260px)',
          overflow: 'hidden',
        }}
        aria-label="Work queues and performance"
      >
        {/* ── Left column: Callbacks queue + RNR queue — two distinct
               surfaces (different data, different counts), switched by tab
               instead of stacked, so the active queue gets full table height.
               A lead can appear in both — switching tabs never merges them. ── */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1.5,
            bgcolor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 1, pt: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
              <Box
                role="tab"
                aria-selected={queueTab === 'callbacks'}
                tabIndex={0}
                onClick={() => setQueueTab('callbacks')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQueueTab('callbacks'); } }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.625, cursor: 'pointer',
                  px: 1.25, py: 0.875, borderRadius: '8px 8px 0 0',
                  borderBottom: '2px solid', borderBottomColor: queueTab === 'callbacks' ? '#C2410C' : 'transparent',
                  bgcolor: queueTab === 'callbacks' ? 'action.hover' : 'transparent',
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                }}
              >
                <EventAvailableIcon sx={{ fontSize: 15, color: '#C2410C' }} />
                <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, color: queueTab === 'callbacks' ? 'text.primary' : 'text.secondary' }}>
                  Callbacks
                </Typography>
                <Chip
                  size="small"
                  label={callbacks ? cbTotal : '…'}
                  sx={{ height: 17, minWidth: 22, borderRadius: '8px', fontSize: 10, fontWeight: 700, bgcolor: '#FFEDD5', color: '#C2410C' }}
                />
              </Box>
              <Box
                role="tab"
                aria-selected={queueTab === 'rnr'}
                tabIndex={0}
                onClick={() => setQueueTab('rnr')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQueueTab('rnr'); } }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.625, cursor: 'pointer',
                  px: 1.25, py: 0.875, borderRadius: '8px 8px 0 0',
                  borderBottom: '2px solid', borderBottomColor: queueTab === 'rnr' ? '#475569' : 'transparent',
                  bgcolor: queueTab === 'rnr' ? 'action.hover' : 'transparent',
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                }}
              >
                <PhoneMissedIcon sx={{ fontSize: 15, color: '#475569' }} />
                <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, color: queueTab === 'rnr' ? 'text.primary' : 'text.secondary' }}>
                  RNRs
                </Typography>
                <Chip
                  size="small"
                  label={rnrQueue ? rnrTotal : '…'}
                  sx={{ height: 17, minWidth: 22, borderRadius: '8px', fontSize: 10, fontWeight: 700, bgcolor: 'rgba(71, 85, 105, 0.10)', color: '#475569' }}
                />
              </Box>
              {/* ── Not Reachable tab — its OWN queue, count and backend filter ── */}
              <Box
                role="tab"
                aria-selected={queueTab === 'not-reachable'}
                tabIndex={0}
                onClick={() => setQueueTab('not-reachable')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQueueTab('not-reachable'); } }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.625, cursor: 'pointer',
                  px: 1.25, py: 0.875, borderRadius: '8px 8px 0 0',
                  borderBottom: '2px solid', borderBottomColor: queueTab === 'not-reachable' ? '#7C3AED' : 'transparent',
                  bgcolor: queueTab === 'not-reachable' ? 'action.hover' : 'transparent',
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                }}
              >
                <PhoneDisabledIcon sx={{ fontSize: 15, color: '#7C3AED' }} />
                <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, color: queueTab === 'not-reachable' ? 'text.primary' : 'text.secondary' }}>
                  Not Reachable
                </Typography>
                <Chip
                  size="small"
                  label={notReachableQueue ? notReachableTotal : '…'}
                  sx={{ height: 17, minWidth: 22, borderRadius: '8px', fontSize: 10, fontWeight: 700, bgcolor: 'rgba(124, 58, 237, 0.10)', color: '#7C3AED' }}
                />
              </Box>
              {queueTab === 'callbacks' && (overdueCount > 0 || todayCount > 0) && (
                <Box sx={{ ml: 'auto', mb: 0.875, display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  {overdueCount > 0 && (
                    <Chip
                      size="small"
                      label={`${overdueCount} overdue`}
                      sx={{ height: 18, borderRadius: '8px', fontSize: 10.5, fontWeight: 600, bgcolor: '#FEF2F2', color: '#B91C1C' }}
                    />
                  )}
                  {todayCount > 0 && (
                    <Chip
                      size="small"
                      label={`${todayCount} today`}
                      sx={{ height: 18, borderRadius: '8px', fontSize: 10.5, fontWeight: 600, bgcolor: '#FFFBEB', color: '#B45309' }}
                    />
                  )}
                </Box>
              )}
            </Box>
          </Box>

          {queueTab === 'callbacks' && (
            <TableContainer sx={{ flex: 1, minHeight: 0, maxHeight: 'none', overflowX: 'auto', overflowY: 'auto', scrollbarWidth: 'thin' }}>
              {callbacksError ? (
                <Box sx={{ p: 2 }}><QueueError message={callbacksError} onRetry={refetchCallbacks} /></Box>
              ) : !callbacks ? (
                <Box sx={{ p: 2 }}><QueueSkeleton /></Box>
              ) : cbTotal === 0 ? (
                <Box sx={{ color: 'text.secondary', fontSize: 13, py: 4, textAlign: 'center', px: 2 }}>
                  No callbacks — nothing to resume right now.
                </Box>
              ) : (
                <Table stickyHeader aria-label="Callbacks">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Type</TableCell>
                      <TableCell sx={{ py: 0.5, px: 1 }}>Student</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Lead ID</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Due / Retry</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Status</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1, width: '1%' }} align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allCallbacks.map((c) => {
                      const statusSx =
                        c._tone === 'error'
                          ? { color: '#B91C1C', bgcolor: '#FEF2F2', borderColor: '#FECACA' }
                          : c._tone === 'warning'
                            ? { color: '#B45309', bgcolor: '#FFFBEB', borderColor: '#FDE68A' }
                            : { color: '#374151', bgcolor: 'action.hover', borderColor: '#e5e7eb' };
                      return (
                        <TableRow key={c.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                          <TableCell sx={{ py: 0.625, px: 1 }}>
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: 20,
                                px: 1,
                                borderRadius: '8px',
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                                color: '#C2410C',
                                bgcolor: '#FFEDD5',
                                border: '1px solid rgba(194, 65, 12, 0.2)',
                              }}
                            >
                              Callback
                            </Box>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 220, py: 0.625, px: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                              <Typography
                                component="span"
                                title={c.studentName}
                                sx={{ fontSize: 14, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {c.studentName}
                              </Typography>
                              {c.priority && <PriorityChip priority={c.priority} />}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1 }}>
                            <Typography
                              component="span"
                              sx={{ fontSize: 12, color: 'text.disabled', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.02em' }}
                            >
                              {c.referenceId}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1 }}>
                            <Typography
                              component="span"
                              sx={{ fontSize: 13, fontWeight: c._tone === 'error' ? 600 : 400, color: c._tone === 'error' ? 'error.main' : 'text.secondary' }}
                            >
                              {fmtDue(c)}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1 }}>
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: 20,
                                px: 1,
                                borderRadius: '8px',
                                border: '1px solid',
                                fontSize: 11,
                                fontWeight: 600,
                                ...statusSx,
                              }}
                            >
                              {c._status}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1, width: '1%' }} align="right">
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                              <SecondaryButton
                                size="small"
                                startIcon={<VisibilityIcon sx={{ fontSize: 12 }} />}
                                onClick={() => openLead(c.id)}
                                disabled={fetchingLead}
                                sx={{ minHeight: 30, fontSize: 12, px: 1.25, ...secondaryNeutralSx }}
                              >
                                View
                              </SecondaryButton>
                              <PrimaryButton
                                size="small"
                                startIcon={<AutorenewIcon sx={{ fontSize: 12 }} />}
                                onClick={() => openLead(c.id)}
                                disabled={fetchingLead}
                                sx={{ minHeight: 30, fontSize: 12, px: 1.25, ...primaryBrandSx }}
                              >
                                Resume
                              </PrimaryButton>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
          )}

          {/* ── RNR table — a SEPARATE queue: leads currently in RNR
                 workload (rnr.service 'current' set). Never merged with the
                 Callback table; a lead can appear in both, one tab at a time. ── */}
          {queueTab === 'rnr' && (
            <TableContainer sx={{ flex: 1, minHeight: 0, maxHeight: 'none', overflowX: 'auto', overflowY: 'auto', scrollbarWidth: 'thin' }}>
              {rnrError ? (
                <Box sx={{ p: 2 }}><QueueError message={rnrError} onRetry={refetchRnrQueue} /></Box>
              ) : !rnrQueue ? (
                <Box sx={{ p: 2 }}><QueueSkeleton rows={2} /></Box>
              ) : rnrRows.length === 0 ? (
                <Box sx={{ color: 'text.secondary', fontSize: 13, py: 4, textAlign: 'center', px: 2 }}>
                  No RNR leads — nothing to retry right now.
                </Box>
              ) : (
                <Table stickyHeader aria-label="RNR">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Type</TableCell>
                      <TableCell sx={{ py: 0.5, px: 1 }}>Student</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Lead ID</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Last Attempt</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1, width: '1%' }} align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rnrRows.map((r) => (
                      <TableRow key={r.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ py: 0.625, px: 1 }}>
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 20,
                              px: 1,
                              borderRadius: '8px',
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: '0.02em',
                              color: '#475569',
                              bgcolor: 'rgba(71, 85, 105, 0.10)',
                              border: '1px solid rgba(71, 85, 105, 0.2)',
                            }}
                          >
                            RNR
                          </Box>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220, py: 0.625, px: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <Typography
                              component="span"
                              title={r.studentName}
                              sx={{ fontSize: 14, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {r.studentName}
                            </Typography>
                            {r.priority && <PriorityChip priority={r.priority} />}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1 }}>
                          <Typography
                            component="span"
                            sx={{ fontSize: 12, color: 'text.disabled', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.02em' }}
                          >
                            {r.referenceId}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1 }}>
                          <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>
                            {fmtLastAttempt(r)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1, width: '1%' }} align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <SecondaryButton
                              size="small"
                              startIcon={<VisibilityIcon sx={{ fontSize: 12 }} />}
                              onClick={() => openLead(r.id)}
                              disabled={fetchingLead}
                              sx={{ minHeight: 30, fontSize: 12, px: 1.25, ...secondaryNeutralSx }}
                            >
                              View
                            </SecondaryButton>
                            <PrimaryButton
                              size="small"
                              startIcon={<AutorenewIcon sx={{ fontSize: 12 }} />}
                              onClick={() => openLead(r.id)}
                              disabled={fetchingLead}
                              sx={{ minHeight: 30, fontSize: 12, px: 1.25, ...WORK_TYPE_RESUME.RNR }}
                            >
                              Resume
                            </PrimaryButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
          )}

          {/* ── Not Reachable table — a SEPARATE queue: leads whose latest
                 disposition is "Switched Off / Not Reachable" (rnr.service
                 'not-reachable' set). Resolved by its own backend filter, never
                 by filtering the RNR result, and never merged with Callbacks. ── */}
          {queueTab === 'not-reachable' && (
            <TableContainer sx={{ flex: 1, minHeight: 0, maxHeight: 'none', overflowX: 'auto', overflowY: 'auto', scrollbarWidth: 'thin' }}>
              {notReachableError ? (
                <Box sx={{ p: 2 }}><QueueError message={notReachableError} onRetry={refetchNotReachableQueue} /></Box>
              ) : !notReachableQueue ? (
                <Box sx={{ p: 2 }}><QueueSkeleton rows={2} /></Box>
              ) : notReachableRows.length === 0 ? (
                <Box sx={{ color: 'text.secondary', fontSize: 13, py: 4, textAlign: 'center', px: 2 }}>
                  No Not Reachable leads — nothing to retry right now.
                </Box>
              ) : (
                <Table stickyHeader aria-label="Not Reachable">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Type</TableCell>
                      <TableCell sx={{ py: 0.5, px: 1 }}>Student</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Lead ID</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1 }}>Last Attempt</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: 0.5, px: 1, width: '1%' }} align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {notReachableRows.map((r) => (
                      <TableRow key={r.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ py: 0.625, px: 1 }}>
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 20,
                              px: 1,
                              borderRadius: '8px',
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: '0.02em',
                              color: '#7C3AED',
                              bgcolor: 'rgba(124, 58, 237, 0.10)',
                              border: '1px solid rgba(124, 58, 237, 0.2)',
                            }}
                          >
                            Not Reachable
                          </Box>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220, py: 0.625, px: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <Typography
                              component="span"
                              title={r.studentName}
                              sx={{ fontSize: 14, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {r.studentName}
                            </Typography>
                            {r.priority && <PriorityChip priority={r.priority} />}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1 }}>
                          <Typography
                            component="span"
                            sx={{ fontSize: 12, color: 'text.disabled', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.02em' }}
                          >
                            {r.referenceId}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1 }}>
                          <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>
                            {fmtLastAttempt(r)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', py: 0.625, px: 1, width: '1%' }} align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <SecondaryButton
                              size="small"
                              startIcon={<VisibilityIcon sx={{ fontSize: 12 }} />}
                              onClick={() => openLead(r.id)}
                              disabled={fetchingLead}
                              sx={{ minHeight: 30, fontSize: 12, px: 1.25, ...secondaryNeutralSx }}
                            >
                              View
                            </SecondaryButton>
                            <PrimaryButton
                              size="small"
                              startIcon={<AutorenewIcon sx={{ fontSize: 12 }} />}
                              onClick={() => openLead(r.id)}
                              disabled={fetchingLead}
                              sx={{ minHeight: 30, fontSize: 12, px: 1.25, ...WORK_TYPE_RESUME['Not Reachable'] }}
                            >
                              Resume
                            </PrimaryButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
          )}
        </Box>

        {/* ── Performance Summary ── */}
        <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PerformanceSummaryTable data={performance} loading={!performance} subtitle={null} tableMaxHeight={400} onCellClick={handlePerformanceCellClick} />
        </Box>
      </Box>

      {/* ── Assigned Leads drawer ── */}
      <AssignedLeadsDrawer
        open={assignedOpen}
        onClose={() => setAssignedOpen(false)}
        preset={assignedPreset}
        onOpenLead={openAssignedLead}
        fetchingLead={fetchingLead}
      />

      {/* ── Performance Summary drilldown ── */}
      <PerformanceDrilldownDrawer
        open={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        periodLabel={drilldownCtx?.periodLabel}
        metricLabel={drilldownCtx?.metricLabel}
        period={drilldownCtx?.period}
        metric={drilldownCtx?.metric}
        onOpenLead={openDrilldownLead}
      />
    </Box>
  );
}
