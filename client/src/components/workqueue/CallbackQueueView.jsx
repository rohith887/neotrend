import { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, TextField, Typography } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventIcon from '@mui/icons-material/Event';
import InboxIcon from '@mui/icons-material/Inbox';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { rescheduleCallback, completeCallback } from '../../api/workqueue.js';
import { useToast } from '../../context/ToastContext.jsx';
import { CountryLabel } from '../../utils/flag.jsx';
import { CALL_ACTIVE, CALL_STATUS } from '../../context/AgentContext.jsx';
import PrimaryButton from '../../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';

/* ==========================================================================
   CALLBACK QUEUE — the callback workspace hosted inside the work queue
   drawer. All reschedule / complete logic, live state derivation and the
   30s countdown tick are unchanged; only the presentation uses MUI.
   ========================================================================== */

/* ── Time helpers ─────────────────────────────────────────────── */

const to12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${period}`;
};

const fmtDur = (ms) => {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

/* ── Per-card live state ──────────────────────────────────────── */

const CARD_STATES = {
  oncall:    { label: 'On Call',        tone: 'error',   icon: <PhoneIcon sx={{ fontSize: 12 }} /> },
  ended:     { label: 'Call Ended',     tone: 'warning', icon: <CheckCircleIcon sx={{ fontSize: 12 }} /> },
  ready:     { label: 'Ready to Call',  tone: 'info',    icon: <ScheduleIcon sx={{ fontSize: 12 }} /> },
  scheduled: { label: 'Scheduled',      tone: 'default', icon: <CalendarMonthIcon sx={{ fontSize: 12 }} /> },
};

// P1/P2/P3 priority chip (mirrors the dashboard / AssignedLeadsDrawer).
const PRIO_CHIP = {
  P1: { color: 'error',   label: 'P1 HOT' },
  P2: { color: 'warning', label: 'P2 WARM' },
  P3: { color: 'info',    label: 'P3 COLD' },
};

const PriorityChip = ({ priority }) => {
  const key = String(priority || '').trim().toUpperCase();
  const meta = PRIO_CHIP[key];
  return meta ? (
    <Chip size="small" color={meta.color} label={meta.label} sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} />
  ) : null;
};

/* ── Card ─────────────────────────────────────────────────────── */

function QueueCard({ entry, activeLeadId, callStatus, now, busy, onCallNow, onOpenLead, onRefresh }) {
  const { push } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [date, setDate] = useState(entry.callbackDate || '');
  const [time, setTime] = useState(entry.callbackTime || '');
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const disp = entry.disposition;

  // Live status of THIS card, derived from the shared dialer state.
  const isActive = entry.id === activeLeadId;
  const live = isActive && CALL_ACTIVE.has(callStatus);
  const ended = isActive && callStatus === CALL_STATUS.ENDED;
  const anyLive = CALL_ACTIVE.has(callStatus);

  const dueAt = entry.dueAt ? new Date(entry.dueAt).getTime() : null;
  const ready = dueAt == null || dueAt <= now;
  const state = live ? 'oncall' : ended ? 'ended' : ready ? 'ready' : 'scheduled';
  const st = CARD_STATES[state];

  const remain = dueAt != null && dueAt > now ? fmtDur(dueAt - now) : null;
  const overdueTxt = dueAt != null && dueAt <= now ? `${fmtDur(now - dueAt)} overdue` : null;

  // "Call Now" is blocked while another lead is live, during break/fetch, or
  // when this callback is not due yet. The active card shows "On Call" instead.
  const callBlocked = busy || anyLive || state === 'scheduled' || state === 'ended';

  const saveReschedule = async () => {
    if (!date || !time) {
      push('Pick a date and time', 'warning');
      return;
    }
    setSaving(true);
    try {
      await rescheduleCallback({ leadId: entry.id, callbackDate: date, callbackTime: time });
      push('Callback rescheduled', 'success');
      setEditOpen(false);
      onRefresh();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not reschedule callback', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (live) return;
    if (!window.confirm(`Mark ${entry.studentName}'s callback as completed?`)) return;
    setCompleting(true);
    try {
      await completeCallback({ leadId: entry.id });
      push('Callback marked completed', 'success');
      onRefresh();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not complete callback', 'danger');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <Box
      component="li"
      sx={{
        border: 1,
        borderColor: isActive ? 'primary.main' : 'divider',
        borderLeftWidth: isActive ? 3 : 1,
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Name + reference */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.studentName}>
          {entry.studentName}
        </Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.disabled', flexShrink: 0 }} title={entry.referenceId}>
          {entry.referenceId}
        </Typography>
      </Box>

      {/* Contact meta */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: 11.5, color: 'text.secondary' }} title={entry.mobile}>
          <PhoneIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
          {entry.mobile}
        </Box>
        {entry.email && (
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: 11.5, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.email}>
            <ScheduleIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
            {entry.email}
          </Box>
        )}
      </Box>

      {/* Chips */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Chip
          label={st.label}
          size="small"
          icon={st.icon}
          color={st.tone}
          variant={st.tone === 'default' ? 'outlined' : 'filled'}
          sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }}
        />
        {entry.priority && <PriorityChip priority={entry.priority} />}
        {disp && (
          <Chip
            label={disp.label || disp.name}
            size="small"
            sx={{
              height: 20,
              fontSize: 10.5,
              fontWeight: 700,
              ...(disp.color
                ? { color: disp.color, border: `1px solid ${disp.color}`, backgroundColor: `${disp.color}22` }
                : { color: 'text.secondary', border: 1, borderColor: 'divider', backgroundColor: 'action.hover' }),
            }}
          />
        )}
        {entry.country && (
          <Chip
            label={<CountryLabel value={entry.country} flagSx={{ fontSize: 12.5 }} />}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }}
          />
        )}
      </Box>

      {/* Due */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 11.5, color: 'text.secondary' }}>
        <EventIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
        {entry.dueAt ? (
          <Box component="span" sx={{ minWidth: 0 }}>
            Call on <Box component="strong" sx={{ fontWeight: 700, color: 'text.primary' }}>{new Date(entry.dueAt).toLocaleDateString()}</Box> at{' '}
            <Box component="strong" sx={{ fontWeight: 700, color: 'text.primary' }}>{to12h(entry.callbackTime)}</Box>
          </Box>
        ) : (
          <Box component="span">Callback scheduled — no time set</Box>
        )}
        {remain && (
          <Box component="span" sx={{ color: 'text.disabled', fontWeight: 600 }}>in {remain}</Box>
        )}
        {overdueTxt && state !== 'oncall' && state !== 'ended' && (
          <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>{overdueTxt}</Box>
        )}
      </Box>

      {/* Reschedule form */}
      {editOpen && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'action.hover', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
            <TextField
              label="Date"
              type="date"
              size="small"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Time"
              type="time"
              size="small"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <SecondaryButton size="small" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </SecondaryButton>
            <PrimaryButton size="small" onClick={saveReschedule} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </PrimaryButton>
          </Box>
        </Box>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        {live ? (
          <Button size="small" variant="contained" disabled sx={{ flex: 1, fontWeight: 700 }} startIcon={<PhoneIcon sx={{ fontSize: 13 }} />}>
            On Call
          </Button>
        ) : (
          <PrimaryButton size="small" startIcon={<CallMadeIcon sx={{ fontSize: 13 }} />} onClick={() => onCallNow(entry)} disabled={callBlocked} sx={{ flex: 1 }}>
            Call Now
          </PrimaryButton>
        )}
        <SecondaryButton size="small" startIcon={<PersonIcon sx={{ fontSize: 13 }} />} onClick={() => onOpenLead(entry)} disabled={busy || anyLive} sx={{ flex: 1 }}>
          Open Lead
        </SecondaryButton>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Button size="small" startIcon={<RestartAltIcon sx={{ fontSize: 13 }} />} onClick={() => setEditOpen((o) => !o)} disabled={saving || live} sx={{ color: 'text.secondary' }}>
          Reschedule
        </Button>
        <Button
          size="small"
          startIcon={completing ? <CircularProgress size={12} thickness={6} /> : <CheckCircleIcon sx={{ fontSize: 13 }} />}
          onClick={handleComplete}
          disabled={completing || live || ended}
          sx={{ color: 'success.main', ml: 'auto' }}
        >
          {completing ? 'Completing…' : 'Mark Completed'}
        </Button>
      </Box>
    </Box>
  );
}

/* ── Group ────────────────────────────────────────────────────── */

const GROUPS = [
  { key: 'callbacksOverdue', label: 'Overdue' },
  { key: 'callbacksToday', label: 'Today' },
  { key: 'callbacksTomorrow', label: 'Tomorrow' },
  { key: 'callbacksLater', label: 'Upcoming' },
];

function QueueGroup({ label, items, ...cardProps }) {
  if (items.length === 0) return null;
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: '8px', px: 1.5, pt: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' }}>
          {label}
        </Typography>
        <Chip
          label={items.length}
          size="small"
          variant="outlined"
          sx={{ height: 16, minWidth: 16, fontSize: 10, fontWeight: 700 }}
        />
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((e) => (
          <QueueCard key={e.id} entry={e} {...cardProps} />
        ))}
      </Box>
    </Box>
  );
}

/* ── View ─────────────────────────────────────────────────────── */

export default function CallbackQueueView({
  queue,
  loading,
  activeLeadId,
  callStatus,
  onBreak,
  fetchingLead,
  onCallNow,
  onOpenLead,
  onRefresh,
}) {
  const [now, setNow] = useState(() => Date.now());

  // Tick so "in 3h 12m" / "10m overdue" countdowns stay fresh without a poll.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const cardProps = {
    activeLeadId,
    callStatus,
    now,
    busy: onBreak || fetchingLead,
    onCallNow,
    onOpenLead,
    onRefresh,
  };

  const hasDueSoon =
    queue.callbacksToday.length > 0 || queue.callbacksOverdue.length > 0;

  if (loading && !hasDueSoon) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.25, py: '48px', color: 'text.secondary' }}>
        <CircularProgress size={16} thickness={5} />
        <Typography sx={{ fontSize: 13 }}>Loading work queue…</Typography>
      </Box>
    );
  }

  const total =
    queue.callbacksToday.length +
    queue.callbacksOverdue.length +
    queue.callbacksTomorrow.length +
    queue.callbacksLater.length;

  if (total === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', px: 3, py: '56px' }}>
        <Box component="span" sx={{ display: 'inline-flex', color: 'text.disabled' }} aria-hidden="true">
          <InboxIcon sx={{ fontSize: 36, opacity: 0.35 }} />
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          All caught up
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: 'text.disabled', maxWidth: 260, lineHeight: 1.45 }}>
          You're all caught up — no callbacks in your queue.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', pb: 2 }}>
      {GROUPS.map((g) => (
        <QueueGroup key={g.key} label={g.label} items={queue[g.key]} {...cardProps} />
      ))}

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 1.5, color: 'text.disabled' }}>
          <CircularProgress size={14} thickness={5} />
        </Box>
      )}
    </Box>
  );
}
