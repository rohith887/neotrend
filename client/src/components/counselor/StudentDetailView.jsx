import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Chip, Paper,
  Skeleton, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import DescriptionIcon from '@mui/icons-material/Description';
import EmailIcon from '@mui/icons-material/Email';
import EventIcon from '@mui/icons-material/Event';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import ForumIcon from '@mui/icons-material/Forum';
import HistoryIcon from '@mui/icons-material/History';
import HomeIcon from '@mui/icons-material/Home';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import NotesIcon from '@mui/icons-material/Notes';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonIcon from '@mui/icons-material/Person';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import PhoneIcon from '@mui/icons-material/Phone';
import PaymentIcon from '@mui/icons-material/Payment';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import PublicIcon from '@mui/icons-material/Public';
import SchoolIcon from '@mui/icons-material/School';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { fetchLeadById, fetchInteractions, createInteraction } from '../../api/leads.js';
import client from '../../api/client.js';
import { useApplications } from '../../hooks/useApplications.js';
import { useDispositions } from '../../api/useDispositions.js';
import { useCounselor } from '../../context/CounselorContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { lifecycleOf, stageLabel, stageTone } from '../../utils/lifecycle.js';
import { CountryLabel } from '../../utils/flag.jsx';
import {
  deriveStepStates,
  JourneyRegistration, JourneyDocuments, JourneyPayments, JourneyVisa,
} from '../CounselorWorkspace.jsx';
import UniversityFinderPanel from '../university/UniversityFinderPanel.jsx';
import ShortlistPanel from '../university/ShortlistPanel.jsx';
import ApplicationsPanel from '../application/ApplicationsPanel.jsx';
import StatusChip from '../../ui/mui/StatusChip.jsx';
import PrimaryButton from '../../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';
import AppDialog from '../../ui/mui/AppDialog.jsx';
import MentionInput from '../MentionInput.jsx';

/* ═══════════════════════════════════════════════════════════════════════
   STUDENT DETAIL VIEW — the counselor's single source of truth for one
   student, fully self-contained inside the "My Students" page.

     Compact professional CRM (Salesforce/HubSpot-style):
       HEADER  → small avatar + identity + ownership + actions (Open Lead | Add Remark)
       STATUS  → single compact read-out strip (Status | Disposition | Last Call | ...)
       JOURNEY → compact 8-stage stepper (navigation, ~55px)
       BODY    → MAIN (68–72%) + CALL NOTES / RECENT ACTIVITY (28–32%) side-by-side.
                 Clicking a journey stage swaps the MAIN area inline; the right
                 rail stays fixed with independent scroll on each card.

   UI/UX restructuring ONLY — no new APIs, no backend changes, no fake data.
   Reuses existing endpoints & contexts:
     GET /leads/:id            (full-lead hydrate)
     GET /interactions         (call notes + recent-activity timeline)
     POST /interactions        (remark logger)
     PATCH /leads/:id          (profile / reg / doc / visa saves)
     useApplications()         (shortlist → applications cache)
   Calling lives in the dedicated Counselor Workspace — this overview opens a
   student's profile workflow via onNavigate('workspace', { _id }).
   ═══════════════════════════════════════════════════════════════════════ */

const JOURNEY = [
  { id: 'counseling',   label: 'Counseling',   icon: <ForumIcon /> },
  { id: 'universities', label: 'Universities', icon: <SchoolIcon /> },
  { id: 'shortlist',    label: 'Shortlist',    icon: <PlaylistAddCheckIcon /> },
  { id: 'applications', label: 'Applications', icon: <AssignmentIcon /> },
  { id: 'registration', label: 'Registration', icon: <HowToRegIcon /> },
  { id: 'documents',    label: 'Documents',    icon: <DescriptionIcon /> },
  { id: 'payments',     label: 'Payments',     icon: <PaymentIcon /> },
  { id: 'visa',         label: 'Visa',         icon: <FlightTakeoffIcon /> },
];

const BLOCKED_STATES = new Set([
  'rejected', 'denied', 'failed', 'cancelled', 'expired', 'non-compliance',
  'not-applicable', 'on-hold', 'deferred', 'lost',
]);

const FIELD_FOR = {
  counseling: 'counselingStatus',
  universities: null,
  shortlist: null,
  applications: 'applicationStatus',
  registration: 'registrationStatus',
  documents: 'documentStatus',
  payments: 'paymentStatus',
  visa: 'visaStatus',
};

const M_EMPTY = '—';
const NOT_PROVIDED = 'Not provided';
const NOT_SELECTED = 'Not selected';
const isBlank = (v) => v == null || v === '' || v === undefined;
const val = (v, empty = M_EMPTY) => (isBlank(v) ? empty : v);

/* ── Typography scale (compact CRM: labels small & muted, values strong) ── */
const SECTION = { fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: 'text.primary' };
const CARD_TITLE = { fontSize: 12, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' };
const ROW_LABEL = { fontSize: 11, fontWeight: 600, color: 'text.disabled' };
const ROW_VALUE = { fontSize: 13.5, fontWeight: 600, color: 'text.primary', lineHeight: 1.35, overflowWrap: 'anywhere' };

const displayPhone = (lead) => val(lead.mobile ?? lead.phone);
const displaySource = (lead) => val(lead.source?.name ?? lead.source ?? lead.leadSource, NOT_PROVIDED);
const displayAgent = (lead) => {
  if (lead.assignedTo && typeof lead.assignedTo === 'object') {
    return [lead.assignedTo.firstName, lead.assignedTo.lastName].filter(Boolean).join(' ') || M_EMPTY;
  }
  return M_EMPTY;
};
const displayCounselor = (lead) => {
  const c = lead.counselorAssigned;
  if (!c) return M_EMPTY;
  if (typeof c === 'object') return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || c.email || M_EMPTY;
  return c;
};
const nameOf = (p) => {
  if (!p || typeof p !== 'object') return p || '';
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || p.email || '';
};
const initialsOf = (name) =>
  String(name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '—';

const fmtDT = (iso, when = true) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = d.getDate();
  const HR = (k) => String(k).padStart(2, '0');
  const date = `${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
  if (!when) return date;
  return `${date} · ${HR(d.getHours())}:${HR(d.getMinutes())}`;
};
const fmtDate = (iso) => fmtDT(iso, false);

/* ── Shared recent-activity feed: disposition history + interactions ───── */
function buildFeed(lead, sortedInteractions) {
  const entries = [];
  (lead?.dispositionHistory ?? []).forEach((dh, i) => {
    if (dh?.dispositionName) entries.push({
      key: `dh-${i}`, at: dh.changedAt || dh.changed_on || null,
      title: dh.dispositionName, note: dh.note, by: dh.changedBy, type: 'disposition',
    });
  });
  sortedInteractions.forEach((it, i) => {
    if (!it?.dispositionName && !it?.disposition && !it?.remarks) return;
    entries.push({
      key: `it-${it._id || i}`, at: it.calledAt || it.createdAt || null,
      title: it.disposition?.name || it.dispositionName || 'Interaction',
      note: it.remarks, by: it.counselor || it.agent || null, type: 'interaction',
    });
  });
  return entries.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

/* ═══════════════════════════════════════════════════════════════════════
   COMPACT HORIZONTAL JOURNEY STEPPER — navigation, not cards (~55px).
   ═══════════════════════════════════════════════════════════════════════ */
function JourneyStepper({ lead, active, onOpenStage }) {
  if (!lead) return null;
  const steps = deriveStepStates(lead);
  const stateById = new Map(steps.map((s) => [s.id, s.state]));
  const stageNodes = JOURNEY.map((cfg) => {
    const raw = FIELD_FOR[cfg.id] ? lead[FIELD_FOR[cfg.id]] : null;
    const blocked = BLOCKED_STATES.has(String(raw || '').toLowerCase());
    const base = stateById.get(cfg.id) || 'upcoming';
    return { ...cfg, state: (blocked && base !== 'completed') ? 'blocked' : base };
  });

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', px: 0.5, pt: 0.15 }}>
      {stageNodes.map((node, i) => {
        const activeNow = active === node.id;
        const filled = node.state === 'completed' || node.state === 'current';
        const circleColor = activeNow ? '#fff' : node.state === 'completed' ? '#fff' : filled ? 'primary.main' : node.state === 'blocked' ? 'warning.main' : 'grey.400';
        const circleBg = activeNow ? 'primary.main' : node.state === 'completed' ? 'success.main' : node.state === 'current' ? 'primary.soft' : node.state === 'blocked' ? 'warning.soft' : 'grey.100';
        const lineFilled = node.state === 'completed';
        const labelColor = activeNow ? 'primary.main' : node.state === 'current' ? 'primary.main' : node.state === 'completed' ? 'text.secondary' : node.state === 'blocked' ? 'warning.main' : 'text.disabled';

        return (
          <Tooltip
            key={node.id}
            title={`${node.label} — ${node.state === 'completed' ? 'Completed' : node.state === 'current' ? 'In progress' : node.state === 'blocked' ? 'Action needed' : 'Pending'}${activeNow ? ' · viewing now' : ''}`}
            arrow placement="top" enterDelay={350}
          >
            <Box
              role="button" tabIndex={0}
              onClick={() => onOpenStage?.(node.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenStage?.(node.id); } }}
              aria-label={`${node.label}${activeNow ? ' · viewing now' : ''}`}
              aria-pressed={activeNow}
              sx={{
                flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 0.2, cursor: 'pointer', userSelect: 'none',
                py: activeNow ? 0.2 : 0.1, px: 0.4, borderRadius: 1.25, mx: -0.25,
                transition: 'background-color 110ms ease',
              }}
            >
              <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 0 }}>
                <Box sx={{ flex: '1 1 auto', height: 2, borderRadius: 2, bgcolor: i === 0 ? 'grey.200' : lineFilled ? 'success.main' : 'grey.200', minWidth: 4 }} />
                <Box
                  sx={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: circleColor, bgcolor: circleBg,
                    border: activeNow || node.state === 'current' ? 2 : 0,
                    borderColor: activeNow ? 'transparent' : 'primary.main',
                    boxShadow: activeNow ? '0 2px 8px rgba(15,118,110,0.35)' : node.state === 'current' ? '0 0 0 3px #fff, 0 0 0 5px #0f766e' : 'none',
                    transition: 'all 110ms ease',
                  }}
                >
                  {(node.state === 'completed' || activeNow) && <CheckCircleIcon sx={{ fontSize: 13 }} />}
                  {!(node.state === 'completed' || activeNow) && (
                    <Box component="span" sx={{ display: 'inline-flex', color: 'inherit', fontSize: 12 }}>{node.icon}</Box>
                  )}
                </Box>
                <Box sx={{ flex: '1 1 auto', height: 2, borderRadius: 2, bgcolor: i === stageNodes.length - 1 ? 'grey.200' : node.state === 'completed' ? 'success.main' : 'grey.200', minWidth: 4 }} />
              </Box>
              <Typography noWrap sx={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, maxWidth: '100%', color: labelColor }}>{node.label}</Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   COMPACT STUDENT HEADER — small avatar, identity, ownership, actions.
   Information first; no gradient, no oversized elements.
   ═══════════════════════════════════════════════════════════════════════ */
function DetailHeader({ lead, onBack, onOpenLead, onAddRemark }) {
  const name = lead.studentName || M_EMPTY;
  const lc = lifecycleOf(lead);
  const tags = Array.isArray(lead?.tags) ? lead.tags : [];

  return (
    <Box sx={{ bgcolor: 'background.paper', px: { xs: 1.5, md: 2.25 }, py: 1.1 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {/* Back */}
        <Box
          onClick={onBack} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBack(); } }}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.35, color: 'text.secondary',
            cursor: 'pointer', flexShrink: 0, borderRadius: 1, px: 0.5, py: 0.5,
            fontSize: 12.5, fontWeight: 600, mt: 0.3, '&:hover': { color: 'text.primary', bgcolor: 'grey.50' },
          }}
        >
          <ArrowBackIcon sx={{ fontSize: 16 }} /> Back
        </Box>

        {/* Small avatar — identity anchor */}
        <Box
          sx={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em',
            color: 'primary.main', bgcolor: 'primary.soft', border: 1, borderColor: 'primary.border',
          }}
        >
          {initialsOf(name)}
        </Box>

        {/* Identity + meta */}
        <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexWrap: 'wrap' }}>
            <Typography noWrap sx={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{name}</Typography>
            {lead.referenceId && (
              <Chip label={lead.referenceId} size="small" variant="outlined"
                sx={{ height: 18, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.03em', color: 'text.secondary', borderColor: 'divider' }} />
            )}
            <StatusChip status={stageLabel(lc?.stage) || 'New Lead'} tone={stageTone(lc?.stage)} size="small" sx={{ height: 18, '& .MuiChip-label': { fontWeight: 700, px: 1 } }} />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 1.25, rowGap: 0.25, flexWrap: 'wrap', mt: 0.35, minWidth: 0 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, flexShrink: 0 }} title="Mobile">
              <PhoneIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
              <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary' }}>{displayPhone(lead)}</Typography>
            </Box>
            {lead.email && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, minWidth: 0, flexShrink: 1 }} title="Email">
                <EmailIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
                <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary' }}>{lead.email}</Typography>
              </Box>
            )}
            <Box sx={{ width: '1px', height: 14, bgcolor: 'divider', flex: '0 0 1px', flexShrink: 0, mx: 0.5 }} />
            <MetaPill label="Source" value={displaySource(lead)} />
            <MetaPill label="Intake" value={val(lead.intake, NOT_SELECTED)} />
            <MetaPill label="Owner" value={displayAgent(lead)} />
            <MetaPill label="Counselor" value={displayCounselor(lead)} />
          </Box>

          {/* Tags — integrated subtly into identity, not a separate strip */}
          {tags.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {tags.map((t) => (
                <Chip
                  key={t._id}
                  size="small"
                  label={t.label}
                  title={t.createdBy?.name ? `Added by ${t.createdBy.name}` : 'Operational tag'}
                  sx={{
                    height: 18, fontSize: 10, fontWeight: 600, color: 'text.secondary',
                    bgcolor: 'grey.50', border: 1, borderColor: 'divider',
                    '& .MuiChip-label': { px: 0.8 },
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* Compact actions — aligned with the header identity row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, mt: 0.3 }}>
          <Box component="button" type="button" onClick={onOpenLead} sx={actionStyle('primary')}>
            <OpenInNewIcon sx={{ fontSize: 14 }} /> Open Lead
          </Box>
          <Box component="button" type="button" onClick={onAddRemark} sx={actionStyle('secondary')}>
            <ChatBubbleIcon sx={{ fontSize: 14 }} /> Add Remark
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const actionStyle = (kind) => ({
  display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 30,
  px: 1.1, borderRadius: 1.4, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  border: 'none', userSelect: 'none', fontFamily: 'inherit',
  transition: 'background-color 100ms ease',
  '&:disabled': { opacity: 0.45, cursor: 'default' },
  ...(kind === 'primary'
    ? { bgcolor: 'primary.main', color: '#fff', '&:hover:not(:disabled)': { bgcolor: 'primary.dark' } }
    : { bgcolor: 'background.paper', color: 'primary.main', border: 1, borderColor: 'primary.border', '&:hover': { bgcolor: 'primary.soft' } }),
});

function MetaPill({ label, value }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.4, minWidth: 0 }}>
      <Typography noWrap sx={ROW_LABEL}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>{value}</Typography>
    </Box>
  );
}

/* ── Compact Label/Value row (Overview grids) ────────────────────────── */
function Row({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography noWrap sx={ROW_LABEL}>{label}</Typography>
      <Typography sx={ROW_VALUE}>{value}</Typography>
    </Box>
  );
}

function InfoCard({ title, icon, children }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.75, bgcolor: 'background.paper', p: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 1 }}>
        {icon && <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">{icon}</Box>}
        <Typography sx={CARD_TITLE}>{title}</Typography>
      </Box>
      {children}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DENSE OVERVIEW — the COMPLETE student summary. Compact 2-col grids:
   Personal | Academic | Study Prefs | Lead | Counseling summary | Lifecycle.
   Read-only, highly scannable. Real fields only; '—' for unavailable.
   ═══════════════════════════════════════════════════════════════════════ */
function OverviewPanel({ lead, interactions }) {
  const sorted = useMemo(
    () => [...interactions].sort((a, b) => new Date(b.calledAt ?? b.createdAt ?? 0) - new Date(a.calledAt ?? a.createdAt ?? 0)),
    [interactions],
  );
  const latest = sorted[0];
  const latestDisposition = latest?.disposition?.name || latest?.dispositionName || '';
  const lastCallAt = lead?.lastCallAt || latest?.calledAt || latest?.createdAt || null;
  const counselingCompleted = lead?.counselingStatus === 'completed';
  const lc = lifecycleOf(lead);

  const prefCountries = (lead?.preferredCountries ?? []).map((p) => (p && typeof p === 'object' ? p.country?.name || p.name || p.country : p)).filter(Boolean);
  const prefUnis = (lead?.preferredUniversities ?? []).map((p) => (p && typeof p === 'object' ? p.university?.institutionName || p.name || p.university : p)).filter(Boolean);
  const dispCountry = (lead?.countryPreferred && typeof lead.countryPreferred === 'object') ? lead.countryPreferred.name || lead.countryPreferred.label : lead.countryPreferred;

  const addr = (a) => [
    a?.address1, a?.address2,
    [a?.city, a?.state].filter(Boolean).join(', '),
    [a?.country, a?.pincode].filter(Boolean).join(' - '),
  ].filter(Boolean).join(', ');
  const mailingAddr = addr(lead?.mailingAddress);
  const permanentAddr = addr(lead?.permanentAddress);
  const pp = lead?.passport || {};

  const steps = useMemo(() => deriveStepStates(lead), [lead]);
  const lifecycleRows = steps
    .filter((s) => s.id !== 'overview')
    .map((s) => {
      const cfg = JOURNEY.find((j) => j.id === s.id);
      const label = cfg?.label ?? s.id;
      const stateLabel = s.state === 'completed' ? 'Completed' : s.state === 'current' ? 'In Progress' : s.state === 'blocked' ? 'Action Needed' : 'Not Started';
      const tone = s.state === 'completed' ? 'success' : s.state === 'current' ? 'warning' : s.state === 'blocked' ? 'error' : 'default';
      return { id: s.id, label, stateLabel, tone };
    });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {/* ── Personal | Academic ──────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))' }, gap: 1.25 }}>
        <InfoCard title="Personal Information" icon={<PersonIcon sx={{ fontSize: 14 }} />}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
            <Row label="Full Name" value={val(lead.studentName)} />
            <Row label="Mobile" value={displayPhone(lead)} />
            <Row label="Email" value={val(lead.email)} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              <Row label="Date of Birth" value={val(lead.dateOfBirth)} />
              <Row label="Gender" value={val(lead.gender, NOT_SELECTED)} />
              <Row label="Marital Status" value={val(lead.maritalStatus, NOT_SELECTED)} />
            </Box>
          </Box>
        </InfoCard>
        <InfoCard title="Academic Information" icon={<SchoolIcon sx={{ fontSize: 14 }} />}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
            <Row label="Highest Education" value={val(lead.highestEducation, NOT_SELECTED)} />
            <Row label="College / University" value={val(lead.collegeName)} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              <Row label="Passing Year" value={val(lead.passingYear)} />
              <Row label="GPA / Percentage" value={val(lead.gpa)} />
              <Row label="Country of Education" value={<CountryLabel value={lead.countryOfEducation} fallback={M_EMPTY} />} />
              <Row label="Work Experience" value={val(lead.workExperience, NOT_SELECTED)} />
            </Box>
          </Box>
        </InfoCard>
      </Box>

      {/* ── Study Prefs | Lead ───────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))' }, gap: 1.25 }}>
        <InfoCard title="Study Preferences" icon={<PublicIcon sx={{ fontSize: 14 }} />}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
            <Row label="Preferred Country" value={prefCountries.length ? <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: '10px', rowGap: 2 }}>{prefCountries.map((c, i) => <CountryLabel key={i} value={c} />)}</Box> : M_EMPTY} />
            <Row label="Interested Country" value={<CountryLabel value={dispCountry} fallback={M_EMPTY} />} />
            <Row label="Preferred University" value={prefUnis.join(', ') || M_EMPTY} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              <Row label="Intake" value={val(lead.intake, NOT_SELECTED)} />
              <Row label="Preferred Course" value={val(lead.preferredCourse)} />
              <Row label="Study Level" value={val(lead.highestEducation, NOT_SELECTED)} />
            </Box>
          </Box>
        </InfoCard>
        <InfoCard title="Lead Information" icon={<AssignmentIcon sx={{ fontSize: 14 }} />}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
            <Row label="Reference ID" value={val(lead.referenceId)} />
            <Row label="Source" value={displaySource(lead)} />
            <Row label="Current Status" value={val(lead.status, NOT_SELECTED)} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              <Row label="Owner" value={displayAgent(lead)} />
              <Row label="Assigned Agent" value={displayAgent(lead)} />
              <Row label="Created" value={lead.createdAt ? fmtDate(lead.createdAt) : M_EMPTY} />
              <Row label="Lead Type" value={val(lead.leadType, M_EMPTY)} />
            </Box>
          </Box>
        </InfoCard>
      </Box>

      {/* ── Address | Passport ───────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))' }, gap: 1.25 }}>
        <InfoCard title="Address" icon={<HomeIcon sx={{ fontSize: 14 }} />}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
            <Row label="Mailing Address" value={mailingAddr || M_EMPTY} />
            <Row label="Permanent Address" value={permanentAddr || M_EMPTY} />
          </Box>
        </InfoCard>
        <InfoCard title="Passport" icon={<AssessmentIcon sx={{ fontSize: 14 }} />}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <Row label="Passport Number" value={val(pp.passportNumber)} />
            <Row label="Nationality" value={<CountryLabel value={pp.nationality} fallback={M_EMPTY} />} />
            <Row label="Citizenship" value={val(pp.citizenship)} />
            <Row label="Country of Birth" value={<CountryLabel value={pp.countryOfBirth} fallback={M_EMPTY} />} />
            <Row label="Issue Date" value={val(pp.issueDate)} />
            <Row label="Expiry Date" value={val(pp.expiryDate)} />
          </Box>
        </InfoCard>
      </Box>

      {/* ── Counseling summary ───────────────────────────────── */}
      <InfoCard title="Counseling Summary" icon={<ForumIcon sx={{ fontSize: 14 }} />}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0,1fr))' }, gap: '0 1rem' }}>
            <Row label="Current Status" value={counselingCompleted ? 'Completed' : 'In Progress'} />
            <Row label="Disposition" value={latestDisposition || M_EMPTY} />
            <Row label="Last Call" value={lastCallAt ? fmtDT(lastCallAt) : 'No call yet'} />
            <Row label="Next Follow-up" value={lead?.nextActionDue ? fmtDate(lead.nextActionDue) : M_EMPTY} />
            <Row label="Counselor" value={displayCounselor(lead)} />
            <Row label="Assigned Agent" value={displayAgent(lead)} />
          </Box>
          {lc?.stage && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Row label="Lifecycle Stage" value={stageLabel(lc.stage)} />
              {lc?.waitingOn && <Row label="Waiting On" value={val(lc.waitingOn)} />}
              {lc?.nextAction && <Row label="Next Action" value={val(lc.nextAction)} />}
            </Box>
          )}
        </Box>
      </InfoCard>

      {/* ── Lifecycle status ─────────────────────────────────── */}
      <InfoCard title="Lifecycle Status" icon={<PersonPinIcon sx={{ fontSize: 14 }} />}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' }, gap: 0.75 }}>
          {lifecycleRows.map((r) => (
            <Box key={r.id} sx={{ minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75, px: 0.9, py: 0.55, border: 1, borderColor: 'divider', borderRadius: 1.25, bgcolor: 'background.paper' }}>
              <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.primary' }}>{r.label}</Typography>
              <StatusChip status={r.stateLabel} tone={r.tone} size="small" sx={{ height: 18, flexShrink: 0, '& .MuiChip-label': { px: 0.8, fontSize: 9.5, fontWeight: 700 } }} />
            </Box>
          ))}
        </Box>
      </InfoCard>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CALL NOTES — counselor-facing conversation/remark history. Only rows that
   carry actual written remarks (what people said/wrote about the student).
   ═══════════════════════════════════════════════════════════════════════ */
function CallNotesList({ interactions }) {
  const notes = interactions.filter((n) => n.remarks && String(n.remarks).trim());
  if (notes.length === 0) {
    return <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 1 }}>No call notes yet.</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {notes.map((n, i) => (
        <Box key={n._id || i} sx={{ py: 0.75, borderTop: i === 0 ? 0 : 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              size="small" label={n.disposition?.name || n.dispositionName || 'Note'}
              sx={{ height: 17, fontSize: 9.5, fontWeight: 700, '& .MuiChip-label': { px: 0.7 }, bgcolor: 'primary.soft', color: 'primary.main' }}
            />
            <Typography noWrap sx={{ fontSize: 10.5, color: 'text.disabled', flex: 1, textAlign: 'right' }}>{fmtDT(n.calledAt || n.createdAt)}</Typography>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: 'text.primary', lineHeight: 1.45, mt: 0.25 }}>{n.remarks}</Typography>
          {nameOf(n.counselor || n.agent) && (
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled', mt: 0.15 }}>by {nameOf(n.counselor || n.agent)}</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   RECENT ACTIVITY — complete shared system timeline (disposition history +
   interactions). What has happened to this student across the CRM.
   ═══════════════════════════════════════════════════════════════════════ */
function ActivityList({ feed }) {
  if (feed.length === 0) {
    return <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 1 }}>No activity yet.</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {feed.map((e) => (
        <Box key={e.key} sx={{ py: 0.7, borderTop: 1, borderColor: 'divider', ':first-of-type': { borderTop: 0 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75 }}>
            <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>{e.title}</Typography>
            <Typography noWrap sx={{ fontSize: 10, color: 'text.disabled', flexShrink: 0 }}>{e.at ? fmtDT(e.at) : ''}</Typography>
          </Box>
          {e.note && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4, mt: 0.1 }}>{e.note}</Typography>}
          <Typography sx={{ fontSize: 10.5, color: 'text.disabled', mt: 0.15 }}>
            {nameOf(e.by) ? `${nameOf(e.by)} · ${e.type === 'disposition' ? 'status change' : 'remark'}` : (e.type === 'disposition' ? 'status change' : 'remark')}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DENSE COUNSELING WORKSPACE — status grid · call notes · remark logger.
   Recording-only; recent activity lives in the right-side rail.
   ═══════════════════════════════════════════════════════════════════════ */
function CounselingPanel({ lead, interactions }) {
  const sorted = useMemo(
    () => [...interactions].sort((a, b) => new Date(b.calledAt ?? b.createdAt ?? 0) - new Date(a.calledAt ?? a.createdAt ?? 0)),
    [interactions],
  );
  const latest = sorted[0];
  const latestDisposition = latest?.disposition?.name || latest?.dispositionName || '';
  const lastCallAt = lead?.lastCallAt || latest?.calledAt || latest?.createdAt || null;
  const counselingCompleted = lead?.counselingStatus === 'completed';
  const notes = sorted.filter((it) => it.remarks && String(it.remarks).trim()).slice(0, 6);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      {/* ── Status grid ─────────────────────────────────────────── */}
      <InfoCard title="Counseling" icon={<ForumIcon sx={{ fontSize: 14 }} />}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0,1fr))' }, gap: 1.25 }}>
          <Row label="Current Status" value={counselingCompleted ? 'Completed' : 'In Progress'} />
          <Row label="Disposition" value={latestDisposition || M_EMPTY} />
          <Row label="Last Call" value={lastCallAt ? fmtDT(lastCallAt) : 'No call yet'} />
          <Row label="Next Follow-up" value={lead?.nextActionDue ? fmtDate(lead.nextActionDue) : M_EMPTY} />
          <Row label="Counselor" value={displayCounselor(lead)} />
          <Row label="Assigned Agent" value={displayAgent(lead)} />
        </Box>
      </InfoCard>

      {/* ── Call notes (counselor-facing history) ────────────────── */}
      <InfoCard title="Call Notes" icon={<NotesIcon sx={{ fontSize: 14 }} />}>
        {notes.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No call notes yet.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {notes.map((n, i) => (
              <Box key={n._id || i} sx={{ py: 0.75, borderTop: i === 0 ? 0 : 1, borderColor: 'divider' }}>
                <Typography sx={{ fontSize: 13, color: 'text.primary', lineHeight: 1.5 }}>{n.remarks}</Typography>
                <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
                  {[n.disposition?.name || n.dispositionName, fmtDT(n.calledAt || n.createdAt)].filter(Boolean).join(' · ')}
                  {nameOf(n.counselor || n.agent) ? ` by ${nameOf(n.counselor || n.agent)}` : ''}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </InfoCard>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   REMARK DIALOG (header quick action)
   ═══════════════════════════════════════════════════════════════════════ */
function RemarkDialog({ open, onClose, lead, onLogged }) {
  const { push } = useToast();
  const { dispositions, loading: dispLoading } = useDispositions();
  const [dispositionId, setDispositionId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [mentionIds, setMentionIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const leadId = lead?._id ?? lead?.id;

  const handleSubmit = async () => {
    if (!leadId || !dispositionId) return;
    setSubmitting(true);
    try {
      await createInteraction({ leadId, dispositionId, remarks: remarks.trim() || undefined, mentions: mentionIds.length ? mentionIds : undefined });
      push('Remark logged successfully', 'success');
      onLogged?.();
      setDispositionId(''); setRemarks(''); setMentionIds([]);
      onClose();
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to log remark', 'danger');
    } finally { setSubmitting(false); }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Add Remark"
      subtitle="Log a counseling note for this student — type @ to mention a teammate."
      size="sm"
      footer={
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pb: 2.5, pr: 2.5 }}>
          <SecondaryButton size="small" onClick={onClose} disabled={submitting}>Cancel</SecondaryButton>
          <PrimaryButton size="small" startIcon={<ChatBubbleIcon sx={{ fontSize: 14 }} />} onClick={handleSubmit} disabled={submitting || !dispositionId} loading={submitting}>
            {submitting ? 'Saving…' : 'Log Remark'}
          </PrimaryButton>
        </Box>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          required select label="Disposition" size="small" fullWidth
          value={dispositionId}
          onChange={(e) => setDispositionId(e.target.value)}
          disabled={dispLoading || submitting}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        >
          <option value="">Select Disposition</option>
          {dispositions.map((d) => <option key={d.id} value={d.id}>{d.label || d.name}</option>)}
        </TextField>
        <MentionInput
          label="Remarks"
          placeholder="Enter counseling notes, observations, or follow-up notes… (type @ to mention a teammate)"
          value={remarks}
          onChange={(next, ids) => { setRemarks(next); setMentionIds(ids); }}
          disabled={submitting}
          minRows={4}
        />
      </Box>
    </AppDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STATUS STRIP — the single most important current-state read-out, sitting
   immediately below the student header. One compact framed row answering
   "what is happening with this student right now?". Compact, no pills.
   ═══════════════════════════════════════════════════════════════════════ */
function StatusStrip({ lead, interactions }) {
  const sorted = useMemo(
    () => [...interactions].sort((a, b) => new Date(b.calledAt ?? b.createdAt ?? 0) - new Date(a.calledAt ?? a.createdAt ?? 0)),
    [interactions],
  );
  const latest = sorted[0];
  const latestDisposition = latest?.disposition?.name || latest?.dispositionName || '';
  const lastCallAt = lead?.lastCallAt || latest?.calledAt || latest?.createdAt || null;
  const nextFollowUp = lead?.nextActionDue || latest?.callbackDateTime || latest?.callbackDate || null;
  const lc = lifecycleOf(lead);
  const currentStatus = lead?.counselingStatus === 'completed' ? 'Completed' : (lead?.counselingStatus === 'in-progress' || lead?.counselingStatus === 'not-started') ? 'In Progress' : lc?.stage ? stageLabel(lc.stage) : 'New Lead';

  return (
    <Box sx={{ bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', px: { xs: 1.5, md: 2.25 }, py: 0.75 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', columnGap: 1, rowGap: 0.5 }}>
        <StatusStat label="Status" value={currentStatus} />
        <StatusStat label="Disposition" value={latestDisposition || M_EMPTY} />
        <StatusStat label="Last Call" value={lastCallAt ? fmtDate(lastCallAt) : '—'} />
        <StatusStat label="Next Follow-up" value={nextFollowUp ? fmtDate(nextFollowUp) : '—'} />
        <StatusStat label="Counselor" value={displayCounselor(lead)} />
        <StatusStat label="Assigned Agent" value={displayAgent(lead)} />
      </Box>
    </Box>
  );
}

function StatusStat({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography noWrap sx={{ fontSize: 9.5, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', mt: 0.15 }}>{value}</Typography>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════ */
export default function StudentDetailView({ leadId, onBack, onNavigate }) {
  const { setActiveStudent, bumpInteraction, interactionVersion } = useCounselor();
  const { push } = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [activeStage, setActiveStage] = useState('overview');
  const [interactions, setInteractions] = useState([]);

  const leadIdNum = lead?._id ?? lead?.id;

  /* ── Hydrate the full lead (GET /leads/:id) ─────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const fetched = await fetchLeadById(leadId);
        if (!cancelled) setLead(fetched);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || 'Could not load this student.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  /* ── Load interactions (call notes + recent-activity rail) ───────── */
  useEffect(() => {
    if (!leadIdNum) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchInteractions(leadIdNum);
        if (!cancelled) setInteractions(data ?? []);
      } catch {
        if (!cancelled) setInteractions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [leadIdNum, interactionVersion]);

  const handleOpenStage = useCallback((stage) => setActiveStage(stage), []);
  const handleRemarkLogged = useCallback(() => { if (leadIdNum) bumpInteraction(); }, [leadIdNum, bumpInteraction]);
  const handleOpenLead = useCallback(() => {
    if (leadIdNum && onNavigate) onNavigate('workspace', { _id: leadIdNum });
  }, [leadIdNum, onNavigate]);

  const sortedInteractions = useMemo(
    () => [...interactions].sort((a, b) => new Date(b.calledAt ?? b.createdAt ?? 0) - new Date(a.calledAt ?? a.createdAt ?? 0)),
    [interactions],
  );
  const feed = useMemo(() => (lead ? buildFeed(lead, sortedInteractions) : []), [lead, sortedInteractions]);
  const callNotesCount = useMemo(
    () => sortedInteractions.filter((n) => n.remarks && String(n.remarks).trim()).length,
    [sortedInteractions],
  );

  /* ── Profile save: PATCH /leads/:id then refresh the local copy ───── */
  const [profileSaving, setProfileSaving] = useState(false);
  const saveProfile = useCallback(async (payload) => {
    if (!leadIdNum) return false;
    setProfileSaving(true);
    try {
      const { data } = await client.patch(`/leads/${leadIdNum}`, payload);
      const updated = data.data?.lead ?? data.data;
      if (updated) { setLead(updated); setActiveStudent(updated); }
      push('Student profile updated', 'success');
      return true;
    } catch (err) {
      push(err?.response?.data?.message ?? 'Could not update profile', 'danger');
      return false;
    } finally { setProfileSaving(false); }
  }, [leadIdNum, setActiveStudent, push]);

  const handleLeadUpdated = useCallback(async (freshLead) => {
    if (freshLead) { setLead(freshLead); setActiveStudent(freshLead); }
    else if (leadIdNum) {
      try {
        const fetched = await fetchLeadById(leadIdNum);
        setLead(fetched);
        setActiveStudent(fetched);
      } catch { /* keep current copy */ }
    }
  }, [leadIdNum, setActiveStudent]);

  const apps = useApplications(leadIdNum, {
    enabled: activeStage === 'shortlist' || activeStage === 'applications',
  });

  /* ── Active-stage MAIN content (inline, no workspace navigation) ─── */
  const stageContent = useMemo(() => {
    if (!lead || !leadIdNum) return null;
    switch (activeStage) {
      case 'counseling':
        return <CounselingPanel lead={lead} interactions={sortedInteractions} />;
      case 'universities':
        return <UniversityFinderPanel lead={lead} />;
      case 'shortlist':
        return <ShortlistPanel lead={lead} onLeadUpdated={handleLeadUpdated} onApplicationStarted={() => apps.refetch()} />;
      case 'applications':
        return <ApplicationsPanel lead={lead} apps={apps} onLeadUpdated={handleLeadUpdated} />;
      case 'registration':
        return <JourneyRegistration lead={lead} onSave={saveProfile} saving={profileSaving} />;
      case 'documents':
        return <JourneyDocuments lead={lead} onSave={saveProfile} saving={profileSaving} />;
      case 'payments':
        return <JourneyPayments lead={lead} />;
      case 'visa':
        return <JourneyVisa lead={lead} onSave={saveProfile} saving={profileSaving} />;
      case 'overview':
      default:
        return <OverviewPanel lead={lead} interactions={sortedInteractions} />;
    }
  }, [activeStage, lead, leadIdNum, saveProfile, profileSaving, bumpInteraction, handleLeadUpdated, apps, sortedInteractions]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: { xs: 1.5, md: 2.5 }, minHeight: 0, overflowY: 'auto', width: '100%' }}>
        <Skeleton variant="rounded" height={92} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rounded" height={56} sx={{ borderRadius: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.75 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={140} sx={{ borderRadius: 2 }} />)}
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minHeight: 0, overflowY: 'auto' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'error.main' }}>{error}</Typography>
        <SecondaryButton size="small" onClick={onBack}>Back to students</SecondaryButton>
      </Box>
    );
  }

  if (!lead) return null;

  const activeCfg = JOURNEY.find((s) => s.id === activeStage);
  const activeLabel = activeStage === 'overview' ? 'Overview' : (activeCfg?.label ?? 'Overview');

  return (
    <Box
      sx={{
        width: '100%', maxWidth: 'none',
        // Mobile: natural height, page scrolls (panels stack).
        // Desktop (md+): fill the shell and own all vertical scrolling.
        flex: '1 1 auto', minHeight: 0,
        display: 'flex', flexDirection: 'column',
        p: { xs: 1, md: 1.5 },
        ...({ xs: { overflow: 'visible', height: 'auto' }, md: { overflow: 'hidden', height: '100%' } }),
      }}
    >
      {/* ── ONE master record container: identity + status + journey ── */}
      <Box sx={{
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        border: 1, borderColor: 'divider', borderRadius: 1.5,
        bgcolor: 'background.paper', overflow: 'hidden',
      }}>
        {/* ── Header: identity anchor ──────────────────────────── */}
        <DetailHeader
          lead={lead}
          onBack={onBack}
          onOpenLead={handleOpenLead}
          onAddRemark={() => setRemarkOpen(true)}
        />

        {/* ── Status rail: attached to header, not a floating card ── */}
        <StatusStrip lead={lead} interactions={sortedInteractions} />

        {/* ── Journey: directly below the status rail ──────────── */}
        <Box sx={{ borderTop: 1, borderColor: 'divider', px: { xs: 1.5, md: 2.25 }, py: 0.5 }}>
          <JourneyStepper lead={lead} active={activeStage === 'overview' ? '' : activeStage} onOpenStage={handleOpenStage} />
        </Box>
      </Box>

      {/* ── Workspace — the active stage + right rail, below the record ── */}
      <Box
        sx={{
          flex: '1 1 auto', minHeight: 0, mt: 1,
          display: { xs: 'block', md: 'grid' },
          gridTemplateColumns: { md: 'minmax(0, 72fr) minmax(0, 28fr)' },
          gridTemplateRows: 'minmax(0, 1fr)',
          gap: { xs: 1, md: 1 },
        }}
      >
        {/* LEFT — ACTIVE STAGE CARD (70–72%) */}
        <Box sx={{ minHeight: 0, height: { xs: 'auto', md: '100%' }, mb: { xs: 1, md: 0 } }}>
          <Paper variant="outlined" sx={{ borderRadius: 1.5, borderColor: 'divider', bgcolor: 'background.paper', height: { xs: 'auto', md: '100%' }, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Stage card header (sticky) */}
            <Box sx={{ px: 1.75, py: 0.85, display: 'flex', alignItems: 'center', gap: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0, bgcolor: 'grey.50' }}>
              <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
                {activeCfg?.icon ?? <PersonPinIcon sx={{ fontSize: 17 }} />}
              </Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: 'text.primary' }}>{activeLabel}</Typography>
              <Box sx={{ flex: 1 }} />
              {activeStage !== 'overview' && (
                <Box
                  role="button" tabIndex={0}
                  onClick={() => setActiveStage('overview')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveStage('overview'); } }}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.4, color: 'text.secondary',
                    cursor: 'pointer', flexShrink: 0, borderRadius: 1, px: 0.75, py: 0.45,
                    fontSize: 12, fontWeight: 600, '&:hover': { color: 'primary.main', bgcolor: 'primary.soft' },
                  }}
                >
                  <ArrowBackIcon sx={{ fontSize: 13 }} /> Overview
                </Box>
              )}
            </Box>
            {/* Stage card scrollable body */}
            <Box sx={{ flex: { xs: '1 1 auto', md: 1 }, minHeight: 0, overflowY: { xs: 'visible', md: 'auto' }, p: 1.75 }}>{stageContent}</Box>
          </Paper>
        </Box>

        {/* RIGHT — CALL NOTES (top) + RECENT ACTIVITY (bottom), own scrolls */}
        <Box sx={{ minHeight: 0, height: { xs: 'auto', md: '100%' }, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Call notes — counselor-facing conversation history */}
          <Paper variant="outlined" sx={{ borderRadius: 1.5, borderColor: 'divider', bgcolor: 'background.paper', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: { xs: '1 1 auto', md: '1 1 50%' }, maxHeight: { xs: 320, md: '50%' } }}>
            <Box sx={{ px: 1.5, py: 0.85, display: 'flex', alignItems: 'center', gap: 0.6, borderBottom: 1, borderColor: 'divider', flexShrink: 0, bgcolor: 'grey.50' }}>
              <NotesIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: 'text.primary' }}>Call Notes</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>{callNotesCount}</Typography>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: { xs: 'visible', md: 'auto' }, p: 1 }}>
              <CallNotesList interactions={sortedInteractions} />
            </Box>
          </Paper>

          {/* Recent activity — complete shared system timeline */}
          <Paper variant="outlined" sx={{ borderRadius: 1.5, borderColor: 'divider', bgcolor: 'background.paper', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: { xs: '1 1 auto', md: '1 1 50%' }, maxHeight: { xs: 320, md: '50%' } }}>
            <Box sx={{ px: 1.5, py: 0.85, display: 'flex', alignItems: 'center', gap: 0.6, borderBottom: 1, borderColor: 'divider', flexShrink: 0, bgcolor: 'grey.50' }}>
              <HistoryIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: 'text.primary' }}>Recent Activity</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>{feed.length} events</Typography>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: { xs: 'visible', md: 'auto' }, p: 1 }}>
              <ActivityList feed={feed} />
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* ── Remark dialog ──────────────────────────────────────── */}
      <RemarkDialog open={remarkOpen} onClose={() => setRemarkOpen(false)} lead={lead} onLogged={handleRemarkLogged} />
    </Box>
  );
}