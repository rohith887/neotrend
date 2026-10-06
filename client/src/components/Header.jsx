import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsIcon from '@mui/icons-material/Notifications';
import RefreshIcon from '@mui/icons-material/Refresh';
import SpeedIcon from '@mui/icons-material/Speed';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import { useAuth, getRoleCode } from '../context/AuthContext.jsx';
import { fetchUnreadNotificationCount } from '../api/notifications.js';
import { checkLogout } from '../api/logoutGate.js';
import StatusChip from '../ui/mui/StatusChip.jsx';
import logo from '../assets/tasa-logo.png';

// Agent shell nav — Dashboard / Call Workspace / Alerts. Kept as a small
// local copy (icon + label + route id) rather than importing it from
// Layout.jsx, which already imports Header.jsx — avoids a circular import
// for three static entries.
// Each item keeps its own identity color (the "precision" look from the old
// pill nav) — applied only as a soft glossy tint on the active item, never a
// solid permanent fill, so Alerts reads the same as the other two until it's
// actually the active view.
const AGENT_NAV = [
  { id: 'dashboard', label: 'Dashboard', color: '#800000', icon: <SpeedIcon sx={{ fontSize: 16 }} /> },
  { id: 'workspace', label: 'Call Workspace', color: '#166534', icon: <PhoneInTalkIcon sx={{ fontSize: 16 }} /> },
  { id: 'alerts', label: 'Alerts', color: '#DC2626', icon: <NotificationsIcon sx={{ fontSize: 16 }} /> },
];

export default function Header({ onToggleCollapse, agentView, agentNavigate, onAgentRefresh }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const name      = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Supervisor' : 'Supervisor';
  const roleCode  = getRoleCode(user) || 'supervisor';
  const roleLabel = roleCode.charAt(0).toUpperCase() + roleCode.slice(1);
  const initials  = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const [anchorEl, setAnchorEl] = useState(null);
  const menuOpen = Boolean(anchorEl);
  const [checkingLogout, setCheckingLogout] = useState(false);
  const [logoutBlocked, setLogoutBlocked] = useState(null);

  /* Supervisor alert bell + Agent nav Alerts badge — unread count from the
     same shared per-user Notification store, polled so the badge reflects
     live state. Clicking either goes straight to the Alerts page. */
  const isSupervisor = roleCode === 'supervisor';
  const isAgent = roleCode === 'agent';
  const isCounselor = roleCode === 'counselor';
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  useEffect(() => {
    if (!isSupervisor && !isAgent && !isCounselor) return undefined;
    let cancelled = false;
    const reload = () => {
      fetchUnreadNotificationCount()
        .then((n) => { if (!cancelled) setUnreadAlerts(n); })
        .catch(() => { /* the Alerts page is still reachable */ });
    };
    reload();
    const id = window.setInterval(reload, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isSupervisor, isAgent, isCounselor]);

  const handleLogout = async () => {
    // Logout-control gate applies to Agents/Counselors only — they may not
    // sign out with unfinished callbacks/RNRs (unless a supervisor granted a
    // one-shot override, which the server consumes on this call).
    const gated = roleCode === 'agent' || roleCode === 'counselor';
    if (gated) {
      setCheckingLogout(true);
      try {
        const result = await checkLogout();
        if (result && result.allowed === false) {
          setLogoutBlocked(result);
          return;
        }
      } catch (_) {
        // Server unreachable — fall back to the current sign-out behavior.
      } finally {
        setCheckingLogout(false);
      }
    }
    logout();
    navigate('/signin', { replace: true });
  };

  return (
    <Box
      component="header"
      sx={{
        flexShrink: 0,
        height: 42,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        px: '18px',
        gap: 2,
      }}
    >
      <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 2 }}>

        {/* ── Left: hamburger + logo ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
          {onToggleCollapse && (
            <IconButton onClick={onToggleCollapse} aria-label="Toggle sidebar">
              <MenuIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}

            <Box component={Link} to="/" aria-label="TASA CRM home" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none' }}>
              <Box
                component="img"
                src={logo}
                alt=""
                aria-hidden="true"
                sx={{
                  height: 38,
                  width: { xs: 104, sm: 116, md: 128, lg: 138 },
                  objectFit: 'cover',
                  objectPosition: 'center',
                }}
              />
            </Box>
        </Box>

        {/* ── Agent nav — Dashboard / Call Workspace / Alerts, immediately
           right of the logo. Each item keeps its own identity color (the
           precise old pill look) as a soft glossy tint only while active —
           inactive stays clean/subtle. Alerts is styled exactly like the
           other two; it never turns permanently red on its own, only the
           small badge signals unread count. ── */}
        {isAgent && agentNavigate && (
          <Box component="nav" aria-label="Agent views" sx={{ display: 'flex', alignItems: 'center', gap: 0.625, flexShrink: 0 }}>
            {AGENT_NAV.map((item) => {
              const active = agentView === item.id;
              return (
                <Box
                  component="button"
                  type="button"
                  key={item.id}
                  onClick={() => agentNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    py: '6px',
                    px: '12px',
                    borderRadius: '999px',
                    border: '1px solid',
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    color: active ? item.color : 'text.secondary',
                    background: active
                      ? `linear-gradient(180deg, ${alpha(item.color, 0.16)}, ${alpha(item.color, 0.08)})`
                      : 'transparent',
                    borderColor: active ? alpha(item.color, 0.35) : 'transparent',
                    boxShadow: active ? `inset 0 1px 0 ${alpha('#ffffff', 0.6)}, 0 1px 2px ${alpha(item.color, 0.15)}` : 'none',
                    transition: 'color 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease',
                    '&:hover': {
                      color: item.color,
                      borderColor: alpha(item.color, active ? 0.35 : 0.2),
                      background: active
                        ? `linear-gradient(180deg, ${alpha(item.color, 0.16)}, ${alpha(item.color, 0.08)})`
                        : alpha(item.color, 0.06),
                    },
                  }}
                >
                  {item.id === 'alerts' ? (
                    <Badge badgeContent={unreadAlerts} color="error" overlap="circular" showZero={false} sx={{ '& .MuiBadge-badge': { fontSize: 9, height: 14, minWidth: 14 } }}>
                      {item.icon}
                    </Badge>
                  ) : item.icon}
                  {item.label}
                </Box>
              );
            })}
          </Box>
        )}

        {/* ── Right: Live/Refresh (agent) + alerts bell (supervisor) + user profile menu ── */}
        <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
          {isAgent && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <StatusChip status="Live" tone="success" dot pulse />
              <Box
                component="button"
                type="button"
                aria-label="Refresh dashboard"
                onClick={() => onAgentRefresh?.()}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  py: '5px',
                  px: '10px',
                  borderRadius: '999px',
                  border: 1,
                  borderColor: 'divider',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'text.secondary',
                  bgcolor: 'background.paper',
                  transition: 'color 150ms ease, border-color 150ms ease',
                  '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
                }}
              >
                <RefreshIcon sx={{ fontSize: 13 }} />
                Refresh
              </Box>
            </Box>
          )}
          {(isSupervisor || isCounselor) && (
            <Tooltip title={unreadAlerts > 0 ? `${unreadAlerts} unread alert${unreadAlerts === 1 ? '' : 's'}` : 'Alerts'}>
              <IconButton
                aria-label="Alerts"
                onClick={() => navigate(isCounselor ? '/counselor/alerts' : '/alerts')}
                sx={{ border: 1, borderColor: 'divider', bgcolor: 'background.paper', '&:hover': { borderColor: 'primary.main', color: 'primary.main' } }}
              >
                <Badge badgeContent={unreadAlerts} color="error" overlap="circular" showZero={false} sx={{ '& .MuiBadge-badge': { fontSize: 9, height: 15, minWidth: 15 } }}>
                  <NotificationsIcon sx={{ fontSize: 18 }} />
                </Badge>
              </IconButton>
            </Tooltip>
          )}
          <ButtonBase
            aria-label="Account menu"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              height: 36,
              minWidth: 0,
              px: '9px',
              borderRadius: '8px',
              bgcolor: 'transparent',
              cursor: 'pointer',
              transition: 'background-color 150ms ease',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Avatar
              aria-hidden="true"
              sx={{
                width: 34,
                height: 34,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#fff',
                bgcolor: 'grey.900',
                flexShrink: 0,
              }}
            >
              {initials}
            </Avatar>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'flex-start',
                minWidth: 0,
                width: 112,
                textAlign: 'left',
                ml: '2px',
              }}
            >
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'text.primary',
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: '100%',
                }}
              >
                {name}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 400,
                  color: 'text.secondary',
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: '100%',
                  mt: '1px',
                }}
              >
                {roleLabel}
              </Typography>
            </Box>
            <KeyboardArrowDownIcon sx={{ fontSize: 17, color: 'text.disabled', flexShrink: 0, ml: '6px' }} />
          </ButtonBase>

          <Menu
            anchorEl={anchorEl}
            open={menuOpen}
            onClose={() => setAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { mt: 1, minWidth: 224, borderRadius: 2, boxShadow: '0 8px 28px rgba(0,0,0,0.14), 0 2px 10px rgba(0,0,0,0.06)' } } }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5 }}>
              <Avatar aria-hidden="true" sx={{ width: 40, height: 40, fontSize: 15, fontWeight: 700, color: '#fff', bgcolor: 'grey.900', flexShrink: 0 }}>
                {initials}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.disabled', lineHeight: 1.3 }}>{roleLabel}</Typography>
              </Box>
            </Box>
            <Divider />
            <MenuItem onClick={handleLogout} disabled={checkingLogout} sx={{ gap: 1.25, py: 1 }}>
              <LogoutIcon sx={{ fontSize: 15, color: 'error.main' }} />
              <Typography sx={{ fontSize: 13, color: 'error.main' }}>
                {checkingLogout ? 'Checking…' : 'Sign out'}
              </Typography>
            </MenuItem>
          </Menu>
        </Box>

      </Box>

      {/* Logout-control dialog — shown when a sign-out attempt is blocked by
          unfinished callbacks/RNRs or the server is still checking. */}
      <Dialog
        open={Boolean(logoutBlocked) || checkingLogout}
        onClose={() => setLogoutBlocked(null)}
      >
        <DialogTitle>
          {checkingLogout ? 'Checking for pending work…' : 'Sign out blocked'}
        </DialogTitle>
        <DialogContent>
          {checkingLogout ? (
            <DialogContentText>
              Verifying that there is no unfinished work before signing out.
            </DialogContentText>
          ) : (
            <DialogContentText>
              You still have{' '}
              <b>{logoutBlocked?.pendingCallbacks ?? 0} pending callback{(logoutBlocked?.pendingCallbacks ?? 0) === 1 ? '' : 's'}</b>{' '}
              and{' '}
              <b>{logoutBlocked?.unfinishedRnr ?? 0} unfinished RNR lead{(logoutBlocked?.unfinishedRnr ?? 0) === 1 ? '' : 's'}</b>.
              Complete or reschedule them, then try signing out again. A supervisor can grant a
              one-time override from their Alerts page if approval is needed.
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutBlocked(null)} color="primary">
            Stay signed in
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
