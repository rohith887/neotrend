/**
 * UserManagement — redesigned to match LeadManagement visual baseline.
 * Columns control added; row selection + bulk actions removed.
 * All existing API calls, handlers, dialogs, and profile modal unchanged.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  DialogActions,
  Divider,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import GroupsIcon from '@mui/icons-material/Groups';
import KeyIcon from '@mui/icons-material/Key';
import LaptopIcon from '@mui/icons-material/Laptop';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonIcon from '@mui/icons-material/Person';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import TimelineIcon from '@mui/icons-material/Timeline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { useToast } from '../context/ToastContext.jsx';
import { useCachedFetch } from '../context/CacheContext.jsx';
import {
  fetchSupervisorUsers,
  createSupervisorUser,
  updateSupervisorUser,
  provisionSupervisorUserSip,
  setSupervisorUserStatus,
  resetSupervisorUserPassword,
  deleteSupervisorUser,
  fetchSupervisorQueues,
  fetchSupervisorReports,
} from '../api/supervisor.js';
import { fetchSystemLogs } from '../api/systemLogs.js';
import {
  AppDialog,
  AppIconButton,
  AppTabs,
  DataTable,
  FilterSelect,
  PrimaryButton,
  SearchField,
  SecondaryButton,
  StatusChip,
} from '../ui/mui/index.js';
import CrmListShell from './CrmListShell.jsx';

/* ═══════════════════════════════════════════════════════════════════
   Constants & helpers
   ═══════════════════════════════════════════════════════════════════ */
const PAGE_SIZE = 20;

const roleChipColor = (r) =>
  r === 'Supervisor' ? 'secondary' : r === 'Agent' ? 'primary' : 'default';

const ACTIVITY_TITLES = {
  LEAD_FETCHED: 'Lead Fetched',
  DISPOSITION_SAVED: 'Disposition Saved',
  BREAK_IN: 'Break In',
  BREAK_OUT: 'Break Out',
};
const ACTIVITY_TONES  = { LEAD_FETCHED: 'violet', DISPOSITION_SAVED: 'primary', BREAK_IN: 'warning', BREAK_OUT: 'info' };
const ACTIVITY_ICONS  = { LEAD_FETCHED: PersonAddAlt1Icon, DISPOSITION_SAVED: ChecklistIcon, BREAK_IN: LocalCafeIcon, BREAK_OUT: LocalCafeIcon };
const ACTIVITY_TONE_COLORS = { success: 'success', warning: 'warning', danger: 'error', info: 'info', violet: 'secondary', primary: 'primary', neutral: null };

const PERMISSION_MODULES = [
  ['lead:read-all', 'Lead Management'], ['lead:fetch', 'Lead Management'], ['lead:create', 'Lead Management'],
  ['user:manage', 'User Management'],  ['user:read', 'User Management'],
  ['report:read', 'Reports'],          ['report:export', 'Reports'],
  ['activity:read', 'QA & Scoring'],
];
const permissionModules = (perms = []) => {
  const mods = PERMISSION_MODULES.filter(([p]) => perms.includes(p)).map(([, m]) => m);
  return [...new Set(mods)].length ? [...new Set(mods)] : ['—'];
};

const buildDetails = (u, ctx = {}) => {
  const activities = (ctx.activities || []).filter((a) => a.agent === u.name);
  const breaks     = (ctx.breaks     || []).filter((b) => b.agent === u.name);
  const todayP     = ctx.periodsByUser?.[u.id]?.today;
  const isFieldRole = ['agent', 'counselor'].includes(String(u.role || '').toLowerCase());
  return {
    perf: {
      calls: u.callsToday,
      conversions: u.conversions,
      avgDuration: u.avgDuration,
      conversionRate: u.conversionRate,
      connectedToday: isFieldRole && todayP && todayP.connected != null ? todayP.connected : null,
      qualifiedToday: isFieldRole && todayP && todayP.qualified != null ? todayP.qualified : null,
      isFieldRole,
    },
    activities, breaks,
    phone: u.mobile,
    joinDate: u.createdAt ? new Date(u.createdAt) : new Date(),
    permissions: {
      modules:   permissionModules(u.permissions),
      queues:    u.queue && u.queue !== '—' ? [u.queue] : ['Unassigned'],
      campaigns: [],
    },
    activity: activities.map((a) => ({
      title: ACTIVITY_TITLES[a.event] || a.event,
      detail: a.detail,
      tone: ACTIVITY_TONES[a.event] || 'neutral',
      icon: ACTIVITY_ICONS[a.event] || TimelineIcon,
      time: a.time,
    })),
  };
};

const USER_TABS = [
  { id: 'overview',    label: 'Overview',      icon: <PersonIcon sx={{ fontSize: 15 }} />,      iconPosition: 'start' },
  { id: 'activity',    label: 'Activity',      icon: <AccessTimeIcon sx={{ fontSize: 15 }} />,  iconPosition: 'start' },
  { id: 'performance', label: 'Performance',   icon: <TrendingUpIcon sx={{ fontSize: 15 }} />,  iconPosition: 'start' },
  { id: 'logins',      label: 'Login History', icon: <LaptopIcon sx={{ fontSize: 15 }} />,      iconPosition: 'start' },
  { id: 'permissions', label: 'Permissions',   icon: <SecurityIcon sx={{ fontSize: 15 }} />,    iconPosition: 'start' },
];

const initialsOf = (name = '') => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

/* ── ALL_COLUMNS — defines every column; visibility toggled by user ── */
const ALL_COLUMNS_DEF = [
  { key: 'name',       label: 'Name',        defaultVisible: true  },
  { key: 'email',      label: 'Email',       defaultVisible: true  },
  { key: 'role',       label: 'Role',        defaultVisible: true  },
  { key: 'sipExtension', label: 'Extension',  defaultVisible: true  },
  { key: 'team',       label: 'Team / Queue', defaultVisible: true  },
  { key: 'status',     label: 'Status',      defaultVisible: true  },
  { key: 'callsToday', label: 'Calls today', defaultVisible: true  },
  { key: 'lastLogin',  label: 'Last login',  defaultVisible: true  },
];

/* ═══════════════════════════════════════════════════════════════════
   MetaCell — compact label + value for profile modal
   ═══════════════════════════════════════════════════════════════════ */
function MetaCell({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled', mb: 0.375 }}>
        {label}
      </Box>
      <Box title={value || '—'} sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value || '—'}
      </Box>
    </Box>
  );
}

// Single bordered panel divided by hairlines — replaces the per-item card
// grid so the profile reads as one cohesive surface instead of many boxes.
function DetailPanel({ children }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.paper' }}>
      {children}
    </Box>
  );
}

function FieldLabel({ children }) {
  return (
    <Box sx={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled', mb: 0.5 }}>
      {children}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Per-row kebab menu
   ═══════════════════════════════════════════════════════════════════ */
function UserRowMenu({ user, onChangeRole, onAssignTeam, onMoveQueue, onProvisionSip, onActivate, onSuspend, onResetPassword, onDelete }) {
  const [anchor, setAnchor] = useState(null);
  const close = (fn) => () => { setAnchor(null); fn?.(); };
  return (
    <>
      <AppIconButton title="Row actions" ariaLabel={`Actions for ${user.name}`}
        onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }} size="small">
        <MoreVertIcon sx={{ fontSize: 17 }} />
      </AppIconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 185 } } }}>
        <MenuItem dense onClick={close(() => onChangeRole(user))}><PersonIcon sx={{ fontSize: 15, mr: 1.5, color: 'text.secondary' }} />Change role</MenuItem>
        <MenuItem dense onClick={close(() => onAssignTeam(user))}><GroupsIcon sx={{ fontSize: 15, mr: 1.5, color: 'text.secondary' }} />Assign team</MenuItem>
        <MenuItem dense onClick={close(() => onMoveQueue(user))}><AccountTreeIcon sx={{ fontSize: 15, mr: 1.5, color: 'text.secondary' }} />Move queue</MenuItem>
        {(user.sipProvisionStatus !== 'provisioned' || !user.sipExtension) && (
          <MenuItem dense onClick={close(() => onProvisionSip(user))}>
            <KeyIcon sx={{ fontSize: 15, mr: 1.5, color: 'primary.main' }} />
            {user.sipProvisionStatus === 'failed' ? 'Retry SIP' : 'Provision SIP'}
          </MenuItem>
        )}
        <Divider />
        <MenuItem dense onClick={close(() => onActivate(user))}><CheckCircleIcon sx={{ fontSize: 15, mr: 1.5, color: 'success.main' }} />Activate</MenuItem>
        <MenuItem dense onClick={close(() => onSuspend(user))}><PersonOffIcon sx={{ fontSize: 15, mr: 1.5, color: 'warning.main' }} />Suspend</MenuItem>
        <MenuItem dense onClick={close(() => onResetPassword(user))}><KeyIcon sx={{ fontSize: 15, mr: 1.5, color: 'text.secondary' }} />Reset password</MenuItem>
        <Divider />
        <MenuItem dense onClick={close(() => onDelete(user))} sx={{ color: 'error.main' }}>
          <DeleteIcon sx={{ fontSize: 15, mr: 1.5 }} />Remove user
        </MenuItem>
      </Menu>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Columns control popover
   ═══════════════════════════════════════════════════════════════════ */
function ColumnsControl({ visibleKeys, allDefs, onChange }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <Tooltip title="Show / hide columns">
        <span>
          <SecondaryButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ minWidth: 0, px: 1 }}>
            <ViewColumnIcon sx={{ fontSize: 15 }} />
          </SecondaryButton>
        </span>
      </Tooltip>
      <Popover
        open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 0.5, minWidth: 200, p: 1.5, border: 1, borderColor: 'divider', boxShadow: 2 } } }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled', mb: 1 }}>
          Columns
        </Typography>
        {allDefs.map((col) => (
          <Box key={col.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.25 }}>
            <Typography sx={{ fontSize: 13, color: 'text.primary' }}>{col.label}</Typography>
            <Switch
              size="small"
              checked={visibleKeys.includes(col.key)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...visibleKeys, col.key]
                  : visibleKeys.filter((k) => k !== col.key);
                onChange(next);
              }}
              disabled={visibleKeys.length === 1 && visibleKeys.includes(col.key)}
            />
          </Box>
        ))}
      </Popover>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   User Profile Modal — premium CRM profile presentation.
   Functionality, tabs, data, actions, and permissions are unchanged; only
   the visual presentation is refined (header hierarchy, compact tabs,
   divider-based information grids, grouped footer actions).
   ═══════════════════════════════════════════════════════════════════ */
function UserProfileModal({ user, detail, detailLoading, logins = [], loginsLoading = false, onClose, onEdit, onResetPassword, onSuspend }) {
  const [tab, setTab] = useState('overview');
  if (!user || !detail) return null;

  const perfItems = [
    { label: 'Calls Today',     value: detail.perf?.calls          ?? null },
    { label: 'Total Calls',     value: user.totalCalls             ?? null },
    { label: 'Leads Assigned',  value: user.leadsAssigned          ?? null },
    { label: 'Connected Calls', value: detail.perf?.connectedToday ?? null },
    { label: 'Qualified Leads', value: detail.perf?.qualifiedToday ?? null },
    { label: 'Conversion Rate', value: detail.perf?.conversionRate ?? null },
  ].filter((m) => m.value != null && m.value !== '—');
  const overviewRows = [
    { label: 'Assigned Team', value: user.team },
    { label: 'Queue',         value: user.queue === '—' ? 'Unassigned' : user.queue },
    { label: 'Role',          value: user.role },
    { label: 'SIP Extension', value: user.sipExtension || '—' },
    { label: 'Email',         value: user.email },
    { label: 'Phone',         value: detail.phone ?? '—' },
    { label: 'Status',        value: user.status },
    { label: 'Last Login',    value: user.lastLogin },
    { label: 'Joining Date',  value: detail.joinDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) },
  ];

  return (
    <AppDialog open onClose={onClose} maxWidth="md"
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, py: '2px' }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', bgcolor: 'primary.soft', color: 'primary.main', border: '1px solid', borderColor: 'primary.border' }}>
            {initialsOf(user.name)}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
              <Typography component="span" sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </Typography>
              <Chip size="small" variant="outlined" color={roleChipColor(user.role)} label={user.role} sx={{ height: 20, '& .MuiChip-label': { fontSize: 11, fontWeight: 600, px: 0.875 } }} />
            </Box>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.3, mt: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.email}
            </Typography>
          </Box>
          <StatusChip status={user.status} size="small" sx={{ flexShrink: 0 }} />
        </Box>
      }
      footer={
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover', px: 2.5, py: 1.5 }}>
          <DialogActions sx={{ p: 0, gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <SecondaryButton size="small" startIcon={<EditIcon sx={{ fontSize: 13 }} />} onClick={onEdit}>Edit</SecondaryButton>
            <SecondaryButton size="small" startIcon={<KeyIcon sx={{ fontSize: 13 }} />} onClick={onResetPassword}>Reset Password</SecondaryButton>
            {user.status !== 'Suspended' && (
              <Button variant="outlined" color="error" size="small" startIcon={<PersonOffIcon sx={{ fontSize: 13 }} />} onClick={onSuspend}>Suspend</Button>
            )}
            <Box sx={{ flex: 1 }} />
            <SecondaryButton size="small" startIcon={<CloseIcon sx={{ fontSize: 13 }} />} onClick={onClose}>Close</SecondaryButton>
          </DialogActions>
        </Box>
      }
    >
      <AppTabs
        tabs={USER_TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="User details"
        sx={{
          minHeight: 40,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '& .MuiTabs-flexContainer': { gap: 0.5 },
          '& .MuiTab-root': { minHeight: 40, py: 0, px: 1.5, fontSize: 12.5, fontWeight: 600, textTransform: 'none', letterSpacing: '-0.01em' },
          '& .MuiTabs-scrollButtons': { width: 28 },
        }}
        TabIndicatorProps={{ sx: { height: 2.5, borderRadius: '2px 2px 0 0' } }}
      >
        {tab === 'overview' && (
          <DetailPanel>
            <Box sx={{ display: { xs: 'block', sm: 'grid' }, gridTemplateColumns: { sm: '1fr 1fr' } }}>
              <Box sx={{ borderRight: { sm: '1px solid' }, borderBottom: { xs: '1px solid', sm: 'none' }, borderColor: 'divider' }}>
                {overviewRows.slice(0, 4).map((r, i) => (
                  <Box key={r.label} sx={{ px: 1.5, py: 1.25, borderBottom: i === 3 ? 'none' : '1px solid', borderColor: 'divider' }}>
                    <MetaCell label={r.label} value={r.value} />
                  </Box>
                ))}
              </Box>
              <Box>
                {overviewRows.slice(4).map((r, i) => (
                  <Box key={r.label} sx={{ px: 1.5, py: 1.25, borderBottom: i === 3 ? 'none' : '1px solid', borderColor: 'divider' }}>
                    <MetaCell label={r.label} value={r.value} />
                  </Box>
                ))}
              </Box>
            </Box>
          </DetailPanel>
        )}
        {tab === 'activity' && (
          detailLoading
            ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 5, justifyContent: 'center', color: 'text.secondary', fontSize: 13 }}><CircularProgress size={16} />Loading…</Box>
            : detail.activity.length === 0
              ? <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 5, fontSize: 13 }}>No activity recorded.</Box>
              : <DetailPanel>
                  {detail.activity.map((a, i) => {
                    const isLast = i === detail.activity.length - 1;
                    const color = ACTIVITY_TONE_COLORS[a.tone || 'neutral'];
                    const Icon = a.icon || TimelineIcon;
                    return (
                      <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '58px 1fr', gap: 1, alignItems: 'flex-start', px: 1.5, py: 0.875, borderBottom: isLast ? 'none' : '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.disabled', fontVariantNumeric: 'tabular-nums', pt: '1px', whiteSpace: 'nowrap' }}>{a.time}</Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', minWidth: 0 }}>
                          <Box sx={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', bgcolor: color ? `${color}.soft` : 'action.hover', color: color ? `${color}.main` : 'text.disabled', border: 1, borderColor: color ? `${color}.border` : 'divider' }} aria-hidden="true">
                            <Icon sx={{ fontSize: 12 }} />
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: 'text.primary', lineHeight: 1.35 }}>{a.title}</Typography>
                            {a.detail && a.detail !== '—' && (
                              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5, mt: 0.25, wordBreak: 'break-word' }}>{a.detail}</Typography>
                            )}
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                </DetailPanel>
        )}
        {tab === 'performance' && (
          <DetailPanel>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.625, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled' }}>Metric</Box>
              <Box sx={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled' }}>Value</Box>
            </Box>
            {perfItems.map((m, i) => (
              <Box key={m.label} sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, px: 1.5, py: 1, borderBottom: i === perfItems.length - 1 ? 'none' : '1px solid', borderColor: 'divider' }}>
                <Box sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</Box>
                <Box sx={{ fontSize: 14.5, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{m.value}</Box>
              </Box>
            ))}
          </DetailPanel>
        )}
        {tab === 'logins' && (
          loginsLoading
            ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 5, justifyContent: 'center', color: 'text.secondary', fontSize: 13 }}><CircularProgress size={16} />Loading…</Box>
            : logins.length === 0
              ? <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 5, fontSize: 13 }}>No login history recorded.</Box>
              : <DetailPanel>
                  {logins.map((l, i) => {
                    const failed = l.action === 'LOGIN_FAILED';
                    return (
                      <Box key={l.logId || i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', px: 1.5, py: 1, borderBottom: i === logins.length - 1 ? 'none' : '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ width: 118, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: 'text.disabled', fontVariantNumeric: 'tabular-nums', pt: '1px', lineHeight: 1.35 }}>
                          {new Date(l.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <Chip size="small" label={failed ? 'Failed' : 'Success'} sx={{ height: 19, flexShrink: 0, bgcolor: failed ? 'error.soft' : 'success.soft', color: failed ? 'error.main' : 'success.main', '& .MuiChip-label': { fontSize: 10.5, fontWeight: 700, px: 0.75, textTransform: 'uppercase', letterSpacing: '0.04em' } }} />
                            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.username || 'Unknown account'}</Typography>
                          </Box>
                          {l.message && (
                            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45, mt: 0.375, wordBreak: 'break-word' }}>{l.message}</Typography>
                          )}
                          {l.ipAddress ? (
                            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', fontVariantNumeric: 'tabular-nums', mt: 0.25 }}>IP {l.ipAddress}</Typography>
                          ) : null}
                        </Box>
                      </Box>
                    );
                  })}
                </DetailPanel>
        )}
        {tab === 'permissions' && (
          <DetailPanel>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid', borderRight: { sm: '1px solid' }, borderColor: 'divider' }}>
                <FieldLabel>Role</FieldLabel>
                <Box sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>{user.role}</Box>
              </Box>
              <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <FieldLabel>Access Status</FieldLabel>
                <StatusChip status={user.status === 'Active' ? 'Access Granted' : 'Access Revoked'} tone={user.status === 'Active' ? 'success' : 'neutral'} size="small" sx={{ mt: '2px' }} />
              </Box>
            </Box>
            <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
              <FieldLabel>Allowed Modules</FieldLabel>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{detail.permissions.modules.map((m) => <Chip key={m} size="small" label={m} />)}</Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <Box sx={{ px: 1.5, py: 1.25, borderRight: { sm: '1px solid' }, borderColor: 'divider' }}>
                <FieldLabel>Queues</FieldLabel>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{detail.permissions.queues.map((q) => <Chip key={q} size="small" variant="outlined" label={q} />)}</Box>
              </Box>
              <Box sx={{ px: 1.5, py: 1.25 }}>
                <FieldLabel>Campaigns</FieldLabel>
                {detail.permissions.campaigns.length === 0
                  ? <Typography variant="body2" color="text.disabled" sx={{ fontSize: 12.5 }}>None recorded</Typography>
                  : <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{detail.permissions.campaigns.map((c) => <Chip key={c} size="small" label={c} />)}</Box>}
              </Box>
            </Box>
          </DetailPanel>
        )}
      </AppTabs>
    </AppDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main — UserManagement
   ═══════════════════════════════════════════════════════════════════ */
export default function UserManagement() {
  const { push } = useToast();

  /* ── Dialog / profile state ─────────────────────────────────── */
  const [dialog,      setDialog]      = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    role: 'agent',
  });
  const [provisioningSip, setProvisioningSip] = useState({});

  /* ── Filter + search state ───────────────────────────────────── */
  const [search,  setSearch]  = useState('');
  const [filters, setFilters] = useState({ team: 'all', role: 'all', status: 'all' });

  /* ── Columns state ──────────────────────────────────────────── */
  const [visibleCols,  setVisibleCols]  = useState(() => ALL_COLUMNS_DEF.filter((c) => c.defaultVisible).map((c) => c.key));

  /* ── Data fetch ─────────────────────────────────────────────── */
  const fetcher = useCallback(async () => {
    const [users, qs] = await Promise.all([fetchSupervisorUsers(), fetchSupervisorQueues()]);
    return { users, queues: qs };
  }, []);
  const { data, loading, error, refetch } = useCachedFetch('supervisor-user-directory', fetcher, { staleTime: 60_000 });
  const { data: reportsData, loading: reportsLoading } = useCachedFetch('supervisor-reports-All', fetchSupervisorReports, { enabled: !!profileUser, staleTime: 60_000 });
  const { data: loginsData, loading: loginsLoading } = useCachedFetch(
    profileUser ? `supervisor-logins-${profileUser.id}` : null,
    () => fetchSystemLogs({ module: 'auth', userId: profileUser.id, limit: 50 }),
    { enabled: !!profileUser, staleTime: 60_000 }
  );

  const rows   = data?.users  ?? [];
  const queues = data?.queues ?? [];
  const detailData = useMemo(() => ({
    activities: reportsData?.activityReport ?? [],
    breaks: reportsData?.breakReport ?? [],
    periodsByUser: reportsData?.periodsByUser ?? {},
  }), [reportsData]);
  const loginHistory = useMemo(() => (loginsData?.data || []).filter((l) => l?.action === 'LOGIN_SUCCESS' || l?.action === 'LOGIN_FAILED'), [loginsData]);

  const filterOptions = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((r) => r[key]).filter((v) => v && v !== '—'))];
    return { team: uniq('team'), role: uniq('role'), status: uniq('status') };
  }, [rows]);

  /* ── Filtered rows ──────────────────────────────────────────── */
  const visible = useMemo(() => {
    let list = rows;
    if (filters.team   !== 'all') list = list.filter((u) => u.team   === filters.team);
    if (filters.role   !== 'all') list = list.filter((u) => u.role   === filters.role);
    if (filters.status !== 'all') list = list.filter((u) => u.status === filters.status);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((u) => `${u.name} ${u.email} ${u.role} ${u.team} ${u.queue}`.toLowerCase().includes(q));
    return list;
  }, [rows, filters, search]);

  const setFilter    = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const closeDialog  = () => setDialog(null);
  const dialogLabel  = () => (dialog?.user ? dialog.user.name : `${dialog?.ids?.length ?? 0} users`);

  const details = useMemo(() => {
    const map = {};
    rows.forEach((u) => { map[u.id] = buildDetails(u, detailData); });
    return map;
  }, [rows, detailData]);

  /* ── Action handlers ────────────────────────────────────────── */
  const errorMessage = (err, fallback) => err?.response?.data?.message || fallback;
  const updateCreateForm = (key) => (event) => setCreateForm((form) => ({ ...form, [key]: event.target.value }));
  const openCreateDialog = () => {
    setCreateForm({ firstName: '', lastName: '', email: '', mobile: '', role: 'agent' });
    setDialog({ type: 'invite' });
  };

  const inviteUser = async () => {
    if (!createForm.firstName.trim() || !createForm.email.trim()) {
      push('First name and email are required', 'warning');
      return;
    }
    setSaving(true);
    try {
      const created = await createSupervisorUser({
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        email: createForm.email.trim(),
        mobile: createForm.mobile.trim(),
        role: createForm.role,
      });
      await refetch();
      setDialog(null);
      const extension = created?.sipExtension ? ` — Extension: ${created.sipExtension}` : '';
      push(`${createForm.email.trim()} created${extension || ' with SIP provisioning'}`, 'success');
    } catch (err) {
      push(errorMessage(err, 'Could not create the user'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const provisionSip = useCallback(async (user) => {
    if (provisioningSip[user.id]) return;
    setProvisioningSip((current) => ({ ...current, [user.id]: true }));
    try {
      const provisioned = await provisionSupervisorUserSip(user.id);
      await refetch();
      const extension = provisioned?.sipExtension ? ` — Extension: ${provisioned.sipExtension}` : '';
      push(`SIP provisioned for ${user.name}${extension}`, 'success');
    } catch (err) {
      try {
        await refetch();
      } catch {}
      push(errorMessage(err, 'SIP provisioning failed'), 'error');
    } finally {
      setProvisioningSip((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
    }
  }, [provisioningSip, refetch, push]);

  const changeRole = async (ids, role) => {
    if (saving) return;
    const label = dialogLabel();
    setSaving(true);
    try {
      await Promise.all(ids.map((id) => updateSupervisorUser(id, { role })));
      await refetch();
      setDialog(null);
      push(`${label} is now ${role}`, 'success');
    } catch (err) {
      push(errorMessage(err, 'Could not change the role'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyMove = (type) => {
    const val = document.getElementById(type === 'team' ? 'um-move-team' : 'um-move-queue')?.value;
    if (!val || !dialog) return;
    refetch();
    setDialog(null);
    push(type === 'team' ? `${dialogLabel()} assigned to ${val}` : `${dialogLabel()} moved to ${val}`, 'success');
  };

  const setStatus = async (ids, status) => {
    if (saving) return;
    const label = ids.length === 1 ? rows.find((u) => u.id === ids[0])?.name : `${ids.length} users`;
    setSaving(true);
    try {
      await Promise.all(ids.map((id) => setSupervisorUserStatus(id, status === 'Active' ? 'active' : 'inactive')));
      await refetch();
      setProfileUser(null);
      push(`${label} ${status === 'Active' ? 'activated' : 'suspended'}`, status === 'Active' ? 'success' : 'warning');
    } catch (err) {
      push(errorMessage(err, 'Could not update the user status'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (ids) => {
    if (saving || ids.length !== 1) return;
    const password = window.prompt('Enter the new CRM password (minimum 8 characters)');
    if (password == null) return;
    if (password.length < 8) {
      push('Password must contain at least 8 characters', 'warning');
      return;
    }
    setSaving(true);
    try {
      await resetSupervisorUserPassword(ids[0], password);
      push(`Password reset for ${rows.find((u) => u.id === ids[0])?.email || 'user'}`, 'success');
    } catch (err) {
      push(errorMessage(err, 'Could not reset the password'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteUsers = async (ids) => {
    if (saving) return;
    const label = ids.length === 1 ? rows.find((u) => u.id === ids[0])?.name : `${ids.length} users`;
    setSaving(true);
    try {
      await Promise.all(ids.map((id) => deleteSupervisorUser(id)));
      await refetch();
      setProfileUser(null);
      setDialog(null);
      push(`${label} removed and SIP extension deleted`, 'success');
    } catch (err) {
      push(errorMessage(err, 'Could not remove the user'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── CSV export ─────────────────────────────────────────────── */
  const exportRows = (targetRows) => {
    const cols = ['name','email','role','sipExtension','team','queue','status','callsToday','lastLogin'];
    const hdr  = 'Name,Email,Role,Extension,Team,Queue,Status,Calls Today,Last Login';
    const body = targetRows.map((r) => cols.map((k) => `"${String(r[k] ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([`${hdr}\r\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'user-directory.csv' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  /* ── Column definitions (filtered by visibility) ────────────── */
  const allColDefs = useMemo(() => [
    {
      key: 'name', label: 'Name', sortable: true, width: '18%',
      render: (v, row) => (
        <Typography component="span" onClick={() => setProfileUser(row)}
          sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', cursor: 'pointer', lineHeight: 1.3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', '&:hover': { textDecoration: 'underline' } }}>
          {row.name}
        </Typography>
      ),
    },
    {
      key: 'email', label: 'Email', sortable: true, width: '22%',
      render: (_v, row) => (
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.email}</Typography>
      ),
    },
    {
      key: 'role', label: 'Role', sortable: true, width: '10%',
      render: (v) => <Chip size="small" color={roleChipColor(v)} label={v} sx={{ height: 22, '& .MuiChip-label': { fontSize: 11, px: 0.875 } }} />,
    },
    {
      key: 'sipExtension', label: 'Extension', sortable: true, width: '9%',
      render: (v, row) => {
        const status = String(row.sipProvisionStatus || '').toLowerCase();
        if (provisioningSip[row.id] || status === 'provisioning') {
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <CircularProgress size={12} thickness={5} />
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Provisioning...</Typography>
            </Box>
          );
        }
        if (status === 'provisioned' && v) {
          return <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary' }}>Extension: {v}</Typography>;
        }
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
            <Typography sx={{ fontSize: 11.5, color: status === 'failed' ? 'warning.main' : 'text.disabled' }}>
              {status === 'failed' ? 'Failed' : 'Not Provisioned'}
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={(event) => { event.stopPropagation(); provisionSip(row); }}
              disabled={Boolean(provisioningSip[row.id])}
              sx={{ minWidth: 0, p: 0, fontSize: 11.5, lineHeight: 1.2 }}
            >
              {status === 'failed' ? 'Retry' : 'Provision SIP'}
            </Button>
          </Box>
        );
      },
    },
    {
      key: 'team', label: 'Team / Queue', sortable: true, width: '22%',
      render: (_v, row) => {
        const q = row.queue && row.queue !== '—' ? row.queue : null;
        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: row.team && row.team !== '—' ? 'text.primary' : 'text.disabled' }}>
              {row.team && row.team !== '—' ? row.team : 'Unassigned'}
            </Typography>
            {q && q !== row.team && <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q}</Typography>}
          </Box>
        );
      },
    },
    {
      key: 'status', label: 'Status', sortable: true, width: '12%',
      render: (v) => <StatusChip status={v} size="small" />,
    },
    {
      key: 'callsToday', label: 'Calls today', sortable: true, width: '10%', align: 'right',
      render: (v) => <Box sx={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, textAlign: 'right', color: v > 0 ? 'text.primary' : 'text.disabled' }}>{v ?? 0}</Box>,
    },
    {
      key: 'lastLogin', label: 'Last login', sortable: true, width: '14%',
      render: (v) => <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{v || '—'}</Typography>,
    },
  ], [provisioningSip, provisionSip]);

  const columns = useMemo(() => allColDefs.filter((c) => visibleCols.includes(c.key)), [allColDefs, visibleCols]);

  /* ── Export menu state ──────────────────────────────────────── */
  const [exportMenu, setExportMenu] = useState(null);

  /* ── Toolbar ────────────────────────────────────────────────── */
  const toolbar = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.875, flexWrap: 'wrap', py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <SearchField
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, email, role…"
        sx={{ minWidth: 220, flex: '1 1 220px', maxWidth: 320 }}
      />
      <Chip size="small" label={`${visible.length} user${visible.length !== 1 ? 's' : ''}`}
        sx={{ height: 22, fontSize: 11, fontWeight: 600, bgcolor: 'action.hover', '& .MuiChip-label': { px: 0.875 } }} />

      <FilterSelect label="Team"   value={filters.team}   onChange={setFilter('team')}
        options={[{ value: 'all', label: 'All Teams' },    ...filterOptions.team.map((t) => ({ value: t, label: t }))]}  sx={{ minWidth: 120 }} />
      <FilterSelect label="Role"   value={filters.role}   onChange={setFilter('role')}
        options={[{ value: 'all', label: 'All Roles' },    ...filterOptions.role.map((r) => ({ value: r, label: r }))]}  sx={{ minWidth: 110 }} />
      <FilterSelect label="Status" value={filters.status} onChange={setFilter('status')}
        options={[{ value: 'all', label: 'All Statuses' }, ...filterOptions.status.map((s) => ({ value: s, label: s }))]} sx={{ minWidth: 120 }} />

      <Box sx={{ flex: 1 }} />

      <Tooltip title="Refresh"><span>
        <SecondaryButton size="small" onClick={() => refetch()} sx={{ minWidth: 0, px: 1 }}>
          <RefreshIcon sx={{ fontSize: 15 }} />
        </SecondaryButton>
      </span></Tooltip>

      <ColumnsControl visibleKeys={visibleCols} allDefs={ALL_COLUMNS_DEF} onChange={setVisibleCols} />

      <SecondaryButton size="small" startIcon={<FileDownloadIcon sx={{ fontSize: 14 }} />} onClick={(e) => setExportMenu(e.currentTarget)}>
        Export
      </SecondaryButton>
      <Menu anchorEl={exportMenu} open={Boolean(exportMenu)} onClose={() => setExportMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem dense onClick={() => { setExportMenu(null); exportRows(visible); }}>
          Export all ({visible.length})
        </MenuItem>
      </Menu>

      <PrimaryButton size="small" startIcon={<PersonAddIcon sx={{ fontSize: 14 }} />} onClick={openCreateDialog} disabled={saving}>
        Create User
      </PrimaryButton>
    </Box>
  );

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
      <CrmListShell
        title="User Management"
        subtitle="Manage roles, queues, and account access for your team"
        error={error}
        onRetry={() => refetch()}
      >
        <DataTable
          columns={columns}
          data={visible}
          keyField="id"
          loading={loading}
          dense
          initialPageSize={PAGE_SIZE}
          pageSizeOptions={[PAGE_SIZE, 25, 50]}
          initialSortKey="name"
          initialSortDir="asc"
          emptyTitle="No users found"
          emptyText="No users match the current filters."
          toolbar={toolbar}
          renderActions={(row) => (
            <UserRowMenu
              user={row}
              onChangeRole={(r) => setDialog({ type: 'role',  user: r, ids: [r.id] })}
              onAssignTeam={(r) => setDialog({ type: 'team',  user: r, ids: [r.id] })}
              onMoveQueue={(r)  => setDialog({ type: 'queue', user: r, ids: [r.id] })}
              onProvisionSip={provisionSip}
              onActivate={(r)   => setStatus([r.id], 'Active')}
              onSuspend={(r)    => setStatus([r.id], 'Suspended')}
              onResetPassword={(r) => resetPassword([r.id])}
              onDelete={(r)     => setDialog({ type: 'delete', user: r, ids: [r.id] })}
            />
          )}
          rootSx={{ flex: 1, minHeight: 0 }}
          containerSx={{ maxHeight: 'calc(100vh - 220px)' }}
        />
      </CrmListShell>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      <AppDialog open={dialog?.type === 'invite'} onClose={closeDialog}
        title="Create User" subtitle="Create CRM access and automatically assign a PBX SIP extension." maxWidth="xs"
        footer={<DialogActions><SecondaryButton size="small" onClick={closeDialog} disabled={saving}>Cancel</SecondaryButton><PrimaryButton size="small" startIcon={<PersonAddIcon sx={{ fontSize: 13 }} />} onClick={inviteUser} loading={saving} disabled={saving}>Create User</PrimaryButton></DialogActions>}
      >
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="First name" value={createForm.firstName} onChange={updateCreateForm('firstName')} fullWidth size="small" required />
            <TextField label="Last name" value={createForm.lastName} onChange={updateCreateForm('lastName')} fullWidth size="small" />
          </Box>
          <TextField label="Email address" value={createForm.email} onChange={updateCreateForm('email')} type="email" fullWidth size="small" required />
          <TextField label="Mobile" value={createForm.mobile} onChange={updateCreateForm('mobile')} fullWidth size="small" />
          <TextField select label="Role" value={createForm.role} onChange={updateCreateForm('role')} fullWidth size="small">
            <option value="agent">Agent</option>
            <option value="counselor">Counselor</option>
            <option value="supervisor">Supervisor</option>
          </TextField>
          <TextField label="Extension" defaultValue="Assigned automatically" fullWidth size="small" disabled />
        </Stack>
      </AppDialog>

      <AppDialog open={dialog?.type === 'role'} onClose={closeDialog}
        title={`Change role — ${dialogLabel()}`} subtitle="Supervisor role grants queue management and reporting access." maxWidth="xs"
        footer={<DialogActions><SecondaryButton size="small" onClick={closeDialog} disabled={saving}>Cancel</SecondaryButton><SecondaryButton size="small" onClick={() => changeRole(dialog.ids, 'agent')} disabled={saving}>Make Agent</SecondaryButton><SecondaryButton size="small" onClick={() => changeRole(dialog.ids, 'counselor')} disabled={saving}>Make Counselor</SecondaryButton><PrimaryButton size="small" onClick={() => changeRole(dialog.ids, 'supervisor')} disabled={saving}>Make Supervisor</PrimaryButton></DialogActions>}
      >
        <Typography variant="body2" color="text.secondary">Select the new role for {dialog?.ids?.length === 1 ? 'this account' : 'these accounts'}.</Typography>
      </AppDialog>

      <AppDialog open={dialog?.type === 'team'} onClose={closeDialog}
        title={`Assign team — ${dialogLabel()}`} subtitle="Team membership controls supervisor visibility." maxWidth="xs"
        footer={<DialogActions><SecondaryButton size="small" onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton size="small" onClick={() => applyMove('team')}>Apply</PrimaryButton></DialogActions>}
      >
        <TextField select id="um-move-team" label="Team" fullWidth size="small" SelectProps={{ native: true }}>
          {filterOptions.team.map((t) => <option key={t} value={t}>{t}</option>)}
        </TextField>
      </AppDialog>

      <AppDialog open={dialog?.type === 'queue'} onClose={closeDialog}
        title={`Move queue — ${dialogLabel()}`} subtitle="Choose the new queue for this account." maxWidth="xs"
        footer={<DialogActions><SecondaryButton size="small" onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton size="small" onClick={() => applyMove('queue')}>Apply</PrimaryButton></DialogActions>}
      >
        <TextField select id="um-move-queue" label="Queue" fullWidth size="small" SelectProps={{ native: true }}>
          {(queues.length ? queues.map((q) => q.name) : ['Unassigned']).map((q) => <option key={q} value={q}>{q}</option>)}
        </TextField>
      </AppDialog>

      <AppDialog open={dialog?.type === 'delete'} onClose={closeDialog}
        title={`Remove ${dialogLabel()}?`} subtitle="CRM access will be revoked and the PBX extension deleted." maxWidth="xs"
        footer={<DialogActions><SecondaryButton size="small" onClick={closeDialog} disabled={saving}>Cancel</SecondaryButton><Button variant="contained" color="error" size="small" startIcon={<DeleteIcon sx={{ fontSize: 13 }} />} onClick={() => deleteUsers(dialog.ids)} disabled={saving}>Remove User</Button></DialogActions>}
      >
        <Typography variant="body2" color="text.secondary">
          The user will be deactivated while historical CRM records are preserved. Reactivation provisions a new SIP password.
        </Typography>
      </AppDialog>

      {profileUser && (
        <UserProfileModal
          user={profileUser}
          detail={details[profileUser.id]}
          detailLoading={reportsLoading}
          logins={loginHistory}
          loginsLoading={loginsLoading}
          onClose={() => setProfileUser(null)}
          onEdit={() => { setDialog({ type: 'role', user: profileUser, ids: [profileUser.id] }); setProfileUser(null); }}
          onResetPassword={() => { resetPassword([profileUser.id]); setProfileUser(null); }}
          onSuspend={() => { setStatus([profileUser.id], 'Suspended'); setProfileUser(null); }}
        />
      )}
    </>
  );
}
