import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Grid, IconButton, Popover, Skeleton, TextField, Tooltip, Typography } from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import GroupIcon from '@mui/icons-material/Group';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PersonIcon from '@mui/icons-material/Person';
import PublicIcon from '@mui/icons-material/Public';
import SchoolIcon from '@mui/icons-material/School';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import ChecklistIcon from '@mui/icons-material/Checklist';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import client from '../api/client.js';
import { auditEvent } from '../api/audit.js';
import { useLookups } from '../api/useLookups.js';
import UniversityFinderPanel from './university/UniversityFinderPanel.jsx';
import ShortlistPanel from './university/ShortlistPanel.jsx';
import ApplicationsPanel from './application/ApplicationsPanel.jsx';
import { useApplications } from '../hooks/useApplications.js';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';

/* ==========================================================================
   STUDENT PROFILE — editable data-entry panel (center column).
   The compact Student Summary Strip sits at the top (identity, contact,
   lead facts); below it the tabbed sections (Personal, Academic, Study
   Preferences, Reference) keep only one section visible at a time. Only
   the active tab renders. The editable tabs appear only for the
   'Interested' disposition; other dispositions show only the summary.
   The workspace-level bottom action bar (profile state + Discard +
   Submit Disposition) lives in AgentWorkspace and always stays visible.
   The form state itself is owned by the Agent Workspace so the disposition
   form can validate and persist profile changes together — this panel only
   edits it via the props below.
   MUI migration — same form state, validation and tab logic, only the
   presentation uses MUI.
   ========================================================================== */

const EDUCATION_LEVELS = [
  'High School',
  "Bachelor's Degree",
  "Master's Degree",
  "Doctorate / PhD",
  'Diploma',
  'Other',
];

const GENDERS = ['Male', 'Female', 'Other'];

const buildIntakeOptions = () => {
  const year = new Date().getFullYear();
  const options = [];
  for (let y = year; y <= year + 2; y += 1) {
    options.push(`Fall ${y}`);
    options.push(`Spring ${y + 1}`);
  }
  return options;
};

const INTAKE_OPTIONS = buildIntakeOptions();

const TABS = [
  { id: 'personal',     label: 'Personal',          icon: <PersonIcon sx={{ fontSize: 15 }} /> },
  { id: 'academic',     label: 'Academic',          icon: <SchoolIcon sx={{ fontSize: 15 }} /> },
  { id: 'preferences',  label: 'Study Preferences', icon: <PublicIcon sx={{ fontSize: 15 }} /> },
  { id: 'universities', label: 'Find Universities', icon: <TravelExploreIcon sx={{ fontSize: 15 }} /> },
  { id: 'shortlist',    label: 'Shortlist',         icon: <ChecklistIcon sx={{ fontSize: 15 }} /> },
  { id: 'applications', label: 'Applications',      icon: <AssignmentOutlinedIcon sx={{ fontSize: 15 }} /> },
  { id: 'reference',    label: 'Reference',         icon: <GroupIcon sx={{ fontSize: 15 }} /> },
];

const MAX_PREFS = 3;

const initialsOf = (name = '') =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const display = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v.trim() || '—';
  return v.name || v.code || v.label || '—';
};

// Partially masks a contact value: reveals enough to identify the contact
// without ever exposing the complete value. Email keeps the leading half of
// the local part plus the full domain; mobile keeps a leading prefix and the
// trailing digits while masking the middle. Used by the Personal Information
// Email/Mobile fields so the header's View → Reveal stays the only full view.
const partialMask = (value, type) => {
  const s = value == null ? '' : String(value).trim();
  if (!s) return '';
  const bullet = '•';
  if (type === 'email') {
    const at = s.indexOf('@');
    if (at > 0) {
      const local = s.slice(0, at);
      const domain = s.slice(at + 1);
      const keep = Math.max(1, Math.min(local.length, Math.ceil(local.length / 2)));
      const hidden = Math.max(0, local.length - keep);
      return `${local.slice(0, keep)}${bullet.repeat(hidden)}@${domain}`;
    }
  }
  const keepStart = Math.min(6, s.length);
  const keepEnd = s.length > keepStart ? Math.min(4, Math.max(1, s.length - keepStart)) : 0;
  if (keepStart + keepEnd >= s.length) {
    const keep = Math.max(1, Math.ceil(s.length / 2));
    const tail = s.length > keep ? s.slice(-1) : '';
    const hidden = Math.max(1, s.length - keep - tail.length);
    return `${s.slice(0, keep)}${bullet.repeat(hidden)}${tail}`;
  }
  return `${s.slice(0, keepStart)}${bullet.repeat(s.length - keepStart - keepEnd)}${s.slice(-keepEnd)}`;
};

// ── Small presentational helpers ───────────────────────────────────
function SectionTitle({ icon, title }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'text.primary', mb: 1 }}>
      <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
        {icon}
      </Box>
      {title}
      <Box sx={{ flex: 1, height: 1, bgcolor: 'divider', ml: 0.5 }} />
    </Box>
  );
}

// Small labeled detail rendered inside the compact agent Workspace student
// header as a compact pill ("INTAKE  Spring 2027"). The label and value are
// always visible; the value compresses with an ellipsis when the viewport
// narrows so the single header bar never overflows.
function HeaderDetail({ label, value }) {
  const text = display(value);
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0, height: 26, borderRadius: '999px', px: 1, bgcolor: 'primary.soft', border: 1, borderColor: 'primary.border', color: 'text.secondary', flexShrink: 1 }}>
      <Box component="span" sx={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'inherit', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: 160 }} title={text}>
        {text}
      </Box>
    </Box>
  );
}

// ── Quick-contact reveal pill (Email / Mobile) ─────────────────────────
// Sensitive contact values are hidden by default: the pill shows only the
// uppercase field label plus a small VIEW affordance on hover. Clicking the
// pill (or View, or tapping on touch) opens a small popover with the actual
// value, which stays selectable and copyable. Clicking outside closes it.
// The value is never placed in hover titles or aria attributes — only inside
// the popover.
// The audit event records WHO revealed WHICH lead's contact info — never the
// contact values themselves.
function RevealPill({ label, value, onReveal }) {
  const text = display(value);
  const [anchorEl, setAnchorEl] = useState(null);
  const [copied, setCopied] = useState(false);
  const open = Boolean(anchorEl);

  const closePopover = () => {
    setAnchorEl(null);
    setCopied(false);
  };

  const openPopover = (e) => {
    setAnchorEl(e.currentTarget);
    onReveal?.();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch (err) { /* no-op */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label={`Reveal ${label}`}
        onClick={openPopover}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          px: 1, height: 26, borderRadius: '999px', cursor: 'pointer',
          bgcolor: 'primary.soft', border: 1, borderColor: 'primary.border',
          color: 'text.secondary', fontFamily: 'inherit', lineHeight: 1,
          flexShrink: 1, minWidth: 0,
          transition: 'background-color 120ms ease, border-color 120ms ease',
          '&:hover': { bgcolor: 'primary.border', borderColor: 'primary.main', color: 'primary.main' },
          '&:hover .header-view-hint': { display: 'inline-flex' },
        }}
      >
        <Typography component="span" sx={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'inherit', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography
          component="span"
          className="header-view-hint"
          sx={{
            display: 'none', alignItems: 'center', gap: 0.25,
            fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            color: 'primary.main', whiteSpace: 'nowrap', lineHeight: 1,
          }}
        >
          <VisibilityIcon sx={{ fontSize: 11 }} />
          View
        </Typography>
      </Box>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75, px: 1.25, py: 1,
              borderRadius: 1.5, boxShadow: 3,
              bgcolor: 'background.paper', border: 1, borderColor: 'divider',
              display: 'flex', alignItems: 'center', gap: 1, maxWidth: 320,
            },
          },
        }}
      >
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em', userSelect: 'all' }}>
          {text}
        </Typography>
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton size="small" onClick={copy} aria-label={`Copy ${label}`} sx={{ flexShrink: 0 }}>
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Popover>
    </>
  );
}

/* ==========================================================================
   Main component
   ========================================================================== */
export default function StudentProfileForm({
  lead,
  interactions = [],
  form,
  setForm,
  saving,
  selectedDisposition = null,
  onSubmitDisposition,
  dispoState,
  readOnly = false,
  editable = false,
  compact = false,
  hideHeader = false,
  onLeadUpdated,
}) {
  const { countries, universities, loadingCountries, loadingUniversities } = useLookups('');
  const [leadSources, setLeadSources] = useState([]);
  const [activeTab, setActiveTab] = useState('personal');
  // Compact mode (agent Call Workspace): key student details live inline in
  // the single compact header row; "Edit Details" reveals the full editable
  // Personal Information form (and its tabs) when the agent needs to edit.
  const [showEditForm, setShowEditForm] = useState(false);

  // Compact mode is a single-line read-only header bar by default — a new
  // lead starts collapsed (never an empty tabbed area) and only expands
  // into the full editable form once "Edit Details" is clicked.
  useEffect(() => {
    setShowEditForm(false);
  }, [lead?._id]);

  // Applications (Phase 4) — one shared instance for the Shortlist and
  // Applications tabs; fetching stays lazy (nothing loads until one of
  // those tabs is opened).
  const applications = useApplications(lead?._id, {
    enabled: activeTab === 'shortlist' || activeTab === 'applications',
  });
  const [prefCount, setPrefCount] = useState(1);

  // Fetch Lead Type options once.
  useEffect(() => {
    let cancelled = false;
    client
      .get('/lookups/lead-sources')
      .then(({ data }) => { if (!cancelled) setLeadSources(data.data ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Show every already-filled preference slot after a new lead loads,
  // then let the agent add further slots only when they need them.
  useEffect(() => {
    if (!lead) return;
    const filled = Math.max(
      (lead.preferredCountries ?? []).filter((p) => p.country).length,
      (lead.preferredUniversities ?? []).filter((p) => p.university).length
    );
    setPrefCount(Math.max(1, Math.min(MAX_PREFS, filled)));
  }, [lead]);

  // Back to the compact "Student Details" snapshot whenever a new lead loads.
  useEffect(() => {
    setShowEditForm(false);
  }, [lead]);

  // Most recent reference captured on a past call (read-only tab).
  const latestReference = useMemo(() => {
    const withRef = (interactions ?? [])
      .filter((it) => it.reference && (it.reference.name || it.reference.mobile))
      .sort((a, b) => new Date(b.calledAt || 0) - new Date(a.calledAt || 0));
    return withRef[0]?.reference ?? null;
  }, [interactions]);

  // Agent Call Workspace (compact): the single-line student header bar always
  // renders — even before a lead/form is ready it shows '—' placeholders, so
  // no grey placeholder, skeleton, or empty panel ever occupies the right pane.
  // Supervisor / counselor desks keep the legacy loading/empty states.
  if (!compact && !lead) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'transparent',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', px: 2.5, py: 1.5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: 'text.secondary' }}>No Active Lead</Typography>
          <Typography sx={{ fontSize: 13.5, color: 'text.disabled' }}>Fetch a lead to start working.</Typography>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }} aria-hidden="true">
          <Box sx={{ display: 'flex', gap: 1 }}>
            {[72, 96, 132, 104].map((w, i) => (
              <Skeleton key={i} variant="rounded" width={w} height={30} />
            ))}
          </Box>
          <Skeleton variant="text" width={170} height={13} />
          {[0, 1, 2].map((r) => (
            <Box key={r} sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {[0, 1, 2].map((f) => (
                <Box key={f} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Skeleton variant="text" width="55%" height={10} />
                  <Skeleton variant="rounded" height={40} />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  if (!compact && !form) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          bgcolor: 'transparent',
          py: '40px',
          color: 'text.disabled',
        }}
      >
        <Skeleton variant="circular" width={14} height={14} />
        <Typography sx={{ fontSize: 12.5 }}>Loading profile…</Typography>
      </Box>
    );
  }

  const loadingLookups = loadingCountries || loadingUniversities;

  // Read-only view (supervisor Student 360): every field renders but stays
  // disabled, and the disposition footer is replaced by a read-only note.
  // When `editable` is set (supervisor mode) the form is always mutable,
  // ignoring the agent-only "Interested" disposition gate.
  const disabled = saving || (readOnly && !editable);

  const setField = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const setSlot = (listKey, idx, field) => (e) => {
    const value = e.target.value;
    setForm((prev) => {
      const list = prev[listKey].map((slot, i) => (i === idx ? { ...slot, [field]: value } : slot));
      return { ...prev, [listKey]: list };
    });
  };

  const universitiesForSlot = (slotCountryId) => {
    const country = countries.find((c) => c.id === slotCountryId);
    return country ? universities.filter((u) => u.country === country.name) : universities;
  };

  // ── Progressive preference slots ────────────────────────────────
  const addPref = () => setPrefCount((c) => Math.min(MAX_PREFS, c + 1));

  const removePref = (idx) => {
    setForm((prev) => {
      const pc = [...prev.preferredCountries];
      const pu = [...prev.preferredUniversities];
      pc.splice(idx, 1);
      pu.splice(idx, 1);
      pc.push({ country: '' });
      pu.push({ university: '' });
      return { ...prev, preferredCountries: pc, preferredUniversities: pu };
    });
    setPrefCount((c) => Math.max(1, c - 1));
  };

  const canAddPref =
    prefCount < MAX_PREFS && !!form?.preferredCountries?.[prefCount - 1]?.country;

  const filledPrefs = Math.max(
    (form?.preferredCountries ?? []).filter((p) => p.country).length,
    (form?.preferredUniversities ?? []).filter((p) => p.university).length
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!lead || dispoState?.submitting) return;
    await onSubmitDisposition?.();
  };

  // Tabs with a live count badge on Study Preferences.
  const tabs = TABS.map((t) =>
    t.id === 'preferences' && filledPrefs > 0
      ? {
          ...t,
          label: (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              {t.label}
              <Chip
                label={filledPrefs}
                size="small"
                sx={{ height: 16, minWidth: 16, fontSize: 10, fontWeight: 700 }}
                aria-label={`${filledPrefs} preferences filled`}
              />
            </Box>
          ),
        }
      : t
  );

  /* ── Personal tab ─────────────────────────────────────────────── */
  const renderPersonal = () => {
    return (
    <Box>
      <SectionTitle icon={<PersonIcon sx={{ fontSize: 14 }} />} title="Personal Information" />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, fontSize: 12.5 }}>
        Required fields are marked with <Box component="span" sx={{ color: 'error.main' }}>*</Box>.
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Student Name" required placeholder="Full name" value={form.studentName} onChange={setField('studentName')} disabled={disabled} fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField
            label="Student ID"
            value={lead?.referenceId ?? ''}
            disabled
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField
            select
            label="Country Preferred"
            required
            value={form.countryPreferred}
            onChange={setField('countryPreferred')}
            disabled={disabled || loadingCountries}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            fullWidth
          >
            <option value="">— Select —</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField
            label="Email"
            value={editable ? (lead?.email ?? '') : partialMask(lead?.email, 'email')}
            disabled
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField
            select
            label="Intake"
            required
            value={form.intake}
            onChange={setField('intake')}
            disabled={disabled}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            fullWidth
          >
            <option value="">— Select —</option>
            {INTAKE_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField
            select
            label="Highest Education"
            required
            value={form.highestEducation}
            onChange={setField('highestEducation')}
            disabled={disabled}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            fullWidth
          >
            <option value="">— Select —</option>
            {EDUCATION_LEVELS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField
            select
            label="Gender"
            value={form.gender}
            onChange={setField('gender')}
            disabled={disabled}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            fullWidth
          >
            <option value="">— Select —</option>
            {GENDERS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField
            select
            label="Lead Type"
            required
            value={form.source}
            onChange={setField('source')}
            disabled={disabled || leadSources.length === 0}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            fullWidth
          >
            <option value="">— Select —</option>
            {leadSources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </TextField>
        </Grid>
      </Grid>
      <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 2.5, textAlign: 'center' }}>
        No additional personal information to display.
      </Typography>
      {compact && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
          <SecondaryButton size="small" onClick={() => setShowEditForm(false)} disabled={saving}>
            Done
          </SecondaryButton>
        </Box>
      )}
    </Box>
  );
  };

  /* ── Academic tab ─────────────────────────────────────────────── */
  const renderAcademic = () => (
    <Box>
      <SectionTitle icon={<SchoolIcon sx={{ fontSize: 14 }} />} title="Academic &amp; Work Profile" />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="College Name" placeholder="Institution name" value={form.collegeName} onChange={setField('collegeName')} disabled={disabled} fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Year of Passing" placeholder="e.g. 2024" value={form.passingYear} onChange={setField('passingYear')} disabled={disabled} fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Work Experience" placeholder="e.g. Fresher / 1 year" value={form.workExperience} onChange={setField('workExperience')} disabled={disabled} fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="GPA / Percentage" placeholder="e.g. 8.2 / 10" value={form.gpa} onChange={setField('gpa')} disabled={disabled} fullWidth />
        </Grid>
      </Grid>
      <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 2.5, textAlign: 'center' }}>
        No additional academic information to display.
      </Typography>
    </Box>
  );

  /* ── Study Preferences tab (progressive) ──────────────────────── */
  const renderPreferences = () => (
    <Box>
      <SectionTitle icon={<PublicIcon sx={{ fontSize: 14 }} />} title="Countries &amp; University Preferences" />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {Array.from({ length: prefCount }, (_, i) => {
          const slotCountry = form.preferredCountries[i].country;
          const uniOptions = universitiesForSlot(slotCountry);
          return (
            <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'action.hover', px: 1.5, py: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.25 }}>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
                  <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
                    <PublicIcon sx={{ fontSize: 13 }} />
                  </Box>
                  Preference {i + 1}
                </Box>
                {prefCount > 1 && (
                  <Tooltip title={`Remove preference ${i + 1}`}>
                    <IconButton
                      size="small"
                      onClick={() => removePref(i)}
                      disabled={disabled}
                      aria-label={`Remove preference ${i + 1}`}
                      sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
                    >
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    select
                    label={`Preferred Country ${i + 1}`}
                    value={form.preferredCountries[i].country}
                    onChange={setSlot('preferredCountries', i, 'country')}
                    disabled={disabled || loadingCountries}
                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                    fullWidth
                  >
                    <option value="">— Select —</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    select
                    label={`Preferred University ${i + 1}`}
                    value={form.preferredUniversities[i].university}
                    onChange={setSlot('preferredUniversities', i, 'university')}
                    disabled={disabled || loadingUniversities}
                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                    fullWidth
                  >
                    <option value="">— Select —</option>
                    {uniOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
            </Box>
          );
        })}

        {prefCount < MAX_PREFS && (
          <Button
            type="button"
            variant="outlined"
            startIcon={<AddCircleIcon sx={{ fontSize: 15 }} />}
            onClick={addPref}
            disabled={!canAddPref || disabled}
            sx={{ borderStyle: 'dashed', py: 1, color: 'text.secondary', '&:hover': { borderStyle: 'dashed' } }}
          >
            Add Preference {prefCount + 1}
          </Button>
        )}
        {prefCount < MAX_PREFS && !canAddPref && (
          <Typography variant="caption" sx={{ textAlign: 'center', color: 'text.disabled' }}>
            Complete the country for Preference {prefCount} to add Preference {prefCount + 1}.
          </Typography>
        )}
      </Box>
    </Box>
  );

  /* ── Reference tab (editable name + mobile) ─────────────────── */
  const renderReference = () => (
    <Box>
      <SectionTitle icon={<GroupIcon sx={{ fontSize: 14 }} />} title="Reference Details" />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, fontSize: 12.5 }}>
        Add a contact who can vouch for the student. These details are saved
        to the student record and shown to counsellors.
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Reference Name" placeholder="Reference name" value={form.referenceName} onChange={setField('referenceName')} disabled={disabled} fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Reference Mobile Number" type="tel" placeholder="e.g. +91 98xxx xxxxx" value={form.referenceMobile} onChange={setField('referenceMobile')} disabled={disabled} fullWidth />
        </Grid>
      </Grid>
      {latestReference && (latestReference.name !== (lead.referenceName ?? '') || latestReference.mobile !== (lead.referenceMobile ?? '')) && (
        <Box sx={{ mt: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'action.hover', p: 1.5 }}>
          <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 13, fontWeight: 700, mb: 1.25 }}>
            <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
              <HowToRegIcon sx={{ fontSize: 14 }} />
            </Box>
            Previously Captured Reference
          </Typography>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6 }}>
              <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <Box component="span" sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.disabled' }}>Name</Box>
                <Box component="span" sx={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-word' }}>{latestReference.name || '—'}</Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <Box component="span" sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.disabled' }}>Mobile</Box>
                <Box component="span" sx={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-word' }}>{latestReference.mobile || '—'}</Box>
              </Box>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );

  // Non-compact desks keep the existing disposition gate: the editable form
  // (tabs + sections + footer) renders when the selected disposition is
  // 'Interested' (or the desk is editable/read-only). In compact mode (agent
  // Call Workspace) the panel is hidden by default so only the single header
  // bar shows; "Edit Details" reveals the full editable form.
  // Dropped leads opened directly from the Dropped Leads drawer/bucket render
  // a minimal read-only panel (header + Drop Lead indicator) with NO student
  // profile fields, so the agent can still identify the lead and revive it
  // while its personal/academic details stay hidden.
  const dropped = !!lead && String(lead.dropStatus || '') === 'dropped';

  const profileFormVisible = readOnly || editable || selectedDisposition === 'Interested';

  // Gate for the tabbed panel. Compact agent workspace shows the editable
  // profile when "Edit Details" is pressed OR a disposition is selected
  // (Interested reveals the form, as on a normal desk); otherwise it stays a
  // clean info bar with never an empty placeholder. Supervisor / counselor
  // desks keep the existing disposition gating. The collapsed compact state
  // renders nothing below the header. Dropped leads never open the panel.
  const panelVisible = (compact && dropped) ? false : (compact ? (showEditForm || profileFormVisible) : profileFormVisible);

  const renderStudentHeader = () => {
    const countryName = countries.find((c) => c.id === form?.countryPreferred)?.name;
    const countryValue = countryName
      || (typeof lead?.countryPreferred === 'object' && lead?.countryPreferred
        ? lead.countryPreferred.name || lead.countryPreferred.code || lead.countryPreferred.label
        : null)
      || '—';

    // Agent Call Workspace (compact): ONE single-line student header bar —
    // name (visually strongest, first), then EMAIL | MOBILE as compact reveal
    // pills (values hidden until View is clicked), then Intake | Country as
    // smaller labeled details, and the eyebrow Edit Details flow stays as-is.
    // No avatar, no student ID here. The bar stays nowrap: name and details
    // compress with ellipses when space is tight instead of ever wrapping.
    if (compact) {
      // Dropped lead — header ONLY (name + reference), Drop Lead indicator.
      // No email / mobile / intake / country pills, no profile fields, no
      // tabs. The Revive action lives in the workspace LeadStatusStrip and the
      // disposition/remark history stays on the left disposition panel.
      if (dropped) {
        return (
          <Box sx={{ flexShrink: 0, display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 1, px: 1.5, py: 0.625, minHeight: 40 }}>
            <Typography sx={{ flex: '0 1 auto', minWidth: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.015em', color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {display(lead ? form?.studentName : null)}
            </Typography>
            {lead?.referenceId && (
              <Typography component="span" sx={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'text.disabled', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                #{lead.referenceId}
              </Typography>
            )}
            <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75, ml: 0.5, justifyContent: 'flex-end' }}>
              <Chip
                size="small"
                label="Drop Lead"
                sx={{ height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: '#FDF2F8', color: '#881337', border: 1, borderColor: '#FCE7F3', '& .MuiChip-label': { px: 1 } }}
              />
            </Box>
          </Box>
        );
      }
      return (
        <Box sx={{ flexShrink: 0, display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 1, px: 1.5, py: 0.625, minHeight: 40 }}>
          <Typography sx={{ flex: '0 1 auto', minWidth: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.015em', color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {display(lead ? form?.studentName : null)}
          </Typography>
          <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.875, ml: 0.5 }}>
            <RevealPill
              label="Email"
              value={lead?.email}
              onReveal={() =>
                auditEvent({
                  action: 'VIEW_EMAIL',
                  module: 'crud',
                  leadId: lead?._id,
                  leadName: lead?.studentName,
                  message: `Contact email revealed for ${(lead?.studentName || 'student').slice(0, 60)}`,
                })
              }
            />
            <RevealPill
              label="Mobile"
              value={lead?.mobile ?? lead?.phone}
              onReveal={() =>
                auditEvent({
                  action: 'VIEW_MOBILE',
                  module: 'crud',
                  leadId: lead?._id,
                  leadName: lead?.studentName,
                  message: `Contact mobile revealed for ${(lead?.studentName || 'student').slice(0, 60)}`,
                })
              }
            />
            <HeaderDetail label="Intake" value={lead ? form?.intake : null} />
            <HeaderDetail label="Country" value={lead ? countryValue : null} />
          </Box>
          {/* <SecondaryButton
            size="small"
            startIcon={<EditIcon sx={{ fontSize: 14 }} />}
            onClick={() => setShowEditForm(true)}
            disabled={disabled || !lead || !form}
            title={!lead ? 'Fetch a lead to enable editing' : undefined}
            sx={{ ml: 'auto', flexShrink: 0 }}
          >
            Edit Details
          </SecondaryButton> */}
        </Box>
      );
    }

    // Supervisor / Counselor / Student 360 — existing header unchanged.
    return (
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 0.875 }}>
        <Box
          component="span"
          sx={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'primary.main', bgcolor: 'primary.soft', border: 1,
            borderColor: 'primary.border', fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
          }}
        >
          {initialsOf(form.studentName)}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.015em', color: 'text.primary', whiteSpace: 'nowrap' }}>
            {display(form.studentName)}
          </Typography>
          <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>
            #{lead.referenceId ?? '—'}
          </Typography>
        </Box>
      </Box>
    );
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'transparent', overflow: 'hidden' }}
    >

      {!hideHeader && renderStudentHeader()}

      {(panelVisible && form && lead) && (
        <>
          {/* ── Tab bar — compact rounded "cute" pills, directly under the header.
                 Single non-wrapping row (horizontal scroll if it overflows) ── */}
          <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, overflowX: 'auto', overflowY: 'hidden', msOverflowStyle: 'none', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            {tabs.map((t) => {
              const active = activeTab === t.id;
              return (
                <Box
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  component="button"
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: 28,
                    py: 0,
                    px: '10px',
                    borderRadius: '999px',
                    border: 1,
                    borderColor: active ? 'primary.main' : 'divider',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    lineHeight: 1,
                    textDecoration: 'none',
                    textTransform: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    color: active ? 'primary.main' : 'text.secondary',
                    bgcolor: active ? 'primary.soft' : 'background.paper',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'color 120ms ease, border-color 120ms ease, background-color 120ms ease',
                    '&:hover': {
                      color: active ? 'primary.main' : 'text.primary',
                      borderColor: active ? 'primary.main' : 'grey.400',
                    },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -1 },
                  }}
                >
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: 'inherit' }} aria-hidden="true">
                    {t.icon}
                  </Box>
                  {t.label}
                </Box>
              );
            })}
            {readOnly && (
              <Chip size="small" label="Read-only" sx={{ flexShrink: 0, mr: 0.5, ml: 'auto', height: 20, fontSize: 10.5, fontWeight: 700, color: 'text.secondary', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }} />
            )}
          </Box>

          {/* ── Active section (this is the only region that scrolls) ── */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', mx: 1.5, px: 0.5, py: 1 }}>
            {activeTab === 'personal' && renderPersonal()}
            {activeTab === 'academic' && renderAcademic()}
            {activeTab === 'preferences' && renderPreferences()}
            {activeTab === 'universities' && <UniversityFinderPanel lead={lead} />}
            {activeTab === 'shortlist' && (
              <ShortlistPanel lead={lead} onLeadUpdated={onLeadUpdated} />
            )}
            {activeTab === 'applications' && (
              <ApplicationsPanel
                lead={lead}
                apps={applications}
                onLeadUpdated={onLeadUpdated}
              />
            )}
            {activeTab === 'reference' && renderReference()}
          </Box>
        </>
      )}
    </Box>
  );
}
