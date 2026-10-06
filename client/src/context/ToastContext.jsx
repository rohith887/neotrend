import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { Alert, IconButton, Slide, Stack } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const ToastContext = createContext(null);

const TONE_ICONS = {
  success: <CheckCircleIcon sx={{ fontSize: 16 }} />,
  danger: <ErrorIcon sx={{ fontSize: 16 }} />,
  warning: <WarningAmberIcon sx={{ fontSize: 16 }} />,
  info: <InfoIcon sx={{ fontSize: 16 }} />,
};

const TONE_SEVERITY = {
  success: 'success',
  danger: 'error',
  warning: 'warning',
  info: 'info',
};

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef([]);

  // Toasts quote student names ("Call started for <name>"). This provider sits
  // above <App/> and therefore outlives a logout, so an Agent A toast would
  // still be on screen when Agent B signs in. Drop them with the identity.
  const { user } = useAuth();
  const userId = user?._id ?? null;
  const [scope, setScope] = useState(userId);
  if (scope !== userId) {
    setScope(userId);
    if (timers.current.length) {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    }
    setToasts([]);
  }

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'success', duration = 3200) => {
      const id = ++toastId;
      setToasts((list) => [...list.slice(-4), { id, message, tone }]);
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.push(timer);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      toast: (message, tone, duration) => push(message, tone, duration),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <Stack
          spacing={1.25}
          role="status"
          aria-live="polite"
          sx={{
            position: 'fixed',
            top: 60,
            right: 18,
            zIndex: 1080,
            width: 340,
            maxWidth: 'calc(100vw - 36px)',
          }}
        >
          {toasts.map((t) => {
            const sev = TONE_SEVERITY[t.tone] || 'info';
            return (
              <Slide key={t.id} direction="left" in timeout={200}>
                <Alert
                  severity={sev}
                  icon={TONE_ICONS[t.tone] || TONE_ICONS.info}
                  action={
                    <IconButton
                      size="small"
                      aria-label="Dismiss"
                      onClick={() => dismiss(t.id)}
                      sx={{ width: 24, height: 24, p: 0, '& .MuiSvgIcon-root': { fontSize: 15 } }}
                    >
                      <CloseIcon />
                    </IconButton>
                  }
                  sx={{
                    bgcolor: `${sev}.soft`,
                    color: 'text.primary',
                    border: 1,
                    borderColor: `${sev}.border`,
                    borderRadius: 1,
                    boxShadow: 2,
                    py: 0.75,
                    '& .MuiAlert-message': { minWidth: 0, alignSelf: 'center', fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45, whiteSpace: 'pre-line', wordBreak: 'break-word' },
                  }}
                >
                  {t.message}
                </Alert>
              </Slide>
            );
          })}
        </Stack>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
