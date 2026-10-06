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
import { muiLightTheme } from '../theme/muiTheme.js';
import PublicHeader from '../components/PublicHeader.jsx';
import Footer from '../components/Footer.jsx';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const COUNTRIES = [
  'Canada', 'United States', 'United Kingdom', 'Australia',
  'Germany', 'Ireland', 'New Zealand', 'UAE', 'Singapore',
];

const INTAKES = ['Fall 2026', 'Spring 2027', 'Summer 2027', 'Winter 2027'];

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    const msg = json.message || 'Request failed';
    const details = json.errors?.map((e) => e.message).filter(Boolean).join('. ');
    throw new Error(details || msg);
  }
  return json.data;
}

const fieldSx = {
  mb: 2,
  minWidth: 0,
  '& .MuiInputLabel-root': { fontWeight: 600, fontSize: { xs: 13, sm: 13.5 } },
  '& .MuiOutlinedInput-root': {
    height: { xs: 46, sm: 48 },
    borderRadius: 2,
    fontSize: { xs: 15, sm: 14 },
  },
  '& .MuiOutlinedInput-input': {
    fontSize: { xs: 15, sm: 14 },
  },
  '& .MuiSelect-select': {
    py: '10px',
    fontSize: { xs: 15, sm: 14 },
  },
};

export default function PublicQRReferralPage() {
  const c = muiLightTheme.palette;

  const [form, setForm] = useState({
    employeeName: '',
    employeeId: '',
    employeeNumber: '',
    studentName: '',
    mobile: '',
    email: '',
    preferredCountry: '',
    intake: '',
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
      await apiPost('/referrals/public', form);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success ──────────────────────────────────────────────── */
  if (submitted) {
    return (
      <Box sx={shellSx}>
        <PublicHeader />
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: { xs: 2, sm: 3 },
            py: { xs: 2, sm: 3 },
          }}
        >
          <Card
            elevation={0}
            sx={{
              width: '100%',
              maxWidth: 440,
              textAlign: 'center',
              px: { xs: 2.5, sm: 4 },
              py: { xs: 3, sm: 4 },
              animation: 'referFadeIn 0.4s ease both',
              '@keyframes referFadeIn': {
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
            <Typography variant="h2" sx={{ mb: 1 }}>Referral Submitted!</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 320, mx: 'auto' }}>
              The referred student has been registered. Our team will get in touch with them shortly.
            </Typography>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setForm({ employeeName: '', employeeId: '', employeeNumber: '', studentName: '', mobile: '', email: '', preferredCountry: '', intake: '' });
                setSubmitted(false);
                setSubmitError(null);
              }}
              sx={{
                height: { xs: 44, sm: 40 },
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 14,
                borderRadius: 2,
              }}
            >
              Refer Another Student
            </Button>
          </Card>
        </Box>
        <Footer />
      </Box>
    );
  }

  /* ── Main form ────────────────────────────────────────────── */
  return (
    <Box sx={shellSx}>
      <PublicHeader />
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 3 },
          pb: { xs: 2.5, sm: 3 },
        }}
      >
        <Card
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 520,
            px: { xs: 2, sm: 3.5 },
            py: { xs: 2.5, sm: 3 },
            animation: 'referFadeIn 0.4s ease both',
            '@keyframes referFadeIn': {
              from: { opacity: 0, transform: 'translateY(8px)' },
              to: { opacity: 1, transform: 'none' },
            },
          }}
        >
          <Box component="form" onSubmit={handleSubmit} noValidate>

            {/* ── Employee Details ────────────────────────── */}
            <Typography variant="h3" sx={{ mb: 0.5, fontSize: { xs: 17, sm: 18 } }}>Employee Details</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: 12.5, sm: 13 } }}>
              Referring through Grassroots Study Abroad
            </Typography>

            <Alert
              severity="info"
              sx={{
                mb: 2.5,
                py: 0,
                px: { xs: 1, sm: 1.5 },
                borderRadius: 1.5,
                minHeight: 40,
                '& .MuiAlert-message': { py: '8px 4px', fontSize: { xs: 12, sm: 13 } },
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.4, fontSize: { xs: 12.5, sm: 13 } }}>Grassroots Study Abroad</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>Employee Referral Program</Typography>
            </Alert>

            <TextField
              label="Employee Name"
              placeholder="Enter your full name"
              required
              fullWidth
              size="small"
              value={form.employeeName}
              onChange={set('employeeName')}
              sx={fieldSx}
            />
            <TextField
              label="Employee ID"
              placeholder="Enter your employee ID"
              required
              fullWidth
              size="small"
              value={form.employeeId}
              onChange={set('employeeId')}
              sx={fieldSx}
            />

              <TextField
              label="Employee Mobile Number"
              placeholder="Enter your mobile Number"
              required
              fullWidth
              size="small"
              value={form.employeeNumber}
              onChange={set('employeeNumber')}
              sx={fieldSx}
            />

            {/* ── Divider ─────────────────────────────────── */}
            <Box sx={{ my: { xs: 2, sm: 2.5 }, borderTop: '1px solid', borderColor: 'divider' }} />

            {/* ── Student Details ─────────────────────────── */}
            <Typography variant="h3" sx={{ mb: 0.5, fontSize: { xs: 17, sm: 18 } }}>Student Details</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: 12.5, sm: 13 } }}>
              Enter the details of the student you are referring.
            </Typography>

            {submitError && (
              <Alert
                severity="error"
                sx={{ mb: 2, py: 0, px: { xs: 1, sm: 1.5 }, borderRadius: 1.5, '& .MuiAlert-message': { py: '8px 4px', fontSize: { xs: 12, sm: 13 } } }}
              >
                {submitError}
              </Alert>
            )}

            <TextField
              label="Full Name"
              placeholder="Enter student's full name"
              required
              fullWidth
              size="small"
              value={form.studentName}
              onChange={set('studentName')}
              sx={fieldSx}
            />
            <TextField
              label="Mobile Number"
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
              fullWidth
              size="small"
              value={form.intake}
              onChange={set('intake')}
              sx={fieldSx}
            >
              <MenuItem value="">— Select —</MenuItem>
              {INTAKES.map((i) => (
                <MenuItem key={i} value={i}>{i}</MenuItem>
              ))}
            </TextField>

            {/* ── Submit ──────────────────────────────────── */}
            <Button
              type="submit"
              fullWidth
              disabled={submitting}
              sx={{
                mt: 1,
                height: { xs: 48, sm: 46 },
                fontSize: { xs: 15, sm: 14.5 },
                fontWeight: 700,
                letterSpacing: '0.01em',
                color: '#ffffff',
                borderRadius: 2,
                textTransform: 'none',
                background: `linear-gradient(180deg, ${alpha(c.primary.main, 0.95)} 0%, ${c.primary.main} 50%, ${c.primary.hover} 100%)`,
                boxShadow: `0 2px 6px ${alpha(c.primary.main, 0.25)}, 0 6px 20px ${alpha(c.primary.main, 0.18)}`,
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                '&:hover:not(:disabled)': {
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 10px ${alpha(c.primary.main, 0.30)}, 0 10px 28px ${alpha(c.primary.main, 0.22)}`,
                  background: `linear-gradient(180deg, ${alpha(c.primary.main, 1)} 0%, ${alpha(c.primary.main, 0.95)} 50%, ${c.primary.main} 100%)`,
                },
                '&:active:not(:disabled)': {
                  transform: 'translateY(0)',
                  boxShadow: `0 1px 4px ${alpha(c.primary.main, 0.20)}, 0 4px 12px ${alpha(c.primary.main, 0.12)}`,
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
                'Submit Referral'
              )}
            </Button>
          </Box>
        </Card>
      </Box>
      <Footer />
    </Box>
  );
}

/* ── Shell ──────────────────────────────────────────────────── */
const shellSx = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  bgcolor: 'grey.50',
  overflowX: 'hidden',
};
