import { useEffect, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import WhatsAppTemplateComposer from './WhatsAppTemplateComposer.jsx';
import WhatsAppConversation from './WhatsAppConversation.jsx';

/* ==========================================================================
   WHATSAPP SIDEBAR — unified right-side panel for the Agent Workspace.
   Replaces the previous standalone WhatsApp modal + separate Chat History
   button/drawer with ONE panel, two sections:

     Conversation — read-only WhatsApp history (WhatsAppConversation.jsx),
                    fed by a stub data source for now.
     Templates    — the existing, unmodified template-sending logic
                    (WhatsAppTemplateComposer.jsx), the same component the
                    full-screen WhatsAppTemplateDialog modal still uses
                    elsewhere (e.g. CounselorWorkspace) — nothing here
                    duplicates or forks that logic.

   A plain flex sibling (not a modal Drawer), so the workspace genuinely
   shares width with it — width animates 0 → PANEL_WIDTH — rather than an
   overlay that floats on top. Identity (student name/mobile) comes from the
   `lead` already loaded in the workspace; there is no second student
   picker.
   ========================================================================== */

const WA_GREEN = '#25D366';
const PANEL_WIDTH = 420;

const SECTIONS = [
  { key: 'conversation', label: 'Conversation' },
  { key: 'templates', label: 'Templates' },
];

export default function WhatsAppSidebar({ open, onClose, lead, onSent }) {
  const [section, setSection] = useState('templates');

  // Reset to the primary (Templates) tab each time the sidebar is freshly
  // opened, so re-opening for a different student never carries over a
  // stale "Conversation" selection silently.
  useEffect(() => {
    if (open) setSection('templates');
  }, [open]);

  return (
    <Box
      sx={{
        flexShrink: 0,
        width: open ? PANEL_WIDTH : 0,
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
        borderLeft: open ? 1 : 0,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        transition: 'width 180ms ease',
      }}
      aria-hidden={!open}
    >
      <Box sx={{ width: PANEL_WIDTH, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* ── Header ───────────────────────────────────────────────── */}
        <Box
          component="header"
          sx={{
            flexShrink: 0,
            px: 2,
            py: 1.25,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WhatsAppIcon sx={{ fontSize: 16, color: WA_GREEN }} />
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>
              WhatsApp
            </Typography>
            <IconButton size="small" onClick={onClose} aria-label="Close WhatsApp" sx={{ border: 1, borderColor: 'divider', borderRadius: 1.25 }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Typography sx={{ mt: 0.5, fontSize: 13, fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead?.studentName || 'Student'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'Menlo, Consolas, monospace' }}>
            {lead?.mobile || '—'}
          </Typography>
        </Box>

        {/* ── Section navigation ───────────────────────────────────── */}
        <Box sx={{ flexShrink: 0, display: 'flex', borderBottom: 1, borderColor: 'divider' }}>
          {SECTIONS.map((s) => {
            const active = section === s.key;
            return (
              <Box
                key={s.key}
                component="button"
                type="button"
                onClick={() => setSection(s.key)}
                sx={{
                  flex: 1,
                  border: 'none',
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  py: 1,
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'primary.main' : 'text.secondary',
                  borderBottom: '2px solid',
                  borderBottomColor: active ? 'primary.main' : 'transparent',
                  transition: 'color 120ms ease, border-color 120ms ease',
                  '&:hover': { color: active ? 'primary.main' : 'text.primary' },
                }}
              >
                {s.label}
              </Box>
            );
          })}
        </Box>

        {/* ── Active section content (each owns its own scroll + footer) ──
           Both sections stay mounted and only toggle visibility — switching
           tabs must never unmount/reset the Templates composer's in-progress
           selection, so it can't be a conditional render. ── */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: section === 'conversation' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <WhatsAppConversation studentId={lead?._id} active={open && section === 'conversation'} />
          </Box>
          <Box sx={{ display: section === 'templates' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <WhatsAppTemplateComposer
              open={open}
              onClose={onClose}
              lead={lead}
              onSent={onSent}
              showRecipientStrip={false}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
