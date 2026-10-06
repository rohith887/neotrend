import { useMemo, useState } from 'react';
import {
  Alert, Box, DialogActions, DialogContent, MenuItem, TextField, Typography,
} from '@mui/material';
import CallMadeIcon from '@mui/icons-material/CallMade';
import EventIcon from '@mui/icons-material/Event';
import FlagIcon from '@mui/icons-material/Flag';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PhoneIcon from '@mui/icons-material/Phone';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SellIcon from '@mui/icons-material/Sell';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AppDialog from '../ui/mui/AppDialog.jsx';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
import StatusChip from '../ui/mui/StatusChip.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { updateLeadLifecycle } from '../api/lifecycle.js';
import {
  LIFECYCLE_ALL_STAGES,
  STAGE_LABELS,
  WAITING_ON_OPTIONS,
  dueLabel,
  isOverdue,
  lifecycleOf,
  stageLabel,
  stageTone,
} from '../utils/lifecycle.js';

/* ==========================================================================
   STUDENT OVERVIEW PANEL — left column for the supervisor Student 360 view
   (where agents see the disposition Call Dock). Surfaces the lead's live
   lifecycle state (stage / waiting-on / next action) straight from the
   lead document already in context, plus the classic workflow rows.
   Supervisors get a focused "Update workflow" action that PATCHes
   /leads/:id/lifecycle — a controlled transition recorded as an event.
   ========================================================================== */

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function Row({ icon, label, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
        <Box component="span" sx={{ display: 'inline-flex', color: 'text.disabled' }} aria-hidden="true">
          {icon}
        </Box>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>{label}</Typography>
      </Box>
      <Box sx={{ minWidth: 0, textAlign: 'right' }}>{children}</Box>
    </Box>
  );
}

const Value = ({ children }) => (
  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', wordBreak: 'break-word', lineHeight: 1.35 }}>
    {children ?? '—'}
  </Typography>
);

/* ── Supervisor workflow dialog ─────────────────────────────────────────── */

const emptyForm = (lc) => ({
  stage: lc?.stage ?? '',
  subStatus: lc?.subStatus ?? '',
  waitingOn: lc?.waitingOn ?? '',
  nextAction: lc?.nextAction ?? '',
  nextActionDue: lc?.nextActionDue ? String(lc.nextActionDue).slice(0, 10) : '',
});

function WorkflowDialog({ open, onClose, lead, onSaved }) {
  const lc = useMemo(() => lifecycleOf(lead), [lead]);
  const [form, setForm] = useState(() => emptyForm(lc));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Re-seed the form each time the dialog opens for a (possibly new) lead.
  const [seedKey, setSeedKey] = useState('');
  if (open && seedKey !== `${lead?._id}`) {
    setSeedKey(`${lead?._id}`);
    setForm(emptyForm(lc));
    setError(null);
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {};
      if (form.stage) payload.stage = form.stage;
      payload.subStatus = form.subStatus;
      payload.waitingOn = form.waitingOn || null;
      payload.nextAction = form.nextAction;
      payload.nextActionDue = form.nextActionDue || null;
      const data = await updateLeadLifecycle(lead._id, payload);
      onSaved?.(data.lead);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not update workflow');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Update workflow"
      subtitle="Controlled transition — every change is recorded in the student's journey history."
    >
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="warning" sx={{ fontSize: 12.5 }}>{error}</Alert>}
        <TextField
          select
          label="Stage"
          value={form.stage}
          onChange={set('stage')}
          size="small"
          fullWidth
          helperText="Leave as-is to only update waiting-on / next action."
        >
          {LIFECYCLE_ALL_STAGES.map((s) => (
            <MenuItem key={s} value={s}>{STAGE_LABELS[s]}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Sub-status"
          value={form.subStatus}
          onChange={set('subStatus')}
          size="small"
          fullWidth
          placeholder="e.g. Documents Pending"
        />
        <TextField
          select
          label="Waiting on"
          value={form.waitingOn}
          onChange={set('waitingOn')}
          size="small"
          fullWidth
        >
          <MenuItem value="">—</MenuItem>
          {WAITING_ON_OPTIONS.map((w) => (
            <MenuItem key={w} value={w}>{w}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Next action"
          value={form.nextAction}
          onChange={set('nextAction')}
          size="small"
          fullWidth
          placeholder="e.g. Collect final transcripts"
        />
        <TextField
          label="Next action due"
          type="date"
          value={form.nextActionDue}
          onChange={set('nextActionDue')}
          size="small"
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <SecondaryButton size="small" onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
        <PrimaryButton size="small" onClick={save} loading={saving} disabled={!form.stage}>
          Save workflow
        </PrimaryButton>
      </DialogActions>
    </AppDialog>
  );
}

/* ── Main panel ─────────────────────────────────────────────────────────── */

export default function StudentOverviewPanel({ lead, interactions = [], onLeadUpdated }) {
  const { role } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const latest = useMemo(() => {
    const sorted = [...(interactions || [])].sort((a, b) => new Date(b.calledAt || 0) - new Date(a.calledAt || 0));
    return sorted[0] ?? null;
  }, [interactions]);

  const nextCallback = useMemo(
    () =>
      (interactions || [])
        .filter((it) => it.callbackDateTime)
        .sort((a, b) => new Date(b.callbackDateTime) - new Date(a.callbackDateTime))[0] ?? null,
    [interactions]
  );

  const disposition = lead?.currentDisposition;
  const dispName = typeof disposition === 'string' ? disposition : disposition?.name || disposition?.label || null;
  const dispColor = !disposition || typeof disposition === 'string' ? undefined : disposition.color;

  const interest = latest?.interestLevel || latest?.dispositionPriority || null;

  const lc = useMemo(() => lifecycleOf(lead), [lead]);
  const overdue = isOverdue(lc?.nextActionDue);
  const due = dueLabel(lc?.nextActionDue);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Lead Overview
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.5, lineHeight: 1.4 }}>
          Read-only view — dispositions are logged by calling agents.
        </Typography>
      </Box>

      {/* ── Live student lifecycle ─────────────────────────────── */}
      <Row icon={<FlagIcon sx={{ fontSize: 13 }} />} label="Stage">
        {lc?.stage ? (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <StatusChip status={stageLabel(lc.stage)} tone={stageTone(lc.stage)} size="small" sx={{ height: 20, fontSize: 11 }} />
            {role === 'supervisor' && (
              <Typography
                component="button"
                onClick={() => setDialogOpen(true)}
                sx={{
                  border: 'none', background: 'none', p: 0, cursor: 'pointer',
                  fontSize: 11.5, fontWeight: 600, color: 'primary.main',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                Update
              </Typography>
            )}
          </Box>
        ) : (
          <Value>—</Value>
        )}
      </Row>

      <Row icon={<PauseCircleIcon sx={{ fontSize: 13 }} />} label="Waiting on">
        <Value>{lc?.waitingOn ?? null}</Value>
      </Row>

      <Row icon={<ScheduleIcon sx={{ fontSize: 13 }} />} label="Next Action">
        {lc?.nextAction ? (
          <Value>{lc.nextAction}</Value>
        ) : (
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No next action</Typography>
        )}
      </Row>

      <Row icon={<EventIcon sx={{ fontSize: 13 }} />} label="Next Action Due">
        {due ? (
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: overdue ? 'warning.dark' : 'text.primary' }}>
            {due}
          </Typography>
        ) : (
          <Value>—</Value>
        )}
      </Row>

      {lc?.subStatus ? (
        <Row icon={<SellIcon sx={{ fontSize: 13 }} />} label="Sub-status">
          <Value>{lc.subStatus}</Value>
        </Row>
      ) : null}

      <Row icon={<TrendingUpIcon sx={{ fontSize: 13 }} />} label="Disposition">
        {dispName ? (
          <Box
            component="span"
            sx={{
              display: 'inline-block', px: 0.875, py: 0.125, borderRadius: 999,
              fontSize: 11, fontWeight: 700,
              ...(dispColor
                ? { color: dispColor, border: `1px solid ${dispColor}`, backgroundColor: `${dispColor}18` }
                : { color: 'text.secondary', border: 1, borderColor: 'divider', bgcolor: 'action.hover' }),
            }}
          >
            {dispName}
          </Box>
        ) : (
          <Value>—</Value>
        )}
      </Row>

      <Row icon={<PhoneIcon sx={{ fontSize: 13 }} />} label="Interest Level">
        <Value>{interest}</Value>
      </Row>

      <Row icon={<CallMadeIcon sx={{ fontSize: 13 }} />} label="Calls Logged">
        <Value>{(interactions || []).length}</Value>
      </Row>

      <Row icon={<ScheduleIcon sx={{ fontSize: 13 }} />} label="Last Contact">
        <Value>{latest?.calledAt ? fmtDateTime(latest.calledAt) : '—'}</Value>
      </Row>

      <Row icon={<EventIcon sx={{ fontSize: 13 }} />} label="Next Callback">
        <Value>{nextCallback ? fmtDateTime(nextCallback.callbackDateTime) : '—'}</Value>
      </Row>

      {role === 'supervisor' && lead && (
        <WorkflowDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          lead={lead}
          onSaved={(freshLead) => onLeadUpdated?.(freshLead)}
        />
      )}
    </Box>
  );
}
