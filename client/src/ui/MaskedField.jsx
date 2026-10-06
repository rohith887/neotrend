import { useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { maskEmail, maskPhone, isEmail } from '../utils/privacy.js';

/**
 * MaskedField — renders a PII value (email or phone) masked by default
 * with a toggle button to reveal/hide the full value.
 *
 * Props:
 *   value     — the raw PII string
 *   type      — 'email' | 'phone' | 'auto' (default: 'auto')
 *   onReveal  — callback(isRevealed: boolean) when the user toggles visibility
 *   sx        — MUI sx prop for the container
 */
export default function MaskedField({ value, type = 'auto', onReveal, sx }) {
  const [revealed, setRevealed] = useState(false);

  if (!value || typeof value !== 'string') {
    return <Typography sx={{ fontSize: 11, color: 'text.secondary', ...sx }}>—</Typography>;
  }

  const resolvedType = type === 'auto' ? (isEmail(value) ? 'email' : 'phone') : type;
  const masked = resolvedType === 'email' ? maskEmail(value) : maskPhone(value);
  const display = revealed ? value : masked;

  const handleToggle = () => {
    const next = !revealed;
    setRevealed(next);
    onReveal?.(next);
  };

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, minWidth: 0, ...sx }}>
      <Typography
        noWrap
        sx={{
          fontSize: 11,
          color: 'text.secondary',
          fontFamily: revealed ? 'inherit' : 'monospace',
          letterSpacing: revealed ? 0 : '0.02em',
          minWidth: 0,
          flex: 1,
        }}
        title={revealed ? value : 'Click eye icon to reveal'}
      >
        {display}
      </Typography>
      <Tooltip title={revealed ? 'Hide' : 'Reveal'}>
        <IconButton
          size="small"
          onClick={handleToggle}
          sx={{ width: 18, height: 18, p: 0, color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
        >
          {revealed
            ? <VisibilityOffIcon sx={{ fontSize: 13 }} />
            : <VisibilityIcon sx={{ fontSize: 13 }} />
          }
        </IconButton>
      </Tooltip>
    </Box>
  );
}
