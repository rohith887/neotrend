import { useEffect, useState } from 'react';
import { Box, DialogActions, TextField, Typography } from '@mui/material';
import { BREAK_TYPES, useAgent } from '../context/AgentContext.jsx';
import AppDialog from '../ui/mui/AppDialog.jsx';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';

/* ==========================================================================
   BREAK MODAL — capture the reason for taking a break before the agent's
   availability is flipped. Same fields and submit flow (startBreak via the
   agent context) — only the presentation uses MUI.
   ========================================================================== */

export default function BreakModal() {
  const { breakModalOpen, closeBreakModal, startBreak, breaking } = useAgent();
  const [type, setType] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (breakModalOpen) {
      setType('');
      setNote('');
    }
  }, [breakModalOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!type) return;
    startBreak(type, note.trim());
  };

  const handleClose = () => {
    if (breaking) return;
    closeBreakModal();
  };

  return (
    <AppDialog
      open={breakModalOpen}
      title="Break In"
      subtitle="Select a break reason. New leads will not be assigned while you are on break."
      onClose={handleClose}
      disableEscapeKeyDown={breaking}
      size="sm"
      footer={
        <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
          <SecondaryButton size="small" onClick={closeBreakModal} disabled={breaking}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            size="small"
            type="submit"
            form="break-form"
            disabled={!type || breaking}
            loading={breaking}
          >
            {breaking ? 'Starting…' : 'Start Break'}
          </PrimaryButton>
        </DialogActions>
      }
    >
      <form id="break-form" onSubmit={handleSubmit}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <TextField
            select
            label={<>Break Type <Box component="span" sx={{ color: 'error.main' }}>*</Box></>}
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={breaking}
            slotProps={{ select: { native: true } }}
            size="small"
            fullWidth
          >
            <option value="">— Select —</option>
            {BREAK_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </TextField>

          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5 }}>Notes (optional)</Typography>
            <TextField
              multiline
              rows={3}
              placeholder="Optional notes…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={breaking}
              fullWidth
            />
          </Box>
        </Box>
      </form>
    </AppDialog>
  );
}
