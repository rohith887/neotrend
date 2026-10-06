import { Box, Typography } from '@mui/material';
import logo from '../assets/gr3.png';

export const CONTACT = {
  whatsappDisplay: '+91 81519 67421',
  whatsappLink: 'https://wa.me/918151967421',
  email: 'admissions@grstudyabroad.com',
  address:
    'First Floor, Corporate Miller, 332/1, Thimmaiah Road, Govinda Chetty Colony, Vasanth Nagar, Bengaluru, Karnataka – 560052',
};

/**
 * StudentFormFooter — office address + "A Product of" branding for the
 * public student form.
 */
export default function StudentFormFooter() {
  return (
    <Box
      component="footer"
      role="contentinfo"
      sx={{
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        px: 2,
        py: 1.5,
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: 12, color: 'text.secondary', maxWidth: 420, mx: 'auto', lineHeight: 1.5 }}>
        {CONTACT.address}
      </Typography>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <Typography component="span" sx={{ fontSize: 12, color: 'text.disabled' }}>A Product of</Typography>
        <Box component="img" src={logo} alt="Grassroots" sx={{ height: 22, width: 'auto' }} />
      </Box>
    </Box>
  );
}
