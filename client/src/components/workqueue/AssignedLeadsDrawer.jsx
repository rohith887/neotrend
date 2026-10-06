import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Drawer,
  Pagination,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import CloseIcon from '@mui/icons-material/Close';
import EventNoteIcon from '@mui/icons-material/EventNote';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { fetchAssignedLeads } from '../../api/dashboard.js';
import { CountryLabel } from '../../utils/flag.jsx';
import { contextWorkType, currentWorkType } from '../../utils/workType.js';
import { useCache } from '../../context/CacheContext.jsx';
import ReviveLeadButton from '../ReviveLeadButton.jsx';
import {
  AppIconButton,
  FilterSelect,
  PrimaryButton,
  SearchField,
  SecondaryButton,
} from '../../ui/mui/index.js';

/* ==========================================================================
   ASSIGNED LEADS DRAWER — the agent's primary workload view.
   Right-side slide-out showing EVERY lead assigned to the agent regardless
   of status, with server-side search, filters (Status / Priority / Country /
   Intake), pagination and a Continue → workspace action per row.
   Polls while open so the list stays in sync with assignments/dispositions.

   Context filters (applied by the KPI tile that opened the drawer, never
   cleared by Clear — every other filter is applied ON TOP of them):
     dropStatus → Dropped Leads
     rnr        → 'current'   RNR Leads       (currently in RNR state, open today)
                  'escalated' RNR 6+ Leads    (lifetime RNR attempts >= 6)
   Both RNR modes are resolved server-side by the same service that produces
   the KPI counts, so the drawer count and the KPI number always match.

   MUI migration — same state, debounce, preset handling, polling, fetch
   (fetchAssignedLeads) and pagination logic as before; only the presentation
   uses muiTheme.js + shared MUI components.
   ========================================================================== */

// Display label per raw status (mirror of the server's STATUS_DISPLAY).
const STATUS_LABEL = {
  new: 'New',
  assigned: 'Contacted',
  fetched: 'Contacted',
  'in-progress': 'Qualified',
  callback: 'Qualified',
  'follow-up': 'Qualified',
  completed: 'Application Started',
  'callback-completed': 'Callback Completed',
  submitted: 'Enrolled',
  'documents-pending': 'Documents Pending',
  'offer-received': 'Offer Received',
  'visa-process': 'Visa Process',
  lost: 'Lost',
  dropped: 'Dropped',
};

// Statuses that can be claimed into the workspace (mirror of the server's
// RESUME_STATUSES). Terminal leads stay visible but cannot be re-opened.
// Dropped leads are openable by their owner (the revive surface lives both
// here and in the workspace) — they just never appear in the active queues.
const RESUMABLE = new Set([
  'new', 'assigned', 'callback', 'fetched', 'in-progress', 'follow-up',
  'completed', 'documents-pending', 'offer-received', 'visa-process',
  'dropped',
]);

// Display-label status → MUI chip color (mirror of the old text-bg-* tones).
const STATUS_COLOR = {
  New: 'default',
  Contacted: 'info',
  Qualified: 'success',
  'Application Started': 'success',
  'Callback Completed': 'success',
  Enrolled: 'success',
  'Documents Pending': 'warning',
  'Offer Received': 'success',
  'Visa Process': 'info',
  Lost: 'error',
  Dropped: 'error',
};

// P1/P2/P3 priority chip (mirrors the dashboard PriorityChip / workspace
// PriorityBadge labels).
const PRIO_CHIP = {
  P1: { color: 'error',   label: 'P1 HOT' },
  P2: { color: 'warning', label: 'P2 WARM' },
  P3: { color: 'info',    label: 'P3 COLD' },
};

// Friendly label for a KPI preset status chip. Presets may carry raw status
// values (e.g. ["new","assigned"] from the Ready to Call KPI) so we map them
// back to human-readable labels for the removable chips.
const PRESET_STATUS_LABEL = {
  new: 'New',
  assigned: 'Contacted',
  fetched: 'Contacted',
  'in-progress': 'Qualified',
  callback: 'Callback',
  'follow-up': 'Qualified',
  completed: 'Application Started',
  'documents-pending': 'Documents Pending',
  'offer-received': 'Offer Received',
  'visa-process': 'Visa Process',
};

const presetStatusLabel = (s) => PRESET_STATUS_LABEL[s] || STATUS_LABEL[s] || s;

// RNR context-filter label shown as a removable chip while the filter is on.
const RNR_MODE_LABEL = {
  current: 'RNR Leads',
  escalated: 'RNR 6+ Leads',
};

const PriorityChip = ({ priority }) => {
  const key = String(priority || '').trim().toUpperCase();
  const meta = PRIO_CHIP[key];
  return meta ? (
    <Chip size="small" color={meta.color} label={meta.label} sx={{ height: 20, fontSize: 10.5 }} />
  ) : (
    <Chip size="small" variant="outlined" label="No Priority" sx={{ height: 20, fontSize: 10.5 }} />
  );
};

const PAGE_SIZE = 10;

// Approved color system — brand indigo for general UI chrome (focus ring,
// spinner, count badge, avatars); KPI identity colors preserved through the
// core color-continuity rule for preset chips and the Continue button.
const BRAND = '#0f766e';
const BRAND_HOVER = '#115e59';
const GRAY_LINE = '#e5e7eb';

// Brand filled primary overrides (no-preset fallback for Continue CTA).
const primaryBrandSx = {
  bgcolor: BRAND,
  color: '#ffffff',
  boxShadow: 'none',
  '&:hover': { bgcolor: BRAND_HOVER, boxShadow: 'none' },
};

// Neutral search/filter field styling — white background, light-grey border,
// brand focus accent (matches the one active-action colour intentionally).
const neutralFieldSx = {
  bgcolor: '#ffffff',
  '& .MuiOutlinedInput-root': {
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BRAND, boxShadow: 'none' },
    '&.Mui-focused': { boxShadow: 'none' },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: BRAND },
};

// Core color-continuity rule: when a KPI preset is active, its identity color
// carries through to the preset chips and the Continue button so the drawer
// reads as part of that KPI's context.
const PRESET_COLORS = {
  'totalAssignedLeads': { chip: { bgcolor: '#eff6ff', color: '#1e40af' },   action: { bgcolor: '#3B82F6', color: '#ffffff', '&:hover': { bgcolor: '#2563EB' } } },
  'readyToCall':        { chip: { bgcolor: '#ecfeff', color: '#155e75' },   action: { bgcolor: '#06B6D4', color: '#ffffff', '&:hover': { bgcolor: '#0891B2' } } },
  'pendingCallbacks':   { chip: { bgcolor: '#FEF3C7', color: '#92400E' },  action: { bgcolor: '#F59E0B', color: '#ffffff', '&:hover': { bgcolor: '#D97706' } } },
  'p1Leads':            { chip: { bgcolor: '#fef2f2', color: '#991b1b' },  action: { bgcolor: '#EF4444', color: '#ffffff', '&:hover': { bgcolor: '#DC2626' } } },
  'qualifiedLeads':     { chip: { bgcolor: '#f0fdf4', color: '#166534' },  action: { bgcolor: '#22C55E', color: '#ffffff', '&:hover': { bgcolor: '#16A34A' } } },
  'readyForRegistration': { chip: { bgcolor: '#f5f3ff', color: '#5B21B6' }, action: { bgcolor: '#8B5CF6', color: '#ffffff', '&:hover': { bgcolor: '#7C3AED' } } },
  'droppedLeads':       { chip: { bgcolor: '#FDF2F8', color: '#881337' }, action: { bgcolor: '#881337', color: '#ffffff', '&:hover': { bgcolor: '#6B0E28' } } },
  // RNR identity — the same slate tone the dashboard already uses for RNR
  // (Callbacks & RNR table badges). The 6+ escalation bucket is the darker
  // step of the same family so the two read as RNR but stay distinguishable.
  'rnrLeads':           { chip: { bgcolor: 'rgba(71, 85, 105, 0.10)', color: '#334155' }, action: { bgcolor: '#475569', color: '#ffffff', '&:hover': { bgcolor: '#334155' } } },
  'rnr6PlusLeads':      { chip: { bgcolor: '#E2E8F0', color: '#0F172A' },   action: { bgcolor: '#0F172A', color: '#ffffff', '&:hover': { bgcolor: '#334155' } } },
};

// Derive the active preset color from the current assignedKey.
const usePresetColor = (assignedKey) => PRESET_COLORS[assignedKey] || null;

// Human-readable context name for the active preset (shown in the header).
const PRESET_CONTEXT_LABEL = {
  'totalAssignedLeads':   'All Assigned Leads',
  'readyToCall':          'Ready to Call',
  'pendingCallbacks':     'Pending Callbacks',
  'p1Leads':              'Hot Leads (P1)',
  'qualifiedLeads':       'Qualified Leads',
  'readyForRegistration': 'Ready for Registration',
  'droppedLeads':         'Dropped Leads',
  'rnrLeads':             'RNR Leads',
  'rnr6PlusLeads':        'RNR 6+ Leads',
};

const initials = (name) =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

// Type chip styling — the current work-type identity of a card. RNR keeps the
// slate family used across the app's RNR surfaces; Callback the deep-orange
// used by the callback work queue; every other type stays neutral.
const TYPE_CHIP_SX = {
  RNR:      { color: '#475569', bgcolor: 'rgba(71, 85, 105, 0.08)', border: '1px solid rgba(71, 85, 105, 0.25)' },
  Callback: { color: '#C2410C', bgcolor: '#FFEDD5', border: '1px solid rgba(194, 65, 12, 0.2)' },
};
const typeChipSx = (t) => TYPE_CHIP_SX[t] || { color: 'text.secondary', bgcolor: 'action.hover', border: 1, borderColor: 'divider' };

const fmtWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function AssignedLeadsDrawer({ open, onClose, preset, onOpenLead, fetchingLead }) {
  const { invalidate } = useCache();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [presetStatuses, setPresetStatuses] = useState([]);
  const [presetDropStatus, setPresetDropStatus] = useState('');
  const [presetRnrMode, setPresetRnrMode] = useState('');
  const [priority, setPriority] = useState('');
  const [country, setCountry] = useState('');
  const [intake, setIntake] = useState('');
  const [page, setPage] = useState(1);

  // Core color-continuity: derive which KPI color identity applies based on
  // the active preset so the drawer reads as part of that KPI's context.
  const activePresetKey = useMemo(() => {
    if (preset?.dropStatus === 'dropped') return 'droppedLeads';
    if (preset?.priority === 'P1') return 'p1Leads';
    if (preset?.rnr === 'current') return 'rnrLeads';
    if (preset?.rnr === 'escalated') return 'rnr6PlusLeads';
    if (!preset?.status) return null;
    const s = preset.status;
    if (s.length === 1 && s[0] === 'callback') return 'pendingCallbacks';
    if (s.includes('new')) return 'readyToCall';
    if (s.includes('completed') || s.includes('visa-process')) return 'readyForRegistration';
    if (s.includes('in-progress') || s.includes('follow-up')) return 'qualifiedLeads';
    return null;
  }, [preset]);
  const presetColor = usePresetColor(activePresetKey);

  // Snapshot the preset at open time so mid-session filter edits are not
  // clobbered when the parent re-renders with a fresh object.
  const presetRef = useRef(preset);
  useEffect(() => { presetRef.current = preset; }, [preset]);

  // Monotonic sequence for the in-flight request. Because a stale (older)
  // request can resolve after a newer one — e.g. the unfiltered fetch fired
  // the instant a KPI preset drawer opened, racing the filtered refetch — we
  // only ever commit the response from the most recently issued request.
  const reqSeqRef = useRef(0);

  // Apply the latest preset whenever the drawer opens OR the preset changes
  // while it is already open (switching between KPI tiles). `status` may be a
  // single label ("Qualified") or an array of labels (multi-status preset)
  // shown as removable chips.
  useEffect(() => {
    if (!open) return;
    const p = presetRef.current || {};
    setPresetRnrMode(p.rnr ?? '');
    if (p.dropStatus) {
      setPresetStatuses([]);
      setStatus('');
      setPresetDropStatus(p.dropStatus);
    } else if (Array.isArray(p.status) && p.status.length) {
      setPresetStatuses(p.status.filter(Boolean));
      setStatus('');
      setPresetDropStatus('');
    } else {
      setPresetStatuses([]);
      setStatus(p.status ?? '');
      setPresetDropStatus('');
    }
    setPriority(p.priority ?? '');
    setCountry(p.country ?? '');
    setIntake(p.intake ?? '');
    setSearch('');
    setDebounced('');
    setPage(1);
  }, [open, preset]);

  // Debounce the search box.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(id);
  }, [search]);

  // Reset to page 1 whenever a filter or search changes.
  useEffect(() => {
    setPage(1);
  }, [debounced, status, presetStatuses, presetDropStatus, presetRnrMode, priority, country, intake]);

  const fetchData = useCallback(async () => {
    if (!open) return;
    const seq = ++reqSeqRef.current;
    setLoading(true);
    // The Dropped Leads / RNR contexts are the preset's own filter (applied
    // the moment the KPI opens — read from the prop synchronously, so the
    // very first request is already scoped to the KPI's leads) or a later
    // user selection. Every other filter (search/status/priority/country/
    // intake/pagination) is applied ON TOP of it, never instead of it.
    const dropFilter = preset?.dropStatus || presetDropStatus || '';
    const rnrFilter = preset?.rnr || presetRnrMode || '';
    try {
      const d = await fetchAssignedLeads({
        page,
        pageSize: PAGE_SIZE,
        search: debounced || undefined,
        status: status || presetStatuses.join(',') || undefined,
        priority: priority || undefined,
        country: country || undefined,
        intake: intake || undefined,
        dropStatus: dropFilter || undefined,
        rnr: rnrFilter || undefined,
      });
      if (seq !== reqSeqRef.current) return; // stale response — drop it
      setData(d);
      setError(null);
    } catch (err) {
      if (seq !== reqSeqRef.current) return; // stale response — drop it
      setError(err?.response?.data?.message || err?.message || 'Could not load assigned leads');
    } finally {
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }, [open, page, debounced, status, presetStatuses, presetDropStatus, presetRnrMode, preset, priority, country, intake]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep the list live while the drawer is open (assignment changes,
  // dispositions, reassignments all land within one poll cycle). Same rule as
  // the dashboard: no tick while the tab is hidden, immediate catch-up when it
  // returns. Filters are read-only inputs to fetchData, so a refresh can never
  // reset what the agent has selected.
  useEffect(() => {
    if (!open) return undefined;
    const isVisible = () => typeof document === 'undefined' || !document.hidden;
    const id = window.setInterval(() => { if (isVisible()) fetchData(); }, 30000);
    const onVisibilityChange = () => { if (isVisible()) fetchData(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [open, fetchData]);

  // Context filters — the Dropped Leads / RNR Leads / RNR 6+ Leads buckets the
  // drawer was opened with. These are NOT cleared by Clear; Clear only resets
  // the user's own optional filters on top of them.
  const isDropContext = Boolean(preset?.dropStatus || presetDropStatus);
  const rnrMode = String(preset?.rnr || presetRnrMode || '');
  const isRnrContext = Boolean(rnrMode);
  const isContextFilter = isDropContext || isRnrContext;

  const resetFilters = () => {
    setStatus('');
    setPresetStatuses([]);
    setPriority('');
    setCountry('');
    setIntake('');
    setSearch('');
    // presetDropStatus / presetRnrMode intentionally preserved — they are the
    // context filters the KPI applied, not user-selected filters to clear.
  };

  const activeFilterCount = [status, priority, country, intake, presetDropStatus, presetRnrMode].filter(Boolean).length + presetStatuses.length;
  const hasQuery = activeFilterCount > 0 || debounced !== '';

  // Status dropdown options — unique display labels in a stable order.
  const STATUS_ORDER = ['New', 'Contacted', 'Qualified', 'Application Started', 'Callback Completed', 'Enrolled', 'Documents Pending', 'Offer Received', 'Visa Process', 'Lost', 'Dropped'];
  const statusOptions = useMemo(() => {
    const set = new Set((data?.options?.statuses || []).map((s) => STATUS_LABEL[s] || s));
    return [...set].sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a) === -1 ? 99 : STATUS_ORDER.indexOf(a);
      const ib = STATUS_ORDER.indexOf(b) === -1 ? 99 : STATUS_ORDER.indexOf(b);
      return ia - ib;
    });
  }, [data?.options?.statuses]);

  const priorities = (data?.options?.priorities || []).filter(Boolean).sort();
  const countries = (data?.options?.countries || []).filter(Boolean);
  const intakes = (data?.options?.intakes || []).filter(Boolean);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const from = total === 0 ? 0 : (cur - 1) * PAGE_SIZE + 1;
  const to = Math.min(cur * PAGE_SIZE, total);
  const rows = data?.rows || [];

  // The "Type" of each card is the CURRENT work type of the queue context the
  // KPI opened, falling back to the lead's actual current work type for
  // contexts that are not a work type themselves — notably the RNR 6+ bucket,
  // which is a lifetime-history filter and must never force an "RNR" label.
  const presetCtxType = contextWorkType(preset || {});
  const showWorkType = Boolean(presetCtxType) || preset?.rnr === 'escalated';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: 420,
            maxWidth: { xs: '100vw', sm: '92vw' },
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      {/* Contextual top accent — the KPI/work-type color that opened the drawer. */}
      <Box
        sx={{
          flexShrink: 0,
          height: 3,
          bgcolor: presetColor ? presetColor.action.bgcolor : BRAND,
        }}
      />

      <Box
        component="header"
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        <AssignmentIndIcon aria-hidden="true" sx={{ fontSize: 17, color: presetColor ? presetColor.action.bgcolor : BRAND }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2 }} noWrap>
            Assigned Leads
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: presetColor ? presetColor.action.bgcolor : 'text.secondary', lineHeight: 1.2, mt: 0.25 }} noWrap>
            {activePresetKey ? PRESET_CONTEXT_LABEL[activePresetKey] || 'Assigned Leads' : 'All Assigned Leads'}
          </Typography>
        </Box>
        <Box
          component="span"
          title={isContextFilter
            ? `${data?.total ?? 0} ${rnrMode ? RNR_MODE_LABEL[rnrMode]?.toLowerCase() || 'leads' : 'dropped leads'}`
            : `${data?.allCount ?? 0} in queue`}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 22,
            height: 22,
            px: 0.875,
            borderRadius: 99,
            fontSize: 12,
            fontWeight: 700,
            color: '#ffffff',
            bgcolor: presetColor ? presetColor.action.bgcolor : BRAND,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isContextFilter ? (data?.total ?? 0) : (data?.allCount ?? 0)}
        </Box>
        <AppIconButton title="Close" ariaLabel="Close queue" onClick={onClose} size="small">
          <CloseIcon sx={{ fontSize: 18 }} />
        </AppIconButton>
      </Box>

      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: 2,
          py: 1.25,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {/* ── Search ── */}
        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, lead ID, phone, email…"
          aria-label="Search assigned leads"
          sx={{ ...neutralFieldSx }}
        />

        {/* ── Filters (compact two-row grid) ── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 1 }}>
          <FilterSelect
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All Statuses"
            options={statusOptions.map((s) => ({ label: s, value: s }))}
            aria-label="Filter by status"
            sx={{ ...neutralFieldSx }}
          />
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            placeholder="All Priorities"
            options={priorities.map((p) => ({ label: p, value: p }))}
            aria-label="Filter by priority"
            sx={{ ...neutralFieldSx }}
          />
          <FilterSelect
            label="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="All Countries"
            options={countries.map((c) => ({ label: c, value: c }))}
            aria-label="Filter by country"
            sx={{ ...neutralFieldSx }}
          />
          <FilterSelect
            label="Intake"
            value={intake}
            onChange={(e) => setIntake(e.target.value)}
            placeholder="All Intakes"
            options={intakes.map((i) => ({ label: i, value: i }))}
            aria-label="Filter by intake"
            sx={{ ...neutralFieldSx }}
          />
        </Box>

        {/* ── Active filters — contextual preset chips + compact clear ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {isRnrContext && (
            <Chip
              size="small"
              label={RNR_MODE_LABEL[rnrMode] || 'RNR'}
              onDelete={() => setPresetRnrMode('')}
              deleteIcon={<CloseIcon sx={{ fontSize: 12 }} />}
              aria-label={`Remove ${RNR_MODE_LABEL[rnrMode] || 'RNR'} filter`}
              sx={{
                height: 22,
                fontSize: 11,
                bgcolor: presetColor ? presetColor.chip.bgcolor : '#f3f4f6',
                color: presetColor ? presetColor.chip.color : '#212529',
                '& .MuiChip-deleteIcon': {
                  color: presetColor ? presetColor.chip.color : '#6b7280',
                  '&:hover': { color: presetColor ? presetColor.chip.color : BRAND },
                },
              }}
            />
          )}
          {presetStatuses.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {presetStatuses.map((s) => (
                <Chip
                  key={s}
                  size="small"
                  label={presetStatusLabel(s)}
                  onDelete={() => setPresetStatuses((cur) => cur.filter((x) => x !== s))}
                  deleteIcon={<CloseIcon sx={{ fontSize: 12 }} />}
                  aria-label={`Remove ${presetStatusLabel(s)} filter`}
                  sx={{
                    height: 22,
                    fontSize: 11,
                    ...(presetColor
                      ? { bgcolor: presetColor.chip.bgcolor, color: presetColor.chip.color, '& .MuiChip-deleteIcon': { color: presetColor.chip.color, '&:hover': { color: presetColor.chip.color, opacity: 0.7 } } }
                      : { bgcolor: '#f3f4f6', color: '#212529', '& .MuiChip-deleteIcon': { color: '#6b7280', '&:hover': { color: BRAND } } }),
                  }}
                />
              ))}
            </Box>
          )}
          {activeFilterCount > 0 && (
            <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: presetColor ? presetColor.action.bgcolor : BRAND }}>
              {activeFilterCount} active
            </Box>
          )}
          <Box sx={{ flex: 1 }} />
          <SecondaryButton
            size="small"
            startIcon={<RestartAltIcon sx={{ fontSize: 12 }} />}
            onClick={resetFilters}
            disabled={!hasQuery}
            title="Clear all filters"
            sx={{
              minHeight: 26,
              fontSize: 11,
              px: 1,
              color: 'text.secondary',
              bgcolor: '#ffffff',
              borderColor: GRAY_LINE,
              '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f9fafb', color: 'text.primary' },
            }}
          >
            Clear
          </SecondaryButton>
        </Box>

        {/* ── Results toolbar — compact summary + filter state ── */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            fontSize: 11.5,
            fontWeight: 600,
            color: 'text.secondary',
            borderTop: 1,
            borderColor: 'divider',
            pt: 0.75,
          }}
        >
          <Box component="span" sx={{ minWidth: 0 }}>
            {total === 0 ? 'No leads' : `${from}–${to} of ${total}`}
            {!isContextFilter && data && data.allCount !== total && (
              <Box component="span" sx={{ color: 'text.disabled' }}> (of {data.allCount} assigned)</Box>
            )}
          </Box>
          {loading && data ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 11 }} role="status">
              <CircularProgress size={10} sx={{ color: 'text.secondary' }} />
              Refreshing…
            </Box>
          ) : hasQuery ? (
            <Box component="span" sx={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                aria-hidden="true"
                sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: presetColor ? presetColor.action.bgcolor : BRAND }}
              />
              Filtered
            </Box>
          ) : null}
        </Box>

        {error && (
          <Alert severity="error" sx={{ py: 0.5, px: 1.5, fontSize: 12.5 }} role="alert">
            {error}
          </Alert>
        )}

        {!data && loading ? (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 6, color: 'text.secondary' }}
            role="status"
          >
            <CircularProgress size={14} sx={{ color: BRAND }} />
            <Typography sx={{ fontSize: 12.5 }}>Loading assigned leads…</Typography>
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
            <Box
              aria-hidden="true"
              sx={{
                width: 44,
                height: 44,
                mx: 'auto',
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'action.hover',
                color: 'text.secondary',
              }}
            >
              <PersonOffIcon sx={{ fontSize: 22 }} />
            </Box>
            <Typography sx={{ mt: 1.5, fontSize: 13.5, color: 'text.secondary' }}>
              {hasQuery ? 'No assigned leads match your filters.' : "You don't have any assigned leads yet."}
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {rows.map((l) => {
                const resumable = RESUMABLE.has(l.rawStatus);
                // Dropped state is determined SOLELY by the lead's current dropStatus
                // marker — never by status or a stale 'Drop Lead' disposition (a revived
                // lead keeps its dropHistory for audit but must read as a normal active
                // assigned lead with no Revive action).
                const dropped = l.dropStatus === 'dropped';
                const cardType = presetCtxType || currentWorkType(l);
                return (
                  <Box key={l.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'action.hover', px: 1.25, py: 1, boxShadow: 'none' }}>
                    {/* ROW 1: Avatar | Name | Type · Status */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      <Avatar sx={{ width: 30, height: 30, fontSize: 11.5, fontWeight: 700, bgcolor: '#eef1f5', color: '#374151', flexShrink: 0 }}>
                        {initials(l.studentName)}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box
                          sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          title={l.studentName}
                        >
                          {l.studentName}
                        </Box>
                      </Box>
                      {showWorkType && (
                        <Chip
                          size="small"
                          label={cardType}
                          title={`Type: ${cardType}`}
                          sx={{ height: 20, fontSize: 10.5, flexShrink: 0, maxWidth: 130, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' }, ...typeChipSx(cardType) }}
                        />
                      )}
                      <Chip
                        size="small"
                        color={STATUS_COLOR[l.status] || 'default'}
                        label={l.status}
                        sx={{ height: 20, fontSize: 10.5, flexShrink: 0, maxWidth: 130, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                      />
                    </Box>

                    {/* ROW 2: Lead ID | phone/email */}
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums', minWidth: 0 }}
                      title={`${l.referenceId} · ${l.mobile}${l.email ? ` · ${l.email}` : ''}`}
                    >
                      <Box
                        component="span"
                        sx={{ fontWeight: 600, color: 'text.primary', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {l.referenceId}
                      </Box>
                      <Box component="span" sx={{ flexShrink: 0 }}>·</Box>
                      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.mobile}</Box>
                      {l.email && <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, overflow: 'hidden', textOverflow: 'ellipsis' }}> · {l.email}</Box>}
                    </Box>

                    {/* ROW 3: Priority badge | Country · Intake | assignment info */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.6, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
                        {l.priority && <PriorityChip priority={l.priority} />}
                        {l.country && (
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            <CountryLabel value={l.country} flagSx={{ fontSize: 12 }} />
                          </Box>
                        )}
                        {l.intake && (
                          <Box
                            component="span"
                            title={l.intake}
                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35, fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}
                          >
                            <EventNoteIcon aria-hidden="true" sx={{ fontSize: 12, flexShrink: 0 }} />
                            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.intake}</Box>
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 10.5, color: 'text.secondary', whiteSpace: 'nowrap', minWidth: 0 }}>
                        <AccessTimeIcon aria-hidden="true" sx={{ fontSize: 11, flexShrink: 0 }} />
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {fmtWhen(l.assignedAt)}
                          {l.lastCallAt && <> · {fmtWhen(l.lastCallAt)}</>}
                        </Box>
                      </Box>
                    </Box>

                    {/* ROW 4: Revive (dropped) + Continue action (right-aligned) */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75, mt: 0.75 }}>
                      {dropped && (
                        <ReviveLeadButton
                          lead={l}
                          onRevived={() => {
                            fetchData();
                            invalidate('agent-dashboard-summary');
                          }}
                          title={`Revive ${l.studentName} — restores it to the active workflow`}
                        />
                      )}
                      <PrimaryButton
                        size="small"
                        endIcon={<ArrowForwardIcon sx={{ fontSize: 13 }} />}
                        onClick={() => onOpenLead(l)}
                        disabled={!resumable || fetchingLead}
                        title={resumable ? 'Open this lead in the workspace' : `${l.status} leads are closed and cannot be re-opened`}
                        sx={{ minHeight: 28, fontSize: 12, px: 1.5, flexShrink: 0, ...(presetColor ? { bgcolor: presetColor.action.bgcolor, color: presetColor.action.color, boxShadow: 'none', '&:hover': presetColor.action['&:hover'] } : primaryBrandSx) }}
                      >
                        Continue
                      </PrimaryButton>
                    </Box>
                  </Box>
                );
              })}
            </Box>

            {/* ── Pagination ── */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider', pt: 1 }}>
              <Pagination
                size="small"
                page={cur}
                count={pages}
                onChange={(_, p) => setPage(p)}
                aria-label="Assigned leads pagination"
                sx={{ '& .MuiPaginationItem-root': { color: '#4b5563' }, '& .Mui-selected': { bgcolor: presetColor ? presetColor.action.bgcolor : BRAND, color: '#ffffff', '&:hover': presetColor ? presetColor.action['&:hover'] : { bgcolor: BRAND_HOVER } } }}
              />
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
