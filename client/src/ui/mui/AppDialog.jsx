import { useId } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const WIDTH_MAP = { sm: 'sm', md: 'md', lg: 'lg', xl: 'xl' };

/* Arbitrary pixel widths (e.g. "960px") render a fixed-width centered dialog,
   matching the old compact modal designs — the paper never grows past the
   viewport. `slotProps.paper.sx` merges over the width for extras like
   max-height. */
const isPxSize = (size) => typeof size === 'number' || /^\d+px$/.test(String(size ?? ''));

/**
 * AppDialog — accessible modal dialog. `size` accepts 'sm' | 'md' | 'lg' |
 * 'xl', any MUI maxWidth token, or a fixed pixel width like "720px". Renders
 * title, optional subtitle, body and an optional `footer` (MUI DialogActions).
 * Focus trap + Escape handled by MUI.
 */
export default function AppDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'sm',
  maxWidth,
  fullWidth = true,
  slotProps,
  ...rest
}) {
  const id = useId();
  const pxSize = isPxSize(size);
  const pxWidth = pxSize ? String(size).includes('px') ? String(size) : `${size}px` : null;

  const mergedSlotProps =
    pxSize || slotProps?.paper
      ? {
          ...slotProps,
          paper: {
            ...(slotProps?.paper ?? null),
            sx: {
              ...(pxSize ? { width: pxWidth, maxWidth: 'calc(100vw - 48px)' } : null),
              ...(slotProps?.paper?.sx ?? null),
            },
          },
        }
      : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth={pxSize ? false : fullWidth}
      maxWidth={pxSize ? false : maxWidth || WIDTH_MAP[size] || 'sm'}
      slotProps={mergedSlotProps}
      aria-labelledby={id}
      {...rest}
    >
      <DialogTitle
        id={id}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          pr: 1,
          pb: subtitle ? 0 : 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="div" sx={{ fontSize: 16, fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close dialog">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: subtitle ? 1 : 2 }}>{children}</DialogContent>
      {footer}
    </Dialog>
  );
}
