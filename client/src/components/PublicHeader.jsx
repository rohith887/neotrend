import { Box } from '@mui/material';
import logo from '../assets/tasa-logo.png';

/**
 * PublicHeader — branding-only header for unauthenticated pages (/refer).
 * Visually matches the authenticated Header (42px, same logo, same borders)
 * but contains no user profile, sidebar toggle, or navigation controls.
 * `large` renders a taller header with a bigger logo (public student form).
 */
export default function PublicHeader({ large = false }) {
  return (
    <Box
      component="header"
      sx={{
        flexShrink: 0,
        height: large ? 64 : 42,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        px: '18px',
      }}
    >
      <Box
        component="img"
        src={logo}
        alt="Grassroots Study Abroad"
        sx={large
          ? { height: 56, width: { xs: 154, sm: 180 }, objectFit: 'cover', objectPosition: 'center' }
          : {
              height: 38,
              width: { xs: 104, sm: 116, md: 128, lg: 138 },
              objectFit: 'cover',
              objectPosition: 'center',
            }}
      />
    </Box>
  );
}
