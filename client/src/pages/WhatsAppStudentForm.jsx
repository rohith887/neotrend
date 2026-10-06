import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { muiLightTheme } from '../theme/muiTheme.js';
import PublicHeader from '../components/PublicHeader.jsx';
import Footer, { CONTACT } from '../components/StudentFormFooter.jsx';
import { submitWhatsAppStudent } from '../api/whatsappStudents.js';

const COUNTRIES = [
  'Canada', 'United States', 'United Kingdom', 'Australia',
  'Germany', 'Ireland', 'New Zealand', 'UAE', 'Singapore',
];

const INTAKES = ['Fall 2026', 'Spring 2027', 'Summer 2027', 'Winter 2027'];

const fieldSx = {
  mb: 1.75,
  minWidth: 0,
  '& .MuiInputLabel-root': { fontWeight: 600, fontSize: 13 },
  '& .MuiOutlinedInput-root': {
    height: 46,
    borderRadius: 2,
    fontSize: 15,
  },
  '& .MuiOutlinedInput-input': {
    fontSize: 15,
  },
  '& .MuiSelect-select': {
    py: '10px',
    fontSize: 15,
  },
};

const contactBtnSx = (bg, hover, shadow) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 1.5,
  width: '100%',
  minHeight: 56,
  px: 1.5,
  py: 1,
  borderRadius: 2.5,
  textTransform: 'none',
  textAlign: 'left',
  color: '#ffffff',
  background: bg,
  boxShadow: shadow,
  transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
  '&:hover': { background: hover, transform: 'translateY(-1px)', boxShadow: shadow },
  '&:active': { transform: 'translateY(0)' },
});

const ContactBlock = () => (
  <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px dashed', borderColor: 'divider' }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: 13, textAlign: 'center' }}>
      Meanwhile, you can also reach out to us on:
    </Typography>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Button
        component="a"
        href={CONTACT.whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Chat on WhatsApp ${CONTACT.whatsappDisplay}`}
        sx={contactBtnSx('#25D366', '#1ebe5a', '0 4px 14px rgba(37,211,102,0.35)')}
      >
        <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <WhatsAppIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 11.5, opacity: 0.9, lineHeight: 1.2 }}>Chat on WhatsApp</Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{CONTACT.whatsappDisplay}</Typography>
        </Box>
        <ArrowForwardIcon sx={{ fontSize: 18, opacity: 0.9 }} />
      </Button>
      <Button
        component="a"
        href={`mailto:${CONTACT.email}`}
        aria-label={`Send an email to ${CONTACT.email}`}
        sx={contactBtnSx('#0f766e', '#115e59', '0 4px 14px rgba(15,118,110,0.30)')}
      >
        <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <EmailOutlinedIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 11.5, opacity: 0.9, lineHeight: 1.2 }}>Email us</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{CONTACT.email}</Typography>
        </Box>
        <ArrowForwardIcon sx={{ fontSize: 18, opacity: 0.9 }} />
      </Button>
    </Box>
  </Box>
);

export default function WhatsAppStudentForm() {
  const c = muiLightTheme.palette;

  const [form, setForm] = useState({
    studentName: '',
    mobile: '',
    email: '',
    preferredCountry: '',
    preferredIntake: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitWhatsAppStudent(form);
      setSubmitted(true);
    } catch (err) {
      const data = err?.response?.data;
      const details = data?.errors?.map((er) => er.message).filter(Boolean).join('. ');
      setSubmitError(details || data?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success ──────────────────────────────────────────────────── */
  if (submitted) {
    return (
      <Box sx={shellSx}>
        <PublicHeader large />
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2,
            py: 2,
          }}
        >
          <Card
            elevation={0}
            sx={{
              width: '100%',
              maxWidth: 420,
              textAlign: 'center',
              px: 2.5,
              py: 3,
              animation: 'waFormFadeIn 0.4s ease both',
              '@keyframes waFormFadeIn': {
                from: { opacity: 0, transform: 'translateY(8px)' },
                to: { opacity: 1, transform: 'none' },
              },
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                bgcolor: c.successSoft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 32, color: c.success }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              Submission Received!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 320, mx: 'auto' }}>
              Thank you — our team will get in touch with you shortly.
            </Typography>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setForm({ studentName: '', mobile: '', email: '', preferredCountry: '', preferredIntake: '' });
                setSubmitted(false);
                setSubmitError(null);
              }}
              sx={{
                height: 44,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 14,
                borderRadius: 2,
              }}
            >
              Submit Another Response
            </Button>
            <ContactBlock />
          </Card>
        </Box>
        <Footer />
      </Box>
    );
  }

  /* ── Form ─────────────────────────────────────────────────────── */
  return (
    <Box sx={shellSx}>
      <PublicHeader large />
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          px: 2,
          pt: 2,
          pb: 2.5,
        }}
      >
        <Card
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 420,
            px: 2,
            py: 2.5,
            animation: 'waFormFadeIn 0.4s ease both',
            '@keyframes waFormFadeIn': {
              from: { opacity: 0, transform: 'translateY(8px)' },
              to: { opacity: 1, transform: 'none' },
            },
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Student Details
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 13 }}>
            Please share your details and we will reach out to you.
          </Typography>

          {submitError && (
            <Alert severity="error" sx={{ mb: 1.75, py: 0, px: 1, borderRadius: 1.5, '& .MuiAlert-message': { py: '8px 4px', fontSize: 13 } }}>
              {submitError}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Student Name"
              placeholder="Enter your full name"
              required
              fullWidth
              size="small"
              value={form.studentName}
              onChange={set('studentName')}
              sx={fieldSx}
            />
            <TextField
              label="Mobile"
              placeholder="e.g. +91 98765 43210"
              required
              fullWidth
              size="small"
              value={form.mobile}
              onChange={set('mobile')}
              sx={fieldSx}
            />
            <TextField
              label="Email"
              placeholder="you@example.com"
              required
              fullWidth
              size="small"
              type="email"
              value={form.email}
              onChange={set('email')}
              sx={fieldSx}
            />
            <TextField
              label="Preferred Country"
              select
              required
              fullWidth
              size="small"
              value={form.preferredCountry}
              onChange={set('preferredCountry')}
              sx={fieldSx}
            >
              <MenuItem value="">— Select —</MenuItem>
              {COUNTRIES.map((cn) => (
                <MenuItem key={cn} value={cn}>{cn}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Preferred Intake"
              select
              required
              fullWidth
              size="small"
              value={form.preferredIntake}
              onChange={set('preferredIntake')}
              sx={fieldSx}
            >
              <MenuItem value="">— Select —</MenuItem>
              {INTAKES.map((i) => (
                <MenuItem key={i} value={i}>{i}</MenuItem>
              ))}
            </TextField>

            <Button
              type="submit"
              fullWidth
              disabled={submitting}
              sx={{
                mt: 0.5,
                height: 48,
                fontSize: 15,
                fontWeight: 700,
                color: '#ffffff',
                borderRadius: 2,
                textTransform: 'none',
                background: `linear-gradient(180deg, ${alpha(c.primary.main, 0.95)} 0%, ${c.primary.main} 50%, ${c.primary.hover} 100%)`,
                boxShadow: `0 2px 6px ${alpha(c.primary.main, 0.25)}, 0 6px 20px ${alpha(c.primary.main, 0.18)}`,
                '&:hover:not(:disabled)': {
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 10px ${alpha(c.primary.main, 0.30)}, 0 10px 28px ${alpha(c.primary.main, 0.22)}`,
                  background: `linear-gradient(180deg, ${alpha(c.primary.main, 1)} 0%, ${alpha(c.primary.main, 0.95)} 50%, ${c.primary.main} 100%)`,
                },
                '&:disabled': { opacity: 0.55, boxShadow: 'none', color: '#ffffff', cursor: 'not-allowed' },
              }}
            >
              {submitting ? (
                <>
                  <CircularProgress size={18} thickness={5} sx={{ color: '#ffffff', mr: 1 }} />
                  Submitting…
                </>
              ) : (
                'Submit'
              )}
            </Button>
          </Box>
          <ContactBlock />
        </Card>
      </Box>
      <Footer />
    </Box>
  );
}

/* ── Shell ──────────────────────────────────────────────────────── */
const shellSx = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  bgcolor: 'grey.50',
  overflowX: 'hidden',
};