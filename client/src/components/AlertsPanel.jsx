import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Divider, Typography,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useToast } from '../context/ToastContext.jsx';
import { useAgent } from '../context/AgentContext.jsx';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/notifications.js';
import { approveLogoutOverride } from '../api/logoutGate.js';
import { approveDropRequest, denyDropRequest } from '../api/notifications.js';

// Alert types relevant to each role. The Agent keeps the existing
// supervisor-mention behavior; the Counselor sees the broader set of
// workflow alerts relevant to their role. Both read from the same shared
// per-user Notification collection — nothing new is created.
const COUNSELOR_ALERT_TYPES = new Set([
  'supervisor-mention',
  'task-sla-breach',
  'task-overdue',
  'task-assigned',
  'task-reassigned',
  'info',
]);

/* ── Pane tab — same underline treatment used by list-page saved-view
   tabs elsewhere in the app (CrmListShell), so this reads consistently. ── */
const TabButton = ({ label, count, active, onClick }) => (
  <Box
    component="button"
    type="button"
    onClick={onClick}
    sx={{
      px: 1.5,
      py: 0.875,
      border: 'none',
      borderRadius: 0,
      bgcolor: 'transparent',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: active ? 700 : 500,
      lineHeight: 1,
      color: active ? 'primary.main' : 'text.secondary',
      borderBottom: '2px solid',
      borderBottomColor: active ? 'primary.main' : 'transparent',
      mb: '-1px',
      whiteSpace: 'nowrap',
      transition: 'color 120ms ease, border-color 120ms ease',
      '&:hover': { color: active ? 'primary.main' : 'text.primary' },
    }}
  >
    {label}
    {count != null && (
      <Box component="span" sx={{ ml: 0.5, fontWeight: 500, color: 'text.disabled' }}>
        ({count})
      </Box>
    )}
  </Box>
);

const timeAgo = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

export default function AlertsPanel({ onGoToWorkspace, onOpenLead, alertTypes = null, canOverrideLogout = false, canApproveDrop = false }) {
  const [pane, setPane] = useState('all');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [overridingId, setOverridingId] = useState(null);
  const [decidingDropId, setDecidingDropId] = useState(null);
  const { push } = useToast();
  const { fetchCall, fetchingLead } = useAgent();

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchNotifications({ limit: 50 }));
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not load alerts');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async (n) => {
    if (openingId) return;
    setOpeningId(n.id);
    // Mark read (best effort) first so the unread state is updated immediately.
    try { await markNotificationRead(n.id); } catch (_) { /* noop */ }
    setItems((prev) => (prev || []).map((x) => (x.id === n.id ? { ...x, read: true, readAt: new Date().toISOString() } : x)));

    if (n.lead) {
      // Counselor passes its own loader (loadStudent), which switches the
      // workspace into CounselorWorkspaceShell for that student. The Agent
      // falls back to the legacy fetchCall + navigation behavior.
      if (typeof onOpenLead === 'function') {
        const opened = await onOpenLead(n.lead);
        if (!opened) push('Could not open this student', 'info');
      } else if (onGoToWorkspace) {
        const opened = await fetchCall(n.lead);
        if (opened) onGoToWorkspace();
        else push('You do not have this lead assigned to open it', 'info');
      }
    }
    setOpeningId(null);
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => (prev || []).map((x) => ({ ...x, read: true, readAt: new Date().toISOString() })));
    } catch (_) { /* noop */ }
  };

  // Supervisor grants a one-shot logout override for a blocked sign-out
  // attempt. The server validates ownership + pending status, records the
  // override in the System Log audit trail, and confirms with an alert.
  const handleOverrideLogout = async (n) => {
    if (overridingId) return;
    const reason = window.prompt('Reason for overriding this logout (optional):', '') ?? '';
    setOverridingId(n.id);
    try {
      await approveLogoutOverride(n.id, reason.trim());
      push('Logout override granted', 'success');
      await load();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not grant the logout override', 'danger');
    } finally {
      setOverridingId(null);
    }
  };

  // Supervisor approves a pending Drop Lead request → lead becomes dropped
  // (revivable). One click, no reason required — the approval itself is
  // recorded in the lead's disposition + activity history.
  const handleApproveDrop = async (n) => {
    if (decidingDropId) return;
    setDecidingDropId(n.id);
    try {
      await approveDropRequest(n.id, '');
      push('Drop approved — lead moved to Dropped', 'success');
      await load();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not approve the drop', 'danger');
    } finally {
      setDecidingDropId(null);
    }
  };

  // Supervisor denies a pending Drop Lead request → lead returns to active.
  // One click, no reason required.
  const handleDenyDrop = async (n) => {
    if (decidingDropId) return;
    setDecidingDropId(n.id);
    try {
      await denyDropRequest(n.id, '');
      push('Drop denied — lead returned to the active queue', 'success');
      await load();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not deny the drop', 'danger');
    } finally {
      setDecidingDropId(null);
    }
  };

  const unread = (items || []).filter((n) => !n.read).length;

  // Filter to the alert types relevant for this role. Default (Agent) keeps
  // the existing supervisor-mention behavior; the Counselor passes its own set.
  const typeSet = alertTypes ? new Set(alertTypes) : null;
  const visibleItems = (items || [])
    .filter((n) => (typeSet ? typeSet.has(n.type) : n.type === 'supervisor-mention'));
  const unreadItems = visibleItems.filter((n) => !n.read);
  const readItems = visibleItems.filter((n) => n.read);
  const paneItems = pane === 'unread' ? unreadItems : pane === 'read' ? readItems : visibleItems;

  // One alert card — shared by both the Unread and Read sections below so
  // neither ever drifts out of sync with the other.
  const renderCard = (n) => (
    <Box
      key={n.id}
      onClick={() => handleOpen(n)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(n); } }}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        px: 1.5,
        py: 0.75,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        bgcolor: n.read ? 'background.paper' : 'primary.soft',
        '&:hover': { boxShadow: 1 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {!n.read && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />}
        <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{n.title}</Box>
          {n.body && (
            <Box component="span" sx={{ color: 'text.secondary' }}> — {n.body}</Box>
          )}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', flexShrink: 0, ml: 1 }}>{timeAgo(n.createdAt)}</Typography>
      </Box>
      {(n.leadStudent || n.leadRef || n.senderName) && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, fontSize: 11.5, color: 'text.secondary' }}>
          {n.leadStudent && <Box component="span">Student: {n.leadStudent}</Box>}
          {n.leadRef && <Box component="span">{n.leadStudent ? ' · ' : ''}Lead: {n.leadRef}</Box>}
          {n.senderName && <Box component="span">{(n.leadStudent || n.leadRef) ? ' · ' : ''}From: {n.senderName}</Box>}
        </Box>
      )}
      {n.type === 'drop-request' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={`State: ${n.meta?.currentState || 'Drop Pending'}`}
            sx={{ height: 18, fontSize: 10.5, bgcolor: '#FDF2F8', color: '#881337', '& .MuiChip-label': { px: 0.75 } }}
          />
          {n.meta?.dropReason && (
            <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontStyle: 'italic' }}>
              Reason: {n.meta.dropReason}
            </Typography>
          )}
        </Box>
      )}
      {n.type === 'drop-request' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
          {n.dropDecision === 'pending' && canApproveDrop ? (
            <>
              <Button
                size="small"
                variant="contained"
                color="success"
                disabled={decidingDropId === n.id}
                onClick={(e) => { e.stopPropagation(); handleApproveDrop(n); }}
                sx={{ textTransform: 'none', fontSize: 11.5 }}
              >
                {decidingDropId === n.id ? 'Approving…' : 'Approve Drop'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={decidingDropId === n.id}
                onClick={(e) => { e.stopPropagation(); handleDenyDrop(n); }}
                sx={{ textTransform: 'none', fontSize: 11.5 }}
              >
                {decidingDropId === n.id ? 'Deciding…' : 'Deny Drop'}
              </Button>
            </>
          ) : n.dropDecision === 'approved' ? (
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'success.main' }}>
              Drop approved{n.dropDecisionByName ? ` by ${n.dropDecisionByName}` : ''}
              {n.dropDecisionReason ? ` — ${n.dropDecisionReason}` : ''}
            </Typography>
          ) : n.dropDecision === 'denied' ? (
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'error.main' }}>
              Drop denied{n.dropDecisionByName ? ` by ${n.dropDecisionByName}` : ''}
              {n.dropDecisionReason ? ` — ${n.dropDecisionReason}` : ''}
            </Typography>
          ) : null}
        </Box>
      )}
      {n.type === 'logout-blocked' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
          {n.overrideStatus === 'pending' && canOverrideLogout ? (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={overridingId === n.id}
              onClick={(e) => { e.stopPropagation(); handleOverrideLogout(n); }}
              sx={{ textTransform: 'none', fontSize: 11.5 }}
            >
              {overridingId === n.id ? 'Granting…' : 'Override Logout'}
            </Button>
          ) : n.overrideStatus === 'approved' ? (
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'warning.main' }}>
              Override granted{n.overrideByName ? ` by ${n.overrideByName}` : ''}
              {n.overrideReason ? ` — ${n.overrideReason}` : ''}
            </Typography>
          ) : n.overrideStatus === 'used' ? (
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'success.main' }}>
              Override used — user signed out
            </Typography>
          ) : n.overrideStatus === 'superseded' ? (
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>
              Superseded by a newer sign-out attempt
            </Typography>
          ) : null}
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ p: '12px 18px 24px', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexShrink: 0 }}>
        <NotificationsActiveIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle1" sx={{ fontSize: 15, fontWeight: 700 }}>Alerts</Typography>
        {unread > 0 && <Chip size="small" color="primary" label={`${unread} unread`} sx={{ height: 20, fontSize: 11 }} />}
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<RefreshIcon sx={{ fontSize: 14 }} />} onClick={load} sx={{ textTransform: 'none', fontSize: 12 }}>
          Refresh
        </Button>
        {unread > 0 && (
          <Button size="small" onClick={handleMarkAll} sx={{ textTransform: 'none', fontSize: 12 }}>
            Mark all read
          </Button>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0, borderBottom: 1, borderColor: 'divider', mb: 1.5, flexShrink: 0 }}>
        <TabButton label="All" count={visibleItems.length} active={pane === 'all'} onClick={() => setPane('all')} />
        <TabButton label="Unread" count={unreadItems.length} active={pane === 'unread'} onClick={() => setPane('unread')} />
        <TabButton label="Read" count={readItems.length} active={pane === 'read'} onClick={() => setPane('read')} />
      </Box>

      {error && (
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>{error}</Typography>
        </Box>
      )}

      {items === null ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
          <CircularProgress size={16} />
          <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>Loading alerts…</Typography>
        </Box>
      ) : visibleItems.length === 0 ? (
        <Box sx={{ py: 5, textAlign: 'center' }}>
          <NotificationsNoneIcon sx={{ fontSize: 34, color: 'text.disabled', mb: 1 }} />
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No alerts yet.</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Alerts that need your attention will appear here.</Typography>
        </Box>
      ) : paneItems.length === 0 ? (
        <Box sx={{ py: 5, textAlign: 'center' }}>
          <NotificationsNoneIcon sx={{ fontSize: 34, color: 'text.disabled', mb: 1 }} />
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            {pane === 'unread' ? 'No unread alerts.' : 'No read alerts yet.'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.625 }}>
          {paneItems.map(renderCard)}
        </Box>
      )}
      {fetchingLead && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, flexShrink: 0 }}>
          <CircularProgress size={14} />
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Opening lead…</Typography>
        </Box>
      )}
      <Divider sx={{ my: 1.5 }} />
      <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>Alerts persist after refresh and logout. Click an alert to open its lead.</Typography>
    </Box>
  );
}
