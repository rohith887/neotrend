import { useEffect, useMemo, useState } from 'react';
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BarChartIcon from '@mui/icons-material/BarChart';
import DescriptionIcon from '@mui/icons-material/Description';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import GroupsIcon from '@mui/icons-material/Groups';
import EventNoteIcon from '@mui/icons-material/EventNote';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import RouteIcon from '@mui/icons-material/Route';
import LinkIcon from '@mui/icons-material/Link';
import PaymentIcon from '@mui/icons-material/Payment';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import SpeedIcon from '@mui/icons-material/Speed';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CallIcon from '@mui/icons-material/Call';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TimerIcon from '@mui/icons-material/Timer';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BugReportIcon from '@mui/icons-material/BugReport';
import NotificationsIcon from '@mui/icons-material/Notifications';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_ITEMS = [
  { id: 'dashboard',           label: 'Dashboard',             icon: <SpeedIcon sx={{ fontSize: 18 }} />,            to: '/dashboard' },
  { type: 'divider', label: 'Management', accordion: true, icon: <GroupsIcon sx={{ fontSize: 18 }} /> },
  { id: 'leads',               label: 'Leads',       icon: <FilterAltIcon sx={{ fontSize: 18 }} />,        to: '/leads' },
  { id: 'users',               label: 'Users',       icon: <PeopleAltIcon sx={{ fontSize: 18 }} />,        to: '/users' },
  { id: 'universities',        label: 'Universities', icon: <WorkspacePremiumIcon sx={{ fontSize: 18 }} />, to: '/universities' },
  { id: 'referrals',           label: 'Referrals',   icon: <LinkIcon sx={{ fontSize: 18 }} />,             to: '/referrals' },
  { type: 'divider', label: 'Monitoring', accordion: true, icon: <MonitorHeartIcon sx={{ fontSize: 18 }} /> },
  { id: 'alerts',              label: 'Alerts',       icon: <NotificationsIcon sx={{ fontSize: 18 }} />,    to: '/alerts' },
  { id: 'system-logs',         label: 'System Logs', icon: <BugReportIcon sx={{ fontSize: 18 }} />,        to: '/system-logs' },
  { type: 'divider', label: 'Reports & Analytics', accordion: true, icon: <AssessmentIcon sx={{ fontSize: 18 }} /> },
  { id: 'advisor-performance', label: 'Advisor Performance',   icon: <BarChartIcon sx={{ fontSize: 18 }} />,         to: '/reports/advisor-performance' },
  { id: 'activity-report',     label: 'Activity Report',       icon: <EventNoteIcon sx={{ fontSize: 18 }} />,        to: '/reports/activity-report' },
  { id: 'break-report',        label: 'Break Report',          icon: <TimerIcon sx={{ fontSize: 18 }} />,            to: '/reports/break-report' },
  { id: 'lead-conversion',     label: 'Lead Conversion',       icon: <TrendingUpIcon sx={{ fontSize: 18 }} />,       to: '/reports/lead-conversion' },
  { id: 'call-analytics',      label: 'Call Analytics',        icon: <CallIcon sx={{ fontSize: 18 }} />,             to: '/reports/call-analytics' },
  // { id: 'quality-scores',      label: 'Quality Report',        icon: <ShowChartIcon sx={{ fontSize: 18 }} />,        to: '/reports/quality-scores' },
  // { id: 'time-share',          label: 'Time Share',            icon: <AccessTimeIcon sx={{ fontSize: 18 }} />,       to: '/reports/time-share' },
];


const COUNSELOR_NAV = [
  { id: 'workspace',    label: 'Home',          icon: <SpeedIcon sx={{ fontSize: 18 }} />,               to: '/counselor/workspace' },
  { id: 'my-students',  label: 'My Students',   icon: <GroupsIcon sx={{ fontSize: 18 }} />,              to: '/counselor/students' },
  { type: 'divider', label: 'Student Journey', accordion: true, icon: <RouteIcon sx={{ fontSize: 18 }} /> },
  { id: 'applications', label: 'Applications',  icon: <AssignmentOutlinedIcon sx={{ fontSize: 18 }} />,  to: '/counselor/applications' },
  { id: 'registration', label: 'Registration',  icon: <PersonAddAlt1Icon sx={{ fontSize: 18 }} />,       to: '/counselor/registration' },
  { id: 'documents',    label: 'Documents',     icon: <DescriptionIcon sx={{ fontSize: 18 }} />,         to: '/counselor/documents' },
  { id: 'payments',     label: 'Payments',      icon: <PaymentIcon sx={{ fontSize: 18 }} />,             to: '/counselor/payments' },
  { id: 'visa-process', label: 'Visa Process',  icon: <FlightTakeoffIcon sx={{ fontSize: 18 }} />,       to: '/counselor/visa-process' },
  { type: 'divider', label: 'reports-group', accordion: false },
 // { id: 'reports',      label: 'Reports',       icon: <BarChartIcon sx={{ fontSize: 18 }} />,            to: '/counselor/reports' },
];

function buildSections(items) {
  const sections = [];
  let current = null;
  for (const item of items) {
    if (item.type === 'divider') {
      current = { key: item.label, label: item.label, accordion: !!item.accordion, icon: item.icon, items: [] };
      sections.push(current);
    } else if (current) {
      current.items.push(item);
    } else {
      sections.push({ key: item.id, accordion: false, items: [item] });
    }
  }
  return sections;
}

/* Persisted accordion open/closed state — scoped per role since Supervisor
   and Counselor never share a session. Best-effort only: a blocked/quota'd
   localStorage never breaks the sidebar, it just falls back to in-memory
   state for that session. */
const GROUPS_KEY = (role) => `tasa:sidebarGroups:${role || 'default'}`;

function readStoredGroups(role) {
  try {
    const raw = localStorage.getItem(GROUPS_KEY(role));
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function writeStoredGroups(role, set) {
  try {
    localStorage.setItem(GROUPS_KEY(role), JSON.stringify([...set]));
  } catch {
    // Quota/blocked storage — the toggle still works for this session.
  }
}

export function rolesForNav(role) {
  if (role === 'supervisor') return NAV_ITEMS.map((i) => ({ ...i, roles: ['supervisor'] }));
  if (role === 'counselor')  return COUNSELOR_NAV.map((i) => ({ ...i, roles: ['counselor'] }));
  return [];
}

/* ─── NavItem — top-level so React never remounts it across renders ── */
function NavItem({ item, view, expanded, child = false }) {
  const active = view === item.id;

  const inner = (
    <Box
      component={Link}
      to={item.to}
      aria-current={active ? 'page' : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: child ? 36 : 40,
        px: '10px',
        ml: child && expanded ? '14px' : 0,
        justifyContent: expanded ? 'flex-start' : 'center',
        width: expanded ? 'auto' : 36,
        mx: expanded ? 0 : 'auto',
        borderRadius: '6px',
        borderLeft: '2px solid',
        borderLeftColor: active && expanded ? 'primary.main' : 'transparent',
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        fontSize: '13px',
        lineHeight: 1,
        fontWeight: active ? 600 : 500,
        color: active ? 'primary.main' : 'text.primary',
        bgcolor: active ? 'primary.soft' : 'transparent',
        transition: 'background-color 130ms ease, color 130ms ease',
        '&:hover': {
          bgcolor: active ? 'primary.soft' : 'action.hover',
          color: active ? 'primary.main' : 'text.primary',
        },
        '&:hover svg': {
          color: active ? 'primary.main' : 'text.primary',
        },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          flexShrink: 0,
          color: active ? 'primary.main' : 'text.secondary',
          transition: 'color 130ms ease',
        }}
      >
        {item.icon}
      </Box>
      {expanded && (
        <Typography
          component="span"
          sx={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            fontSize: 'inherit',
            fontWeight: 'inherit',
            color: 'inherit',
            lineHeight: 'inherit',
          }}
        >
          {item.label}
        </Typography>
      )}
    </Box>
  );

  /* Show tooltip with label when sidebar is collapsed */
  if (!expanded) {
    return (
      <Tooltip title={item.label} placement="right" arrow>
        {inner}
      </Tooltip>
    );
  }
  return inner;
}

/* ─── SectionHeader — accordion group title ─────────────────────── */
function SectionHeader({ section, open, onToggle, expanded, active = false }) {
  const inner = (
    <ButtonBase
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`${section.key}-submenu`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 40,
        px: '10px',
        justifyContent: expanded ? 'flex-start' : 'center',
        width: expanded ? '100%' : 36,
        mx: expanded ? 0 : 'auto',
        borderRadius: '6px',
        borderLeft: '2px solid',
        borderLeftColor: active && expanded ? 'primary.main' : 'transparent',
        cursor: 'pointer',
        fontSize: '10.5px',
        lineHeight: 1,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: active ? 'primary.main' : 'text.secondary',
        bgcolor: 'transparent',
        transition: 'background-color 130ms ease, color 130ms ease',
        '&:hover': {
          bgcolor: 'action.hover',
          color: active ? 'primary.main' : 'text.primary',
        },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          flexShrink: 0,
          color: active ? 'primary.main' : open ? 'text.secondary' : 'text.disabled',
          transition: 'color 130ms ease',
        }}
      >
        {section.icon}
      </Box>
      {expanded && (
        <>
          <Box
            component="span"
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
              textAlign: 'left',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              letterSpacing: 'inherit',
              textTransform: 'inherit',
              color: 'inherit',
            }}
          >
            {section.label}
          </Box>
          <ExpandMoreIcon
            sx={{
              fontSize: 16,
              flexShrink: 0,
              color: 'text.disabled',
              transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
        </>
      )}
    </ButtonBase>
  );

  if (!expanded) {
    return (
      <Tooltip title={section.label} placement="right" arrow>
        {inner}
      </Tooltip>
    );
  }
  return inner;
}

/* ═══════════════════════════════════════════════════════════════════
   Sidebar
   collapsed prop: only respected for supervisor — counselor is always
   expanded since the workspace route hides the sidebar entirely instead.
   ═══════════════════════════════════════════════════════════════════ */
export default function Sidebar({ view, onNavigate, collapsed = false }) {
  const { role } = useAuth();
  const navItems = rolesForNav(role);

  const sections = useMemo(() => buildSections(navItems), [navItems]);

  /* Accordion open/closed state now persists per role (best-effort — falls
     back to closed if storage is unavailable) instead of always starting
     closed. Manual chevron clicks are still what drives it day to day; the
     effect below only ever ADDS the current route's section — it never
     closes a section the user opened. */
  const [openGroups, setOpenGroups] = useState(() => readStoredGroups(role));

  const toggleGroup = (key) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      writeStoredGroups(role, next);
      return next;
    });
  };

  // section key that contains the currently active nav id, if any.
  const activeSectionKey = useMemo(() => {
    const owner = sections.find((s) => s.accordion && s.items.some((i) => i.id === view));
    return owner ? owner.key : null;
  }, [sections, view]);

  // Auto-open the section containing the current route so navigating to a
  // page (via a link, a dashboard shortcut, back/forward, a fresh load...)
  // never leaves its parent group collapsed. Never closes anything.
  useEffect(() => {
    if (!activeSectionKey) return;
    setOpenGroups((prev) => {
      if (prev.has(activeSectionKey)) return prev;
      const next = new Set(prev).add(activeSectionKey);
      writeStoredGroups(role, next);
      return next;
    });
  }, [activeSectionKey, role]);

  if (navItems.length === 0) return null;

  /* All roles respect the collapse toggle */
  const expanded = !collapsed;

  return (
    <Box
      component="aside"
      aria-label="Primary navigation"
      sx={{
        width: expanded ? 250 : 56,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width 180ms cubic-bezier(0.4,0,0.2,1)',
        userSelect: 'none',
        zIndex: 20,
      }}
    >
      <Box
        component="nav"
        role="navigation"
        sx={{
          flex: 1,
          py: '8px',
          px: '6px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {sections.map((section) => {
          /* Standalone top-level items (e.g. Dashboard) */
          if (!section.accordion) {
            return (
              <Box key={section.key} sx={{ mb: '4px' }}>
                {section.items.map((item) => (
                  <NavItem key={item.id} item={item} view={view} expanded={expanded} />
                ))}
              </Box>
            );
          }

          /* Accordion section */
          const open = openGroups.has(section.key);
          return (
            <Box key={section.key} sx={{ mb: '4px' }}>
              <SectionHeader
                section={section}
                open={open}
                onToggle={() => toggleGroup(section.key)}
                expanded={expanded}
                active={section.key === activeSectionKey}
              />

              {/* Items are always rendered in the DOM; CSS grid animates open/close */}
              <Box
                id={`${section.key}-submenu`}
                role="group"
                sx={{
                  display: 'grid',
                  gridTemplateRows: open && expanded ? '1fr' : '0fr',
                  transition: 'grid-template-rows 200ms cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                <Box
                  sx={{
                    overflow: 'hidden',
                    minHeight: 0,
                    opacity: open && expanded ? 1 : 0,
                    transition: 'opacity 140ms ease',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1px',
                      pt: '2px',
                      pb: '3px',
                      pl: '4px',
                    }}
                  >
                    {section.items.map((item) => (
                      <NavItem key={item.id} item={item} view={view} expanded={expanded} child />
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
