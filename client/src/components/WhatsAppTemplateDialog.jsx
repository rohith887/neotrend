import { useId } from 'react';
import { Box, Dialog, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import WhatsAppTemplateComposer from './WhatsAppTemplateComposer.jsx';

/* ==========================================================================
   WHATSAPP TEMPLATE DIALOG — the original full-screen modal shell.
   All the actual logic (templates, variables, preview, send) now lives in
   WhatsAppTemplateComposer.jsx, shared with the new Agent Workspace WhatsApp
   sidebar (WhatsAppSidebar.jsx) so neither duplicates the other's behavior.
   This file's own public API (open/onClose/lead/onSent) and rendered result
   are unchanged — existing callers (e.g. CounselorWorkspace) are unaffected.
   ========================================================================== */

const WA_GREEN = '#25D366';

export default function WhatsAppTemplateDialog({ open, onClose, lead, onSent }) {
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      aria-labelledby={titleId}
      slotProps={{
        paper: {
          sx: {
            width: 960,
            maxWidth: 'calc(100vw - 48px)',
            height: 700,
            maxHeight: 'calc(100vh - 48px)',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        },
      }}
    >
      {/* ── Fixed header ─────────────────────────────────────────── */}
      <DialogTitle
        id={titleId}
        sx={{
          px: 2.5,
          pt: 1.5,
          pb: 1.25,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <WhatsAppIcon sx={{ fontSize: 18, color: WA_GREEN, flexShrink: 0 }} />
            <Typography component="div" sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>
              WhatsApp Message
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="Close WhatsApp message dialog" sx={{ flexShrink: 0 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Send an approved template to this student
        </Typography>
      </DialogTitle>

      <WhatsAppTemplateComposer open={open} onClose={onClose} lead={lead} onSent={onSent} showRecipientStrip />
    </Dialog>
  );
}
