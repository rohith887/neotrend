import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  DialogActions,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditIcon from '@mui/icons-material/Edit';
import EventNoteIcon from '@mui/icons-material/EventNote';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterListIcon from '@mui/icons-material/FilterList';
import LinkIcon from '@mui/icons-material/Link';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonIcon from '@mui/icons-material/Person';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PhoneIcon from '@mui/icons-material/Phone';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { useToast } from '../context/ToastContext.jsx';
import { useCachedFetch, useCache } from '../context/CacheContext.jsx';
import {
  fetchLeadsPaginated,
  createLead as createLeadApi,
  updateLead as updateLeadApi,
  exportLeadReport as exportLeadReportApi,
} from '../api/leads.js';
import { fetchSupervisorUsers } from '../api/supervisor.js';
import ImportLeadsModal from './ImportLeadsModal.jsx';
import CrmListShell from './CrmListShell.jsx';
import {
  LIFECYCLE_ALL_STAGES,
  STAGE_LABELS,
  stageLabel,
  stageTone,
} from '../utils/lifecycle.js';
import { CountryLabel } from '../utils/flag.jsx';
import {
  AppDialog,
  AppIconButton,
  DataTable,
  FilterSelect,
  PrimaryButton,
  SearchField,
  SecondaryButton,
  StatusChip,
} from '../ui/mui/index.js';

/* ── Pipeline constants ─────────────────────────────────────────── */
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

const LEAD_MARKETING_AGENCIES = ['ATIL', 'AVISKAR'];

const LEAD_SOURCES = [
  'Website', 'Landing Page', 'LinkedIn', 'Instagram', 'Meta Lead Generation',
  'Referral Leads', 'Kerala', 'Vizag', 'Sales Leads', 'Organic Website',
];
const LEAD_COUNTRIES = [
  'Canada', 'United States', 'United Kingdom', 'Australia', 'Germany',
  'Ireland', 'New Zealand', 'UAE', 'Singapore',
];
const LEAD_UNIVERSITIES = [
  'University of Toronto', 'University of British Columbia', 'McGill University', 'University of Waterloo',
  'Harvard University', 'Stanford University', 'New York University', 'University of Oxford',
  'University College London', 'Imperial College London', 'University of Melbourne', 'University of Sydney',
  'Monash University', 'Technical University of Munich', 'Trinity College Dublin', 'University of Auckland',
  'University of Wollongong in Dubai', 'National University of Singapore',
];
const LEAD_INTAKES = ['Fall 2026', 'Spring 2027', 'Summer 2027', 'Winter 2027'];
const LEAD_EDUCATION = ["Bachelor's Degree", "Master's Degree", 'Diploma', '12th / HSC', 'Other'];
const CALL_OUTCOMES = ['RNR', 'Callback', 'Interested', 'P1 - Hot Lead', 'P2 - Warm Lead', 'P3 - Cold Lead', 'Not Interested'];

const NEXT_STATUS = {
  'New': 'Contacted',
  'Contacted': 'Qualified',
  'Qualified': 'Application Started',
  'Application Started': 'Documents Pending',
  'Documents Pending': 'Offer Received',
  'Offer Received': 'Visa Process',
  'Visa Process': 'Enrolled',
};

const TASA_DONE = new Set(['Offer Received', 'Visa Process', 'Enrolled']);

/* Pipeline view tabs — these drive server-side filtering where possible */
const PIPELINE_TABS = [
  { key: 'all',          label: 'All Leads' },
  { key: 'new',          label: 'New' },
  { key: 'contacted',    label: 'Contacted' },
  { key: 'p1',           label: 'P1' },
  { key: 'p2',           label: 'P2' },
  { key: 'registration', label: 'Registration' },
  { key: 'submitted',    label: 'Submitted' },
];

/* Map pipeline tab → server filter params.
   NOTE: Working views are grouped semantically (e.g. "Contacted" = raw
   'assigned' + 'fetched'; "Submitted" = multiple terminal display stages),
   which cannot be expressed as a single server rawStatus value. So views are
   filtered CLIENT-SIDE (see PIPELINE_MATCH) against the already-fetched lead
   rows. Keep both the table and the per-tab counts on the exact same
   PIPELINE_MATCH so they can never disagree. */
const TAB_SERVER_PARAMS = {};

/* Client-side matching for pipeline tabs (used for BOTH table + counts) */
const PIPELINE_MATCH = {
  new:          (l) => l.status === 'New',
  contacted:    (l) => l.status === 'Contacted',
  p1:           (l) => l.priority === 'Urgent',
  p2:           (l) => l.priority === 'Medium',
  registration: (l) => l.status === 'Documents Pending',
  submitted:    (l) => TASA_DONE.has(l.status),
};

const PRIORITY_STYLE = {
  Urgent: { color: 'error.main',   fontWeight: 700 },
  High:   { color: 'warning.main', fontWeight: 600 },
  Medium: { color: 'info.main',    fontWeight: 500 },
  Low:    { color: 'text.disabled', fontWeight: 400 },
};

const STAGE_CHIP_SX = { height: 20, fontSize: 10.5, fontWeight: 500, '& .MuiChip-label': { px: 0.625 } };

const STATUS_PILL = {
  NEW_LEAD:             'neutral',
  ASSIGNED:             'neutral',
  CONTACTED:            'info',
  COUNSELLING:          'primary',
  INTERESTED:           'success',
  PREFERENCES:          'info',
  UNIVERSITY_SHORTLIST: 'info',
  APPLICATION:          'primary',
  SUBMITTED:            'info',
  OFFER_RECEIVED:       'success',
  DEPOSIT_PAYMENT:      'warning',
  VISA:                 'primary',
  ENROLLED:             'success',
  NOT_INTERESTED:       'danger',
  LOST:                 'danger',
  ON_HOLD:              'neutral',
  DEFERRED:             'neutral',
  REJECTED:             'danger',
};

const statusPillTone = (stage) => STATUS_PILL[stage] || stageTone(stage) || 'neutral';

const STATUS_PILL_SX = { height: 24, fontSize: 11.5, px: 0, '& .MuiChip-label': { px: 1.25, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } };

/* ── Source helpers ──────────────────────────────────────────────── */
const leadSourceName   = (l) => { const s = l.source ?? l.leadSource; if (!s) return null; return typeof s === 'string' ? s : s.name || null; };
const leadSourceDetail = (l) => { const s = l.source && typeof l.source === 'object' ? l.source : null; return String((s?.description) || l.sourceDetail || l.campaign || '').trim(); };

const SourceCell = ({ lead }) => {
  const name   = leadSourceName(lead);
  const detail = leadSourceDetail(lead);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={name ?? undefined}>{name || '—'}</Box>
      {detail && <Box sx={{ fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={detail}>{detail}</Box>}
    </Box>
  );
};

/* ── Export helpers ─────────────────────────────────────────────── */
const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};
const exportStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
};
const tasacell = (lead) =>
  TASA_DONE.has(lead.status)
    ? <StatusChip status="Submitted" tone="success" size="small" sx={STAGE_CHIP_SX} />
    : <StatusChip status="Pending"   tone="neutral"  size="small" sx={STAGE_CHIP_SX} />;

/* ── Section header helper for dialogs ──────────────────────────── */
const SectionLabel = ({ children }) => (
  <Typography variant="overline" sx={{ color: 'text.disabled', letterSpacing: '0.08em', display: 'block', mt: 0.5, mb: -0.5 }}>
    {children}
  </Typography>
);
const FIELD_LABEL = { fontSize: 12.5, fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' };

/* ═══════════════════════════════════════════════════════════════════
   LEAD FORM DIALOG  (create + edit)
   ═══════════════════════════════════════════════════════════════════ */
function LeadFormDialog({ mode, lead, users, onClose, onSubmit, onValidationError }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    studentName:       lead?.studentName       ?? '',
    phone:             lead?.phone             ?? '',
    email:             lead?.email             ?? '',
    gender:            lead?.gender            ?? '',
    countryInterested: lead?.countryInterested ?? LEAD_COUNTRIES[0],
    preferredUniversity: lead?.preferredUniversity ?? LEAD_UNIVERSITIES[0],
    intake:            lead?.intake            ?? LEAD_INTAKES[0],
    leadSource:        lead?.leadSource        ?? LEAD_SOURCES[0],
    assignedAgent:     lead?.assignedAgent     ?? '',
    priority:          lead?.priority          ?? 'Medium',
    highestEducation:  lead?.highestEducation  ?? LEAD_EDUCATION[0],
    collegeName:       lead?.collegeName       ?? '',
    gpa:               lead?.gpa               ?? '',
    marketingAgency:   lead?.marketingAgency   ?? '',
    notes:             lead?.counsellingNotes?.[0]?.text ?? '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const data = {
      studentName: form.studentName.trim(), phone: form.phone.trim(), email: form.email.trim(),
      gender: form.gender || null, intake: form.intake,
      leadSource: form.leadSource, assignedAgent: form.assignedAgent || null,
      priority: form.priority, highestEducation: form.highestEducation,
      collegeName: form.collegeName.trim(), gpa: form.gpa.trim(), notes: form.notes.trim(),
      ...(isEdit ? { countryInterested: form.countryInterested, preferredUniversity: form.preferredUniversity } : {}),
      marketingAgency: form.marketingAgency.trim() || null,
    };
    if (!data.studentName || !data.phone) { onValidationError(); return; }
    onSubmit(data);
  };

  return (
    <AppDialog
      open onClose={onClose} size="920px"
      title={isEdit ? `Edit lead — ${lead.studentName}` : 'New Lead'}
      subtitle={isEdit ? `Update the record for ${lead.referenceId}.` : 'Capture a new student enquiry.'}
      footer={
        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
          <SecondaryButton size="small" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={submit}>
            {isEdit ? 'Save Changes' : 'Create Lead'}
          </PrimaryButton>
        </DialogActions>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
        <SectionLabel>Contact</SectionLabel>
        <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
          <Box><Typography sx={FIELD_LABEL}>Student name *</Typography><TextField fullWidth size="small" placeholder="e.g. Priya Verma" value={form.studentName} onChange={set('studentName')} /></Box>
          <Box><Typography sx={FIELD_LABEL}>Gender</Typography><TextField select fullWidth size="small" value={form.gender} onChange={set('gender')} slotProps={{ select: { native: true } }}><option value="">Not specified</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></TextField></Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Box><Typography sx={FIELD_LABEL}>Phone *</Typography><TextField fullWidth size="small" placeholder="+91 9xxxx xxxxx" value={form.phone} onChange={set('phone')} /></Box>
          <Box><Typography sx={FIELD_LABEL}>Email</Typography><TextField fullWidth size="small" type="email" placeholder="student@example.com" value={form.email} onChange={set('email')} /></Box>
        </Box>

        <SectionLabel>Academic</SectionLabel>
        {isEdit && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box><Typography sx={FIELD_LABEL}>Country interested</Typography><TextField select fullWidth size="small" value={form.countryInterested} onChange={set('countryInterested')} slotProps={{ select: { native: true } }}>{LEAD_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</TextField></Box>
            <Box><Typography sx={FIELD_LABEL}>Preferred university</Typography><TextField select fullWidth size="small" value={form.preferredUniversity} onChange={set('preferredUniversity')} slotProps={{ select: { native: true } }}>{LEAD_UNIVERSITIES.map((u) => <option key={u} value={u}>{u}</option>)}</TextField></Box>
          </Box>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
          <Box><Typography sx={FIELD_LABEL}>Intake</Typography><TextField select fullWidth size="small" value={form.intake} onChange={set('intake')} slotProps={{ select: { native: true } }}>{LEAD_INTAKES.map((i) => <option key={i} value={i}>{i}</option>)}</TextField></Box>
          <Box><Typography sx={FIELD_LABEL}>Highest education</Typography><TextField select fullWidth size="small" value={form.highestEducation} onChange={set('highestEducation')} slotProps={{ select: { native: true } }}>{LEAD_EDUCATION.map((e) => <option key={e} value={e}>{e}</option>)}</TextField></Box>
          <Box><Typography sx={FIELD_LABEL}>Priority</Typography><TextField select fullWidth size="small" value={form.priority} onChange={set('priority')} slotProps={{ select: { native: true } }}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</TextField></Box>
        </Box>

        <SectionLabel>Lead Info</SectionLabel>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
          <Box><Typography sx={FIELD_LABEL}>Lead source</Typography><TextField select fullWidth size="small" value={form.leadSource} onChange={set('leadSource')} slotProps={{ select: { native: true } }}>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</TextField></Box>
          <Box><Typography sx={FIELD_LABEL}>Marketing agency</Typography>
            <TextField select fullWidth size="small" value={form.marketingAgency} onChange={set('marketingAgency')} slotProps={{ select: { native: true } }}>
              <option value="">Select agency</option>
              {LEAD_MARKETING_AGENCIES.map((a) => <option key={a} value={a}>{a}</option>)}
            </TextField>
          </Box>
          <Box><Typography sx={FIELD_LABEL}>Assigned agent</Typography>
            <TextField select fullWidth size="small" value={form.assignedAgent} onChange={set('assignedAgent')} slotProps={{ select: { native: true } }}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.name}>{u.name} · {u.role}</option>)}
            </TextField>
          </Box>
        </Box>

        {isEdit && (
          <>
            <SectionLabel>Education Details</SectionLabel>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box><Typography sx={FIELD_LABEL}>College / university</Typography><TextField fullWidth size="small" value={form.collegeName} onChange={set('collegeName')} /></Box>
              <Box><Typography sx={FIELD_LABEL}>GPA / %</Typography><TextField fullWidth size="small" placeholder="e.g. 8.2 / 10" value={form.gpa} onChange={set('gpa')} /></Box>
            </Box>
          </>
        )}

        <SectionLabel>Notes</SectionLabel>
        <TextField fullWidth multiline minRows={3} placeholder="Initial notes about this enquiry…" value={form.notes} onChange={set('notes')} />
      </Box>
    </AppDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FOLLOW-UP DIALOG
   ═══════════════════════════════════════════════════════════════════ */
function FollowUpDialog({ lead, onClose, onSave }) {
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const [lastContacted, setLastContacted] = useState(today());
  const [callOutcome,   setCallOutcome]   = useState('Interested');
  const [nextFollowUp,  setNextFollowUp]  = useState('');
  const [reminder,      setReminder]      = useState('');
  const [notes,         setNotes]         = useState('');

  return (
    <AppDialog
      open onClose={onClose} size="sm"
      title={`Log follow-up — ${lead.studentName}`}
      subtitle={`${lead.referenceId} · current status ${lead.status}`}
      footer={
        <DialogActions>
          <SecondaryButton size="small" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton size="small" startIcon={<EventNoteIcon sx={{ fontSize: 14 }} />} onClick={() => onSave({ lastContacted, callOutcome, nextFollowUp, reminder, notes })}>
            Save Follow-up
          </PrimaryButton>
        </DialogActions>
      }
    >
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField type="date" label="Last contacted"     size="small" value={lastContacted} onChange={(e) => setLastContacted(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: '1 1 180px' }} />
          <TextField type="date" label="Next follow-up date" size="small" value={nextFollowUp}  onChange={(e) => setNextFollowUp(e.target.value)}  slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: '1 1 180px' }} />
        </Box>
        <TextField select label="Call outcome" value={callOutcome} onChange={(e) => setCallOutcome(e.target.value)} slotProps={{ select: { native: true } }}>
          {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
        </TextField>
        <TextField label="Reminder" placeholder="e.g. Morning call — share fee sheet" value={reminder} onChange={(e) => setReminder(e.target.value)} />
        <TextField label="Notes" multiline minRows={3} placeholder="What happened during this follow-up?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Stack>
    </AppDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ASSIGN DIALOG
   ═══════════════════════════════════════════════════════════════════ */
function AssignDialog({ lead, ids, users, onClose, onAssign }) {
  const [agent, setAgent] = useState(lead?.assignedAgent ?? '');
  const label = lead ? lead.studentName : `${ids?.length ?? 0} leads`;
  return (
    <AppDialog
      open onClose={onClose} size="sm"
      title={`Assign agent — ${label}`}
      subtitle="Choose which counsellor should own this lead."
      footer={
        <DialogActions>
          <SecondaryButton size="small" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton size="small" startIcon={<PersonAddAlt1Icon sx={{ fontSize: 14 }} />} onClick={() => onAssign(agent)}>Assign</PrimaryButton>
        </DialogActions>
      }
    >
      <TextField select label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} slotProps={{ select: { native: true } }} fullWidth>
        <option value="">Unassigned</option>
        {users.map((u) => <option key={u.id} value={u.name}>{u.name} · {u.role}</option>)}
      </TextField>
    </AppDialog>
  );
}

export default function LeadManagement({ routePayload }) {
  const { push }           = useToast();
  const routerNavigate     = useNavigate();
  const { invalidate }     = useCache();
  const [dialog,    setDialog]    = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [users,     setUsers]     = useState([]);

  /* ── View state (pipeline tab) ─────────────────────────────── */
  const [activeView, setActiveView] = useState('all');

  /* ── Toolbar filter state (compact: agent + priority only) ── */
  const [filters, setFilters] = useState(() => ({
    assignedAgent: 'all',
    priority: 'all',
    ...(routePayload?.initialFilters?.priority ? { priority: routePayload.initialFilters.priority } : {}),
    ...(routePayload?.initialFilters?.assignedAgent ? { assignedAgent: routePayload.initialFilters.assignedAgent } : {}),
  }));

  /* ── Secondary filters (More Filters popover) ─────────────── */
  const [secondaryFilters, setSecondaryFilters] = useState(() => ({
    status: 'all',
    country: 'all',
    intake: 'all',
    leadSource: 'all',
    dateFrom: '',
    dateTo: '',
    rawStatus: routePayload?.initialFilters?.rawStatus ?? 'all',
    specialFilter: routePayload?.initialFilters?.specialFilter ?? '',
  }));
  const [moreFiltersAnchor, setMoreFiltersAnchor] = useState(null);
  const moreFiltersOpen = Boolean(moreFiltersAnchor);

  /* ── Column visibility ─────────────────────────────────────── */
  const ALL_COLUMNS = useMemo(() => [
    { key: 'studentName',      label: 'Student',      visible: true },
    { key: 'leadSource',       label: 'Source',        visible: true },
    { key: 'lifecycleStage',   label: 'Current Status',       visible: true },
    { key: 'countryInterested',label: 'Destination',   visible: true },
    { key: 'priority',         label: 'Priority',      visible: true },
    { key: 'assignedAgent',    label: 'Agent',         visible: true },
    { key: 'highestEducation', label: 'Academic',      visible: false },
    { key: 'tasa',             label: 'TASA',          visible: true },
  ], []);
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const vis = {};
    ALL_COLUMNS.forEach((c) => { vis[c.key] = c.visible; });
    return vis;
  });
  const [colMenuAnchor, setColMenuAnchor] = useState(null);

  /* ── Server pagination + search state ──────────────────────── */
  const [serverPage,     setServerPage]     = useState(0);
  const [serverPageSize, setServerPageSize] = useState(25);
  const [searchInput,    setSearchInput]    = useState('');
  const [serverSearch,   setServerSearch]   = useState('');

  /* ── Map active view → server params ───────────────────────── */
  const viewServerParams = useMemo(() => TAB_SERVER_PARAMS[activeView] || {}, [activeView]);

  useEffect(() => { const t = setTimeout(() => setServerSearch(searchInput), 300); return () => clearTimeout(t); }, [searchInput]);
  useEffect(() => { setServerPage(0); }, [serverSearch, activeView, filters.assignedAgent, filters.priority, secondaryFilters.rawStatus, secondaryFilters.specialFilter]);

  /* ── Fetch ──────────────────────────────────────────────────────────
     rawStatus / specialFilter / priority are real server-side filters the
     backend already implements (lead.controller.js getLeads) — they must be
     sent on every fetch, not just applied client-side against whatever page
     happens to come back, or a KPI/dropdown filter only ever sees a handful
     of matches out of the current unfiltered page instead of the true set. */
  const fetchLeadsData = useCallback(async () => {
    return fetchLeadsPaginated({
      page: serverPage + 1,
      limit: serverPageSize,
      ...(serverSearch                              ? { search: serverSearch }                       : {}),
      ...(viewServerParams.stage                     ? { stage: viewServerParams.stage }               : {}),
      ...(secondaryFilters.rawStatus !== 'all'       ? { rawStatus: secondaryFilters.rawStatus }        : {}),
      ...(filters.priority !== 'all'                 ? { priority: filters.priority }                   : {}),
      ...(secondaryFilters.specialFilter             ? { specialFilter: secondaryFilters.specialFilter } : {}),
      sort: 'createdAt', sortDir: 'desc',
    });
  }, [serverPage, serverPageSize, serverSearch, viewServerParams, secondaryFilters.rawStatus, secondaryFilters.specialFilter, filters.priority]);

  const leadsKey = useMemo(
    () => `leads-mgmt-v${activeView}-p${serverPage}-l${serverPageSize}-s${serverSearch}-a${filters.assignedAgent}-pri${filters.priority}-raw${secondaryFilters.rawStatus}-sf${secondaryFilters.specialFilter}`,
    [activeView, serverPage, serverPageSize, serverSearch, filters.assignedAgent, filters.priority, secondaryFilters.rawStatus, secondaryFilters.specialFilter]
  );

  const { data: leadsResult, error, loading, refetch } = useCachedFetch(leadsKey, fetchLeadsData, { staleTime: 10_000 });

  const rowsList   = leadsResult?.leads      ?? [];
  const pagination = leadsResult?.pagination ?? null;

  useEffect(() => {
    fetchSupervisorUsers().then((u) => setUsers(u.filter((x) => x.roleCode === 'agent'))).catch(() => {});
  }, []);

  useEffect(() => {
    if (routePayload?.openLeadId) routerNavigate(`/leads/${routePayload.openLeadId}`);
  }, [routePayload, routerNavigate]);

  const openWorkspace = useCallback((l) => routerNavigate(`/leads/${l.id}`), [routerNavigate]);

  /* ── Client-side filtering (toolbar + secondary) ───────────── */
  const filterOptions = useMemo(() => {
    const all = (key) => [...new Set(rowsList.map((r) => r[key]).filter((v) => v && v !== '—'))];
    return { status: all('status'), priority: all('priority'), assignedAgent: all('assignedAgent'), country: all('countryInterested'), intake: all('intake'), leadSource: all('leadSource') };
  }, [rowsList]);

  const visible = useMemo(() => {
    let list = rowsList;
    /* Pipeline view match (for tabs without server-side mapping) */
    /* Pipeline view match (client-side, same logic as counts) */
    if (activeView !== 'all' && PIPELINE_MATCH[activeView]) {
      list = list.filter(PIPELINE_MATCH[activeView]);
    }
    /* Toolbar filters */
    if (filters.assignedAgent !== 'all') list = list.filter((l) => l.assignedAgent === filters.assignedAgent);
    if (filters.priority      !== 'all') list = list.filter((l) => l.priority      === filters.priority);
    /* Secondary filters */
    if (secondaryFilters.status       !== 'all') list = list.filter((l) => l.status           === secondaryFilters.status);
    if (secondaryFilters.country      !== 'all') list = list.filter((l) => l.countryInterested === secondaryFilters.country);
    if (secondaryFilters.intake       !== 'all') list = list.filter((l) => l.intake            === secondaryFilters.intake);
    if (secondaryFilters.leadSource   !== 'all') list = list.filter((l) => l.leadSource        === secondaryFilters.leadSource);
    if (secondaryFilters.dateFrom) list = list.filter((l) => new Date(l.createdDate) >= new Date(secondaryFilters.dateFrom));
    if (secondaryFilters.dateTo)   { const end = new Date(secondaryFilters.dateTo); end.setDate(end.getDate()+1); list = list.filter((l) => new Date(l.createdDate) < end); }
    if (secondaryFilters.rawStatus    && secondaryFilters.rawStatus    !== 'all') list = list.filter((l) => l.rawStatus    === secondaryFilters.rawStatus);
    if (secondaryFilters.specialFilter === 'unassigned') list = list.filter((l) => !l.assignedAgent);
    if (secondaryFilters.specialFilter === 'stalled') {
      const cutoff = Date.now() - 14*24*60*60*1000;
      list = list.filter((l) => { const last = l.lastFollowUp ? new Date(l.lastFollowUp).getTime() : new Date(l.createdDate).getTime(); return last <= cutoff; });
    }
    return list;
  }, [rowsList, filters, secondaryFilters, activeView]);

  /* Counts per view, computed with the EXACT same PIPELINE_MATCH the table
     uses, so the tab numbers and the filtered rows can never disagree. */
  const tabCounts = useMemo(() => {
    const base = { all: 0, new: 0, contacted: 0, p1: 0, p2: 0, registration: 0, submitted: 0 };
    rowsList.forEach((l) => {
      base.all++;
      Object.keys(PIPELINE_MATCH).forEach((k) => {
        if (PIPELINE_MATCH[k](l)) base[k]++;
      });
    });
    return base;
  }, [rowsList]);

  /* Map counts → the per-tab display count (total uses server pagination total
     when available so it reflects the full result set). */
  const tabDisplayCounts = useMemo(() => ({
    all:          pagination?.total ?? tabCounts.all,
    new:          tabCounts.new,
    contacted:    tabCounts.contacted,
    p1:           tabCounts.p1,
    p2:           tabCounts.p2,
    registration: tabCounts.registration,
    submitted:    tabCounts.submitted,
  }), [tabCounts, pagination]);

  const hasActiveSecondary = Object.entries(secondaryFilters).some(([k, v]) => {
    if (k === 'dateFrom' || k === 'dateTo') return !! v;
    return v !== 'all';
  });                   

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const setSecondary = (key) => (e) => setSecondaryFilters((f) => ({ ...f, [key]: e.target.value }));
  const clearSecondary = () => setSecondaryFilters({ status: 'all', country: 'all', intake: 'all', leadSource: 'all', dateFrom: '', dateTo: '', rawStatus: 'all', specialFilter: '' });

  /* ── Handlers ───────────────────────────────────────────────── */
  const closeDialog   = () => setDialog(null);
  const named = (ids) => ids.length === 1 ? rowsList.find((l) => l.id === ids[0])?.studentName || 'Lead' : `${ids.length} leads`;

  const persistLead = async (id, payload) => {
    try { await updateLeadApi(id, payload); }
    catch (err) { push(err?.response?.data?.message || 'Could not update lead', 'danger'); }
  };

  const createLead = async (data) => {
    try {
      const lead = await createLeadApi(data);
      if (lead) { refetch(); invalidate('supervisor-attention'); invalidate('supervisor-queues'); invalidate('supervisor-dashboard-summary'); return lead; }
      return null;
    } catch (err) { push(err?.response?.data?.message || err?.message || 'Failed to create lead', 'danger'); return null; }
  };

  const assignLead  = (ids, agent) => { ids.forEach((id) => persistLead(id, { assignedAgent: agent || '' })); refetch(); invalidate('supervisor-attention'); invalidate('supervisor-queues'); invalidate('supervisor-dashboard-summary'); };
  const changeStatus = (ids, status) => { ids.forEach((id) => persistLead(id, { status })); refetch(); invalidate('supervisor-attention'); };

  const handleCreateLead = async (data) => { const c = await createLead(data); setDialog(null); if (c) push(`Lead created for ${data.studentName}`, 'success'); };
  const handleUpdateLead = async (lead, data) => {
    try { await updateLeadApi(lead.id, data); refetch(); invalidate('supervisor-attention'); invalidate('supervisor-queues'); invalidate('supervisor-dashboard-summary'); push(`${lead.studentName} updated`, 'success'); }
    catch (err) { push(err?.response?.data?.message || 'Could not update lead', 'danger'); }
    setDialog(null);
  };
  const applyAssign  = (agent) => { if (!dialog) return; assignLead(dialog.ids, agent || null); setDialog(null); push(`${named(dialog.ids)} assigned to ${agent || 'unassigned queue'}`, 'success'); };
  const advanceStage = (lead) => { const next = NEXT_STATUS[lead.status]; if (!next) return; changeStatus([lead.id], next); push(`${lead.studentName} advanced to ${next}`, 'success'); };
  const saveFollowUp = (lead, data) => {
    const now = new Date().toISOString();
    const contactedAt = data.lastContacted ? new Date(`${data.lastContacted}T10:00:00`).toISOString() : now;
    const payload = { lastFollowUp: contactedAt, lastCallOutcome: data.callOutcome || lead.lastCallOutcome, nextFollowUp: data.nextFollowUp ? new Date(`${data.nextFollowUp}T09:00:00`).toISOString() : lead.nextFollowUp, reminder: data.reminder || lead.reminder };
    if (data.notes) payload.counsellingNotes = [...(lead.counsellingNotes || []), { id: `n${Date.now()}`, at: contactedAt, agent: lead.assignedAgent || 'Unassigned', text: data.notes }];
    persistLead(lead.id, payload); refetch(); setDialog(null); push(`Follow-up logged for ${lead.studentName}`, 'success');
  };
  const openCti              = (lead) => push(`Opening CTI desk for ${lead.studentName}…`, 'info');
  const sendRegistrationLink = (lead) => { persistLead(lead.id, { timeline: lead.timeline }); refetch(); push(`Registration link sent to ${lead.studentName}`, 'success'); };
  const refreshLeads         = () => { refetch(); push('Leads refreshed', 'success'); };
  const handleExport = async (rows) => {
    const ids = (rows || []).map((r) => r.id).filter(Boolean);
    if (!ids.length) { push('No leads to export', 'warning'); return; }
    try { const blob = await exportLeadReportApi(ids); saveBlob(blob, `Lead_Management_Report_${exportStamp()}.xlsx`); push('Report downloaded', 'success'); }
    catch (err) { push(err?.response?.data?.message || 'Failed to export report', 'danger'); }
  };

  /* ── Bulk actions (from contextual toolbar) ────────────────── */

  /* ── Row menu ──────────────────────────────────────────────── */
  const [rowMenu, setRowMenu]       = useState(null);
  const [addMenu, setAddMenu]       = useState(null);
  const [exportMenu, setExportMenu] = useState(null);
  const filteredRef = useRef([]);
  useEffect(() => { filteredRef.current = visible; }, [visible]);
  const closeRowMenu   = () => setRowMenu(null);
  const runRowAction   = (fn) => { const lead = rowMenu?.lead; closeRowMenu(); if (lead) fn(lead); };

  /* ── Table columns (enterprise CRM style) ─────────────────── */
  const columns = useMemo(() => {
    const cols = [];

    cols.push({
      key: 'studentName', label: 'Student', sortable: true, width: 220,
      render: (_v, row) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography component="span" onClick={() => openWorkspace(row)}
            sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'text.primary', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}>
            {row.studentName || '—'}
          </Typography>
          {row.referenceId && (
            <Typography sx={{ fontSize: 10, color: 'text.disabled', fontFamily: 'monospace', lineHeight: 1.4, letterSpacing: '0.02em' }}>{row.referenceId}</Typography>
          )}
        </Box>
      ),
    });

    if (columnVisibility.leadSource) {
      cols.push({
        key: 'leadSource', label: 'Source', sortable: true, width: 130,
        accessor: (row) => leadSourceName(row),
        render: (_v, row) => <SourceCell lead={row} />,
      });
    }

    if (columnVisibility.lifecycleStage) {
      cols.push({
        key: 'lifecycleStage', label: 'Current Status', sortable: false, width: 150,
        render: (_v, row) => {
          const stage = row.lifecycleStage || row.lifecycle?.stage;
          if (!stage) return <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>;
          const label = stageLabel(stage);
          return (
            <StatusChip
              status={label}
              tone={statusPillTone(stage)}
              dot={false}
              size="small"
              sx={STATUS_PILL_SX}
              title={row.lifecycle?.waitingOn ? `${label} · waiting on ${row.lifecycle.waitingOn}` : label}
            />
          );
        },
      });
    }

    if (columnVisibility.countryInterested) {
      cols.push({
        key: 'countryInterested', label: 'Destination', sortable: true, width: 140,
        render: (_v, row) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <CountryLabel value={row.countryInterested} fallback="—" />
            </Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled', lineHeight: 1.4 }}>{row.intake || '—'}</Typography>
          </Box>
        ),
      });
    }

    if (columnVisibility.priority) {
      cols.push({
        key: 'priority', label: 'Priority', sortable: true, width: 80,
        render: (v) => <Typography sx={{ fontSize: 11, ...PRIORITY_STYLE[v], color: PRIORITY_STYLE[v]?.color || 'text.disabled' }}>{v || '—'}</Typography>,
      });
    }

    if (columnVisibility.assignedAgent) {
      cols.push({
        key: 'assignedAgent', label: 'Agent', sortable: true, width: 130,
        render: (v) => <Typography noWrap sx={{ fontSize: 12, color: v ? 'text.primary' : 'text.disabled' }}>{v || 'Unassigned'}</Typography>,
      });
    }

    if (columnVisibility.highestEducation) {
      cols.push({
        key: 'highestEducation', label: 'Academic', sortable: true, width: 140,
        render: (_v, row) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, lineHeight: 1.3 }}>{row.highestEducation || '—'}</Typography>
            {row.collegeName && <Typography sx={{ fontSize: 10.5, color: 'text.disabled', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>{row.collegeName}</Typography>}
          </Box>
        ),
      });
    }

    if (columnVisibility.tasa) {
      cols.push({
        key: 'tasa', label: 'TASA', sortable: false, width: 80,
        render: (_v, row) => tasacell(row),
      });
    }

    return cols;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnVisibility]);

  const visibleColumnCount = columns.length;

  /* ── Filter toolbar ────────────────────────────────────────── */
  const activeSecondaryCount = useMemo(
    () => Object.entries(secondaryFilters).filter(([k, v]) => (k === 'dateFrom' || k === 'dateTo') ? !!v : v !== 'all').length,
    [secondaryFilters]
  );
  const toolbar = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5, px: 0.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
      <SearchField
        placeholder="Search name, Lead ID, phone or email…"
        sx={{ minWidth: 200, flex: '1 1 280px', maxWidth: 800, '& .MuiOutlinedInput-root': { minHeight: 30 } }}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />

      <FilterSelect label="Agent" value={filters.assignedAgent} onChange={setFilter('assignedAgent')}
        options={[{ value: 'all', label: 'All Agents' }, ...filterOptions.assignedAgent.map((v) => ({ value: v, label: v }))]}
        sx={{ minWidth: 100, flex: '0 0 30px',maxWidth: 200 }} />

      <FilterSelect label="Priority" value={filters.priority} onChange={setFilter('priority')}
        options={[{ value: 'all', label: 'All Priorities' }, ...filterOptions.priority.map((v) => ({ value: v, label: v }))]}
        sx={{ minWidth: 100, flex: '0 0 30px',maxWidth: 200  }} />

      {/* More Filters button */}
      <Tooltip title={hasActiveSecondary ? 'Filters active — click to manage' : 'More filters'}>
        <span>
          <SecondaryButton
            size="small"
            startIcon={<FilterListIcon sx={{ fontSize: 14 }} />}
            onClick={(e) => setMoreFiltersAnchor(e.currentTarget)}
            sx={{
              minWidth: 0, px: 1, fontSize: 12.5, height: 30,maxWidth: 200 ,  textTransform: 'none',
              ...(hasActiveSecondary && { borderColor: 'primary.main', color: 'primary.main' }),
            }}
          >
            {hasActiveSecondary ? `Filters ${activeSecondaryCount}` : 'Filters'}
          </SecondaryButton>
        </span>
      </Tooltip>

      {/* Column visibility */}
      <Tooltip title="Toggle columns">
        <span>
          <SecondaryButton size="small" onClick={(e) => setColMenuAnchor(e.currentTarget)} sx={{ minWidth: 0, px: 0.75, height: 30,maxWidth: 200  }}>
            <ViewColumnIcon sx={{ fontSize: 15 }} />
          </SecondaryButton>
        </span>
      </Tooltip>

      {/* Export */}
      <SecondaryButton size="small" startIcon={<FileDownloadIcon sx={{ fontSize: 13 }} />} onClick={(e) => setExportMenu(e.currentTarget)} sx={{ minWidth: 0, px: 1, fontSize: 12.5, height: 30,maxWidth: 200 , textTransform: 'none' }}>
        Export
      </SecondaryButton>

      {/* Refresh */}
      <Tooltip title="Refresh leads">
        <span>
          <SecondaryButton size="small" onClick={refreshLeads} sx={{ minWidth:100 , px: 0.75, height: 30,maxWidth: 200  }}>
            <RefreshIcon sx={{ fontSize: 15 }} />
          </SecondaryButton>
        </span>
      </Tooltip>
    </Box>
  );
 
  return (
    <>
      <CrmListShell
        title="Lead Management"
        headerActions={
          <PrimaryButton size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={(e) => setAddMenu(e.currentTarget)}>
            Add Lead
          </PrimaryButton>
        }
        tabs={PIPELINE_TABS.map((t) => ({ key: t.key, label: t.label, count: tabDisplayCounts[t.key] ?? 0 }))}
        activeTab={activeView}
        onTabChange={setActiveView}
        error={error ? <><strong>Could not load leads.</strong> {error}</> : null}
        onRetry={refreshLeads}
      >
        <DataTable
          columns={columns}
          data={visible}
          keyField="id"
          loading={loading}
          dense
          emptyTitle="No leads found"
          emptyText="Leads will appear here once added to the system."
          toolbar={toolbar}
          controlledPage={serverPage}
          onPageChange={(_, p) => setServerPage(p)}
          controlledPageSize={serverPageSize}
          onPageSizeChange={(s) => { setServerPageSize(s); setServerPage(0); }}
          totalCount={pagination?.total ?? 0}
          pageSizeOptions={[10, 25, 50]}
          renderActions={(row) => (
            <AppIconButton title="Lead actions" aria-label={`Actions for ${row.studentName || 'lead'}`}
              onClick={(e) => { e.stopPropagation(); setRowMenu({ anchorEl: e.currentTarget, lead: row }); }}>
              <MoreVertIcon sx={{ fontSize: 17 }} />
            </AppIconButton>
          )}
          containerSx={{ maxHeight: 'calc(100vh - 260px)' }}
        />
      </CrmListShell>

      {/* ═══════════════════════════════════════════════════════
         Popover menus & dialogs
         ═══════════════════════════════════════════════════════ */}

      {/* ── More Filters Popover ──────────────────────────────── */}
      <Popover
        open={moreFiltersOpen}
        anchorEl={moreFiltersAnchor}
        onClose={() => setMoreFiltersAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 340, p: 2, mt: 0.5 } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>More Filters</Typography>
          {hasActiveSecondary && (
            <Button size="small" onClick={clearSecondary} sx={{ fontSize: 11.5, textTransform: 'none', color: 'primary.main' }}>Clear all</Button>
          )}
        </Box>

        <Stack spacing={1.75}>
          <FilterSelect label="Disposition" value={secondaryFilters.status} onChange={setSecondary('status')}
            options={[{ value: 'all', label: 'All Dispositions' }, ...filterOptions.status.map((v) => ({ value: v, label: v }))]} fullWidth />
          <FilterSelect label="Lifecycle" value={secondaryFilters.rawStatus} onChange={setSecondary('rawStatus')}
            options={[{ value: 'all', label: 'All Stages' }, ...LIFECYCLE_ALL_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))]} fullWidth />
          <FilterSelect label="Source" value={secondaryFilters.leadSource} onChange={setSecondary('leadSource')}
            options={[{ value: 'all', label: 'All Sources' }, ...filterOptions.leadSource.map((v) => ({ value: v, label: v }))]} fullWidth />
          <FilterSelect label="Country" value={secondaryFilters.country} onChange={setSecondary('country')}
            options={[{ value: 'all', label: 'All Countries' }, ...filterOptions.country.map((v) => ({ value: v, label: v }))]} fullWidth />
          <FilterSelect label="Intake" value={secondaryFilters.intake} onChange={setSecondary('intake')}
            options={[{ value: 'all', label: 'All Intakes' }, ...filterOptions.intake.map((v) => ({ value: v, label: v }))]} fullWidth />

          <Box>
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.secondary', mb: 0.75 }}>Date Range</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField type="date" size="small" label="From" value={secondaryFilters.dateFrom} onChange={setSecondary('dateFrom')}
                slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
              <TextField type="date" size="small" label="To" value={secondaryFilters.dateTo} onChange={setSecondary('dateTo')}
                slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            </Box>
          </Box>
        </Stack>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <PrimaryButton size="small" onClick={() => setMoreFiltersAnchor(null)}>
            Apply
          </PrimaryButton>
        </Box>
      </Popover>

      {/* ── Column Visibility Menu ────────────────────────────── */}
      <Menu anchorEl={colMenuAnchor} open={Boolean(colMenuAnchor)} onClose={() => setColMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 180, p: 0.5 } } }}>
        {ALL_COLUMNS.map((col) => (
          <MenuItem key={col.key} dense disableRipple
            onClick={() => setColumnVisibility((v) => ({ ...v, [col.key]: !v[col.key] }))}>
            <Checkbox size="small" checked={!!columnVisibility[col.key]}
              sx={{ mr: 0.5, p: 0.25, '&.Mui-checked': { color: 'primary.main' } }} />
            <ListItemText primaryTypographyProps={{ fontSize: 12.5 }}>{col.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {/* ── Per-row context menu ──────────────────────────────── */}
      <Menu
        anchorEl={rowMenu?.anchorEl ?? null}
        open={Boolean(rowMenu)}
        onClose={closeRowMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        <MenuItem dense onClick={() => runRowAction(openWorkspace)}>
          <ListItemIcon><PersonIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Open Student 360</ListItemText>
        </MenuItem>
        <MenuItem dense onClick={() => runRowAction((l) => setDialog({ type: 'edit', lead: l }))}>
          <ListItemIcon><EditIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Edit Lead</ListItemText>
        </MenuItem>
        <MenuItem dense onClick={() => runRowAction((l) => setDialog({ type: 'followup', lead: l }))}>
          <ListItemIcon><EventNoteIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Log Follow-up</ListItemText>
        </MenuItem>
        <MenuItem dense onClick={() => runRowAction((l) => setDialog({ type: 'assign', lead: l, ids: [l.id] }))}>
          <ListItemIcon><PersonAddAlt1Icon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Assign Counsellor</ListItemText>
        </MenuItem>
        {rowMenu?.lead && NEXT_STATUS[rowMenu.lead.status] && (
          <MenuItem dense onClick={() => runRowAction(advanceStage)}>
            <ListItemIcon><ArrowForwardIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Advance to {NEXT_STATUS[rowMenu.lead.status]}</ListItemText>
          </MenuItem>
        )}
        <Divider />
        <MenuItem dense onClick={() => runRowAction(openCti)}>
          <ListItemIcon><PhoneIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Open CTI</ListItemText>
        </MenuItem>
        <MenuItem dense onClick={() => runRowAction(sendRegistrationLink)}>
          <ListItemIcon><LinkIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Send Registration Link</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Add Lead menu ─────────────────────────────────────── */}
      <Menu anchorEl={addMenu} open={Boolean(addMenu)} onClose={() => setAddMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem dense onClick={() => { setAddMenu(null); setDialog({ type: 'new' }); }}>
          <ListItemIcon><AddIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Add Lead</ListItemText>
        </MenuItem>
        <MenuItem dense onClick={() => { setAddMenu(null); setImportOpen(true); }}>
          <ListItemIcon><UploadFileIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Bulk Upload</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Export menu ────────────────────────────────────────── */}
      <Menu anchorEl={exportMenu} open={Boolean(exportMenu)} onClose={() => setExportMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem dense onClick={() => { setExportMenu(null); handleExport(filteredRef.current); }}>
          <ListItemIcon><FileDownloadIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Lead Management Report</ListItemText>
        </MenuItem>
        <MenuItem dense onClick={() => { setExportMenu(null); handleExport(filteredRef.current); }}>
          <ListItemIcon><EventNoteIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>Remarks Report</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Import modal ──────────────────────────────────────── */}
      <ImportLeadsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          refreshLeads();
          invalidate('supervisor-attention'); invalidate('supervisor-queues'); invalidate('supervisor-dashboard-summary');
          push('Leads imported', 'success');
        }}
      />

      {/* ── Dialogs ───────────────────────────────────────────── */}
      {dialog?.type === 'new' && (
        <LeadFormDialog mode="create" users={users} onClose={closeDialog}
          onSubmit={handleCreateLead}
          onValidationError={() => push('Please fill in student name and phone', 'warning')} />
      )}
      {dialog?.type === 'edit' && dialog?.lead && (
        <LeadFormDialog mode="edit" lead={dialog.lead} users={users} onClose={closeDialog}
          onSubmit={(data) => handleUpdateLead(dialog.lead, data)}
          onValidationError={() => push('Please fill in student name and phone', 'warning')} />
      )}
      {dialog?.type === 'assign' && (
        <AssignDialog lead={dialog.lead} ids={dialog.ids} users={users} onClose={closeDialog} onAssign={applyAssign} />
      )}
      {dialog?.type === 'followup' && dialog?.lead && (
        <FollowUpDialog lead={dialog.lead} onClose={closeDialog} onSave={(data) => saveFollowUp(dialog.lead, data)} />
      )}
    </>
  );
}
