import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Chip, Tooltip, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import RefreshIcon from '@mui/icons-material/Refresh';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/notifications.js';
import { DataTable, FilterSelect, StatusChip } from '../../ui/mui/index.js';

/* ═══════════════════════════════════════════════════════════════════════
   COUNSELOR ALERTS — same compact enterprise DataTable pattern as
   SupervisorAlerts.jsx (Type / Summary / From / Lead / Details / Status /
   Time, sortable, filterable, paginated), reused as-is rather than the
   simple card-list AlertsPanel. Deliberately NO drop-approve/deny or
   logout-override actions — those are supervisor-only capabilities the
   counselor role doesn't have; this only ever shows the counselor-relevant
   alert types, so those actions never apply here anyway.
   ═══════════════════════════════════════════════════════════════════════ */

const COUNSELOR_ALERT_TYPES = [
  'supervisor-mention', 'task-sla-breach', 'task-overdue', 'task-assigned', 'task-reassigned', 'info',
];

const TYPE_LABEL = {
  'task-sla-breach':    'SLA Breach',
  'task-overdue':       'Task Overdue',
  'task-assigned':      'Task Assigned',
  'task-reassigned':    'Reassigned',
  'supervisor-mention': 'Mention',
  'info':               'Info',
};

const TYPE_TONE = {
  'task-sla-breach':    'danger',
  'task-overdue':       'warning',
  'task-assigned':      'primary',
  'task-reassigned':    'primary',
  'supervisor-mention': 'info',
  'info':               'default',
};

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Types' },
  ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

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

const summaryOf = (n) => n.title || n.body || '—';
const userOf = (n) => n.senderName || '—';

const TYPE_CHIP_SX = { height: 22, fontSize: 10.5, fontWeight: 600, '& .MuiChip-label': { px: 1 } };
const DETAIL_SX = {
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  whiteSpace: 'normal', fontSize: 12, lineHeight: 1.45, color: 'text.secondary', flex: 1, minWidth: 0,
};

export default function CounselorAlerts() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchNotifications({ limit: 50 }));
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not load alerts');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Same behavior as before: mark read, then open the lead in the Counselor
  // Workspace via routePayload.
  const handleOpen = useCallback((n) => {
    try { markNotificationRead(n.id); } catch (_) { /* best-effort */ }
    setItems((prev) => (prev || []).map((x) => (x.id === n.id ? { ...x, read: true, readAt: new Date().toISOString() } : x)));
    if (n.lead) navigate('/counselor/workspace', { state: { _id: n.lead } });
  }, [navigate]);

  const handleMarkAll = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => (prev || []).map((x) => ({ ...x, read: true, readAt: new Date().toISOString() })));
    } catch (_) { /* noop */ }
  }, []);

  const visibleItems = useMemo(
    () => (items || []).filter((n) => COUNSELOR_ALERT_TYPES.includes(n.type)),
    [items],
  );
  const unread = useMemo(() => visibleItems.filter((n) => !n.read).length, [visibleItems]);
  const filteredItems = useMemo(
    () => (typeFilter === 'all' ? visibleItems : visibleItems.filter((n) => n.type === typeFilter)),
    [visibleItems, typeFilter],
  );

  const columns = useMemo(() => [
    {
      key: 'type', label: 'Type', sortable: true, width: 100,
      accessor: (row) => TYPE_LABEL[row.type] || row.type,
      render: (_v, row) => <StatusChip status={TYPE_LABEL[row.type] || row.type} tone={TYPE_TONE[row.type] || 'neutral'} dot={false} size="small" sx={TYPE_CHIP_SX} />,
    },
    {
      key: 'summary', label: 'Alert / Summary', sortable: true, width: 160,
      accessor: (row) => summaryOf(row),
      render: (_v, row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: 160 }}>
          {!row.read && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />}
          <Tooltip title={summaryOf(row)} placement="top" arrow enterDelay={400}>
            <Typography noWrap sx={{ fontSize: 12.5, fontWeight: row.read ? 500 : 600, color: 'text.primary' }}>{summaryOf(row)}</Typography>
          </Tooltip>
        </Box>
      ),
    },
    {
      key: 'user', label: 'From', sortable: true, width: 120,
      accessor: (row) => userOf(row),
      render: (_v, row) => (
        <Tooltip title={userOf(row)} placement="top" arrow enterDelay={400}>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{userOf(row)}</Typography>
        </Tooltip>
      ),
    },
    {
      key: 'leadRef', label: 'Lead', sortable: true, width: 92,
      accessor: (row) => row.leadRef || null,
      render: (_v, row) => row.leadRef
        ? <Tooltip title={row.leadRef} arrow><Typography noWrap sx={{ fontSize: 12, fontFamily: 'monospace', color: 'text.secondary' }}>{row.leadRef}</Typography></Tooltip>
        : <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>,
    },
    {
      key: 'details', label: 'Details', sortable: false, width: '38%',
      accessor: (row) => row.body || '—',
      render: (_v, row) => (
        <Tooltip title={row.body || '—'} placement="top" arrow enterDelay={400}>
          <Box component="div" sx={DETAIL_SX}>{row.body || '—'}</Box>
        </Tooltip>
      ),
    },
    {
      key: 'status', label: 'Status', sortable: true, width: 78,
      accessor: (row) => (row.read ? 'Read' : 'Unread'),
      render: (_v, row) => <StatusChip status={row.read ? 'Read' : 'Unread'} tone={row.read ? 'neutral' : 'primary'} dot={false} size="small" sx={{ height: 20, fontSize: 10.5, '& .MuiChip-label': { px: 0.75 } }} />,
    },
    {
      key: 'createdAt', label: 'Time', sortable: true, width: 58,
      accessor: (row) => (row.createdAt ? new Date(row.createdAt).getTime() : 0),
      render: (_v, row) => (
        <Tooltip title={row.createdAt ? new Date(row.createdAt).toLocaleString() : ''} arrow>
          <Typography noWrap sx={{ fontSize: 11.5, color: 'text.disabled', whiteSpace: 'nowrap' }}>{timeAgo(row.createdAt)}</Typography>
        </Tooltip>
      ),
    },
  ], []);

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexShrink: 0 }}>
        <NotificationsActiveIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle1" sx={{ fontSize: 15, fontWeight: 700 }}>Alerts</Typography>
        {unread > 0 && <Chip size="small" color="primary" label={`${unread} unread`} sx={{ height: 20, fontSize: 11 }} />}
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<RefreshIcon sx={{ fontSize: 14 }} />} onClick={load} sx={{ textTransform: 'none', fontSize: 12 }}>Refresh</Button>
        {unread > 0 && <Button size="small" onClick={handleMarkAll} sx={{ textTransform: 'none', fontSize: 12 }}>Mark all read</Button>}
      </Box>

      {error && <Typography sx={{ fontSize: 12.5, color: 'error.main', mb: 1, flexShrink: 0 }}>{error}</Typography>}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: 1, borderColor: 'divider', borderRadius: '0 0 6px 6px', bgcolor: 'background.paper', overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          data={filteredItems}
          keyField="id"
          loading={items === null}
          dense
          sortable
          initialPageSize={10}
          pageSizeOptions={[10, 25, 50]}
          emptyTitle={typeFilter === 'all' ? 'No alerts' : `No ${TYPE_LABEL[typeFilter] || typeFilter} alerts`}
          emptyText={typeFilter === 'all' ? 'Alerts that need your attention will appear here.' : 'Try a different type, or switch back to All Types.'}
          onRowClick={handleOpen}
          isRowClickable={(row) => !!row.lead}
          hidePagination={filteredItems.length <= 10}
          toolbar={
            <Box sx={{ px: 1.25, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
              <FilterSelect label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} options={TYPE_FILTER_OPTIONS} sx={{ minWidth: 168, height: 30 }} />
            </Box>
          }
          containerSx={{ maxHeight: 787, '& .MuiTable-root': { width: '100%', tableLayout: 'fixed' } }}
        />
      </Box>
    </Box>
  );
}
