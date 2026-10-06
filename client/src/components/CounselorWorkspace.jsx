import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Chip, Divider, Grid, IconButton, LinearProgress, Skeleton,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import BadgeIcon from '@mui/icons-material/Badge';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallEndIcon from '@mui/icons-material/CallEnd';

import DescriptionIcon from '@mui/icons-material/Description';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import HistoryIcon from '@mui/icons-material/History';
import PaymentIcon from '@mui/icons-material/Payment';
import PersonIcon from '@mui/icons-material/Person';
import PublicIcon from '@mui/icons-material/Public';
import SaveIcon from '@mui/icons-material/Save';
import SchoolIcon from '@mui/icons-material/School';
import SendIcon from '@mui/icons-material/Send';
import SipIcon from '@mui/icons-material/Sip';
import TimelineIcon from '@mui/icons-material/Timeline';
import TimerIcon from '@mui/icons-material/Timer';
import client from '../api/client.js';
import { fetchInteractions, createInteraction, updateCounselorStatus } from '../api/leads.js';
import { auditEvent } from '../api/audit.js';
import { fetchLeadLifecycle } from '../api/lifecycle.js';
import { fetchRegistrationDetail, updateRegistration, completeCounseling } from '../api/counselor.js';
import { fetchLeadDocuments, createDocument, updateDocument, deleteDocument } from '../api/documents.js';
import { useApplications } from '../hooks/useApplications.js';
import { useDispositions } from '../api/useDispositions.js';
import { useLookups } from '../api/useLookups.js';
import { useAuth } from '../context/AuthContext.jsx';
import { CALL_ACTIVE, CALL_LABEL, CALL_STATUS, formatDuration, useCounselor } from '../context/CounselorContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fromLeadCounselor } from '../utils/counselorProfile.js';
import { lifecycleOf, stageLabel, stageTone } from '../utils/lifecycle.js';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
import StatusChip from '../ui/mui/StatusChip.jsx';
import GlossyActionButton from '../ui/mui/GlossyActionButton.jsx';
import ActivityPanel from './ActivityPanel.jsx';
import CallScreen from './CallScreen.jsx';
import WhatsAppTemplateDialog from './WhatsAppTemplateDialog.jsx';
import WhatsAppActionButton from './WhatsAppActionButton.jsx';
import UniversityFinderPanel from './university/UniversityFinderPanel.jsx';
import ShortlistPanel from './university/ShortlistPanel.jsx';
import ApplicationsPanel from './application/ApplicationsPanel.jsx';

/* ==========================================================================
   COUNSELOR WORKSPACE — case-management workspace for the full student
   lifecycle: Counseling → Registration → Documents → Applications → Visa.

   Layout:
      HEADER   — compact student identity + lifecycle stepper + call controls
      BODY     — Main content (~63%) | Activity rail (~18%, self-contained:
                 Timeline/Calls/Remarks tabs + Journey + Next Action)

   Source of truth: CounselorContext.activeStudent (NOT local state).
   All call operations go through CounselorContext (NOT AgentContext).
   ========================================================================== */

/* Restrained palette accents — blue only marks active/interactive, green
   only genuine completion, red only problems. Everything else is ink/grey. */
const INK = 'text.primary';
const STEPPER_DONE = 'success.main';   // subtle ✓ on finished stages
const STEPPER_CURRENT = 'primary.main'; // active stage marker

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const display = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.name || v.code || v.label || '—';
  return String(v);
};

const displayPhone = (lead) => display(lead.mobile ?? lead.phone);
const displaySource = (lead) => display(lead.source?.name ?? lead.source ?? lead.leadSource);
const displayCountry = (lead) => display(lead.countryPreferred?.name ?? lead.countryPreferred ?? lead.countryInterested);
const displayAgent = (lead) => {
  if (lead.assignedTo && typeof lead.assignedTo === 'object') {
    return [lead.assignedTo.firstName, lead.assignedTo.lastName].filter(Boolean).join(' ') || '—';
  }
  return '—';
};

const EDUCATION_LEVELS = ['High School', "Bachelor's Degree", "Master's Degree", "Doctorate / PhD", 'Diploma', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];
const MARITAL = ['Married', 'Unmarried', 'Other'];
const YES_NO = ['Yes', 'No'];
const YES_NO_NA = ['Yes', 'No', 'N/A'];

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

const REG_OPTIONS = [
  { label: 'Not Started', value: 'not-started' },
  { label: 'Registration Pending', value: 'registration-pending' },
  { label: 'Agreement Pending', value: 'agreement-pending' },
  { label: 'Fee Pending', value: 'fee-pending' },
  { label: 'Fee Received', value: 'fee-received' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const AGREEMENT_OPTIONS = [
  { label: 'Not Started', value: 'not-started' },
  { label: 'Pending', value: 'pending' },
  { label: 'Signed', value: 'signed' },
];

const FEE_STATUS_OPTIONS = [
  { label: 'Not Applicable', value: 'not-applicable' },
  { label: 'Pending', value: 'pending' },
  { label: 'Received', value: 'received' },
];

const DOC_CATEGORIES = [
  { label: 'Identity', value: 'identity' },
  { label: 'Academic', value: 'academic' },
  { label: 'Financial', value: 'financial' },
  { label: 'Test Score', value: 'test-score' },
  { label: 'Application', value: 'application' },
  { label: 'Visa', value: 'visa' },
  { label: 'Other', value: 'other' },
];

const DOC_STATUS_OPTIONS = [
  { label: 'Missing', value: 'missing' },
  { label: 'Received', value: 'received' },
  { label: 'Under Review', value: 'under-review' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
];
const DOC_OPTIONS = [
  { label: 'Not Started', value: '' },
  { label: 'Gathering',   value: 'gathering' },
  { label: 'Submitted',   value: 'submitted' },
  { label: 'Verified',    value: 'verified' },
];
const VISA_OPTIONS = [
  { label: 'Not Started',         value: '' },
  { label: 'Gathering Docs',      value: 'gathering' },
  { label: 'Application Filed',   value: 'filed' },
  { label: 'Interview Scheduled', value: 'interview' },
  { label: 'Visa Received',       value: 'received' },
  { label: 'Visa Denied',         value: 'denied' },
];

/* ── Shared layout helpers ──────────────────────────────────────────────── */

function SectionTitle({ icon, title }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'text.primary', mb: 1.5 }}>
      <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }}>{icon}</Box>
      {title}
      <Box sx={{ flex: 1, height: 1, bgcolor: 'divider', ml: 0.5 }} />
    </Box>
  );
}

function SubHeading({ children }) {
  return (
    <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mt: 2.5, mb: 1 }}>{children}</Typography>
  );
}

// A tinted, bordered panel that groups one topic's fields into a visually
// distinct block — used so a dense stack of form fields (Personal Info,
// Registration, Documents, etc.) reads as a set of premium CRM cards rather
// than a flat, uncontained list of inputs.
function SectionCard({ children, sx }) {
  return (
    <Box sx={{
      border: 1, borderColor: 'divider', borderRadius: 2,
      bgcolor: 'grey.50', p: { xs: 1.5, md: 2 },
      ...sx,
    }}>
      {children}
    </Box>
  );
}

function InfoRow({ label, value, width }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.25, ...width }}>
      <Typography sx={{ fontSize: 11.5, color: 'text.disabled', flexShrink: 0 }}>{label}</Typography>
      <Tooltip title={value && value !== '—' ? String(value) : ''} arrow placement="top">
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</Typography>
      </Tooltip>
    </Box>
  );
}

/* Lifecycle stepper model — the same nine steps as before. State is derived
   exactly as it always was (status fields + preference/application signals);
   only the presentation changed: text glyphs instead of icon pills, and the
   row wraps instead of scrolling horizontally. */
const STEPS = [
  { id: 'overview', label: 'Overview' },
  { id: 'counseling', label: 'Counseling' },
  { id: 'universities', label: 'Universities' },
  { id: 'shortlist', label: 'Shortlist' },
  { id: 'applications', label: 'Applications' },
  { id: 'registration', label: 'Registration' },
  { id: 'documents', label: 'Documents' },
  { id: 'payments', label: 'Payments' },
  { id: 'visa', label: 'Visa' },
];

const MID_STEPS = new Set(['universities', 'shortlist', 'applications']);

export function deriveStepStates(lead) {
  const appVal = (lead.applicationStatus || 'not-started').toLowerCase();
  const appStarted = appVal === 'in-progress' || appVal === 'completed';
  const prefsSet = (lead.preferredCountries?.length ?? 0) > 0 || (lead.preferredUniversities?.length ?? 0) > 0;
  const statusMap = {
    counseling: lead.counselingStatus,
    registration: lead.registrationStatus,
    documents: lead.documentStatus,
    payments: lead.paymentStatus,
    visa: lead.visaStatus,
  };
  return STEPS.map((step, i) => {
    let state;
    if (step.id === 'overview') {
      state = 'completed';
    } else if (step.id === 'universities') {
      state = prefsSet ? 'completed' : 'current';
    } else if (step.id === 'shortlist') {
      state = appStarted ? 'completed' : 'current';
    } else if (step.id === 'applications') {
      state = appVal === 'completed' ? 'completed' : appStarted ? 'current' : 'upcoming';
    } else {
      const val = (statusMap[step.id] || 'not-started').toLowerCase();
      if (val === 'completed') state = 'completed';
      else if (val === 'in-progress') state = 'current';
      else {
        const prevCompleted = STEPS.slice(0, i).every((s) => {
          if (s.id === 'overview') return true;
          if (MID_STEPS.has(s.id)) return true; // informational milestones — never block downstream steps
          const pv = (statusMap[s.id] || 'not-started').toLowerCase();
          return pv === 'completed' || pv === 'in-progress';
        });
        state = prevCompleted ? 'current' : 'upcoming';
      }
    }
    const clickable = MID_STEPS.has(step.id) || state === 'completed' || state === 'current';
    return { ...step, state, clickable };
  });
}

/* ── Chevron separator between stepper steps ────────────────────── */
function StepChevron({ muted }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, flexShrink: 0, color: muted ? 'grey.300' : 'grey.400',
        userSelect: 'none',
      }}
    >
      <svg width="6" height="10" viewBox="0 0 6 10" fill="none" style={{ display: 'block' }}>
        <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Box>
  );
}

/* Compact student header — enterprise CRM workflow navigation bar.
   Identity line (back · avatar · name/contact · start call) on top,
   lifecycle stepper on bottom — both in a single compact panel that
   never scrolls horizontally. */
function StudentHeader({ lead, journeyTab, onBack, onStep, callControls }) {
  const lc = lifecycleOf(lead);
  const initials = String(lead.studentName || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const steps = deriveStepStates(lead);

  return (
    <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      {/* ── Identity row ─────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, minWidth: 0 }}>
        {/* Back — lightweight text/icon control */}
        <Box
          onClick={onBack}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.25,
            color: 'text.secondary', cursor: 'pointer', flexShrink: 0,
            borderRadius: 1, px: 0.5, py: 0.25,
            fontSize: 11.5, fontWeight: 500,
            transition: 'color 120ms ease, background-color 120ms ease',
            '&:hover': { color: 'text.primary', bgcolor: 'grey.50' },
          }}
        >
          <ArrowBackIcon sx={{ fontSize: 14 }} />
        </Box>

        {/* Initials avatar */}
        <Box sx={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, fontWeight: 700, color: INK,
          bgcolor: 'grey.100', border: 1, borderColor: 'divider',
        }}>
          {initials || '—'}
        </Box>

        {/* Name + reference ID + contact */}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.2 }}>
              {lead.studentName || '—'}
            </Typography>
            <Typography noWrap sx={{ fontSize: 10, color: 'text.disabled', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
              {lead.referenceId}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.125, minWidth: 0, flexWrap: 'wrap' }}>
            <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>
              {[displayPhone(lead), lead.email].filter((v) => v && v !== '—').join('  ·  ') || 'No contact details'}
            </Typography>
            {lc?.stage && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>·</Typography>
                <StatusChip status={stageLabel(lc.stage)} tone={stageTone(lc.stage)} sx={{ height: 17, fontSize: 9.5, '& .MuiChip-label': { px: 0.6 } }} />
              </Box>
            )}
            {displayAgent(lead) !== '—' && (
              <Typography noWrap sx={{ fontSize: 10.5, color: 'text.disabled' }}>
                · Owner: {displayAgent(lead)}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Call controls — right-aligned */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625, flexShrink: 0 }}>
          {callControls}
        </Box>
      </Box>

      {/* ── Lifecycle stepper — compact horizontal workflow ───────── */}
      <Box sx={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        rowGap: '2px', px: 1.5, pb: 0.75,
      }}>
        {steps.map((step, i) => {
          const isActive = journeyTab === step.id;
          const isCompleted = step.state === 'completed';
          const isCurrent = step.state === 'current';

          return (
            <Box key={step.id} sx={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 && <StepChevron muted={step.state === 'upcoming' && steps[i - 1]?.state === 'upcoming'} />}
              <Tooltip
                title={step.clickable ? `Go to ${step.label}` : `${step.label} — not yet available`}
                arrow placement="bottom"
              >
                <Box
                  onClick={() => step.clickable && onStep(step.id)}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.35,
                    px: 0.5, py: '2px', borderRadius: 0.75,
                    cursor: step.clickable ? 'pointer' : 'default',
                    bgcolor: isActive ? 'primary.main' : isCurrent ? 'grey.50' : 'transparent',
                    '&:hover': step.clickable ? {
                      bgcolor: isActive ? 'primary.main' : 'grey.100',
                    } : {},
                    userSelect: 'none',
                    transition: 'background-color 100ms ease',
                  }}
                >
                  {/* State indicator — small icon or dot */}
                  {isCompleted ? (
                    <CheckCircleIcon sx={{ fontSize: 12, color: 'success.main', flexShrink: 0 }} />
                  ) : isCurrent ? (
                    <Box sx={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      bgcolor: isActive ? 'primary.contrastText' : 'primary.main',
                    }} />
                  ) : (
                    <Box sx={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      bgcolor: 'grey.300',
                    }} />
                  )}

                  {/* Step label */}
                  <Typography noWrap sx={{
                    fontSize: 11, lineHeight: 1.2, fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'primary.contrastText'
                      : isCompleted ? 'text.secondary'
                      : isCurrent ? INK
                      : 'grey.400',
                    transition: 'color 100ms ease',
                  }}>
                    {step.label}
                  </Typography>
                </Box>
              </Tooltip>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

const ACTIVITY_COLLAPSED_KEY = 'counselor-activity-collapsed';

export default function CounselorWorkspace({ student, onBack, leftCollapsed, showActivity = true }) {
  const {
    activeStudent, setActiveStudent,
    startCall, endCall, callStatus, phone,
    interactionVersion, bumpInteraction,
  } = useCounselor();
  const [dialerOpen, setDialerOpen] = useState(false);
  const prevCallActiveRef = useRef(false);
  const { push } = useToast();
  const { user } = useAuth();

  const [journeyTab, setJourneyTab] = useState('overview');
  const [profileSaving, setProfileSaving] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(() => {
    try { return localStorage.getItem(ACTIVITY_COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  const toggleRight = useCallback(() => {
    setRightCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(ACTIVITY_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);

  // WhatsApp template composer — one shared dialog for the loaded student.
  const [waOpen, setWaOpen] = useState(false);
  const openWhatsApp = useCallback(() => {
    setWaOpen(true);
    if (activeStudent?._id && activeStudent?._id !== 'new') {
      auditEvent({
        action: 'WHATSAPP_TEMPLATE_OPENED',
        module: 'workflow',
        leadId: activeStudent._id,
        leadName: activeStudent.studentName,
        message: `WhatsApp composer opened for ${String(activeStudent.studentName || 'student').slice(0, 60)}`,
      });
    }
  }, [activeStudent]);
  const closeWhatsApp = useCallback(() => setWaOpen(false), []);

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

  /* ── Call state ──────────────────────────────────────────────────── */
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

  // Auto-open the floating dialer when a call goes live; the Phone button
  // reopens it anytime after it's closed.
  useEffect(() => {
    const wasActive = prevCallActiveRef.current;
    prevCallActiveRef.current = isOnCall;
    if (isOnCall && !wasActive) setDialerOpen(true);
    if (!isOnCall) setDialerOpen(false);
  }, [isOnCall]);

  /* Header call controls — compact, professional, right-aligned in the
     identity row. Start Call is ~36px tall, green only as an action CTA. */
  const callControls = (
    <>
      {isOnCall && (
        <>
          <StatusChip status={callPillLabel} tone={pillTone} size="small" pulse={pillTone === 'danger'} sx={{ height: 20, fontSize: 10.5, '& .MuiChip-label': { fontWeight: 600 } }} />
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            height: 28, px: 0.75, borderRadius: 1,
            bgcolor: 'error.50', color: 'error.main',
            fontSize: 11, fontWeight: 600, flexShrink: 0,
          }}>
            <TimerIcon sx={{ fontSize: 12 }} />
            {formatDuration(callElapsedMs)}
          </Box>
        </>
      )}

      {/* Phone status + the way back into the dialer once it has been closed
          mid-call (Start Call is disabled while a call is live). Mirrors the
          agent header chip. */}
      {phone.enabled && (
        <Box
          component="span"
          role="button"
          tabIndex={0}
          onClick={() => setDialerOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDialerOpen(true);
            }
          }}
          title={phone.error || 'Softphone registration status — click to open the dialer pad'}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.5,
            height: 28, px: 0.75, borderRadius: '999px', cursor: 'pointer',
            fontSize: 10.5, fontWeight: 700,
            color: phone.state === 'registered' ? 'success.dark'
              : phone.state === 'connecting' ? 'text.secondary' : 'error.main',
            bgcolor: phone.state === 'registered' ? 'success.soft'
              : phone.state === 'connecting' ? 'grey.100' : 'error.soft',
            '&:hover': { filter: 'brightness(0.97)' },
          }}
        >
          <SipIcon sx={{ fontSize: 13 }} />
          {phone.state === 'registered'
            ? `Phone ${phone.extension || ''}`.trim()
            : phone.state === 'connecting'
              ? 'Phone connecting…'
              : 'Phone offline'}
        </Box>
      )}

      {/* Single entry point for the softphone: Start Call OPENS the dialer
          (dial pad, hold, mute, transfer, conference, DTMF, hang up) instead
          of placing a call blind. The widget's own Call button is what dials,
          so a mis-tap can never ring a student. */}
      <GlossyActionButton
        icon={<CallMadeIcon sx={{ fontSize: 14 }} />}
        label="Start Call"
        color="#166534"
        size="small"
        onClick={() => setDialerOpen(true)}
        disabled={!canStartCall}
        pulse={canStartCall}
        title="Open the softphone — dial pad, hold, mute, transfer and conference"
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

      {/* WhatsApp — same compact action family as the call controls */}
      <WhatsAppActionButton onClick={openWhatsApp} />
    </>
  );

  /* ── Profile save ────────────────────────────────────────────────── */
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

  /* ── Interactions ────────────────────────────────────────────────── */
  const [interactions, setInteractions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const loadInteractions = useCallback(async (leadId) => {
    setLoadingHistory(true);
    try {
      const { data } = await client.get('/interactions', { params: { leadId } });
      setInteractions(data.data ?? []);
      setHistoryError(null);
    } catch (err) {
      setHistoryError(err?.response?.data?.message ?? 'Could not load interaction history');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!lead?._id) { setInteractions([]); setHistoryError(null); return; }
    loadInteractions(lead._id);
  }, [lead?._id, interactionVersion, loadInteractions]);

  /* ── Phase 2/3/4 integration: lifecycle events, shortlist, applications ── */
  const [lifecycleData, setLifecycleData] = useState(null);
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

  // Lazily-gated applications instance — only fetches when a relevant
  // journey tab is open (same pattern as the agent-side profile form).
  const apps = useApplications(lead?._id, {
    enabled: journeyTab === 'shortlist' || journeyTab === 'applications',
  });

  // Fresh lead copy after shortlist/application actions mutate lifecycle
  // fields; keeps header chips + sidebar coherent.
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

  /* ── Guard ───────────────────────────────────────────────────────── */
  if (!lead) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: 'text.disabled', fontSize: 14 }}>No student selected.</Typography>
      </Box>
    );
  }

  const renderMainContent = () => {
    switch (journeyTab) {
      case 'overview':      return <JourneyOverview lead={lead} interactions={interactions} onSave={saveProfile} saving={profileSaving} onNavigate={setJourneyTab} />;
      case 'counseling':    return <JourneyCounseling lead={lead} onBump={bumpInteraction} />;
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
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ════════════════ HEADER: identity · stepper · call ════════════════ */}
      <StudentHeader
        lead={lead}
        journeyTab={journeyTab}
        onBack={onBack}
        onStep={setJourneyTab}
        callControls={callControls}
      />

      {/* ════════════════ BODY: MAIN + ACTIVITY RAIL ════════════════ */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* ── Main content — grows when activity rail collapses ──── */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', p: 2 }}>
          {renderMainContent()}
        </Box>

        {/* ── Activity rail — collapsible (only when showActivity) ── */}
        {showActivity && (
        <Box
          sx={{
            width: rightCollapsed ? 52 : '18%',
            minWidth: rightCollapsed ? 52 : 240,
            maxWidth: rightCollapsed ? 52 : 320,
            flexShrink: 0,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper',
            transition: 'width 180ms ease, min-width 180ms ease, max-width 180ms ease',
          }}
        >
          {rightCollapsed ? (
            /* Collapsed rail — vertical expand control */
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              pt: 1.5, gap: 1, flexShrink: 0,
            }}>
              <Tooltip title="Expand activity" placement="left" arrow>
                <IconButton
                  size="small"
                  onClick={toggleRight}
                  sx={{
                    width: 32, height: 32, borderRadius: 1.5,
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  }}
                >
                  <ChevronLeftIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Timeline / Calls / Remarks" placement="left" arrow>
                <TimelineIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </Tooltip>
            </Box>
          ) : (
            /* Expanded — full activity panel with collapse control in header */
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', px: 0.75, pt: 0.5, flexShrink: 0 }}>
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Collapse activity" placement="bottom" arrow>
                  <IconButton
                    size="small"
                    onClick={toggleRight}
                    sx={{
                      width: 24, height: 24, borderRadius: 1,
                      color: 'text.disabled',
                      '&:hover': { bgcolor: 'action.hover', color: 'text.secondary' },
                    }}
                  >
                    <ChevronRightIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              <ActivityPanel
                lead={lead}
                interactions={interactions}
                lifecycleEvents={lifecycleData?.events ?? []}
                loadingHistory={loadingHistory || !lifecycleData}
                historyError={historyError}
              />
            </>
          )}
        </Box>
        )}
      </Box>

      {/* WhatsApp template composer — uses the currently loaded student */}
      <WhatsAppTemplateDialog
        open={waOpen}
        onClose={closeWhatsApp}
        lead={lead}
        onSent={() => loadInteractions(lead._id)}
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

/* ═══════════════════════════════════════════════════════════════════════════
   OVERVIEW — the counseling workspace, organized into scannable sections:
   Summary → Personal → Academic → Preferences → Notes → Handoff.
   Saves via PATCH /api/leads/:id using only the fields present here.
   ═══════════════════════════════════════════════════════════════════════════ */

export function JourneyOverview({ lead, interactions, onSave, saving, onNavigate }) {
  const { push } = useToast();
  const { countries, universities, loadingCountries, loadingUniversities } = useLookups('');
  const { setActiveStudent } = useCounselor();
  const [form, setForm] = useState(null);
  const [localSaving, setLocalSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!lead) return;
    const f = fromLeadCounselor(lead);
    f.mobile = lead.mobile ?? lead.phone ?? '';
    f.email = lead.email ?? '';
    setForm(f);
  }, [lead]);

  const dirty = useMemo(() => {
    if (!form || !lead) return false;
    const current = fromLeadCounselor(lead);
    current.mobile = lead.mobile ?? lead.phone ?? '';
    current.email = lead.email ?? '';
    return JSON.stringify(form) !== JSON.stringify(current);
  }, [form, lead]);

  if (!lead || !form) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
        <Skeleton variant="rounded" width="100%" height={400} />
      </Box>
    );
  }

  const setField = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const setSlot = (listKey, idx, field) => (e) => {
    const value = e.target.value;
    setForm((p) => ({ ...p, [listKey]: p[listKey].map((slot, i) => (i === idx ? { ...slot, [field]: value } : slot)) }));
  };

  const universitiesForSlot = (slotCountryId) => {
    const country = countries.find((c) => c.id === slotCountryId);
    const filtered = country ? universities.filter((u) => u.country === country.name) : universities;
    if (import.meta.env.DEV) {
      console.group('[CounselorWorkspace] universitiesForSlot');
      console.log('slotCountryId:', slotCountryId, typeof slotCountryId);
      console.log('matchedCountry:', country);
      console.log('countries sample:', countries.slice(0, 3));
      console.log('universities sample:', universities.slice(0, 3));
      console.log('universities total:', universities.length);
      console.log('filtered count:', filtered.length);
      console.log('country.name:', country?.name, typeof country?.name);
      if (universities.length > 0) {
        console.log('first uni country:', universities[0].country, typeof universities[0].country);
      }
      console.groupEnd();
    }
    return filtered;
  };

  const handleSave = async () => {
    setLocalSaving(true);
    try {
      const payload = {
        studentName:      form.studentName.trim(),
        middleName:       form.middleName?.trim() ?? '',
        mobile:           form.mobile?.trim() ?? '',
        email:            form.email?.trim() ?? '',
        intake:           form.intake,
        highestEducation: form.highestEducation,
        gender:           form.gender,
        dateOfBirth:      form.dateOfBirth?.trim() ?? '',
        maritalStatus:    form.maritalStatus?.trim() ?? '',
        collegeName:      form.collegeName.trim(),
        passingYear:      form.passingYear.trim(),
        workExperience:   form.workExperience.trim(),
        gpa:              form.gpa.trim(),
        countryOfEducation: form.countryOfEducation?.trim() ?? '',
        workQualifications: form.workQualifications?.trim() ?? '',
        countryPreferred: form.countryPreferred || null,
        source:           form.source || null,
        preferredCountries: (form.preferredCountries || [])
          .map((p, i) => ({ order: i + 1, country: p.country }))
          .filter((p) => p.country),
        preferredUniversities: (form.preferredUniversities || [])
          .map((p, i) => ({ order: i + 1, university: p.university }))
          .filter((p) => p.university),
      };
      const result = await onSave(payload);
      if (result) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      push('Failed to save changes', 'danger');
    } finally {
      setLocalSaving(false);
    }
  };

  const dispositionHistory = lead.dispositionHistory ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ── Record meta — Reference ID / Created / Updated only; Source,
             Owner and Status already live in the header pills above, so
             they aren't repeated here. ──────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, px: 0.25 }}>
        <InfoRow label="Reference ID" value={lead.referenceId} />
        <InfoRow label="Created At" value={fmtDate(lead.createdAt)} />
        <InfoRow label="Updated At" value={fmtDate(lead.updatedAt)} />
      </Box>

      {/* ── Personal Information ────────────────────────────── */}
      <SectionCard sx={{ bgcolor: 'background.paper' }}>
        <SectionTitle icon={<PersonIcon sx={{ fontSize: 14 }} />} title="Personal Information" />
        <Grid container spacing={1.75}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="First Name" required size="small" fullWidth value={form.studentName} onChange={setField('studentName')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Middle Name" size="small" fullWidth value={form.middleName} onChange={setField('middleName')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Mobile" size="small" fullWidth value={form.mobile} onChange={setField('mobile')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Email" size="small" fullWidth value={form.email} onChange={setField('email')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Date of Birth" type="date" size="small" fullWidth value={form.dateOfBirth} onChange={setField('dateOfBirth')} disabled={saving || localSaving} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField select label="Gender" size="small" fullWidth value={form.gender} onChange={setField('gender')} disabled={saving || localSaving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
              <option value="">— Select —</option>
              {GENDERS.map((o) => <option key={o} value={o}>{o}</option>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField select label="Marital Status" size="small" fullWidth value={form.maritalStatus} onChange={setField('maritalStatus')} disabled={saving || localSaving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
              <option value="">— Select —</option>
              {MARITAL.map((o) => <option key={o} value={o}>{o}</option>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField select label="Intake" size="small" fullWidth value={form.intake} onChange={setField('intake')} disabled={saving || localSaving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
              <option value="">— Select —</option>
              {INTAKE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </TextField>
          </Grid>
        </Grid>
      </SectionCard>

      {/* ── Academic Information ─────────────────────────────── */}
      <SectionCard sx={{ bgcolor: 'background.paper' }}>
        <SectionTitle icon={<SchoolIcon sx={{ fontSize: 14 }} />} title="Academic Information" />
        <Grid container spacing={1.75}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField select label="Highest Education" size="small" fullWidth value={form.highestEducation} onChange={setField('highestEducation')} disabled={saving || localSaving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
              <option value="">— Select —</option>
              {EDUCATION_LEVELS.map((o) => <option key={o} value={o}>{o}</option>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="College Name" size="small" fullWidth value={form.collegeName} onChange={setField('collegeName')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Passing Year" size="small" fullWidth value={form.passingYear} onChange={setField('passingYear')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Work Experience" size="small" fullWidth value={form.workExperience} onChange={setField('workExperience')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="GPA / Percentage" size="small" fullWidth value={form.gpa} onChange={setField('gpa')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Country of Education" size="small" fullWidth value={form.countryOfEducation} onChange={setField('countryOfEducation')} disabled={saving || localSaving} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Work Qualifications" size="small" fullWidth value={form.workQualifications} onChange={setField('workQualifications')} disabled={saving || localSaving} />
          </Grid>
        </Grid>
      </SectionCard>

      {/* ── Preferences ─────────────────────────────────────── */}
      <SectionCard sx={{ bgcolor: 'background.paper' }}>
        <SectionTitle icon={<PublicIcon sx={{ fontSize: 14 }} />} title="Study Preferences" />
        {[0, 1, 2].map((i) => {
          const slotCountry = form.preferredCountries[i]?.country;
          const uniOptions = universitiesForSlot(slotCountry);
          return (
            <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', px: 1.5, py: 1, mb: i < 2 ? 1 : 0 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>Preference {i + 1}</Typography>
              <Grid container spacing={1.75}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField select label={`Country ${i + 1}`} size="small" fullWidth value={slotCountry} onChange={setSlot('preferredCountries', i, 'country')} disabled={saving || localSaving || loadingCountries} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                    <option value="">— Select —</option>
                    {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField select label={`University ${i + 1}`} size="small" fullWidth value={form.preferredUniversities[i]?.university} onChange={setSlot('preferredUniversities', i, 'university')} disabled={saving || localSaving || loadingUniversities} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                    <option value="">— Select —</option>
                    {uniOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </TextField>
                </Grid>
              </Grid>
            </Box>
          );
        })}
      </SectionCard>

      {/* ── Counseling Notes (latest remarks, read-only) ────── */}
      {/* <Box>
        <SectionTitle icon={<FormatQuoteIcon sx={{ fontSize: 14 }} />} title="Counseling Notes" />
        {(() => {
          const notes = [...(interactions ?? [])]
            .filter((it) => it.remarks && it.remarks.trim())
            .sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt))
            .slice(0, 3);
          if (notes.length === 0) {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>
                  No counseling notes yet.
                </Typography>
                {onNavigate && (
                  <SecondaryButton size="small" onClick={() => onNavigate('counseling')} sx={{ fontSize: 11.5, textTransform: 'none', minHeight: 0, py: 0.25 }}>
                    Log a remark
                  </SecondaryButton>
                )}
              </Box>
            );
          }
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {notes.map((n, i) => (
                <Box key={n._id || i} sx={{ borderLeft: 2, borderColor: 'divider', pl: 1.25, py: 0.25 }}>
                  <Typography sx={{ fontSize: 12.5, color: INK, lineHeight: 1.5 }}>{n.remarks}</Typography>
                  <Typography sx={{ fontSize: 10.5, color: 'text.disabled', mt: 0.25 }}>
                    {[n.disposition?.name || n.dispositionName, fmtDateTime(n.calledAt)].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              ))}
            </Box>
          );
        })()}
      </Box> */}

      {/* ── Agent Handoff / Disposition History ─────────────── */}
      {/* <Box>
        <SectionTitle icon={<HistoryIcon sx={{ fontSize: 14 }} />} title="Agent Handoff" />
        {dispositionHistory.length === 0 ? (
          <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 1 }}>No disposition history recorded yet.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {dispositionHistory.map((dh, i) => (
              <Box key={i} sx={{ py: 0.875, display: 'flex', flexDirection: 'column', gap: '3px', borderTop: i === 0 ? 0 : 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{dh.dispositionName || '—'}</Typography>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{fmtDateTime(dh.changedAt)}</Typography>
                </Box>
                {dh.note && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>{dh.note}</Typography>}
                {dh.changedBy && (
                  <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
                    Changed by: {typeof dh.changedBy === 'object' ? [dh.changedBy.firstName, dh.changedBy.lastName].filter(Boolean).join(' ') : '—'}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box> */}

      {/* ── Save Footer ─────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
        <Typography component="span" sx={{ mr: 'auto', fontSize: 12, color: 'text.disabled' }}>
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </Typography>
        <PrimaryButton size="small" startIcon={<SaveIcon sx={{ fontSize: 13 }} />} onClick={handleSave} disabled={saving || localSaving || !dirty} loading={localSaving}>
          {localSaving ? 'Saving…' : 'Save Changes'}
        </PrimaryButton>
        {saved && <Typography sx={{ fontSize: 11, color: 'success.main' }}>Changes saved</Typography>}
      </Box>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COUNSELING — disposition logging + remarks + callback scheduling
   ═══════════════════════════════════════════════════════════════════════════ */

export function JourneyCounseling({ lead, onBump }) {
  const { push } = useToast();
  const { resetCallStatus } = useCounselor();
  const { dispositions, loading: dispLoading } = useDispositions();
  const [dispositionId, setDispositionId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completingCounseling, setCompletingCounseling] = useState(false);

  const counselingCompleted = lead.counselingStatus === 'completed';

  const handleSubmit = useCallback(async () => {
    const leadId = lead._id ?? lead.id;
    if (!dispositionId || !leadId) return;
    setSubmitting(true);
    try {
      await createInteraction({
        leadId,
        dispositionId,
        remarks: remarks.trim() || undefined,
        callbackDate: callbackDate || undefined,
        callbackTime: callbackTime || undefined,
      });
      push('Remark logged successfully', 'success');
      resetCallStatus();
      onBump?.();
      setRemarks(''); setCallbackDate(''); setCallbackTime(''); setDispositionId('');
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to log remark', 'danger');
    } finally { setSubmitting(false); }
  }, [lead.id, lead._id, dispositionId, remarks, callbackDate, callbackTime, push, resetCallStatus, onBump]);

  const handleCompleteCounseling = useCallback(async () => {
    if (counselingCompleted) return;
    if (!window.confirm('Mark counseling as completed? This will make the student eligible for Registration.')) return;
    setCompletingCounseling(true);
    try {
      await completeCounseling(lead.id ?? lead._id);
      push('Counseling completed. Student is now eligible for Registration.', 'success');
      onBump?.();
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to complete counseling', 'danger');
    } finally { setCompletingCounseling(false); }
  }, [lead.id, lead._id, counselingCompleted, push, onBump]);

  const selectedDisp = dispositions.find((d) => d.id === dispositionId);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionTitle icon={<FormatQuoteIcon sx={{ fontSize: 14 }} />} title="Log Disposition" />
      {submitting && <LinearProgress sx={{ mb: 0.5 }} />}
      <Grid container spacing={1.25}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            select label="Disposition" size="small" fullWidth
            value={dispositionId}
            onChange={(e) => setDispositionId(e.target.value)}
            disabled={dispLoading}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          >
            <option value="">Select Disposition</option>
            {dispositions.map((d) => <option key={d.id} value={d.id}>{d.label || d.name}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          {selectedDisp?.requiresCallback && (
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <TextField label="Callback Date" type="date" size="small" sx={{ flex: 1 }} InputLabelProps={{ shrink: true }} value={callbackDate} onChange={(e) => setCallbackDate(e.target.value)} />
              <TextField label="Time" type="time" size="small" sx={{ flex: 1 }} InputLabelProps={{ shrink: true }} value={callbackTime} onChange={(e) => setCallbackTime(e.target.value)} />
            </Box>
          )}
        </Grid>

      </Grid>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
        <PrimaryButton onClick={handleSubmit} disabled={submitting || !dispositionId} startIcon={<SendIcon sx={{ fontSize: 15 }} />} size="small">
          {submitting ? 'Saving...' : 'Log Remark'}
        </PrimaryButton>
        {!counselingCompleted ? (
          <SecondaryButton
            onClick={handleCompleteCounseling}
            disabled={completingCounseling}
            startIcon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
            size="small"
            color="success"
          >
            {completingCounseling ? 'Completing...' : 'Mark Counseling Complete'}
          </SecondaryButton>
        ) : (
          <Typography sx={{ fontSize: 12.5, color: 'success.main', fontWeight: 500 }}>
            Counseling completed. Student is eligible for Registration.
          </Typography>
        )}
      </Box>

      <Divider />

      <SectionTitle icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} title="Counseling Status" />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <StatusChip
          status={counselingCompleted ? 'Completed' : 'In Progress'}
          tone={counselingCompleted ? 'success' : 'warning'}
          size="small"
        />
      </Box>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   REGISTRATION — status + notes (counselor workflow stage)
   ═══════════════════════════════════════════════════════════════════════════ */

export function JourneyRegistration({ lead, onSave, saving }) {
  const { push } = useToast();
  const [status, setStatus] = useState(lead.registrationStatus || 'not-started');
  const [regDate, setRegDate] = useState('');
  const [agreementStatus, setAgreementStatus] = useState('not-started');
  const [feeStatus, setFeeStatus] = useState('not-applicable');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localSaving, setLocalSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!lead?._id && !lead?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRegistrationDetail(lead._id ?? lead.id);
        if (cancelled) return;
        setStatus(data.registrationStatus || 'not-started');
        setRegDate(data.registrationDate ? data.registrationDate.slice(0, 10) : '');
        setAgreementStatus(data.agreementStatus || 'not-started');
        setFeeStatus(data.feeStatus || 'not-applicable');
        setPayments(data.payments ?? []);
      } catch {
        setStatus(lead.registrationStatus || 'not-started');
        setRegDate(lead.registrationDate ? lead.registrationDate.slice(0, 10) : '');
        setAgreementStatus(lead.agreementStatus || 'not-started');
        setFeeStatus(lead.feeStatus || 'not-applicable');
        setPayments(lead.registration?.payments ?? []);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [lead._id, lead.id]);

  const handleSave = useCallback(async () => {
    setLocalSaving(true);
    try {
      await updateRegistration(lead._id ?? lead.id, {
        registrationStatus: status,
        registrationDate: regDate || undefined,
        agreementStatus,
        feeStatus,
      });
      await updateCounselorStatus(lead.id ?? lead._id, { registrationStatus: status });
      push('Registration updated', 'success');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to update registration', 'danger');
    } finally { setLocalSaving(false); }
  }, [lead.id, lead._id, status, regDate, agreementStatus, feeStatus, push]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard>
      <SectionTitle icon={<BadgeIcon sx={{ fontSize: 14 }} />} title="Registration" />
      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
        Track registration progress with TASA and the university.
      </Typography>
      {(localSaving || saving) && <LinearProgress sx={{ mb: 0.5 }} />}
      <Grid container spacing={1.75} sx={{ mt: 0.25 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            select label="Registration Status" size="small" fullWidth
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={localSaving || saving}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          >
            {REG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            label="Registration Date" type="date" size="small" fullWidth
            value={regDate}
            onChange={(e) => setRegDate(e.target.value)}
            disabled={localSaving || saving}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            select label="Agreement Status" size="small" fullWidth
            value={agreementStatus}
            onChange={(e) => setAgreementStatus(e.target.value)}
            disabled={localSaving || saving}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          >
            {AGREEMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            select label="Fee Status" size="small" fullWidth
            value={feeStatus}
            onChange={(e) => setFeeStatus(e.target.value)}
            disabled={localSaving || saving}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          >
            {FEE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </TextField>
        </Grid>
      </Grid>

      {payments.length > 0 && (
        <Box>
          <SubHeading>Payment Records</SubHeading>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {payments.map((p, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, px: 1.25, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.paymentType || 'Fee'}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {p.amount ? `₹${Number(p.amount).toLocaleString('en-IN')}` : ''}
                    {p.status ? ` · ${p.status}` : ''}
                    {p.paidAt ? ` · Paid ${fmtDate(p.paidAt)}` : ''}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
      </SectionCard>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <PrimaryButton onClick={handleSave} disabled={localSaving || saving} startIcon={<SaveIcon sx={{ fontSize: 15 }} />} size="small">
          {localSaving ? 'Saving...' : 'Save'}
        </PrimaryButton>
        {saved && <Typography sx={{ fontSize: 11, color: 'success.main' }}>Saved</Typography>}
      </Box>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOCUMENTS — document checklist
   ═══════════════════════════════════════════════════════════════════════════ */

const DOC_TYPES = ['Passport', 'Academic Transcripts', 'Degree Certificate', 'GRE Score', 'GMAT Score', 'IELTS Score', 'TOEFL Score', 'PTE Score', 'SOP', 'LOR', 'Resume / CV', 'Financial Documents', 'Bank Statements', 'Medical Reports', 'Other'];

export function JourneyDocuments({ lead, onSave, saving }) {
  const { push } = useToast();
  const [docs, setDocs] = useState([]);
  const [docStatus, setDocStatus] = useState(lead.documentStatus || '');
  const [loading, setLoading] = useState(true);
  const [localSaving, setLocalSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const leadId = lead?._id || lead?.id;

  useEffect(() => {
    setDocStatus(lead.documentStatus || '');
  }, [lead.documentStatus]);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLeadDocuments(leadId);
        if (!cancelled) setDocs(Array.isArray(data) ? data : data.documents ?? []);
      } catch {
        if (!cancelled) setDocs(lead.documents ?? []);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [leadId, lead.documents]);

  const setDocField = (idx, key) => (e) => {
    setDocs((prev) => { const list = [...prev]; list[idx] = { ...list[idx], [key]: e.target.value }; return list; });
  };

  const addDoc = () => setDocs((p) => [...p, { documentType: '', name: '', documentCategory: 'other', required: false, status: 'missing', notes: '' }]);

  const removeDoc = async (idx) => {
    const doc = docs[idx];
    if (doc?._id) {
      try { await deleteDocument(doc._id); } catch { push('Failed to delete document', 'danger'); return; }
    }
    setDocs((p) => { const list = [...p]; list.splice(idx, 1); return list; });
  };

  const handleSave = useCallback(async () => {
    setLocalSaving(true);
    try {
      for (const doc of docs) {
        if (doc._id) {
          await updateDocument(doc._id, {
            documentType: doc.documentType,
            name: doc.name,
            documentCategory: doc.documentCategory,
            required: doc.required,
            status: doc.status,
            notes: doc.notes,
          });
        } else if (doc.documentType) {
          await createDocument({
            lead: leadId,
            documentType: doc.documentType,
            name: doc.name,
            documentCategory: doc.documentCategory,
            required: doc.required,
            status: doc.status,
            notes: doc.notes,
          });
        }
      }
      await onSave({ documentStatus: docStatus || null });
      push('Documents updated', 'success');
      const refreshed = await fetchLeadDocuments(leadId);
      setDocs(Array.isArray(refreshed) ? refreshed : refreshed.documents ?? []);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { push('Failed to save documents', 'danger'); }
    finally { setLocalSaving(false); }
  }, [docs, docStatus, leadId, onSave, push]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <SectionTitle icon={<DescriptionIcon sx={{ fontSize: 14 }} />} title="Document Checklist" />
      <Grid container spacing={1.75}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            select label="Overall Document Status" size="small" fullWidth
            value={docStatus}
            onChange={(e) => setDocStatus(e.target.value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          >
            {DOC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </TextField>
        </Grid>
      </Grid>

      {loading ? (
        <Box>{[1, 2, 3].map((i) => <Skeleton key={i} height={80} sx={{ mb: 0.5, borderRadius: 1.5 }} />)}</Box>
      ) : docs.map((doc, idx) => (
        <Box key={doc._id || idx} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', p: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document {idx + 1}</Typography>
            <IconButton size="small" onClick={() => removeDoc(idx)} disabled={localSaving || saving}><CloseIcon sx={{ fontSize: 12 }} /></IconButton>
          </Box>
          <Grid container spacing={1.25}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField select label="Type" size="small" fullWidth value={doc.documentType || ''} onChange={setDocField(idx, 'documentType')} disabled={localSaving || saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                <option value="">Select type</option>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Document Name" size="small" fullWidth value={doc.name || ''} onChange={setDocField(idx, 'name')} disabled={localSaving || saving} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField select label="Category" size="small" fullWidth value={doc.documentCategory || 'other'} onChange={setDocField(idx, 'documentCategory')} disabled={localSaving || saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                {DOC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField select label="Status" size="small" fullWidth value={doc.status || 'missing'} onChange={setDocField(idx, 'status')} disabled={localSaving || saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                {DOC_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
                <input
                  type="checkbox"
                  checked={!!doc.required}
                  onChange={(e) => setDocs((prev) => { const list = [...prev]; list[idx] = { ...list[idx], required: e.target.checked }; return list; })}
                  disabled={localSaving || saving}
                  style={{ width: 16, height: 16 }}
                />
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Required</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Remarks" size="small" fullWidth value={doc.notes || ''} onChange={setDocField(idx, 'notes')} disabled={localSaving || saving} /></Grid>
          </Grid>
        </Box>
      ))}
      </SectionCard>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" startIcon={<AddCircleIcon sx={{ fontSize: 12 }} />} onClick={addDoc} disabled={localSaving || saving} sx={{ borderStyle: 'dashed', fontSize: 11, color: 'text.secondary' }}>Add Document</Button>
        <PrimaryButton size="small" startIcon={<SaveIcon sx={{ fontSize: 12 }} />} onClick={handleSave} disabled={localSaving || saving}>Save</PrimaryButton>
        {saved && <Typography sx={{ fontSize: 11, color: 'success.main' }}>Saved</Typography>}
      </Box>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAYMENTS — per-student payment records for the workspace
   ═══════════════════════════════════════════════════════════════════════════ */

const PAY_STATUS_LABELS = {
  'pending': 'Pending', 'link-sent': 'Link Sent', 'partially-paid': 'Partially Paid',
  'paid': 'Paid', 'failed': 'Failed', 'refunded': 'Refunded',
};

export function JourneyPayments({ lead }) {
  const { push } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ paymentType: 'Registration Fee', amount: '', dueDate: '', remarks: '' });

  const leadId = lead?._id || lead?.id;

  const loadPayments = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const res = await client.get('/payments', { params: { search: lead.referenceId || '', limit: 50 } });
      const all = res.data?.data?.payments || [];
      setPayments(all.filter((p) => String(p.lead) === String(leadId)));
    } catch { setPayments([]); }
    finally { setLoading(false); }
  }, [leadId, lead.referenceId]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const handleCreate = useCallback(async () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    try {
      await client.post('/payments', {
        leadId,
        paymentType: form.paymentType,
        amount: Number(form.amount),
        dueDate: form.dueDate || undefined,
        remarks: form.remarks || undefined,
      });
      push('Payment record created', 'success');
      setShowForm(false);
      setForm({ paymentType: 'Registration Fee', amount: '', dueDate: '', remarks: '' });
      loadPayments();
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to create payment', 'danger');
    } finally { setSaving(false); }
  }, [leadId, form, push, loadPayments]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <SectionCard sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <SectionTitle icon={<PaymentIcon sx={{ fontSize: 14 }} />} title="Payment Records" />

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={36} />)}
        </Box>
      ) : payments.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>No payment records for this student yet.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {payments.map((p) => (
            <Box key={p._id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, px: 1.25, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.paymentType}</Typography>
                  <StatusChip status={PAY_STATUS_LABELS[p.status] || p.status} size="small" />
                </Box>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                  ₹{Number(p.amount || 0).toLocaleString('en-IN')} {p.currency || 'INR'}
                  {p.dueDate ? ` · Due ${fmtDate(p.dueDate)}` : ''}
                  {p.transactionRef ? ` · Ref: ${p.transactionRef}` : ''}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box>
        {!showForm ? (
          <PrimaryButton size="small" startIcon={<AddCircleIcon sx={{ fontSize: 13 }} />} onClick={() => setShowForm(true)}>
            Add Payment
          </PrimaryButton>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, p: 1.25, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
      <Grid container spacing={1.75}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField select label="Payment Type" size="small" fullWidth value={form.paymentType} onChange={(e) => setForm((p) => ({ ...p, paymentType: e.target.value }))} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                  <option value="Registration Fee">Registration Fee</option>
                  <option value="Application Fee">Application Fee</option>
                  <option value="Other Fee">Other Fee</option>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Amount" type="number" size="small" fullWidth value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Due Date" type="date" size="small" fullWidth value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField label="Remarks" size="small" fullWidth multiline rows={2} value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <PrimaryButton size="small" onClick={handleCreate} disabled={saving || !form.amount} loading={saving}>
                {saving ? 'Creating…' : 'Create Payment'}
              </PrimaryButton>
              <SecondaryButton size="small" onClick={() => setShowForm(false)} disabled={saving}>Cancel</SecondaryButton>
            </Box>
          </Box>
        )}
      </Box>
      </SectionCard>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   VISA — visa progress tracker with visual flow
   ═══════════════════════════════════════════════════════════════════════════ */

const VISA_STAGES = ['not-started', 'gathering', 'filed', 'interview', 'received', 'denied'];
const VISA_STAGE_LABEL = { 'not-started': 'Not Started', gathering: 'Gathering Docs', filed: 'Application Filed', interview: 'Interview', received: 'Visa Received', denied: 'Visa Denied' };

export function JourneyVisa({ lead, onSave, saving }) {
  const { push } = useToast();
  const [visa, setVisa] = useState({});
  const [visaStatus, setVisaStatus] = useState(lead.visaStatus || '');
  const [localSaving, setLocalSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setVisa(lead.visaDetails ?? {});
    setVisaStatus(lead.visaStatus || '');
  }, [lead.visaDetails, lead.visaStatus]);

  const setField = (key) => (e) => setVisa((p) => ({ ...p, [key]: e.target.value }));

  const handleSave = useCallback(async () => {
    setLocalSaving(true);
    try {
      await onSave({ visaDetails: visa, visaStatus: visaStatus || null });
      push('Visa details updated', 'success');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { push('Failed to save visa details', 'danger'); }
    finally { setLocalSaving(false); }
  }, [visa, visaStatus, onSave, push]);

  const activeIdx = VISA_STAGES.indexOf(visa.stage || 'not-started');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionTitle icon={<FlightTakeoffIcon sx={{ fontSize: 14 }} />} title="Visa Workspace" />

      {/* Visual progress flow */}
      <Box sx={{ display: 'flex', gap: 0.375, alignItems: 'center', flexWrap: 'wrap' }}>
        {VISA_STAGES.filter((s) => s !== 'denied').map((stage, i) => {
          const isReached = i <= activeIdx && activeIdx >= 0;
          const isCurrent = stage === (visa.stage || 'not-started');
          return (
            <Box key={stage} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Chip
                label={VISA_STAGE_LABEL[stage]}
                size="small"
                sx={{
                  height: 22, fontSize: 10.5, fontWeight: isCurrent ? 700 : 500,
                  bgcolor: isCurrent ? 'primary.main' : isReached ? 'primary.soft' : 'action.hover',
                  color: isCurrent ? 'primary.contrastText' : isReached ? 'primary.main' : 'text.disabled',
                }}
              />
              {i < VISA_STAGES.filter((s) => s !== 'denied').length - 1 && (
                <Box sx={{ width: 16, height: 1, bgcolor: isReached ? 'primary.main' : 'divider' }} />
              )}
            </Box>
          );
        })}
      </Box>

      <Grid container spacing={1.75}>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Country" size="small" fullWidth value={visa.country ?? ''} onChange={setField('country')} disabled={localSaving || saving} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Visa Type" size="small" fullWidth value={visa.type ?? ''} onChange={setField('type')} disabled={localSaving || saving} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField select label="Stage" size="small" fullWidth value={visa.stage || 'not-started'} onChange={setField('stage')} disabled={localSaving || saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
            {VISA_STAGES.map((s) => <option key={s} value={s}>{VISA_STAGE_LABEL[s]}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField select label="Overall Visa Status" size="small" fullWidth value={visaStatus} onChange={(e) => setVisaStatus(e.target.value)} disabled={localSaving || saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
            {VISA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Appointment Date" size="small" fullWidth value={visa.appointment ?? ''} onChange={setField('appointment')} disabled={localSaving || saving} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Biometrics" size="small" fullWidth value={visa.biometrics ?? ''} onChange={setField('biometrics')} disabled={localSaving || saving} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Interview" size="small" fullWidth value={visa.interview ?? ''} onChange={setField('interview')} disabled={localSaving || saving} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Decision" size="small" fullWidth value={visa.decision ?? ''} onChange={setField('decision')} disabled={localSaving || saving} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Outcome" size="small" fullWidth value={visa.outcome ?? ''} onChange={setField('outcome')} disabled={localSaving || saving} /></Grid>
        <Grid size={{ xs: 12 }}><TextField label="Remarks" size="small" fullWidth multiline rows={2} value={visa.remarks ?? ''} onChange={setField('remarks')} disabled={localSaving || saving} /></Grid>
      </Grid>
      </SectionCard>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <PrimaryButton size="small" startIcon={<SaveIcon sx={{ fontSize: 12 }} />} onClick={handleSave} disabled={localSaving || saving}>Save</PrimaryButton>
        {saved && <Typography sx={{ fontSize: 11, color: 'success.main' }}>Saved</Typography>}
      </Box>
    </Box>
  );
}
