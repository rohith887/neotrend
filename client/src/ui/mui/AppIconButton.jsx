import { IconButton as MuiIconButton, Tooltip } from '@mui/material';

/**
 * AppIconButton — IconButton with an optional tooltip. `title` doubles as the
 * accessible label when no explicit `aria-label` is given.
 */
export default function AppIconButton({ title, children, ariaLabel, ...rest }) {
  const button = (
    <MuiIconButton aria-label={ariaLabel || title} {...rest}>
      {children}
    </MuiIconButton>
  );
  return title ? <Tooltip title={title}>{button}</Tooltip> : button;
}
