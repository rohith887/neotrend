import { Button } from '@mui/material';

/**
 * PrimaryButton — the primary CTA (filled indigo) used across the app.
 * Inherits color, radius, height and Manrope from muiTheme. `loading` renders
 * an inline spinner and disables the button.
 */
export default function PrimaryButton({ loading = false, children, ...props }) {
  return (
    <Button variant="contained" color="primary" loading={loading} {...props}>
      {children}
    </Button>
  );
}
