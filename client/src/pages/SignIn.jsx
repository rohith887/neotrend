import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  TextField,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { muiLightTheme } from '../theme/muiTheme.js';
import logo from '../assets/tasa-logo.png';
import { useAuth } from '../context/AuthContext.jsx';

export default function SignIn() {
  const { user, loggingIn, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  if (user) return <Navigate to="/" replace />;

  const validateEmail = () => {
    const next = { ...errors };
    const value = email.trim();
    if (!value) next.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) next.email = 'Enter a valid email address.';
    else delete next.email;
    setErrors(next);
    return !next.email;
  };

  const validateOtp = () => {
    if (!/^\d{6}$/.test(otp)) {
      setErrors((current) => ({ ...current, otp: 'Invalid OTP' }));
      return false;
    }
    setErrors((current) => {
      const next = { ...current };
      delete next.otp;
      return next;
    });
    return true;
  };

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
    setOtp('');
    setOtpSent(false);
    setApiError('');
    setErrors((current) => {
      const next = { ...current };
      delete next.otp;
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setApiError('');
    if (!validateEmail()) return;

    try {
      if (!otpSent) {
        await requestOtp(email.trim());
        setOtpSent(true);
        return;
      }
      if (!validateOtp()) return;
      await verifyOtp({ email: email.trim(), otp, remember: true });
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setApiError(err?.response?.data?.message || 'Unable to sign in. Please try again.');
    }
  };

  const c = muiLightTheme.palette;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: '20px 16px', sm: '24px 20px' },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background image — covers entire viewport */}
      <Box
        aria-hidden="true"
        component="img"
        src="/assets/test.jpg"
        alt=""
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          zIndex: 0,
        }}
      />

      {/* Translucent overlay — stronger on small screens for readability */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          bgcolor: {
            xs: 'rgba(255, 255, 255, 0.38)',
            sm: 'rgba(255, 255, 255, 0.30)',
            md: 'rgba(255, 255, 255, 0.24)',
          },
          background: {
            xs: 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(238,240,253,0.38) 100%)',
            sm: 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(238,240,253,0.30) 100%)',
            md: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(238,240,253,0.24) 100%)',
          },
        }}
      />

      <Card
        elevation={0}
        sx={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: 480,
          bgcolor: c.background.paper,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.09), 0 24px 48px rgba(15, 23, 42, 0.08)',
          p: { xs: '20px 22px 14px', sm: '24px 36px 18px' },
          animation: 'signinFadeIn 0.45s ease both',
          '@keyframes signinFadeIn': {
            from: { opacity: 0, transform: 'translateY(10px)' },
            to: { opacity: 1, transform: 'none' },
          },
        }}
      >
        {/* Brand */}
        <Box sx={{ textAlign: 'center', mb: 0 }}>
          <Box
            component="img"
            src={logo}
            alt="TASA CRM"
            sx={{
              display: 'inline-block',
              width: { xs: 150, sm: 180 },
              height: { xs: 36, sm: 44 },
              objectFit: 'cover',
              objectPosition: 'center',
              mb: 3,
            }}
          />
{/* <Typography
  sx={{
    fontSize: { xs: 25, sm: 28 },
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'text.primary',
    mb: 0.75,
  }}
>
  Welcome to Grassroots StudyAbroad CRM
</Typography>

<Typography
  sx={{
    fontSize: 15.5,
    color: 'text.secondary',
    mb: 2.5,
  }}
>
  Sign in to manage your workspace.
</Typography> */}
        </Box>

        {/* ── API error alert ───────────────────────────────── */}
        {apiError && (
          <Alert severity="error" sx={{ py: 1, px: 2.25, mb: 2.25, '& .MuiAlert-message': { fontSize: 12.5 } }}>
            {apiError}
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <TextField
            fullWidth
            label="Email Address"
            placeholder="you@example.com"
            value={email}
            onChange={handleEmailChange}
            disabled={loggingIn}
            autoFocus
            autoComplete="email"
            error={!!errors.email}
            helperText={errors.email || ' '}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{
              mb: otpSent ? 1.5 : 2,
              '& .MuiInputLabel-root': { fontWeight: 600, fontSize: 13.5 },
              '& .MuiOutlinedInput-root': { height: 52, borderRadius: 2, fontSize: 14.5 },
            }}
          />

          {otpSent && (
            <Alert severity="success" sx={{ py: 1, px: 2.25, mb: 2.25, '& .MuiAlert-message': { fontSize: 12.5 } }}>
              OTP sent to your email
            </Alert>
          )}

          {otpSent && (
            <TextField
              fullWidth
              label="Enter OTP"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={loggingIn}
              autoComplete="one-time-code"
              autoFocus
              error={!!errors.otp}
              helperText={errors.otp || ' '}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { inputMode: 'numeric', maxLength: 6, pattern: '[0-9]*' },
              }}
              sx={{
                mb: 2,
                '& .MuiInputLabel-root': { fontWeight: 600, fontSize: 13.5 },
                '& .MuiOutlinedInput-root': { height: 52, borderRadius: 2, fontSize: 14.5 },
                '& input': { letterSpacing: '0.35em', textAlign: 'center', fontSize: 17 },
              }}
            />
          )}

          <Button
            type="submit"
            fullWidth
            disabled={loggingIn}
            sx={{
              height: 52,
              fontSize: 15.5,
              fontWeight: 700,
              letterSpacing: '0.01em',
              color: '#ffffff',
              borderRadius: 2.5,
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
            {loggingIn ? (
              <>
                <CircularProgress size={16} thickness={5} sx={{ color: '#ffffff', mr: 1 }} />
                {otpSent ? 'Verifying…' : 'Sending…'}
              </>
            ) : otpSent ? 'Verify OTP' : 'Send OTP'}
          </Button>
        </form>

        {/* ── Footer ────────────────────────────────────────── */}
        <Box
          sx={{
            mt: 2.5,
            pt: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
          }}
        >
          {/* <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>Powered by</Typography>
          <Box component="img" src={poweredByLogo} alt="Grassroots" sx={{ height: 16, width: 'auto', objectFit: 'contain' }} />
          <Typography sx={{ fontSize: 12.5, color: 'text.disabled', opacity: 0.6 }}>·</Typography> */}
        </Box>
      </Card>
    </Box>
  );
}
