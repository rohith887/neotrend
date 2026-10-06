import { Box, Typography } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CheckIcon from '@mui/icons-material/Check';
import CircleIcon from '@mui/icons-material/Circle';
import CloseIcon from '@mui/icons-material/Close';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import StarIcon from '@mui/icons-material/Star';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

/**
 * Timeline — vertical event stream.
 * items: [{ tone, icon, title, detail, time }]
 * icon is a MUI icon component; falls back to the tone's default icon.
 */
const TONE_ICON = {
  success: CheckIcon,
  warning: WarningAmberIcon,
  danger: CloseIcon,
  info: AutorenewIcon,
  violet: StarIcon,
  primary: CircleIcon,
  neutral: RadioButtonUncheckedIcon,
};

const TONE_TO_COLOR = {
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
  violet: 'secondary',
  primary: 'primary',
  neutral: null,
};

export default function Timeline({ items = [], emptyText = 'No activity yet' }) {
  if (!items || items.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, py: 1.5 }}>{emptyText}</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const tone = item.tone || 'neutral';
        const color = TONE_TO_COLOR[tone];
        const isNeutral = !color;
        const Icon = item.icon || TONE_ICON[tone] || CircleIcon;
        return (
          <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isNeutral ? 'action.hover' : `${color}.soft`,
                  color: isNeutral ? 'text.disabled' : `${color}.main`,
                  border: 1,
                  borderColor: isNeutral ? 'divider' : `${color}.border`,
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                <Icon sx={{ fontSize: 13 }} />
              </Box>
              {!isLast && <Box sx={{ flex: 1, width: 1, minHeight: 16, bgcolor: 'divider' }} />}
            </Box>
            <Box sx={{ pb: isLast ? 0 : 2, pt: 0.25, minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: 'text.primary', wordBreak: 'break-word' }}>
                {item.title}
              </Typography>
              {item.detail && (
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5, mt: 0.5, wordBreak: 'break-word' }}>
                  {item.detail}
                </Typography>
              )}
              {item.time && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', mt: 0.75, fontSize: 11.5, color: 'text.disabled' }}>
                  <AccessTimeIcon sx={{ fontSize: 12 }} />
                  {item.time}
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
