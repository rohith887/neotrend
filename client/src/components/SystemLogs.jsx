import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageHeader from '../ui/PageHeader.jsx';
import AppCard from '../ui/mui/AppCard.jsx';
import AppIconButton from '../ui/mui/AppIconButton.jsx';
import DataTable from '../ui/mui/DataTable.jsx';
import FilterSelect from '../ui/mui/FilterSelect.jsx';
import SearchField from '../ui/mui/SearchField.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fetchSystemLogs, fetchSystemLogMeta, downloadSystemLogs } from '../api/systemLogs.js';

/* ==========================================================================
   System Logs — compact audit console of important Agent/Counselor actions
   (view email/mobile, lead view/update, disposition, remarks, calls, breaks,
   WhatsApp, logins). Technical detail lives in the row detail drawer.
   ========================================================================== */

const LEVEL_META = {
  DEBUG:    { color: '#64748b', bg: '#f1f5f9', label: 'Debug' },
  INFO:     { color: '#2563eb', bg: '#eff6ff', label: 'Info' },
  WARN:     { color: '#b45309', bg: '#fffbeb', label: 'Warning' },
  ERROR:    { color: '#dc2626', bg: '#fef2f2', label: 'Error' },
  CRITICAL: { color: '#7f1d1d', bg: '#fee2e2', label: 'Critical' },
};

const MODULE_META = {
  crud: 'CRUD Operations',
  auth: 'Authentication',
  workflow: 'Workflow',
  system: 'System',
  api: 'API Requests',
};

/* Curated action vocabulary — only important Agent/Counselor events appear,
   and each maps one-to-one to a stored action so filters stay exact. */
const ACTION_OPTIONS = [
  { value: 'VIEW_MOBILE', label: 'VIEW_MOBILE' },
  { value: 'VIEW_EMAIL', label: 'VIEW_EMAIL' },
  { value: 'LEAD_OPENED', label: 'LEAD_VIEW' },
  { value: 'LEAD_UPDATED', label: 'LEAD_UPDATE' },
  { value: 'DISPOSITION_SUBMITTED', label: 'DISPOSITION_SUBMITTED' },
  { value: 'CALL_REMARK_ADDED', label: 'REMARK_ADDED' },
  { value: 'COUNSELOR_NOTE_ADDED', label: 'COUNSELOR_NOTE' },
  { value: 'CALL_STARTED', label: 'START_CALL' },
  { value: 'CALL_ENDED', label: 'END_CALL' },
  { value: 'FETCH_CALL', label: 'FETCH_CALL' },
  { value: 'WHATSAPP_TEMPLATE_OPENED', label: 'WHATSAPP' },
  { value: 'WHATSAPP_SENT', label: 'WHATSAPP_SENT' },
  { value: 'BREAK_STARTED', label: 'BREAK_STARTED' },
  { value: 'BREAK_ENDED', label: 'BREAK_ENDED' },
  { value: 'LOGOUT_OVERRIDE_APPROVED', label: 'LOGOUT_OVERRIDE_APPROVED' },
  { value: 'LOGIN_SUCCESS', label: 'LOGIN' },
  { value: 'LOGIN_FAILED', label: 'FAILED_LOGIN' },
];
const ACTION_LABEL = Object.fromEntries(ACTION_OPTIONS.map((o) => [o.value, o.label]));
const actionLabel = (action) => ACTION_LABEL[action] || action || '—';

const ROLE_LABEL = {
  AGENT: 'Agent',
  COUNSELOR: 'Counselor',
  SUPERVISOR: 'Supervisor',
};

const roleLabel = (role) => ROLE_LABEL[String(role || '').toUpperCase()] || role || '—';

const DATE_PRESETS = [
  { value: '7d',     label: 'Last 7 Days' },
  { value: '24h',    label: 'Last 24 Hours' },
  { value: 'today',  label: 'Today' },
  { value: '30d',    label: 'Last 30 Days' },
  { value: 'month',  label: 'This Month' },
  { value: 'all',    label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const fmtClock = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

function LevelChip({ level }) {
  const meta = LEVEL_META[level] || { color: '#475569', bg: '#f8fafc' };
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1,
        py: 0.25,
        borderRadius: '6px',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        color: meta.color,
        bgcolor: meta.bg,
        letterSpacing: '0.02em',
      }}
    >
      {meta.label}
    </Box>
  );
}

function LevelStat({ level, count, active, onClick }) {
  const meta = LEVEL_META[level];
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        py: 0.4,
        px: 1.1,
        borderRadius: '999px',
        border: 1,
        borderColor: active ? meta.color : 'divider',
        bgcolor: active ? meta.bg : 'background.paper',
        color: active ? meta.color : 'text.secondary',
        fontSize: 12,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        cursor: 'pointer',
        transition: 'border-color 130ms ease, background-color 130ms ease, color 130ms ease',
        '&:hover': { borderColor: meta.color, color: meta.color },
      }}
    >
      <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: meta.color, flexShrink: 0 }} />
      {meta.label}
      <Box component="span" sx={{ fontWeight: 700, color: active ? meta.color : 'text.primary' }}>
        {count}
      </Box>
    </Box>
  );
}

function DetailRow({ label, value, mono = false, copyable = false, onCopy }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(String(value ?? '')).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      });
    } catch (err) { /* ignore */ }
    onCopy?.();
  };
  return (
    <Box sx={{ py: 0.65, borderBottom: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box sx={{ mt: 0.15, display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <Typography
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 500,
            color: 'text.primary',
            wordBreak: 'break-all',
            fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
          }}
        >
          {value != null && value !== '' ? value : '—'}
        </Typography>
        {copyable && value != null && value !== '' && (
          <IconButton size="small" aria-label={`Copy ${label}`} onClick={handleCopy} sx={{ p: 0.25 }}>
            <Tooltip title={copied ? 'Copied' : 'Copy'}>
              <ContentCopyIcon sx={{ fontSize: 13, color: copied ? 'success.main' : 'text.disabled' }} />
            </Tooltip>
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

function LogDrawer({ log, onClose }) {
  if (!log) return null;
  const meta = LEVEL_META[log.level] || LEVEL_META.INFO;
  const metadata = log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata).length
    ? log.metadata
    : null;

  return (
    <Drawer
      anchor="right"
      open={!!log}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 440, maxWidth: '92vw' } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box
          sx={{
            px: 2.25,
            py: 1.75,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LevelChip level={log.level} />
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {MODULE_META[log.module] || log.module}
              </Typography>
            </Box>
            <Typography component="h2" sx={{ mt: 0.75, fontSize: 16, fontWeight: 700, color: 'text.primary', wordBreak: 'break-word' }}>
              {log.action ? actionLabel(log.action) : 'Log Entry'}
            </Typography>
            <Typography sx={{ mt: 0.25, fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {fmtDate(log.timestamp)}
            </Typography>
          </Box>
          <IconButton size="small" aria-label="Close details" onClick={onClose} sx={{ mt: -0.5 }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 2.25, py: 1.5 }}>
          {log.message && <DetailRow label="Message" value={log.message} />}
          {log.action && <DetailRow label="Action" value={log.action} mono />}
          <DetailRow label="Role" value={roleLabel(log.role)} />
          <DetailRow label="User" value={log.username} />
          {log.userId && <DetailRow label="User ID" value={log.userId} mono copyable />}
          {log.leadId && <DetailRow label="Lead" value={log.leadName || log.leadId} />}
          {log.leadId && <DetailRow label="Lead ID" value={log.leadId} mono copyable />}
          <DetailRow label="Log ID" value={log.logId} mono copyable />
          {log.apiPath && <DetailRow label="API Path" value={log.apiPath} mono copyable />}
          {log.statusCode != null && (
            <DetailRow
              label="Status Code"
              value={log.statusCode}
              mono
            />
          )}
          {log.durationMs != null && <DetailRow label="Duration" value={`${log.durationMs} ms`} mono />}
          {log.ipAddress && <DetailRow label="IP Address" value={log.ipAddress} mono copyable />}
          {log.requestId && <DetailRow label="Request ID" value={log.requestId} mono copyable />}
          {log.exception && (
            <Box sx={{ py: 0.65, borderBottom: 1, borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
                Exception
              </Typography>
              <Typography component="pre" sx={{ mt: 0.5, fontSize: 12, color: 'error.main', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', m: 0 }}>
                {log.exception}
              </Typography>
            </Box>
          )}
          {log.stackTrace && (
            <Box sx={{ py: 0.65, borderBottom: 1, borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
                Stack Trace
              </Typography>
              <Typography component="pre" sx={{ mt: 0.5, fontSize: 11.5, color: 'text.secondary', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', m: 0 }}>
                {log.stackTrace}
              </Typography>
            </Box>
          )}
          {metadata && (
            <Box sx={{ py: 0.65 }}>
              <Typography sx={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
                Metadata
              </Typography>
              <Typography component="pre" sx={{ mt: 0.5, fontSize: 11.5, color: 'text.primary', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', m: 0 }}>
                {JSON.stringify(metadata, null, 2)}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

function ExportMenu({ onCsv, onTxt }) {
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  return (
    <Box>
      <SecondaryButton
        size="small"
        aria-haspopup="menu"
        aria-expanded={open}
        startIcon={<FileDownloadIcon sx={{ fontSize: 15 }} />}
        endIcon={<ArrowDropDownIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        Export
      </SecondaryButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => { setAnchor(null); onCsv(); }}>Export as CSV</MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onTxt(); }}>Export as TXT log</MenuItem>
      </Menu>
    </Box>
  );
}

export default function SystemLogs() {
  const { push } = useToast();

  /* ── Filters ─────────────────────────────────────────────────────────── */
  const [level, setLevel] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [leadFilter, setLeadFilter] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [preset, setPreset] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  /* ── Data ────────────────────────────────────────────────────────────── */
  const [meta, setMeta] = useState({ levels: [], actions: [], roles: [], users: [], leads: [] });
  const [logs, setLogs] = useState([]);
  const [pager, setPager] = useState({ total: 0, totalPages: 1 });
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [detail, setDetail] = useState(null);

  /* Search debounce so each keystroke doesn't hammer the server. */
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  /* Load filter vocabulary (actions/roles/users/leads). Reloads when Role or
     User changes so the User and Lead dropdowns cascade to the selection. */
  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (roleFilter) params.role = roleFilter;
    if (userFilter) params.userId = userFilter;
    fetchSystemLogMeta(params)
      .then((m) => { if (!cancelled) setMeta(m); })
      .catch(() => { /* non-fatal — filters still work with static values */ });
    return () => { cancelled = true; };
  }, [roleFilter, userFilter]);

  const buildParams = useCallback(() => {
    const params = { page: page + 1, limit: pageSize };
    if (level) params.level = level;
    if (roleFilter) params.role = roleFilter;
    if (userFilter) params.userId = userFilter;
    if (leadFilter) params.leadId = leadFilter;
    if (action) params.action = action;
    if (debouncedSearch) params.q = debouncedSearch;

    if (preset === 'custom') {
      if (customFrom) params.from = new Date(`${customFrom}T00:00:00`).toISOString();
      if (customTo) params.to = new Date(`${customTo}T23:59:59.999`).toISOString();
    } else {
      const now = new Date();
      if (preset === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); params.from = d.toISOString(); }
      else if (preset === '24h') params.from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
      else if (preset === '7d') params.from = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      else if (preset === '30d') params.from = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
      else if (preset === 'month') { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); params.from = d.toISOString(); }
    }
    return params;
  }, [page, pageSize, level, roleFilter, userFilter, leadFilter, action, debouncedSearch, preset, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await fetchSystemLogs(buildParams());
      setLogs(body?.data ?? []);
      setPager(body?.meta?.total != null ? { total: body.meta.total, totalPages: body.meta.totalPages ?? 1 } : { total: 0, totalPages: 1 });
      setCounts(body?.meta?.counts ?? {});
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load system logs');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { load(); }, [load, refreshNonce]);

  const refresh = () => {
    setRefreshNonce((n) => n + 1);
    push('System logs refreshed', 'success');
  };

  const handleReset = () => {
    setLevel('');
    setRoleFilter('');
    setUserFilter('');
    setLeadFilter('');
    setAction('');
    setSearch('');
    setPreset('7d');
    setCustomFrom('');
    setCustomTo('');
    setPage(0);
  };

  const handleExport = (format) => {
    downloadSystemLogs({ ...buildParams(), format }).catch((err) => {
      push(err?.response?.data?.message || 'Export failed', 'danger');
    });
  };

  const countsByLevel = counts || {};
  const qtyVisible = pager.total || logs.length;
  const hasFilters = level || roleFilter || userFilter || leadFilter || action || debouncedSearch || preset !== '7d';

  // DataTable rows need a single stable key field — logs may have `_id` or
  // (for synthetic/legacy entries) only `logId`, exactly as the row `key`
  // used before this migration (`log._id || log.logId`).
  const rows = useMemo(() => logs.map((l) => ({ ...l, _rowKey: l._id || l.logId })), [logs]);

  const tableCols = useMemo(() => [
    {
      key: 'time', label: 'Time', width: 146,
      render: (_v, log) => (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {fmtClock(log.timestamp)}
        </Typography>
      ),
    },
    {
      key: 'role', label: 'Role', width: 92,
      render: (_v, log) => (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {roleLabel(log.role)}
        </Typography>
      ),
    },
    {
      key: 'user', label: 'User', width: 138,
      render: (_v, log) => <Typography sx={{ fontSize: 12, color: 'text.primary', whiteSpace: 'nowrap' }}>{log.username || '—'}</Typography>,
    },
    {
      key: 'lead', label: 'Lead', width: 168,
      render: (_v, log) => (
        <Tooltip title={log.leadId || ''} placement="top-start">
          <Typography
            sx={{
              fontSize: 12, color: 'text.primary',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontFamily: log.leadName ? undefined : 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {log.leadName || log.leadId || '—'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      key: 'action', label: 'Action', width: 172,
      render: (_v, log) => (
        <Tooltip title={`${log.action || ''}${log.module ? ` · ${MODULE_META[log.module] || log.module}` : ''}`} placement="top-start" arrow>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {actionLabel(log.action)}
            </Typography>
            {log.statusCode != null && (
              <Box
                component="span"
                sx={{
                  flexShrink: 0,
                  px: 0.6,
                  py: 0.1,
                  borderRadius: '5px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: log.statusCode >= 400 ? 'error.main' : 'success.main',
                  bgcolor: log.statusCode >= 400 ? 'error.soft' : 'success.soft',
                }}
              >
                {log.statusCode}
              </Box>
            )}
          </Box>
        </Tooltip>
      ),
    },
    {
      key: 'message', label: 'Message',
      render: (_v, log) => (
        <Tooltip title={log.message || ''} placement="top-start">
          <Typography sx={{ fontSize: 12, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {log.message || '—'}
          </Typography>
        </Tooltip>
      ),
    },
  ], []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title=""
        crumb={[{ label: 'System', href: '' }, { label: 'System Logs' }]}
        actions={
          <>
            <ExportMenu onCsv={() => handleExport('csv')} onTxt={() => handleExport('txt')} />
            <AppIconButton title="Refresh logs" ariaLabel="Refresh logs" onClick={refresh}>
              <RefreshIcon fontSize="small" />
            </AppIconButton>
          </>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }} action={<SecondaryButton size="small" onClick={() => load()}>Retry</SecondaryButton>}>
          {error}
        </Alert>
      )}

      <AppCard sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }} contentSx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DataTable
          columns={tableCols}
          data={rows}
          keyField="_rowKey"
          loading={loading}
          onRowClick={setDetail}
          emptyTitle="No logs found"
          emptyText="Important Agent & Counselor actions are logged here — lead views, disposition submissions, calls, WhatsApp, and sign-ins. Try widening the date range or clearing filters."
          controlledPage={page}
          onPageChange={(_e, p) => setPage(p)}
          controlledPageSize={pageSize}
          onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
          totalCount={pager.total}
          pageSizeOptions={[25, 50, 100, 200]}
          toolbar={
            <>
              {/* Level summary strip */}
              <Box sx={{ px: 1.5, py: 0.8, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <LevelStat level="INFO" count={countsByLevel.INFO ?? 0} active={level === 'INFO'} onClick={() => setLevel((prev) => (prev === 'INFO' ? '' : 'INFO'))} />
                <LevelStat level="WARN" count={countsByLevel.WARN ?? 0} active={level === 'WARN'} onClick={() => setLevel((prev) => (prev === 'WARN' ? '' : 'WARN'))} />
                <LevelStat level="ERROR" count={countsByLevel.ERROR ?? 0} active={level === 'ERROR'} onClick={() => setLevel((prev) => (prev === 'ERROR' ? '' : 'ERROR'))} />
                <LevelStat level="CRITICAL" count={countsByLevel.CRITICAL ?? 0} active={level === 'CRITICAL'} onClick={() => setLevel((prev) => (prev === 'CRITICAL' ? '' : 'CRITICAL'))} />
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>
                    {qtyVisible.toLocaleString()} record{qtyVisible !== 1 ? 's' : ''}
                  </Typography>
                  {hasFilters && (
                    <Box component="button" type="button" onClick={handleReset} sx={{ fontSize: 12, fontWeight: 600, color: 'primary.main', bgcolor: 'transparent', border: 'none', cursor: 'pointer', p: 0.5, '&:hover': { textDecoration: 'underline' } }}>
                      Clear filters
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Filter toolbar — one compact cascade row: Role → User → Lead → Action → Date Range → Search */}
              <Box sx={{ px: 1.5, py: 0.9, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <FilterSelect
                  label="Role"
                  value={roleFilter}
                  onChange={(e) => { setRoleFilter(e.target.value); setUserFilter(''); setLeadFilter(''); setPage(0); }}
                  options={[{ value: '', label: 'All Roles' }, ...(meta.roles || []).map((v) => ({ value: v, label: roleLabel(v) }))]}
                  sx={{ minWidth: 132, height: 30 }}
                />
                <FilterSelect
                  label="User"
                  value={userFilter}
                  disabled={!roleFilter && !(meta.users || []).length}
                  onChange={(e) => { setUserFilter(e.target.value); setLeadFilter(''); setPage(0); }}
                  options={[{ value: '', label: 'All Users' }, ...(meta.users || []).map((u) => ({ value: u.userId, label: `${u.username || u.userId}${u.role ? ` · ${roleLabel(u.role)}` : ''}` }))]}
                  sx={{ minWidth: 180, maxWidth: 260, height: 30 }}
                />
                <FilterSelect
                  label="Lead"
                  value={leadFilter}
                  disabled={!roleFilter && !userFilter && !(meta.leads || []).length}
                  onChange={(e) => { setLeadFilter(e.target.value); setPage(0); }}
                  options={[{ value: '', label: 'All Leads' }, ...(meta.leads || []).map((l) => ({ value: l.leadId, label: l.leadName || l.leadId }))]}
                  sx={{ minWidth: 168, maxWidth: 260, height: 30 }}
                />
                <FilterSelect
                  label="Action"
                  value={action}
                  onChange={(e) => { setAction(e.target.value); setPage(0); }}
                  options={[{ value: '', label: 'All Actions' }, ...ACTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]}
                  sx={{ minWidth: 176, height: 30 }}
                />
                <FilterSelect
                  label="Date range"
                  value={preset}
                  onChange={(e) => { setPreset(e.target.value); setPage(0); }}
                  options={DATE_PRESETS.map((d) => ({ value: d.value, label: d.label }))}
                  sx={{ minWidth: 140, height: 30 }}
                />

                {preset === 'custom' && (
                  <>
                    <TextField
                      type="date"
                      size="small"
                      label="From"
                      value={customFrom}
                      onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 150, '& .MuiOutlinedInput-root': { minHeight: 30 } }}
                    />
                    <TextField
                      type="date"
                      size="small"
                      label="To"
                      value={customTo}
                      onChange={(e) => { setCustomTo(e.target.value); setPage(0); }}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 150, '& .MuiOutlinedInput-root': { minHeight: 30 } }}
                    />
                  </>
                )}

                <SearchField
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search action, user, lead…"
                  fullWidth={false}
                  sx={{ ml: 'auto', minWidth: 220, maxWidth: 280, '& .MuiOutlinedInput-root': { minHeight: 30 } }}
                />
              </Box>
            </>
          }
          containerSx={{ maxHeight: 'none' }}
        />
      </AppCard>

      <LogDrawer log={detail} onClose={() => setDetail(null)} />
    </Box>
  );
}