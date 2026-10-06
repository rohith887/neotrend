import { Box, Divider, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PrimaryButton from '../../ui/mui/PrimaryButton.jsx';

/* ==========================================================================
   CALL ASSIST WELCOME NOTE — compact, non-modal teaser shown in the top-right
   of the agent workspace when a call starts. It never auto-opens the full
   assistant and never blocks the workspace: it only invites the agent to open
   the panel on demand. Sits in normal document flow (right-aligned), so it
   never covers the disposition/remarks panel or student information fields.
   ========================================================================== */

export default function CallAssistWelcomeNote({ open, onView, onDismiss }) {
  if (!open) return null;

  return (
    <Box
      role="status"
      sx={{
        width: 340,
        maxWidth: 'calc(100% - 8px)',
        px: 1.5,
        py: 1.25,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.75,
        boxShadow: 3,
      }}
    >
      {/* ── Title ─────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary', lineHeight: 1.2, minWidth: 0 }}>
          ✨ Call Assist is ready
        </Typography>
      </Box>

      {/* ── Subtitle ──────────────────────────────────────────── */}
      <Typography sx={{ mt: 0.5, fontSize: 11, color: 'text.secondary', lineHeight: 1.45 }}>
        I&rsquo;ve prepared talking points based on this student&rsquo;s information.
      </Typography>

      <Divider sx={{ my: 0.75, borderColor: 'divider' }} />

      {/* ── Actions ───────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
        <PrimaryButton size="small" onClick={onView} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
          View Assist
        </PrimaryButton>
        <IconButton size="small" onClick={onDismiss} aria-label="Dismiss Call Assist note" sx={{ p: 0.5 }}>
          <CloseIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
    </Box>
  );
}