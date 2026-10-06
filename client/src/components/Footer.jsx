import { Box, Typography } from '@mui/material';
import logo from '../assets/gr3.png';

/**
 * Footer — always visible at the bottom of the main scroll column.
 * All content right-aligned: "Powered by [logo]"
 */
export default function Footer() {
  return (
    <Box
      component="footer"
      role="contentinfo"
      sx={{
        flexShrink: 0,
        height: 38,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        px: '18px',
      }}
    >
      <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', fontSize: 12, color: 'text.disabled' }}>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, marginLeft: 'auto' }}>
          <Typography component="span" sx={{ fontSize: 12, color: 'text.disabled' }}>Powered by</Typography>
          <Box component="img" src={logo} alt="Grassroots" sx={{ height: 18, width: 'auto' }} />
        </Box>
      </Box>
    </Box>
  );
}
