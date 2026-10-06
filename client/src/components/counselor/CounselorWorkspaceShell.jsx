import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallEndIcon from '@mui/icons-material/CallEnd';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DialpadIcon from '@mui/icons-material/Dialpad';
import EmailIcon from '@mui/icons-material/Email';
import FlagIcon from '@mui/icons-material/Flag';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import PublicIcon from '@mui/icons-material/Public';
import RefreshIcon from '@mui/icons-material/Refresh';
import SchoolIcon from '@mui/icons-material/School';
import TimerIcon from '@mui/icons-material/Timer';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import client from '../../api/client.js';
import { auditEvent } from '../../api/audit.js';
import { fetchLeadLifecycle } from '../../api/lifecycle.js';
import { useApplications } from '../../hooks/useApplications.js';
import { CALL_ACTIVE, CALL_LABEL, CALL_STATUS, formatDuration, useCounselor } from '../../context/CounselorContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { isEmail, maskEmail, maskPhone } from '../../utils/privacy.js';
import { lifecycleOf, stageLabel, stageTone } from '../../utils/lifecycle.js';
import StatusChip from '../../ui/mui/StatusChip.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';
import GlossyActionButton from '../../ui/mui/GlossyActionButton.jsx';
import CallScreen from '../CallScreen.jsx';
import WhatsAppActionButton from '../WhatsAppActionButton.jsx';
import WhatsAppSidebar from '../WhatsAppSidebar.jsx';
import CounselorActionPanel from './CounselorActionPanel.jsx';
import {
  deriveStepStates,
  JourneyOverview, JourneyRegistration,
  JourneyDocuments, JourneyPayments, JourneyVisa,
} from '../CounselorWorkspace.jsx';
import UniversityFinderPanel from '../university/UniversityFinderPanel.jsx';
import ShortlistPanel from '../university/ShortlistPanel.jsx';
import ApplicationsPanel from '../application/ApplicationsPanel.jsx';
import TagsBar from '../TagsBar.jsx';

/* ═══════════════════════════════════════════════════════════════════════
   COUNSELOR WORKSPACE SHELL — the dedicated, full-lifecycle workspace for
   /counselor/workspace, modelled on the Agent Workspace 35%/65% desk.

   STRUCTURE (mirrors Agent Workspace):
     HEADER     — full-width STUDENT / CALL header. Row 1: back · avatar ·
                  name · ref ID · tags, with call controls on the right.
                  Row 2: quick-info pill strip — masked MOBILE/EMAIL with
                  View/Hide privacy toggles + SOURCE · OWNER · INTAKE ·
                  COUNTRY · UNIVERSITY · STAGE pills (Agent-style compact
                  rounded CRM pills).
     LEFT 35%   — persistent COUNSELOR ACTION / WORKFLOW panel
                  (CounselorActionPanel): disposition, remarks / call notes,
                  counseling status + action, and remark history. Stays
                  visible while working on the right.
     RIGHT 65%  — the actual Counselor Workspace:
                    NAV  — the 9-stage workflow stepper at the TOP of this
                           column: Overview → Counseling → Universities →
                           Shortlist → Applications → Registration →
                           Documents → Payments → Visa.
                    BODY — the selected workflow stage's content rendered in
                           the column. The RIGHT column replaces the old
                           Timeline/Calls/Remarks area with the working area
                           (no Timeline/Calls/Remarks).

   35% = ACTION / WORKFLOW PANEL   ("what I'm doing / notes")
   65% = MAIN STUDENT WORKSPACE    ("the workflow for this student")

   Reuses existing counselor components + backend logic (useCounselor(),
   /leads/:id, interactions, lifecycle, applications, shortlist, universities)
   — nothing is duplicated, nothing new is mocked.
   ═══════════════════════════════════════════════════════════════════════ */

const INK = 'text.primary';

const display = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.name || v.code || v.label || '—';
  return String(v);
};
const displaySource = (lead) => display(lead.source?.name ?? lead.source ?? lead.leadSource);
const displayAgent = (lead) => {
  if (lead.assignedTo && typeof lead.assignedTo === 'object') {
    return [lead.assignedTo.firstName, lead.assignedTo.lastName].filter(Boolean).join(' ') || '—';
  }
  return '—';
};

// Header quick-info extractors — mirror the Agent Workspace header logic.
const headerCountry = (lead) => {
  const cp = lead?.countryPreferred;
  if (cp && typeof cp === 'object' && cp.name) return cp.name;
  if (typeof cp === 'string') return cp;
  const pc = lead?.preferredCountries?.[0]?.country;
  if (pc && typeof pc === 'object' && pc.name) return pc.name;
  if (typeof pc === 'string') return pc;
  return '';
};

const headerUniversity = (lead) => {
  const pu = lead?.preferredUniversities?.[0]?.university;
  if (pu && typeof pu === 'object') return pu.name || pu.label || pu.code || '';
  if (typeof pu === 'string') return pu;
  return '';
};

/* ── Header quick-info pill (non-PII) ───────────────────────────────────
   Compact rounded-rectangle CRM pill: small muted icon + readable
   medium-weight value, with the field name surfaced on hover/focus via a
   tooltip so pills stay clean. Matches the Supervisor/Agent header pill
   family. Neutral base keeps the header calm; the value compresses with an
   ellipsis when space narrows. Renders nothing when the value is unset. ── */
function HeaderPill({ icon, label, value, tone, valueSx, sx }) {
  const text = display(value);
  if (!text || text === '—') return null;
  const toned = Boolean(tone);
  return (
    <Box
      component="span"
      title={`${label}: ${text}`}
      aria-label={`${label}: ${text}`}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.625,
        height: 28, borderRadius: '999px', pl: 0.375, pr: 1.125, flexShrink: 0, minWidth: 0,
        bgcolor: toned ? `${tone}.soft` : 'background.paper',
        border: 1, borderColor: toned ? `${tone}.border` : 'divider',
        color: 'text.secondary', whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        '&:hover': { boxShadow: '0 1px 4px rgba(15,23,42,0.08)', borderColor: toned ? `${tone}.main` : 'primary.border' },
        ...sx,
      }}
    >
      {icon && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            width: 20, height: 20, borderRadius: '50%', fontSize: 11.5,
            bgcolor: toned ? `${tone}.main` : 'primary.soft',
            color: toned ? '#fff' : 'primary.main',
          }}
          aria-hidden="true"
        >
          {icon}
        </Box>
      )}
      <Box component="span" sx={{
        fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis',
        minWidth: 0, maxWidth: 180, color: toned ? `${tone}.main` : 'text.primary', ...valueSx,
      }}>
        {text}
      </Box>
    </Box>
  );
}

/* ── Contact privacy pill (Mobile / Email) ──────────────────────────────
   Icon-first, matching the other header pills; the field name is surfaced
   on hover via tooltip. PII is masked by default; a compact [View] button
   beside each reveals the full value and flips to [Hide]. Revealing fires
   the audit event so access is logged per existing policy — the actual
   phone/email value is NEVER included in the log payload or tooltips while
   masked. ── */
function ContactRevealPill({ lead, field, icon, onReveal }) {
  const [revealed, setRevealed] = useState(false);
  const value = field === 'email' ? lead?.email : (lead?.mobile ?? lead?.phone);
  if (!value || typeof value !== 'string') return null;

  const resolvedEmail = field === 'email' || isEmail(value);
  const masked = resolvedEmail ? maskEmail(value) : maskPhone(value);
  const displayValue = revealed ? value : (masked || value);
  const Icon = revealed ? VisibilityOffIcon : VisibilityIcon;
  const fieldName = field === 'email' ? 'Email' : 'Mobile';

  const toggle = () => {
    const next = !revealed;
    setRevealed(next);
    if (next) onReveal?.();
  };

  return (
    <Box
      component="span"
      title={revealed ? `${fieldName}: ${value}` : `${fieldName}: click View to reveal`}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5,
        height: 28, borderRadius: '999px', pl: 0.375, pr: 0.5, flexShrink: 0, minWidth: 0,
        bgcolor: 'background.paper', border: 1, borderColor: 'divider', color: 'text.secondary',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        '&:hover': { boxShadow: '0 1px 4px rgba(15,23,42,0.08)', borderColor: 'primary.border' },
      }}
    >
      <Box component="span" sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: 20, height: 20, borderRadius: '50%', fontSize: 11.5, bgcolor: 'primary.soft', color: 'primary.main',
      }} aria-hidden="true">
        {icon}
      </Box>
      <Box
        component="span"
        sx={{
          fontSize: 12, fontWeight: 700, color: 'text.primary', lineHeight: 1.2,
          fontFamily: revealed ? 'inherit' : 'monospace',
          letterSpacing: revealed ? 0 : '0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: 200,
        }}
      >
        {displayValue}
      </Box>
      <Box
        component="button"
        type="button"
        aria-label={`${revealed ? 'Hide' : 'View'} ${field === 'email' ? 'email' : 'mobile'}`}
        title={`${revealed ? 'Hide' : 'View'} ${field === 'email' ? 'email' : 'mobile'}`}
        onClick={toggle}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.25,
          px: 0.625, py: '3px', ml: 0.25, border: 'none', borderRadius: '999px', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          lineHeight: 1, whiteSpace: 'nowrap',
          bgcolor: revealed ? 'grey.100' : 'primary.soft',
          color: revealed ? 'text.secondary' : 'primary.main',
          transition: 'background-color 120ms ease',
          '&:hover': { bgcolor: revealed ? 'grey.200' : 'primary.border' },
        }}
      >
        <Icon sx={{ fontSize: 12 }} />
        {revealed ? 'Hide' : 'View'}
      </Box>
    </Box>
  );
}


export default function CounselorWorkspaceShell({ student, onBack, refreshStats, initialStage = null }) {
  const { activeStudent, setActiveStudent, startCall, endCall, callStatus, phone, bumpInteraction, interactionVersion } = useCounselor();
  const { push } = useToast();

  const [dialerOpen, setDialerOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const prevCallActiveRef = useRef(false);

  // Right-column journey tabs that a dashboard stage shortcut can open. Only
  // one of them per initialStage — counseling lives in the LEFT action panel,
  // so a 'counseling' shortcut falls back to the overview tab (the workspace
  // still opens that student's counseling workflow via the left panel).
  const [journeyTab, setJourneyTab] = useState(() =>
    ['overview', 'universities', 'shortlist', 'applications', 'registration', 'documents', 'payments', 'visa'].includes(initialStage)
      ? initialStage
      : 'overview'
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [interactions, setInteractions] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [lifecycleData, setLifecycleData] = useState(null);

  /* ── Seed activeStudent from navigation prop ─────────────────────── */
  const seededRef = useRef(null);
  useEffect(() => {
    if (student && seededRef.current !== student) {
      seededRef.current = student;
      setActiveStudent(student);
    }
  }, [student, setActiveStudent]);

  /* ── Fetch full lead document in background ──────────────────────── */
  const fetchedIdRef = useRef(null);
  useEffect(() => {
    const id = student?.id || student?._id;
    if (!id) return;
    if (fetchedIdRef.current === id) return;
    fetchedIdRef.current = id;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await client.get(`/leads/${id}`);
        const fetched = data.data?.lead ?? data.data;
        if (!cancelled && fetched) setActiveStudent(fetched);
      } catch { /* keep seeded student */ }
    })();
    return () => { cancelled = true; };
  }, [student, student?.id, student?._id, setActiveStudent]);

  const lead = activeStudent;

  /* ── Call workspace controls ─────────────────────────────────────── */
  const isOnCall = CALL_ACTIVE.has(callStatus);
  const callDone = callStatus === CALL_STATUS.ENDED;
  const callPillLabel = CALL_LABEL[callStatus] ?? 'Ready';
  const pillTone = callDone ? 'warning' : isOnCall ? 'danger' : 'success';
  const canStartCall = callStatus === CALL_STATUS.IDLE && !isOnCall;

  const [callElapsedMs, setCallElapsedMs] = useState(0);
  useEffect(() => {
    if (callStatus !== CALL_STATUS.CONNECTED) return undefined;
    const start = Date.now();
    setCallElapsedMs(0);
    const id = window.setInterval(() => setCallElapsedMs(Date.now() - start), 1000);
    return () => window.clearInterval(id);
  }, [callStatus]);

  // Auto-open the floating dialer when a call goes live, mirroring the Agent
  // Workspace; the Phone button can reopen it anytime after it's closed.
  useEffect(() => {
    const wasActive = prevCallActiveRef.current;
    prevCallActiveRef.current = isOnCall;
    if (isOnCall && !wasActive) setDialerOpen(true);
    if (!isOnCall) setDialerOpen(false);
  }, [isOnCall]);

  /* ── Profile save (same backend as the shared workspace) ─────────── */
  const saveProfile = useCallback(async (payload) => {
    if (!lead) return false;
    setProfileSaving(true);
    try {
      const { data } = await client.patch(`/leads/${lead._id}`, payload);
      const updated = data.data?.lead ?? data.data;
      if (updated) setActiveStudent(updated);
      push('Student profile updated', 'success');
      return true;
    } catch (err) {
      push(err?.response?.data?.message ?? 'Could not update profile', 'danger');
      return false;
    } finally {
      setProfileSaving(false);
    }
  }, [lead, setActiveStudent, push]);

  /* ── Interactions (notes shown in Overview) ──────────────────────── */
  const loadInteractions = useCallback(async (leadId) => {
    try {
      const { data } = await client.get('/interactions', { params: { leadId } });
      setInteractions(data.data ?? []);
      setHistoryError(null);
    } catch (err) {
      setHistoryError(err?.response?.data?.message ?? 'Could not load interaction history');
    }
  }, []);

  useEffect(() => {
    if (!lead?._id) { setInteractions([]); setHistoryError(null); return; }
    loadInteractions(lead._id);
  }, [lead?._id, interactionVersion, loadInteractions]);

  /* ── Lifecycle events ────────────────────────────────────────────── */
  const loadLifecycle = useCallback(async (leadId) => {
    try {
      const data = await fetchLeadLifecycle(leadId);
      setLifecycleData(data ?? {});
    } catch {
      setLifecycleData({ events: [] });
    }
  }, []);

  useEffect(() => {
    if (!lead?._id) { setLifecycleData(null); return; }
    loadLifecycle(lead._id);
  }, [lead?._id, loadLifecycle]);

  const apps = useApplications(lead?._id, {
    enabled: journeyTab === 'shortlist' || journeyTab === 'applications',
  });

  const handleLeadUpdated = useCallback(async (freshLead) => {
    if (freshLead) {
      setActiveStudent(freshLead);
    } else if (lead?._id) {
      try {
        const { data } = await client.get(`/leads/${lead._id}`);
        const updated = data.data?.lead ?? data.data;
        if (updated) setActiveStudent(updated);
      } catch { /* keep current copy */ }
    }
    if (lead?._id) loadLifecycle(lead._id);
  }, [lead?._id, setActiveStudent, loadLifecycle]);

  // After a counselor action (e.g. Mark Counseling Complete) the lead's
  // workflow statuses change — refetch the full lead so header + nav + right
  // stage content reflect the new state.
  const handleCounselorAction = useCallback(async () => {
    if (!lead?._id) return;
    try {
      const { data } = await client.get(`/leads/${lead._id}`);
      const updated = data.data?.lead ?? data.data;
      if (updated) setActiveStudent(updated);
    } catch { /* keep current copy */ }
    if (lead?._id) loadLifecycle(lead._id);
  }, [lead?._id, setActiveStudent, loadLifecycle]);

  /* ── Guard ───────────────────────────────────────────────────────── */
  if (!lead) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: 'text.disabled', fontSize: 14 }}>No student selected.</Typography>
      </Box>
    );
  }

  const lc = lifecycleOf(lead);
  const initials = String(lead.studentName || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  // Counseling lives in the LEFT Counselor Actions panel, so it is removed
  // from this horizontal workflow stepper: Overview → Universities →
  // Shortlist → Applications → Registration → Documents → Payments → Visa.
  const steps = deriveStepStates(lead).filter((s) => s.id !== 'counseling');

  const renderStage = () => {
    switch (journeyTab) {
      case 'overview':      return <JourneyOverview lead={lead} interactions={interactions} onSave={saveProfile} saving={profileSaving} onNavigate={setJourneyTab} />;
      case 'universities':  return <UniversityFinderPanel lead={lead} />;
      case 'shortlist':     return <ShortlistPanel lead={lead} onLeadUpdated={handleLeadUpdated} onApplicationStarted={() => apps.refetch()} />;
      case 'applications':  return <ApplicationsPanel lead={lead} apps={apps} onLeadUpdated={handleLeadUpdated} />;
      case 'registration':  return <JourneyRegistration lead={lead} onSave={saveProfile} saving={profileSaving} />;
      case 'documents':     return <JourneyDocuments lead={lead} onSave={saveProfile} saving={profileSaving} />;
      case 'payments':      return <JourneyPayments lead={lead} />;
      case 'visa':          return <JourneyVisa lead={lead} onSave={saveProfile} saving={profileSaving} />;
      default:              return null;
    }
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ═══════════ ONE UNIFIED TOOLBAR: identity + call controls + quick-info pill strip ═══════════ */}
      <Box sx={{
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        bgcolor: 'background.paper', boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
      }}>

        {/* ── Row 1: back + student identity + call controls ── */}
        <Box sx={{
          display: 'flex', alignItems: 'stretch',
          bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider',
        }}>

          {/* ── Left: back + avatar + name + ref + tags (single line) ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flex: '1 1 auto', px: 1, py: 0.5 }}>
            <Box
              onClick={onBack}
              title="Back to students"
              sx={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: 1, flexShrink: 0,
                color: 'text.secondary', cursor: 'pointer',
                '&:hover': { color: 'text.primary', bgcolor: 'grey.100' },
              }}
            >
              <ArrowBackIcon sx={{ fontSize: 15 }} />
            </Box>

            <Box sx={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11.5, fontWeight: 700, color: 'primary.main', bgcolor: 'primary.soft', border: 1, borderColor: 'primary.border',
            }}>
              {initials || '—'}
            </Box>

            {/* Name + reference ID — prominent, single row */}
            <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.2 }}>
                {lead.studentName || '—'}
              </Typography>
              {lead.referenceId && (
                <Typography
                  noWrap
                  sx={{
                    fontSize: 9.5, fontWeight: 600, fontFamily: 'monospace',
                    color: 'text.disabled', bgcolor: 'grey.100', border: 1, borderColor: 'divider',
                    px: 0.5, py: '1px', borderRadius: 0.5, letterSpacing: '0.03em', lineHeight: 1.5, flexShrink: 0,
                  }}
                >
                  {lead.referenceId}
                </Typography>
              )}
              <TagsBar
                variant="header"
                lead={lead}
                onChange={({ tags, history }) => setActiveStudent({ ...lead, tags, history })}
              />
            </Box>
          </Box>

          {/* ── Right: call controls (far right, same row) ─────────── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, px: 1 }}>
            <StatusChip status={callPillLabel} tone={pillTone} size="small" pulse={isOnCall} sx={{ height: 22, '& .MuiChip-label': { fontWeight: 600, fontSize: 10.5 } }} />

            {isOnCall && (
              <Box sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 24, px: 0.75,
                borderRadius: 1, bgcolor: 'error.light', color: 'error.dark',
                fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>
                <TimerIcon sx={{ fontSize: 12 }} />
                {formatDuration(callElapsedMs)}
              </Box>
            )}

            <GlossyActionButton
              icon={<CallMadeIcon sx={{ fontSize: 14 }} />}
              label="Start Call"
              color="#166534"
              size="small"
              onClick={() => startCall(lead)}
              disabled={!canStartCall}
              pulse={canStartCall}
              title="Start a call for this student"
            />
            <GlossyActionButton
              icon={<CallEndIcon sx={{ fontSize: 14 }} />}
              label="End Call"
              color="#B91C1C"
              size="small"
              onClick={endCall}
              disabled={!isOnCall}
              title="End the current call"
            />
            <GlossyActionButton
              icon={<DialpadIcon sx={{ fontSize: 14 }} />}
              label="Phone"
              color="#0369A1"
              size="small"
              onClick={() => setDialerOpen(true)}
              title="Open the phone (dial pad, hold, transfer, conference, mute)"
            />
            <WhatsAppActionButton onClick={() => setWhatsappOpen(true)} />

            <SecondaryButton
              size="small"
              startIcon={<RefreshIcon sx={{ fontSize: 13 }} />}
              onClick={refreshStats}
              sx={{ minWidth: 0, height: 26, px: 0.75 }}
            >
              Refresh
            </SecondaryButton>
          </Box>
        </Box>

        {/* ── Row 2: quick-info pill strip — privacy (masked w/ View) + key CRM facts ──
            Compact Agent-style rounded pills; single row that scrolls rather than
            wrapping so the header never grows excessively tall. ── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          px: 1, py: 0.5, minWidth: 0,
          overflowX: 'auto', overflowY: 'hidden', whiteSpace: 'nowrap',
          borderBottom: 1, borderColor: 'divider',
          '&::-webkit-scrollbar': { height: 0 },
        }}>
          <ContactRevealPill
            lead={lead}
            field="mobile"
            icon={<PhoneIcon sx={{ fontSize: 12 }} />}
            onReveal={() => auditEvent({
              action: 'VIEW_MOBILE',
              module: 'crud',
              leadId: lead?._id,
              leadName: lead?.studentName,
              message: `Contact mobile revealed for ${(lead?.studentName || 'student').slice(0, 60)}`,
            })}
          />
          <ContactRevealPill
            lead={lead}
            field="email"
            icon={<EmailIcon sx={{ fontSize: 12 }} />}
            onReveal={() => auditEvent({
              action: 'VIEW_EMAIL',
              module: 'crud',
              leadId: lead?._id,
              leadName: lead?.studentName,
              message: `Contact email revealed for ${(lead?.studentName || 'student').slice(0, 60)}`,
            })}
          />
          <HeaderPill icon={<PublicIcon sx={{ fontSize: 12 }} />} label="Source" value={displaySource(lead)} />
          <HeaderPill icon={<PersonIcon sx={{ fontSize: 12 }} />} label="Owner" value={displayAgent(lead)} />
          <HeaderPill icon={<CalendarMonthIcon sx={{ fontSize: 12 }} />} label="Intake" value={lead.intake} />
          <HeaderPill icon={<FlagIcon sx={{ fontSize: 12 }} />} label="Country" value={headerCountry(lead)} />
          <HeaderPill icon={<SchoolIcon sx={{ fontSize: 12 }} />} label="University" value={headerUniversity(lead)} />
          {lc?.stage && (() => {
            const rawTone = stageTone(lc.stage);
            const tone = rawTone === 'danger' ? 'error'
              : ['success', 'warning', 'info', 'error'].includes(rawTone) ? rawTone
              : 'primary';
            return (
              <HeaderPill
                icon={<CheckCircleIcon sx={{ fontSize: 11 }} />}
                label="Stage"
                value={stageLabel(lc.stage)}
                tone={tone}
              />
            );
          })()}
        </Box>
      </Box>

      {/* ═══════════════════ BODY: LEFT action | RIGHT workspace ═══════════════════
          Matches Agent Workspace exact grid: 35% left / 65% right.
          No borders around columns — Agent uses transparent background with
          internal panel styling (CounselorActionPanel + journey stages own
          their own borders/shadows). ── */}
      <Box sx={{
        flex: '1 1 0', minHeight: 0, display: 'grid',
        gridTemplateColumns: 'minmax(320px, 35%) minmax(0, 1fr)',
        gap: 0, alignItems: 'stretch', bgcolor: 'transparent', overflowY: 'hidden',
      }}>

        {/* ── LEFT: persistent Counselor action/work panel. Sized to its own
             content (alignSelf: 'start') rather than force-stretched to match
             the right column's height — a short disposition/remarks form no
             longer leaves a large blank void under it. It still caps at the
             row's available height and scrolls internally (maxHeight: 100% +
             overflowY: auto) for students with a long remark history, so
             nothing is ever clipped. ── */}
        <Box component="aside" sx={{
          bgcolor: 'background.paper', minWidth: 0,
          maxHeight: '100%', overflowY: 'auto', alignSelf: 'start',
          display: 'flex', flexDirection: 'column',
          borderRight: 1, borderBottom: 1, borderColor: 'divider',
          borderBottomRightRadius: 8,
        }}>
          <CounselorActionPanel lead={lead} interactions={interactions} onCompleted={handleCounselorAction} />
        </Box>

        {/* ── RIGHT: Counselor Workspace (nav + stage content) — 65% ── */}
        <Box component="section" sx={{
          bgcolor: 'background.paper', minWidth: 0, minHeight: 0,
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Workflow navigation at the top of this 65% column — premium pill-tab
              segmented control: filled active state, soft-tinted completed
              state with a check, muted upcoming state. No chevrons — the pills
              carry the sequence on their own via visual weight. */}
          <Box sx={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5,
            px: 1.25, py: 0.75, bgcolor: 'background.paper',
            borderBottom: 1, borderColor: 'divider',
            overflowX: 'auto', overflowY: 'hidden', whiteSpace: 'nowrap',
            '&::-webkit-scrollbar': { height: 0 },
          }}>
            {steps.map((step) => {
              const isActive = journeyTab === step.id;
              const isCompleted = step.state === 'completed';
              const isCurrent = step.state === 'current';
              return (
                <Tooltip key={step.id} title={step.clickable ? `Go to ${step.label}` : `${step.label} — not yet available`} arrow placement="bottom">
                  <Box
                    onClick={() => step.clickable && setJourneyTab(step.id)}
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.125, py: 0.5,
                      borderRadius: '999px', flexShrink: 0, cursor: step.clickable ? 'pointer' : 'default',
                      border: 1,
                      borderColor: isActive ? 'primary.main' : isCompleted ? 'success.border' : isCurrent ? 'primary.border' : 'transparent',
                      bgcolor: isActive ? 'primary.main' : isCompleted ? 'success.soft' : isCurrent ? 'primary.soft' : 'transparent',
                      boxShadow: isActive ? '0 2px 6px -2px rgba(15,118,110,0.45)' : 'none',
                      '&:hover': step.clickable ? {
                        bgcolor: isActive ? 'primary.main' : isCompleted ? 'success.soft' : 'grey.100',
                        borderColor: isActive ? 'primary.main' : isCompleted ? 'success.border' : 'divider',
                      } : {},
                      userSelect: 'none', transition: 'background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
                    }}
                  >
                    {isCompleted ? (
                      <CheckCircleIcon sx={{ fontSize: 13, color: 'success.main', flexShrink: 0 }} />
                    ) : (
                      <Box sx={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        bgcolor: isActive ? '#fff' : isCurrent ? 'primary.main' : 'grey.400',
                      }} />
                    )}
                    <Typography noWrap sx={{
                      fontSize: 11.5, lineHeight: 1.2, fontWeight: isActive || isCurrent ? 700 : 500,
                      color: isActive ? '#fff' : isCompleted ? 'success.main' : isCurrent ? 'primary.main' : 'text.disabled',
                      transition: 'color 120ms ease',
                    }}>
                      {step.label}
                    </Typography>
                  </Box>
                </Tooltip>
              );
            })}
            <Box sx={{ flex: 1, minWidth: '8px' }} />
            {historyError && <Typography sx={{ fontSize: 10.5, color: 'error.main', flexShrink: 0 }}>{historyError}</Typography>}
          </Box>

          {/* Stage content */}
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', p: 1.5 }}>
            {renderStage()}
          </Box>
        </Box>
      </Box>
    </Box>
    <WhatsAppSidebar
      open={whatsappOpen}
      onClose={() => setWhatsappOpen(false)}
      lead={lead}
    />
    <CallScreen
      open={dialerOpen}
      onClose={() => setDialerOpen(false)}
      timerSeconds={Math.floor(callElapsedMs / 1000)}
      phone={phone}
      lead={lead}
      startCall={startCall}
      endCall={endCall}
      callActive={isOnCall}
      callConnected={callStatus === CALL_STATUS.CONNECTED}
      callEnding={callStatus === CALL_STATUS.ENDING}
    />
    </Box>
  );
}
