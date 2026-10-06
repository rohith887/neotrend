import { Button } from '@mui/material';

/**
 * SecondaryButton — the outlined indigo button, mirrors the existing
 * `.btn-outline-primary` look. `loading` renders an inline spinner and
 * disables the button.
 */
export default function SecondaryButton({ loading = false, children, ...props }) {
  return (
    <Button variant="outlined" color="primary" loading={loading} {...props}>
      {children}
    </Button>
  );
}
