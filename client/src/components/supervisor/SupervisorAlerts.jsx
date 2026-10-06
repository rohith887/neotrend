import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useToast } from '../../context/ToastContext.jsx';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  approveDropRequest as approveDropRequestApi,
  denyDropRequest as denyDropRequestApi,
} from '../../api/notifications.js';
import { approveLogoutOverride } from '../../api/logoutGate.js';
import { DataTable, FilterSelect, StatusChip } from '../../ui/mui/index.js';

/* ── Helpers ──────────────────────────────────────────────────────────── */

const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

/* Short absolute timestamp: "Sep 11, 10:45 AM" — used in alert details. */
const fmtStamp = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* ── Type presentation maps ─────────────────────────────────────────── */

const TYPE_LABEL = {
  'break-exceeded':     'Break Exceeded',
  'drop-request':       'Lead Dropped',
  'logout-blocked':     'Logout Blocked',
  'logout-overridden':  'Logout Override',
  'task-sla-breach':    'SLA Breach',
  'task-overdue':       'Task Overdue',
  'task-assigned':      'Task Assigned',
  'task-reassigned':    'Reassigned',
  'supervisor-mention': 'Mention',
  'contact-viewed':     'Contact Viewed',
  'info':               'Info',
};

const TYPE_TONE = {
  'break-exceeded':     'warning',
  'drop-request':       'danger',
  'logout-blocked':     'warning',
  'logout-overridden':  'primary',
  'task-sla-breach':    'danger',
  'task-overdue':       'warning',
  'task-assigned':      'primary',
  'task-reassigned':    'primary',
  'supervisor-mention': 'info',
  'contact-viewed':     'warning',
  'info':               'default',
};

/* Type filter options — every type this feed actually generates (same
   vocabulary as TYPE_LABEL/TYPE_TONE above), so there's never a filter
   choice that silently shows zero results. */
const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Types' },
  ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

/* Monitoring window — scopes the feed to a real, understood time range
   instead of "the newest 50 rows, whatever dates those happen to span".
   Default is 48h: recent enough to be actionable, wide enough that a quiet
   shift-change doesn't drop something that still matters. */
const RANGE_OPTIONS = [
  { value: '24',  label: 'Last 24 Hours' },
  { value: '48',  label: 'Last 48 Hours' },
  { value: '168', label: 'Last 7 Days' },
  { value: 'all', label: 'All Time' },
];
const DEFAULT_RANGE = '48';
const FETCH_LIMIT = 300;

const READ_FILTER_OPTIONS = [
  { value: 'all',    label: 'Read & Unread' },
  { value: 'unread', label: 'Unread Only' },
  { value: 'read',   label: 'Read Only' },
];

/* ── Field extractors ────────────────────────────────────────────────── */

/* Short, scannable summary — the detailed information lives in Details. */
const summaryOf = (n) => {
  if (n.type === 'break-exceeded')        return n.meta?.breakType || 'Break exceeded';
  if (n.type === 'drop-request')          return n.leadStudent || n.meta?.leadStudent || 'Lead dropped';
  if (n.type === 'logout-blocked')        return n.meta?.targetName ? `Logout blocked — ${n.meta.targetName}` : 'Logout blocked';
  if (n.type === 'logout-overridden')     return n.meta?.targetName ? `Logout granted — ${n.meta.targetName}` : 'Logout override';
  if (n.type === 'contact-viewed')        return `${n.meta?.field || 'Contact'} viewed — ${n.meta?.targetName || 'Unknown'}`;
  return n.title || n.body || '—';
};

const userOf = (n) => {
  if (n.type === 'break-exceeded'   || n.type === 'logout-blocked') return n.meta?.targetName || '—';
  if (n.type === 'logout-overridden') return n.meta?.supervisorName || n.meta?.targetName || '—';
  if (
    n.type === 'task-assigned' || n.type === 'task-reassigned' || n.type === 'task-sla-breach' ||
    n.type === 'task-overdue' || n.type === 'contact-viewed'
  ) {
    return n.meta?.targetName || '—';
  }
  return n.senderName || n.meta?.senderName || '—';
};

const roleLabel = (raw) => {
  if (!raw) return '—';
  return raw.charAt(0) + raw.slice(1).toLowerCase();
};

const dropStateLabel = (n) => {
  const d = n.dropDecision || 'pending';
  if (d === 'approved') return 'Approved';
  if (d === 'denied')   return 'Denied';
  return 'Drop Pending';
};

const dropStateTone = (n) => {
  const d = n.dropDecision || 'pending';
  if (d === 'approved') return 'success';
  if (d === 'denied')   return 'danger';
  return 'warning';
};

const logoutStatusLabel = (n) => {
  const s = n.overrideStatus || 'pending';
  if (s === 'approved')   return 'Granted';
  if (s === 'used')       return 'Used';
  if (s === 'superseded') return 'Superseded';
  return 'Pending';
};

const logoutStatusTone = (n) => {
  const s = n.overrideStatus || 'pending';
  if (s === 'approved')   return 'success';
  if (s === 'used')       return 'neutral';
  if (s === 'superseded') return 'default';
  return 'warning';
};

/* ── Alert-specific detail text (fully readable, no hiding) ──────────── */

const detailTextOf = (n) => {
  const m = n.meta || {};

  /* Break Exceeded — Morning Tea Break · Allowed: 15 min · Actual: 21 min ·
     Exceeded: +6 min · Ended: Sep 11, 10:45 AM */
  if (n.type === 'break-exceeded') {
    const parts = [m.breakType || 'Break exceeded'];
    if (m.allowedMinutes != null) parts.push(`Allowed: ${m.allowedMinutes} min`);
    if (m.actualMinutes != null)  parts.push(`Actual: ${m.actualMinutes} min`);
    if (m.excessMinutes != null)  parts.push(`Exceeded: +${m.excessMinutes} min`);
    parts.push(`Ended: ${fmtStamp(m.endedAt)}`);
    return parts.join(' · ');
  }

  /* Lead Dropped — Student: testlead03 · Lead: GR-001671 · From: Rohith Reddy ·
     Reason: test drop · State: Drop Pending */
  if (n.type === 'drop-request') {
    const parts = [
      `Student: ${n.leadStudent || m.leadStudent || '—'}`,
      `Lead: ${n.leadRef || m.leadRef || '—'}`,
      `From: ${n.senderName || m.senderName || '—'}`,
    ];
    if (m.dropReason) parts.push(`Reason: ${m.dropReason}`);
    parts.push(`State: ${dropStateLabel(n)}`);
    return parts.join(' · ');
  }

  /* Logout Blocked — User: Diya Katti · Role: Agent · Pending: 2 RNR +
     1 Callback · Blocked at: Sep 10, 2:30 PM */
  if (n.type === 'logout-blocked') {
    const cb  = m.pendingCallbacks != null && m.pendingCallbacks !== '' ? Number(m.pendingCallbacks) : 0;
    const rnr = m.unfinishedRnr   != null && m.unfinishedRnr   !== '' ? Number(m.unfinishedRnr)   : 0;
    const parts = [
      `User: ${m.targetName || '—'}`,
      `Role: ${roleLabel(m.targetRole)}`,
      `Pending: ${rnr} RNR + ${cb} Callback`,
      `Blocked at: ${fmtStamp(m.attemptAt || n.createdAt)}`,
    ];
    return parts.join(' · ');
  }

  /* Contact Viewed — Student: Priya S · Field: Mobile · Viewed by: Diya Katti
     (Agent) · At: Sep 11, 10:45 AM */
  if (n.type === 'contact-viewed') {
    const parts = [
      `Student: ${n.leadStudent || m.leadStudent || '—'}`,
      `Field: ${m.field || '—'}`,
      `Viewed by: ${m.targetName || '—'}${m.targetRole ? ` (${roleLabel(m.targetRole)})` : ''}`,
      `At: ${fmtStamp(n.createdAt)}`,
    ];
    return parts.join(' · ');
  }

  return n.body || '—';
};

/* ── Shared chip sx tokens ───────────────────────────────────────────── */

const TYPE_CHIP_SX  = { height: 22, fontSize: 10.5, fontWeight: 600, '& .MuiChip-label': { px: 1 } };
const STATE_CHIP_SX = { height: 20, fontSize: 10.5, fontWeight: 600, '& .MuiChip-label': { px: 0.75 } };

/* Shared Detail text style: wraps to a maximum of two lines so important
   information is never hidden, with the full text available on hover. */
const DETAIL_SX = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  whiteSpace: 'normal',
  fontSize: 12,
  lineHeight: 1.45,
  color: 'text.secondary',
  flex: 1,
  minWidth: 0,
};

/* Break Exceeded's detail is 4 discrete numbers (allowed/actual/excess/ended)
   that read far faster as small side-by-side values than as one joined,
   wrapping sentence — this was the dominant alert type wrapping to 2 lines
   on every row. Same underlying meta fields as detailTextOf(), just laid
   out instead of joined with " · ". */
function StatValue({ label, value, tone }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 0.4,
        px: 0.6,
        py: 0.15,
        borderRadius: '4px',
        bgcolor: tone === 'danger' ? 'error.soft' : 'action.hover',
        flexShrink: 0,
      }}
    >
      <Typography component="span" sx={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.disabled' }}>
        {label}
      </Typography>
      <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 700, color: tone === 'danger' ? 'error.main' : 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}

/* The break type name is already shown in the Alert/Summary column, and the
   exact end time is already the Time column's own tooltip — repeating both
   here is exactly the duplication that was pushing this cell to 2 lines.
   Just the 3 numbers that aren't shown anywhere else on the row. */
const renderBreakExceededDetail = (row) => {
  const m = row.meta || {};
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0, width: '100%' }}>
      {m.allowedMinutes != null && <StatValue label="Allowed" value={`${m.allowedMinutes}m`} />}
      {m.actualMinutes != null && <StatValue label="Actual" value={`${m.actualMinutes}m`} />}
      {m.excessMinutes != null && <StatValue label="Over" value={`+${m.excessMinutes}m`} tone="danger" />}
    </Box>
  );
};

const renderDetailCell = (_v, row) => {
  if (row.type === 'break-exceeded') return renderBreakExceededDetail(row);

  const text = detailTextOf(row);
  const pill =
    row.type === 'drop-request'
      ? { label: dropStateLabel(row), tone: dropStateTone(row) }
      : row.type === 'logout-blocked'
        ? { label: logoutStatusLabel(row), tone: logoutStatusTone(row) }
        : null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        minWidth: 0,
        width: '100%',
        justifyContent: 'flex-start',
      }}
    >
      {pill && (
        <StatusChip
          status={pill.label}
          tone={pill.tone}
          dot={false}
          size="small"
          sx={{ ...STATE_CHIP_SX, flexShrink: 0 }}
        />
      )}
      <Tooltip title={text} placement="top" arrow enterDelay={400}>
        <Box component="div" sx={DETAIL_SX}>
          {text}
        </Box>
      </Tooltip>
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   SUPERVISOR ALERTS — compact enterprise CRM table
   ═══════════════════════════════════════════════════════════════════════ */
export default function SupervisorAlerts({ canOverrideLogout = true, canApproveDrop = true }) {
  const { push }  = useToast();

  const [items,          setItems]          = useState(null);
  const [error,          setError]          = useState(null);
  const [decidingDropId, setDecidingDropId] = useState(null);
  const [overridingId,   setOverridingId]   = useState(null);
  const [reviewMenu,     setReviewMenu]     = useState(null);
  const [typeFilter,     setTypeFilter]     = useState('all');
  const [rangeFilter,    setRangeFilter]    = useState(DEFAULT_RANGE);
  const [readFilter,     setReadFilter]     = useState('all');

  /* ── Data loading ──────────────────────────────────────────────────── */
  const load = useCallback(async (range) => {
    setError(null);
    try {
      const hours = (range ?? rangeFilter) === 'all' ? undefined : (range ?? rangeFilter);
      setItems(await fetchNotifications({ limit: FETCH_LIMIT, hours }));
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not load alerts');
    }
  }, [rangeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleRangeChange = useCallback((e) => {
    const next = e.target.value;
    setRangeFilter(next);
    load(next);
  }, [load]);

  /* ── Row click → mark read only (no redirection) ────────────────────── */
  const handleOpen = useCallback((n) => {
    if (n.read) return;
    try { markNotificationRead(n.id); } catch (_) { /* best-effort */ }
    setItems((prev) =>
      (prev || []).map((x) => (x.id === n.id ? { ...x, read: true, readAt: new Date().toISOString() } : x)),
    );
  }, []);

  /* ── Mark all read ─────────────────────────────────────────────────── */
  const handleMarkAll = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => (prev || []).map((x) => ({ ...x, read: true, readAt: new Date().toISOString() })));
    } catch (_) { /* noop */ }
  }, []);

  /* ── Drop approve / deny (stopPropagation so row click doesn't fire) ── */
  const handleApproveDrop = useCallback(async (e, n) => {
    e.stopPropagation();
    if (decidingDropId) return;
    setDecidingDropId(n.id);
    try {
      await approveDropRequestApi(n.id, '');
      push('Drop approved', 'success');
      await load();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not approve the drop', 'danger');
    } finally { setDecidingDropId(null); }
  }, [decidingDropId, load, push]);

  const handleDenyDrop = useCallback(async (e, n) => {
    e.stopPropagation();
    if (decidingDropId) return;
    setDecidingDropId(n.id);
    try {
      await denyDropRequestApi(n.id, '');
      push('Drop denied', 'success');
      await load();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not deny the drop', 'danger');
    } finally { setDecidingDropId(null); }
  }, [decidingDropId, load, push]);

  /* ── Logout override ───────────────────────────────────────────────── */
  const handleOverride = useCallback(async (e, n) => {
    e.stopPropagation();
    if (overridingId) return;
    const reason = window.prompt('Reason for logout override (optional):', '') ?? '';
    setOverridingId(n.id);
    try {
      await approveLogoutOverride(n.id, reason.trim());
      push('Logout override granted', 'success');
      await load();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not grant the logout override', 'danger');
    } finally { setOverridingId(null); }
  }, [overridingId, load, push]);

  /* ── Derived data ──────────────────────────────────────────────────── */
  // Unread count always reflects ALL alerts (matches "Mark all read", which
  // also acts on everything) — only the table rows are affected by the type
  // / read filters below.
  const unread = useMemo(() => (items || []).filter((n) => !n.read).length, [items]);
  const visibleItems = useMemo(() => items ?? [], [items]);
  const filteredItems = useMemo(
    () => visibleItems
      .filter((n) => typeFilter === 'all' || n.type === typeFilter)
      .filter((n) => readFilter === 'all' || (readFilter === 'unread' ? !n.read : n.read)),
    [visibleItems, typeFilter, readFilter],
  );

  /* ── Table columns ─────────────────────────────────────────────────── */
  /* Width priority: Details > Alert/Summary > User > Lead > Status > Time
     > Type > Actions. Details absorbs the flexible column width so it can
     show the full information on up to two lines. */
  const columns = useMemo(() => [
    /* ── Date / Time (leads the row — a supervisor monitoring a time
       window needs to know exactly when something happened before
       anything else; exact date/time up front, relative underneath) ── */
    {
      key: 'createdAt',
      label: 'Date / Time',
      sortable: true,
      width: 108,
      accessor: (row) => (row.createdAt ? new Date(row.createdAt).getTime() : 0),
      render: (_v, row) => (
        <Tooltip title={row.createdAt ? new Date(row.createdAt).toLocaleString() : ''} arrow>
          <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.primary' }}>
              {fmtStamp(row.createdAt)}
            </Typography>
            <Typography noWrap sx={{ fontSize: 10, color: 'text.disabled' }}>
              {timeAgo(row.createdAt)}
            </Typography>
          </Box>
        </Tooltip>
      ),
    },

    /* ── Type ─────────────────────────────────────────────── */
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      width: 100,
      accessor: (row) => TYPE_LABEL[row.type] || row.type,
      render: (_v, row) => (
        <StatusChip
          status={TYPE_LABEL[row.type] || row.type}
          tone={TYPE_TONE[row.type] || 'neutral'}
          dot={false}
          size="small"
          sx={TYPE_CHIP_SX}
        />
      ),
    },

    /* ── Alert / Summary (short & scannable) ─────────────── */
    {
      key: 'summary',
      label: 'Alert / Summary',
      sortable: true,
      width: 142,
      accessor: (row) => summaryOf(row),
      render: (_v, row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: 142 }}>
          {!row.read && (
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />
          )}
          <Tooltip title={summaryOf(row)} placement="top" arrow enterDelay={400}>
            <Typography
              noWrap
              sx={{ fontSize: 12.5, fontWeight: row.read ? 500 : 600, color: 'text.primary' }}
            >
              {summaryOf(row)}
            </Typography>
          </Tooltip>
        </Box>
      ),
    },

    /* ── User ────────────────────────────────────────────── */
    {
      key: 'user',
      label: 'User',
      sortable: true,
      width: 112,
      accessor: (row) => userOf(row),
      render: (_v, row) => (
        <Tooltip title={userOf(row)} placement="top" arrow enterDelay={400}>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
            {userOf(row)}
          </Typography>
        </Tooltip>
      ),
    },

    /* ── Lead ────────────────────────────────────────────── */
    {
      key: 'leadRef',
      label: 'Lead',
      sortable: true,
      width: 92,
      accessor: (row) => row.leadRef || null,
      render: (_v, row) =>
        row.leadRef ? (
          <Tooltip title={row.leadRef} arrow>
            <Typography
              noWrap
              sx={{ fontSize: 12, fontFamily: 'monospace', color: 'text.secondary' }}
            >
              {row.leadRef}
            </Typography>
          </Tooltip>
        ) : (
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>
        ),
    },

    /* ── Details (widest column — full alert payload) ────── */
    {
      key: 'details',
      label: 'Details',
      sortable: false,
      width: '38%',
      accessor: (row) => detailTextOf(row),
      render: renderDetailCell,
    },

    /* ── Status (read / unread) ──────────────────────────── */
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: 78,
      accessor: (row) => (row.read ? 'Read' : 'Unread'),
      render: (_v, row) => (
        <StatusChip
          status={row.read ? 'Read' : 'Unread'}
          tone={row.read ? 'neutral' : 'primary'}
          dot={false}
          size="small"
          sx={{ height: 20, fontSize: 10.5, '& .MuiChip-label': { px: 0.75 } }}
        />
      ),
    },

  ], []);

  /* ── Per-row action buttons ────────────────────────────────────────── */
  const renderActions = useCallback(
    (row) => {
      /* Drop request — one compact Review action; the decision menu holds
         Approve Drop (green) / Deny Drop (red). */
      if (row.type === 'drop-request' && (row.dropDecision || 'pending') === 'pending' && canApproveDrop) {
        return (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
            <Button
              size="small"
              variant="outlined"
              color="primary"
              disabled={decidingDropId === row.id}
              onClick={(e) => {
                e.stopPropagation();
                setReviewMenu({ anchorEl: e.currentTarget, row });
              }}
              endIcon={<ArrowDropDownIcon sx={{ fontSize: 15 }} />}
              sx={{ textTransform: 'none', fontSize: 10.5, height: 24, minWidth: 0, px: 1.25 }}
            >
              {decidingDropId === row.id ? '…' : 'Review'}
            </Button>
          </Box>
        );
      }

      /* Logout blocked — Override */
      if (row.type === 'logout-blocked' && (row.overrideStatus || 'pending') === 'pending' && canOverrideLogout) {
        return (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={overridingId === row.id}
              onClick={(e) => handleOverride(e, row)}
              sx={{ textTransform: 'none', fontSize: 10.5, height: 24, minWidth: 0, px: 1 }}
            >
              {overridingId === row.id ? '…' : 'Override'}
            </Button>
          </Box>
        );
      }

      return null;
    },
    [canApproveDrop, canOverrideLogout, decidingDropId, overridingId, handleApproveDrop, handleDenyDrop, handleOverride],
  );

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <Box
      sx={{
        // Fills the page's own scroll area (Layout's main content Box) and
        // owns its height outright — the table's internal scroll is the
        // only scrollbar. Without this, the whole page grew to fit however
        // many rows were on screen and scrolled as a second, outer scrollbar
        // on top of the table's own, which is what felt broken.
        height: '100%',
        overflow: 'hidden',
        // No padding here — Layout's own content wrapper already adds 20px
        // on every side for every page. This component was adding another
        // 12/18/24px on top of that (LeadManagement/UniversityManagement/
        // ReferralManagement add none), doubling the inset for no reason.
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header row ──────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexShrink: 0 }}>
        <NotificationsActiveIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle1" sx={{ fontSize: 15, fontWeight: 700 }}>
          Alerts
        </Typography>
        {unread > 0 && (
          <Chip size="small" color="primary" label={`${unread} unread`} sx={{ height: 20, fontSize: 11 }} />
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
          onClick={load}
          sx={{ textTransform: 'none', fontSize: 12 }}
        >
          Refresh
        </Button>
        {unread > 0 && (
          <Button size="small" onClick={handleMarkAll} sx={{ textTransform: 'none', fontSize: 12 }}>
            Mark all read
          </Button>
        )}
      </Box>

      {/* ── Error ────────────────────────────────────────────── */}
      {error && (
        <Typography sx={{ fontSize: 12.5, color: 'error.main', mb: 1, flexShrink: 0 }}>
          {error}
        </Typography>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: 1,
          borderColor: 'divider',
          borderRadius: '0 0 6px 6px',
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        <DataTable
          columns={columns}
          data={filteredItems}
          keyField="id"
          loading={items === null}
          dense
          sortable
          initialPageSize={10}
          pageSizeOptions={[10, 25, 50]}
          emptyTitle={typeFilter === 'all' && readFilter === 'all' ? 'No alerts' : `No ${TYPE_LABEL[typeFilter] || typeFilter || 'matching'} alerts`}
          emptyText={
            typeFilter === 'all' && readFilter === 'all'
              ? `No activity in the ${RANGE_OPTIONS.find((r) => r.value === rangeFilter)?.label.toLowerCase() || 'selected range'}. Alerts that need your attention will appear here.`
              : 'Try a different type, range or status, or reset the filters.'
          }
          onRowClick={handleOpen}
          isRowClickable={(row) => !row.read}
          renderActions={renderActions}
          hidePagination={filteredItems.length <= 10}
          toolbar={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
              <FilterSelect
                label="Type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                options={TYPE_FILTER_OPTIONS}
                sx={{ minWidth: 168, height: 30 }}
              />
              <FilterSelect
                label="Range"
                value={rangeFilter}
                onChange={handleRangeChange}
                options={RANGE_OPTIONS}
                sx={{ minWidth: 152, height: 30 }}
              />
              <FilterSelect
                label="Status"
                value={readFilter}
                onChange={(e) => setReadFilter(e.target.value)}
                options={READ_FILTER_OPTIONS}
                sx={{ minWidth: 156, height: 30 }}
              />
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>
                {filteredItems.length} alert{filteredItems.length === 1 ? '' : 's'} · {RANGE_OPTIONS.find((r) => r.value === rangeFilter)?.label}
              </Typography>
            </Box>
          }
          containerSx={{
            /* Table fills the available page width; Details owns the flex
               column so it stays the widest. Capped to ~20 dense rows
               (header ~47px + 20 × ~37px row) — with the default 10-per-page
               this never engages, but picking 25 or 50 rows scrolls inside
               this box instead of pushing the whole page down. */
            maxHeight: 787,
            '& .MuiTable-root': { width: '100%', tableLayout: 'fixed' },
            /* Reserve enough space for the Review / Override button. */
            '& .MuiTableHead-root th:last-of-type': { width: 96, minWidth: 96 },
          }}
        />
      </Box>

      {/* ── Footer note ──────────────────────────────────────── */}

      {/* ── Pending-drop decision menu ────────────────────────── */}
      <Menu
        anchorEl={reviewMenu?.anchorEl}
        open={!!reviewMenu}
        onClose={() => setReviewMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 160, py: 0.5 } } }}
      >
        <MenuItem
          disabled={decidingDropId === reviewMenu?.row?.id}
          onClick={(e) => {
            const n = reviewMenu?.row;
            setReviewMenu(null);
            if (n) handleApproveDrop(e, n);
          }}
          sx={{ fontSize: 12.5, fontWeight: 600, color: 'success.main', px: 1.75, py: 0.75 }}
        >
          Approve Drop
        </MenuItem>
        <MenuItem
          disabled={decidingDropId === reviewMenu?.row?.id}
          onClick={(e) => {
            const n = reviewMenu?.row;
            setReviewMenu(null);
            if (n) handleDenyDrop(e, n);
          }}
          sx={{ fontSize: 12.5, fontWeight: 600, color: 'error.main', px: 1.75, py: 0.75 }}
        >
          Deny Drop
        </MenuItem>
      </Menu>
    </Box>
  );
}