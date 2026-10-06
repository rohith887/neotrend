import { Box, Chip, Drawer, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * WorkQueueDrawer — generic slide-out panel (Salesforce/HubSpot style queue
 * drawer). Fixed to the right edge (~420px, full height), not a modal:
 * closes via the X button, Escape, or clicking the overlay (MUI Drawer
 * handles Escape + backdrop). The body scrolls internally. Intended to host
 * queue views (callbacks today, P1, ...).
 * `icon` is a React node rendered in the header.
 * MUI migration — same API as before, only the presentation uses MUI.
 */
export default function WorkQueueDrawer({ open, onClose, title, icon, count, children }) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 420 }, maxWidth: '100%', bgcolor: 'background.default' } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <Box
          component="header"
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
            {icon}
          </Box>
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </Typography>
          {Number.isFinite(count) && (
            <Chip
              label={count}
              size="small"
              title={`${count} in queue`}
              sx={{ height: 18, minWidth: 18, fontSize: 11, fontWeight: 700 }}
              color="primary"
            />
          )}
          <IconButton size="small" onClick={onClose} aria-label="Close queue" sx={{ ml: 0.5, border: 1, borderColor: 'divider', borderRadius: 1.25 }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</Box>
      </Box>
    </Drawer>
  );
}
