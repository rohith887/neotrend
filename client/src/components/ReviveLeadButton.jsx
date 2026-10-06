import { useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import ReplayIcon from '@mui/icons-material/Replay';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
import { reviveLead } from '../api/drops.js';
import { useToast } from '../context/ToastContext.jsx';

/* ==========================================================================
   REVIVE LEAD BUTTON — compact Revive action with a mandatory-reason dialog.

   Shown on dropped leads (current disposition 'Drop Lead') directly in the
   lead lists/cards (agent assigned drawer, counselor students) so they can be
   brought back without opening the workspace. Records who + why on the lead's
   dropHistory + Activity trail. On success the parent refreshes its list.
   ========================================================================== */

export default function ReviveLeadButton({ lead, onRevived, size = 'small', title }) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const leadId = lead?._id ?? lead?.id;
  const studentName = lead?.studentName || 'this lead';

  const handleOpen = () => {
    setReason('');
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setSubmitting(false);
  };

  const submit = async () => {
    const trimmed = reason.trim();
    if (!leadId || !trimmed) {
      push('A revive reason is required', 'danger');
      return;
    }
    setSubmitting(true);
    try {
      const result = await reviveLead(leadId, trimmed);
      push('Lead revived — back in the active workflow', 'success');
      close();
      onRevived?.(result?.lead);
    } catch (err) {
      push(err?.response?.data?.message || 'Could not revive this lead', 'danger');
      setSubmitting(false);
    }
  };

  return (
    <>
      <SecondaryButton
        size={size}
        startIcon={<ReplayIcon sx={{ fontSize: 14 }} />}
        onClick={handleOpen}
        title={title || `Revive ${studentName} — restores it to the active workflow`}
      >
        Revive
      </SecondaryButton>

      <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Revive this lead</DialogTitle>
        <DialogContent sx={{ pt: '12px !important', pb: 0 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: 12.5 }}>
            Restore {studentName} to the active workflow. The lead&apos;s history is preserved and
            the reason is recorded on the audit trail.
          </Typography>
          <TextField
            autoFocus
            multiline
            minRows={2}
            maxRows={5}
            fullWidth
            label="Reason for reviving"
            required
            placeholder="e.g. Student reconnected, wants to continue the application"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <SecondaryButton size="small" onClick={close} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            size="small"
            onClick={submit}
            loading={submitting}
            disabled={!reason.trim()}
          >
            Revive Lead
          </PrimaryButton>
        </DialogActions>
      </Dialog>
    </>
  );
}