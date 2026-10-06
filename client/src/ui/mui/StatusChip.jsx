import { Box, Chip } from '@mui/material';

/**
 * StatusChip — colored pill with optional status dot. Colors come from the
 * MUI theme palette (soft backgrounds). Provide `status` to auto-map
 * common status words to tones, or pass
 * `tone` directly.
 */
const STATUS_TONE = {
  available: 'success',
  active: 'success',
  online: 'success',
  ready: 'success',
  connected: 'success',
  completed: 'success',
  'on call': 'danger',
  call: 'danger',
  'in progress': 'info',
  busy: 'warning',
  break: 'warning',
  'on break': 'warning',
  lunch: 'warning',
  tea: 'warning',
  bio: 'warning',
  training: 'warning',
  offline: 'neutral',
  inactive: 'neutral',
  closed: 'neutral',
  suspended: 'neutral',
  missed: 'danger',
  failed: 'danger',
  warning: 'warning',
  critical: 'danger',
  excellent: 'success',
  good: 'info',
  fair: 'warning',
};

const TONE_TO_COLOR = {
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
  primary: 'primary',
  violet: 'secondary',
  neutral: 'default',
};

export default function StatusChip({ status, tone, dot = true, pulse = false, size = 'small', ...rest }) {
  const resolved = tone || STATUS_TONE[String(status || '').toLowerCase()] || 'neutral';
  const color = TONE_TO_COLOR[resolved] || 'default';

  const dotIcon = dot ? (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        bgcolor: 'currentColor',
        ...(pulse && {
          '@keyframes tasChipDotPulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.3 },
          },
          animation: 'tasChipDotPulse 1.4s ease-in-out infinite',
        }),
      }}
    />
  ) : undefined;

  return <Chip size={size} color={color} label={status} icon={dotIcon} {...rest} />;
}
