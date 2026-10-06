import { Box, CircularProgress } from '@mui/material';
import { alpha } from '@mui/material/styles';

/**
 * GlossyActionButton — the premium, color-coded pill used across the Agent
 * Workspace's action bar (Fetch/Start/End Call, Break In/Out, Phone, Call
 * Assist, WhatsApp): a soft top-to-bottom gradient in the action's own
 * identity color, an inset highlight for a glossy sheen, and a matching
 * soft drop shadow. Disabled collapses to a flat neutral chip so state is
 * unmistakable. `pulse` adds a soft breathing glow for the one action that
 * is the current primary next step — never more than one at a time.
 * Purely presentational: click/disabled/loading stay with the caller.
 */
export default function GlossyActionButton({ icon, label, color, disabled, loading, onClick, pulse, title, size = 'small' }) {
  const dense = size === 'small';
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        py: dense ? '7px' : '9px',
        px: dense ? '14px' : '16px',
        border: '1px solid',
        borderRadius: '10px',
        fontSize: dense ? 13 : 14,
        fontWeight: 700,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'transform 120ms ease, box-shadow 120ms ease, filter 120ms ease',
        ...(disabled
          ? {
              color: 'text.disabled',
              bgcolor: 'action.hover',
              borderColor: 'divider',
              boxShadow: 'none',
            }
          : {
              color: '#ffffff',
              background: `linear-gradient(180deg, ${color}, ${alpha(color, 0.82)})`,
              borderColor: alpha(color, 0.9),
              boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.35)}, 0 2px 6px ${alpha(color, 0.35)}`,
              '&:hover': {
                filter: 'brightness(1.06)',
                boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.4)}, 0 3px 10px ${alpha(color, 0.45)}`,
              },
              '&:active': { transform: 'translateY(1px)' },
            }),
        ...(pulse && !disabled
          ? {
              animation: 'glossyActionPulse 1.8s ease-in-out infinite',
              '@keyframes glossyActionPulse': {
                '0%, 100%': { boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.35)}, 0 0 0 0 ${alpha(color, 0.45)}` },
                '50%': { boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.35)}, 0 0 0 5px ${alpha(color, 0)}` },
              },
            }
          : {}),
      }}
    >
      {loading ? <CircularProgress size={dense ? 13 : 14} sx={{ color: disabled ? 'text.disabled' : '#fff' }} /> : icon}
      {label}
    </Box>
  );
}
