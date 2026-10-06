import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LinkIcon from '@mui/icons-material/Link';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const COUNTRIES = [
  'Canada', 'United States', 'United Kingdom', 'Australia',
  'Germany', 'Ireland', 'New Zealand', 'UAE', 'Singapore',
];

const INTAKES = ['Fall 2026', 'Spring 2027', 'Summer 2027', 'Winter 2027'];

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'Request failed');
  return json.data;
}

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

export default function PublicReferralPage() {
  const { referralCode } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [referrerName, setReferrerName] = useState(null);

  const [form, setForm] = useState({
    studentName: '',
    mobile: '',
    email: '',
    preferredCountry: '',
    intake: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet(`/referrals/public/${referralCode}`)
      .then((data) => {
        if (!cancelled) {
          setReferrerName(data.referrerName);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Invalid referral link');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [referralCode]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await apiPost(`/referrals/public/${referralCode}`, form);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Loading ──────────────────────────────────────────────────── */
  if (loading) {
    return (
      <Box sx={shellSx}>
        <Header />
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={32} />
        </Box>
      </Box>
    );
  }

  /* ── Invalid code ─────────────────────────────────────────────── */
  if (error) {
    return (
      <Box sx={shellSx}>
        <Header />
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <Alert severity="error" sx={{ maxWidth: 400, width: '100%' }}>{error}</Alert>
        </Box>
      </Box>
    );
  }

  /* ── Success ──────────────────────────────────────────────────── */
  if (submitted) {
    return (
      <Box sx={shellSx}>
        <Header />
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <Box sx={{ textAlign: 'center', maxWidth: 400 }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Thank you!</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Your referral has been submitted successfully. Our team will get in touch with you shortly.
            </Typography>
            <Button variant="outlined" component={Link} to="/" sx={{ textTransform: 'none' }}>
              Go to Homepage
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }

  /* ── Form ─────────────────────────────────────────────────────── */
  return (
    <Box sx={shellSx}>
      <Header />
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', p: { xs: 2, sm: 3 }, pt: { xs: 3, sm: 4 } }}>
        <Box sx={{ width: '100%', maxWidth: 440 }}>
          {referrerName && (
            <Alert severity="info" icon={<LinkIcon sx={{ fontSize: 18 }} />} sx={{ mb: 2.5, borderRadius: 2 }}>
              Referred by <strong>{referrerName}</strong>
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Get Started</Typography>
            <Typography color="text.secondary" sx={{ mb: 3, fontSize: 14 }}>
              Fill in your details and our team will connect with you.
            </Typography>

            {submitError && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>{submitError}</Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Full Name"
                placeholder="Enter your full name"
                required
                fullWidth
                size="small"
                value={form.studentName}
                onChange={set('studentName')}
              />
              <TextField
                label="Mobile Number"
                placeholder="e.g. +91 98765 43210"
                required
                fullWidth
                size="small"
                value={form.mobile}
                onChange={set('mobile')}
              />
              <TextField
                label="Email"
                placeholder="you@example.com"
                fullWidth
                size="small"
                type="email"
                value={form.email}
                onChange={set('email')}
              />
              <TextField
                label="Preferred Country"
                select
                fullWidth
                size="small"
                value={form.preferredCountry}
                onChange={set('preferredCountry')}
              >
                <MenuItem value="">— Select —</MenuItem>
                {COUNTRIES.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Preferred Intake"
                select
                fullWidth
                size="small"
                value={form.intake}
                onChange={set('intake')}
              >
                <MenuItem value="">— Select —</MenuItem>
                {INTAKES.map((i) => (
                  <MenuItem key={i} value={i}>{i}</MenuItem>
                ))}
              </TextField>
            </Box>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={submitting}
              sx={{ mt: 3, py: 1.25, textTransform: 'none', fontWeight: 600, fontSize: 15, borderRadius: 2 }}
            >
              {submitting ? <CircularProgress size={22} color="inherit" /> : 'Submit'}
            </Button>
          </Box>
        </Box>
      </Box>
      <Box component="footer" sx={{ py: 2, textAlign: 'center', color: 'text.disabled', fontSize: 12 }}>
        TASA Grassroots
      </Box>
    </Box>
  );
}

/* ── Shared layout shell ──────────────────────────────────────── */
const shellSx = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  bgcolor: 'grey.50',
};

function Header() {
  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', fontSize: 18 }}>
        TASA Grassroots
      </Typography>
    </Box>
  );
}
