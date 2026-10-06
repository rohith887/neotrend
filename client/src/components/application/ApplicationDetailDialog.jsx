import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  DialogActions,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import AppDialog from '../../ui/mui/AppDialog.jsx';
import PrimaryButton from '../../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';
import { fetchApplicationTimeline } from '../../api/applications.js';
import { CountryLabel } from '../../utils/flag.jsx';

/* ==========================================================================
   APPLICATION DETAIL — canonical record header, preparation progress and
   status-appropriate actions. History reuses the EXISTING activity/lifecycle
   event stream (fetched through the workspace's shared cache key and
   filtered client-side by application id) — no second timeline system.

   Props:
     lead        student document (Student 360 context)
     application populated application row
     open/onClose
     actions     { update(id, payload), submit(id), withdraw(id, reason) }
     onChange    called after every successful mutation ({application, lead})
   ========================================================================== */

const STATUS_FLOW = [
  'Draft',
  'Preparing',
  'Documents Pending',
  'Ready to Submit',
  'Submitted',
  'Under Review',
  'Offer Received',
];

const PREP_CLUSTER = ['Draft', 'Preparing', 'Documents Pending', 'Ready to Submit'];

// Status-appropriate follow-ups exposed by the Update Status control.
const NEXT_STATUSES = {
  Draft: ['Preparing', 'Documents Pending', 'Ready to Submit'],
  Preparing: ['Draft', 'Documents Pending', 'Ready to Submit'],
  'Documents Pending': ['Draft', 'Preparing', 'Ready to Submit'],
  'Ready to Submit': ['Draft', 'Preparing', 'Documents Pending'],
  Submitted: ['Under Review'],
  'Under Review': ['Offer Received', 'Rejected'],
};

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const userName = (u) => {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
};

const ACTION_LABELS = {
  created: 'Application created',
  status_changed: 'Status changed',
  submitted: 'Application submitted',
  offer: 'Offer received',
  rejected: 'Application rejected',
  withdrawn: 'Application withdrawn',
};

export default function ApplicationDetailDialog({ lead, application, open, onClose, actions, onChange }) {
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState(null);
  const [decision, setDecision] = useState(null); // 'Rejected' | 'Withdrawn'
  const [reason, setReason] = useState('');
  const [events, setEvents] = useState([]);

  // Dedicated audited history: GET /applications/:id/timeline returns the
  // same event shape the unified Activity timeline renders, scoped to this
  // application and access-checked server-side.
  useEffect(() => {
    if (!open || !application?._id) return undefined;
    let cancelled = false;
    fetchApplicationTimeline(application._id)
      .then((payload) => {
        if (cancelled) return;
        setEvents(payload?.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, application?._id]);

  const stepIndex = useMemo(
    () => (application ? STATUS_FLOW.indexOf(application.status) : -1),
    [application]
  );
  const nextStatuses = application ? NEXT_STATUSES[application.status] ?? [] : [];
  const canSubmit = application ? PREP_CLUSTER.includes(application.status) : false;
  const isActive = application
    ? application.status !== 'Rejected' && application.status !== 'Withdrawn'
    : false;

  const runAction = async (fn) => {
    setBusy(true);
    setRowError(null);
    try {
      const result = await fn();
      onChange?.(result);
      return result;
    } catch (err) {
      setRowError(err?.response?.data?.message || err?.message || 'Action failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!application) return null;

  const uni = application.university ?? {};

  return (
    <AppDialog open={open} onClose={onClose} size="md" title="Application">
      {/* ── Header ─────────────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 0.6, columnGap: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        {[
          ['University', uni.institutionName || '—'],
          ['Location', uni.country?.name ? <CountryLabel value={uni.country} flagSx={{ fontSize: 14 }} /> : ([uni.country?.name, uni.city].filter(Boolean).join(' · ') || '—')],
          ['Student', lead?.studentName || '—'],
          ['Owner', userName(application.owner)],
          ['Status', application.status],
          ['Created', fmtDateTime(application.createdAt)],
          ['Last Updated', fmtDateTime(application.updatedAt)],
          ['Next Action', application.nextAction || '—'],
        ].map(([k, v]) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{k}</Typography>
            <Typography sx={{ fontSize: 12.5, fontWeight: k === 'University' || k === 'Status' ? 600 : 500 }}>
              {v}
              {k === 'University' && uni.isActive === false ? ' · inactive' : ''}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── Progress ───────────────────────────────────────────── */}
      <Box sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
          Application Progress
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
          {STATUS_FLOW.map((s, i) => {
            const done = stepIndex > i;
            const current = stepIndex === i;
            return (
              <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: 11.5,
                    fontWeight: current ? 700 : done ? 600 : 400,
                    color: current ? 'primary.main' : done ? 'text.primary' : 'text.disabled',
                  }}
                >
                  {done ? '✓ ' : ''}{s}
                </Typography>
                {i < STATUS_FLOW.length - 1 && (
                  <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>→</Typography>
                )}
              </Box>
            );
          })}
          {(application.status === 'Rejected' || application.status === 'Withdrawn') && (
            <>
              <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>→</Typography>
              <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'error.dark' }}>
                {application.status}
                {application.closureReason ? ` — ${application.closureReason}` : ''}
              </Typography>
            </>
          )}
        </Box>
      </Box>

      {/* ── Actions (only what the current status allows) ──────── */}
      {(canSubmit || nextStatuses.length > 0 || isActive) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          {nextStatuses.length > 0 && (
            <TextField
              select
              size="small"
              label="Update Status"
              value=""
              onChange={(e) => {
                const target = e.target.value;
                if (target === 'Rejected') {
                  setDecision('Rejected');
                  setReason('');
                } else {
                  runAction(() => actions.update(application._id, { status: target }));
                }
              }}
              disabled={busy}
              SelectProps={{ displayEmpty: true, sx: { fontSize: 12 } }}
              InputLabelProps={{ shrink: true, sx: { fontSize: 10.5 } }}
              sx={{ minWidth: 160, '& .MuiInputBase-input': { pt: 1.4, pb: 0.5, fontSize: 12 } }}
            >
              <MenuItem value="" disabled>Update Status…</MenuItem>
              {nextStatuses.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </TextField>
          )}
          {canSubmit && (
            <PrimaryButton
              size="small"
              loading={busy}
              onClick={() => runAction(() => actions.submit(application._id))}
              startIcon={<SendOutlinedIcon sx={{ fontSize: 13 }} />}
              sx={{ textTransform: 'none', fontSize: 12 }}
            >
              Submit Application
            </PrimaryButton>
          )}
          {isActive && (
            <Button
              size="small"
              color="inherit"
              disabled={busy}
              onClick={() => {
                setDecision('Withdrawn');
                setReason('');
              }}
              sx={{ textTransform: 'none', fontSize: 12, ml: 'auto' }}
            >
              Withdraw…
            </Button>
          )}
        </Box>
      )}

      {rowError && (
        <Typography sx={{ fontSize: 12, color: 'error.dark', py: 1 }}>{rowError}</Typography>
      )}

      {/* ── History (existing Activity stream, filtered) ──────── */}
      <Box sx={{ pt: 1.25 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
          Activity
        </Typography>
        {events.length === 0 ? (
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No recorded activity yet.</Typography>
        ) : (
          [...events]
            .sort((a, b) => new Date(b.at) - new Date(a.at))
            .map((ev) => (
              <Typography key={ev.id} sx={{ fontSize: 12, lineHeight: 1.7, color: 'text.secondary' }}>
                <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
                  {ACTION_LABELS[ev.metadata?.action] || 'Updated'}
                  {ev.metadata?.to ? ` → ${ev.metadata.to}` : ''}
                </Box>{' '}
                · {fmtDateTime(ev.at)}
                {ev.user ? ` · ${ev.user}` : ''}
              </Typography>
            ))
        )}
      </Box>

      <DialogActions sx={{ px: 0, pt: 2 }}>
        <SecondaryButton size="small" onClick={onClose}>Close</SecondaryButton>
      </DialogActions>

      {/* ── Reason prompt (Reject / Withdraw) ──────────────────── */}
      <AppDialog
        open={!!decision}
        onClose={() => setDecision(null)}
        size="sm"
        title={decision === 'Rejected' ? 'Record rejection?' : 'Withdraw application?'}
      >
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1.25 }}>
          {decision === 'Rejected'
            ? 'The application will be closed as rejected by the university. Other applications are not affected.'
            : 'The application will be closed as withdrawn. The history is preserved.'}
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={2}
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          sx={{ '& .MuiOutlinedInput-input': { fontSize: 12.5 } }}
        />
        <DialogActions sx={{ px: 0, pt: 2 }}>
          <SecondaryButton size="small" onClick={() => setDecision(null)} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton
            size="small"
            loading={busy}
            onClick={async () => {
              let result = null;
              if (decision === 'Rejected') {
                result = await runAction(() => actions.update(application._id, { status: 'Rejected', reason }));
              } else {
                result = await runAction(() => actions.withdraw(application._id, reason));
              }
              setDecision(null);
              setReason('');
              return result;
            }}
          >
            Confirm {decision === 'Rejected' ? 'Rejection' : 'Withdrawal'}
          </PrimaryButton>
        </DialogActions>
      </AppDialog>
    </AppDialog>
  );
}
