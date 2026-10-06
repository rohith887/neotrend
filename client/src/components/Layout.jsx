import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import SpeedIcon from '@mui/icons-material/Speed';
import TimerIcon from '@mui/icons-material/Timer';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallEndIcon from '@mui/icons-material/CallEnd';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SipIcon from '@mui/icons-material/Sip';

import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAgent, CALL_STATUS, CALL_ACTIVE, formatDuration } from '../context/AgentContext.jsx';
import { setNavigate } from '../api/navigation.js';
import { rolesForNav } from './Sidebar.jsx';
import GlossyActionButton from '../ui/mui/GlossyActionButton.jsx';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import BreakModal from './BreakModal.jsx';
import CallAssistPopup from './callassist/CallAssistPopup.jsx';
import CallAssistFeedbackForm from './callassist/CallAssistFeedbackForm.jsx';
import CallScreen from './CallScreen.jsx';
import { CounselorProvider } from '../context/CounselorContext.jsx';
import AgentWorkspace from './AgentWorkspace.jsx';
import SupervisorDashboard from './SupervisorDashboard.jsx';

import CounselorMyStudents from './counselor/CounselorMyStudents.jsx';
import CounselorFollowUps from './counselor/CounselorFollowUps.jsx';
import CounselorCounseling from './counselor/CounselorCounseling.jsx';
import CounselorApplications from './counselor/CounselorApplications.jsx';
import CounselorRegistration from './counselor/CounselorRegistration.jsx';
import CounselorDocuments from './counselor/CounselorDocuments.jsx';
import CounselorPayments from './counselor/CounselorPayments.jsx';
import CounselorVisaProcess from './counselor/CounselorVisaProcess.jsx';
import CounselorCallWorkspace from './counselor/CounselorCallWorkspace.jsx';
import CounselorAlerts from './counselor/CounselorAlerts.jsx';
import CounselorReports from './counselor/CounselorReports.jsx';
import Reports from './Reports.jsx';
import UserManagement from './UserManagement.jsx';
import LeadManagement from './LeadManagement.jsx';
import SupervisorWorkspace from './supervisor/SupervisorWorkspace.jsx';
import ReferralManagement from './ReferralManagement.jsx';
import AgentDashboard from '../pages/AgentDashboard.jsx';
import AlertsPanel from './AlertsPanel.jsx';
import UniversityManagement from './UniversityManagement.jsx';
import SystemLogs from './SystemLogs.jsx';
import SupervisorAlerts from './supervisor/SupervisorAlerts.jsx';
import NotificationsIcon from '@mui/icons-material/Notifications';

/* ── Shared refresh bridge: AgentDashboard registers its refresh fn here ── */
export let agentRefreshHandler = null;
export const registerAgentRefresh = (fn) => { agentRefreshHandler = fn; };

/* ── Dialer visibility persistence ──────────────────────────────────────
   Only the panel's OPEN/CLOSED state is remembered across a reload, and only
   for this browser. The call itself is never persisted: AgentContext rehydrates
   the live call from the server (GET /activity/fetch-call) on every mount, so
   reopening the panel after a refresh can never invent a call that isn't live. */
const DIALER_OPEN_KEY = 'tasa:dialerOpen';
const readDialerOpen = () => {
  try { return localStorage.getItem(DIALER_OPEN_KEY) === '1'; } catch { return false; }
};
const writeDialerOpen = (open) => {
  try { localStorage.setItem(DIALER_OPEN_KEY, open ? '1' : '0'); } catch { /* noop */ }
};

/* ── View maps (view ID → component) ── */
const SUPERVISOR_VIEWS = {
  dashboard:    SupervisorDashboard,
  reports:      Reports,
  users:        UserManagement,
  leads:        LeadManagement,
  referrals:    ReferralManagement,
  universities: UniversityManagement,
  'system-logs': SystemLogs,
  alerts:       SupervisorAlerts,
};

const COUNSELOR_VIEWS = {
  'workspace':           CounselorCallWorkspace,
  'alerts':              CounselorAlerts,
  'my-students':          CounselorMyStudents,
  'follow-ups':           CounselorFollowUps,
  'counseling':           CounselorCounseling,
  'applications':         CounselorApplications,
  'registration':         CounselorRegistration,
  'documents':            CounselorDocuments,
  'payments':             CounselorPayments,
  'visa-process':         CounselorVisaProcess,
  'reports':              CounselorReports,
};

const SUPERVISOR_PATH_TO_VIEW = {
  '/dashboard': 'dashboard',
  '/reports/advisor-performance': 'reports',
  '/reports/lead-conversion':     'reports',
  '/reports/call-analytics':      'reports',
  '/reports/break-report':        'reports',
  '/reports/activity-report':     'reports',
  '/reports/quality-scores':      'reports',
  '/reports/time-share':          'reports',
  '/users':    'users',
  '/leads':    'leads',
  '/referrals': 'referrals',
  '/universities': 'universities',
  '/system-logs': 'system-logs',
  '/alerts': 'alerts',
};

// /leads/:leadId — supervisor detailed student inspection workspace.
const STUDENT_360_PATTERN = /^\/leads\/([^/]+)$/;

const COUNSELOR_PATH_TO_VIEW = {
  '/counselor/workspace': 'workspace',
  '/counselor/alerts': 'alerts',
  '/counselor/students': 'my-students',
  '/counselor/follow-ups': 'follow-ups',
  '/counselor/counseling': 'counseling',
  '/counselor/applications': 'applications',
  '/counselor/registration': 'registration',
  '/counselor/documents': 'documents',
  '/counselor/payments': 'payments',
  '/counselor/visa-process': 'visa-process',
  '/counselor/reports': 'reports',
};

const AGENT_PATH_TO_VIEW = {
  '/agent/dashboard': 'dashboard',
  '/agent/workspace': 'workspace',
  '/agent/alerts': 'alerts',
};

const VIEW_TO_SUPERVISOR_PATH = Object.fromEntries(Object.entries(SUPERVISOR_PATH_TO_VIEW).map(([path, view]) => [view, path]));
const VIEW_TO_COUNSELOR_PATH = Object.fromEntries(Object.entries(COUNSELOR_PATH_TO_VIEW).map(([path, view]) => [view, path]));
const VIEW_TO_AGENT_PATH = Object.fromEntries(Object.entries(AGENT_PATH_TO_VIEW).map(([path, view]) => [view, path]));

const ALLOWED_IDS = rolesForNav('supervisor').map((i) => i.id);

const AGENT_VIEWS = [
  { id: 'dashboard', label: 'Dashboard', color: '#800000', icon: <SpeedIcon sx={{ fontSize: 14 }} /> },
  { id: 'workspace', label: 'Call Workspace', color: '#166534', icon: <PhoneInTalkIcon sx={{ fontSize: 14 }} /> },
  { id: 'alerts', label: 'Alerts', color: '#DC2626', icon: <NotificationsIcon sx={{ fontSize: 14 }} /> },
];
const AGENT_IDS = AGENT_VIEWS.map((i) => i.id);

function getViewFromPath(pathname, role) {
  if (role === 'counselor') return COUNSELOR_PATH_TO_VIEW[pathname] || 'workspace';
  if (role === 'agent') return AGENT_PATH_TO_VIEW[pathname] || 'dashboard';
  if (pathname === '/reports' || pathname.startsWith('/reports/')) return 'reports';
  return SUPERVISOR_PATH_TO_VIEW[pathname] || (STUDENT_360_PATTERN.test(pathname) ? 'student360' : 'dashboard');
}

function getPathForView(viewId, role) {
  if (role === 'counselor') return VIEW_TO_COUNSELOR_PATH[viewId] || '/counselor/workspace';
  if (role === 'agent') return VIEW_TO_AGENT_PATH[viewId] || '/agent/dashboard';
  return VIEW_TO_SUPERVISOR_PATH[viewId] || '/dashboard';
}

export default function Layout() {
  const { role } = useAuth();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const isAgent = role === 'agent';
  const isCounselor = role === 'counselor';

  useEffect(() => { setNavigate(routerNavigate); }, [routerNavigate]);

  const view = useMemo(() => getViewFromPath(location.pathname, role), [location.pathname, role]);
  const routePayload = location.state || null;
  const isWorkspaceRoute = isCounselor && location.pathname === '/counselor/workspace';
  // Workspace is the counselor Home — the sidebar is always visible and the
  // collapsed state is purely user-controlled via the hamburger toggle.
  const [collapsed, setCollapsed] = useState(false);

  // Extract the report id from /reports/:reportId so the Reports page can open
  // directly on the requested report destination.
  const reportId = view === 'reports'
    ? location.pathname.split('/')[2] || 'advisor-performance'
    : null;

  // The nav id that should appear active in the sidebar. For report routes the
  // active nav id is the specific report id so the correct sidebar item lights
  // up; for every other view it matches the component view id.
  const activeNavId = reportId || view;

  const handleToggleCollapse = () => setCollapsed((c) => !c);

  // Counselors may navigate to every counselor view (including follow-ups,
  // counseling and alerts) even when an item is hidden from the sidebar —
  // the dashboard shortcuts rely on this. Sidebar visibility is governed
  // separately in rolesForNav; allowedIds only gates programmatic navigation.
  const counselorIds = Object.keys(COUNSELOR_VIEWS);
  const allowedIds = isAgent ? AGENT_IDS : isCounselor ? counselorIds : ALLOWED_IDS;

  const navigate = (id, state = null) => {
    if (allowedIds.includes(id)) {
      const path = getPathForView(id, role);
      routerNavigate(path, { state });
    }
  };

  /* ── Agent shell — dashboard landing + CTI workspace, no sidebar ── */
  if (isAgent) {
    const AgentView = view === 'workspace' ? AgentWorkspace : view === 'alerts' ? AlertsPanel : AgentDashboard;

    // Call state for the top nav bar (workspace view only).
    const {
      callStatus, lead, fetchingLead, startCall, endCall, fetchCall,
      setOnDispositionSaved, activeCall, callRefs, phone, recovering,
    } = useAgent();

    // ── Derived call-control state (single source of truth) ──────
    // Break is a display/status only — it must NOT gate the call controls.
    // The three buttons depend solely on the call lifecycle + loaded lead:
    //   loaded + no call  → Fetch ✓, Start ✓, End ✗
    //   DIALING/CONNECTED → Fetch ✗, Start ✗, End ✓
    //   ENDING            → Fetch ✗, Start ✗, End ✗ (loading)
    //   after End (ENDED) → Fetch ✓, Start ✓, End ✗
    const callActive = CALL_ACTIVE.has(callStatus);
    const callEnding = callStatus === CALL_STATUS.ENDING;
    const canFetchCall = !callActive && !fetchingLead;
    const canStartCall = !!lead && !callActive && !fetchingLead
      && (callStatus === CALL_STATUS.IDLE || callStatus === CALL_STATUS.ENDED);
    const canEndCall = callActive && !callEnding;

    // Dev diagnostic — prints the exact values the buttons derive from.
    useEffect(() => {
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.log('[agent-call-ui]', {
          callStatus,
          activeCallId: activeCall?.id || null,
          activeCallStatus: activeCall?.status || null,
          leadId: lead?._id || null,
          fetchingLead,
          inFlight: {
            fetching: callRefs?.fetchingLeadRef?.current ?? null,
            starting: callRefs?.startingCallRef?.current ?? null,
            ending: callRefs?.endingCallRef?.current ?? null,
          },
          derived: { callActive, callEnding, canFetchCall, canStartCall, canEndCall },
        });
      }
    }, [
      callStatus, activeCall, lead?._id, fetchingLead,
      callActive, callEnding, canFetchCall, canStartCall, canEndCall, callRefs,
    ]);

    /* ── Call Assist popup + post-call feedback ─────────────────
       Calling "Start Call" opens a small non-blocking welcome note — the
       full assistant only opens when the agent explicitly requests it
       ("View Call Assist" or the nav chip) and can be dragged/minimized/
       closed without ever blocking the workspace.

       The feedback form is NOT shown on End Call. AgentContext fires
       `setOnDispositionSaved` ONLY from the successful response of the
       existing disposition-save API, and it captures the student's context
       ({ leadId, studentName, callId }) BEFORE the lead is cleared — so a
       failed disposition never shows feedback, a success always does, and a
       next student can never overwrite the captured context.

       Context (and its generation version) is owned by the popup and always
       keyed to the CURRENT active student, so switching leads never shows
       stale data or a previous student's feedback. */
    // Current generation version ('rules-v1' default) mirrors the server's —
    // used when Call Assist context wasn't generated/opened for this call.
    const CALL_ASSIST_CONTEXT_VERSION = 'rules-v1';
    const [callAssistOpen, setCallAssistOpen] = useState(false);
    const [callAssistNoteOpen, setCallAssistNoteOpen] = useState(false);
    const [dialerOpen, setDialerOpen] = useState(readDialerOpen);
    const prevCallActiveRef = useRef(false);
    // Auto-open the full call screen when a CRM call goes live; exit it once
    // the call is done. The chip/Dialer button can reopen it anytime.
    //
    // The first pass is skipped: on mount AgentContext has not finished
    // rehydrating the live call yet, so `callActive` is briefly false. Acting on
    // that would slam the panel shut over the visibility the agent last chose.
    // From the second pass on, a call that ENDS still closes the panel.
    const callActiveSeenRef = useRef(false);
    useEffect(() => {
      const wasActive = prevCallActiveRef.current;
      prevCallActiveRef.current = callActive;
      if (!callActiveSeenRef.current) {
        callActiveSeenRef.current = true;
        if (callActive) setDialerOpen(true);
        return;
      }
      if (callActive && !wasActive) setDialerOpen(true);
      if (!callActive && wasActive) setDialerOpen(false);
    }, [callActive]);
    // Persist visibility only — never the call.
    useEffect(() => { writeDialerOpen(dialerOpen); }, [dialerOpen]);
    const prevCallStatusRef = useRef(callStatus);

    // Generation version used by the current lead's Call Assist context.
    const [contextVersion, setContextVersion] = useState(null);
    const contextVersionRef = useRef(contextVersion);
    contextVersionRef.current = contextVersion;
    const [feedbackRequest, setFeedbackRequest] = useState(null);

    const handleContextVersion = useCallback((version) => setContextVersion(version), []);

    const closeFeedback = useCallback(() => setFeedbackRequest(null), []);

    // Registered once: fires ONLY from the successful disposition-save API
    // response (inside AgentContext.submitCall, before the lead clears). The
    // saved student context is used as-is; the generation version comes from
    // the popup when known, else the current system default.
    useEffect(() => {
      setOnDispositionSaved(({ leadId, studentName, callId }) => {
        setFeedbackRequest({
          nonce: Date.now(),
          leadId,
          studentName,
          callId: callId ?? null,
          version: contextVersionRef.current ?? CALL_ASSIST_CONTEXT_VERSION,
        });
      });
      return () => setOnDispositionSaved(null);
    }, [setOnDispositionSaved]);

    // Reset per-lead state when the active student changes so a new call
    // never inherits the previous student's version, note, or panel.
    useEffect(() => {
      setContextVersion(null);
      setCallAssistNoteOpen(false);
      setCallAssistOpen(false);
    }, [lead?._id]);

    useEffect(() => {
      const prev = prevCallStatusRef.current;
      prevCallStatusRef.current = callStatus;
      const wasActive = CALL_ACTIVE.has(prev);
      const nowActive = CALL_ACTIVE.has(callStatus);
      if (!wasActive && nowActive && lead?._id) {
        setCallAssistNoteOpen(true); // welcome note ONLY — panel stays closed
      }
      if (wasActive && !nowActive) {
        setCallAssistOpen(false);
        setCallAssistNoteOpen(false);
      }
    }, [callStatus, lead?._id]);

    // Call timer — ticks while connected, same as AgentWorkspace. The baseline
    // is server truth (answeredAt, else startedAt) — never a reset 0 — so a
    // call recovered after a reload keeps counting from where it actually was.
    const [callElapsedMs, setCallElapsedMs] = useState(0);
    useEffect(() => {
      if (callStatus !== CALL_STATUS.CONNECTED) return undefined;
      const base =
        (activeCall?.answeredAt && new Date(activeCall.answeredAt).getTime()) ||
        (activeCall?.startedAt && new Date(activeCall.startedAt).getTime()) ||
        Date.now();
      setCallElapsedMs(0);
      const id = window.setInterval(() => setCallElapsedMs(Math.max(0, Date.now() - base)), 1000);
      return () => window.clearInterval(id);
    }, [callStatus, activeCall]);

    return (
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
        <Header
          onToggleCollapse={null}
          agentView={view}
          agentNavigate={navigate}
          onAgentRefresh={() => agentRefreshHandler?.()}
        />
        {/* ── Call controls — workspace view only (Dashboard/Call Workspace/
           Alerts nav + Live/Refresh now live in the shared Header) ── */}
        {view === 'workspace' && (
          <Box
            component="nav"
            aria-label="Call controls"
            sx={{ flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, px: '18px', pt: '10px', pb: { xs: '10px', md: 0 } }}
          >
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: 12,
                    fontWeight: 700,
                    px: 1,
                    py: 0.5,
                    borderRadius: '999px',
                    cursor: 'pointer',
                    color: phone.state === 'registered'
                      ? 'success.dark'
                      : phone.state === 'connecting'
                        ? 'text.secondary'
                        : 'error.main',
                    bgcolor: phone.state === 'registered'
                      ? 'success.soft'
                      : phone.state === 'connecting'
                        ? 'grey.100'
                        : 'error.soft',
                    '&:hover': { filter: 'brightness(0.97)' },
                  }}
                >
                  <SipIcon sx={{ fontSize: 14 }} />
                  {phone.state === 'registered'
                    ? `Phone ${phone.extension || ''}`.trim()
                    : phone.state === 'connecting'
                      ? 'Phone connecting…'
                      : phone.error
                        ? 'Phone offline'
                        : 'Phone offline'}
                </Box>
              )}
              <GlossyActionButton
                icon={<CallReceivedIcon sx={{ fontSize: 15 }} />}
                label={fetchingLead ? 'Fetching…' : 'Fetch Call'}
                color="#0f766e"
                onClick={() => fetchCall(lead?._id)}
                disabled={!canFetchCall}
                loading={fetchingLead}
                title="Fetch the next lead to call"
              />
              {callActive && (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  <TimerIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                  {formatDuration(callElapsedMs)}
                </Box>
              )}

              {/* Single entry point for the softphone: Start Call OPENS the
                  dialer (dial pad, hold, mute, transfer, conference, DTMF,
                  hang up) instead of placing a call blind. The widget's own
                  Call button is what actually dials, so a mis-tap can never
                  ring a student. The status chip above stays clickable to
                  bring the widget back after it has been closed mid-call. */}
              <GlossyActionButton
                icon={<CallMadeIcon sx={{ fontSize: 15 }} />}
                label="Start Call"
                color="#166534"
                onClick={() => setDialerOpen(true)}
                disabled={!canStartCall}
                pulse={canStartCall}
                title="Open the softphone — dial pad, hold, mute, transfer and conference"
              />

              <GlossyActionButton
                icon={<CallEndIcon sx={{ fontSize: 15 }} />}
                label="End Call"
                color="#B91C1C"
                onClick={endCall}
                disabled={!callActive || !endCall || !canEndCall}
                loading={callEnding}
                title="End the current call"
              />

              {callActive && !callAssistOpen && (
                <GlossyActionButton
                  icon={<AutoAwesomeIcon sx={{ fontSize: 15 }} />}
                  label="Call Assist"
                  color="#7C3AED"
                  onClick={() => setCallAssistOpen(true)}
                  title="Reopen Call Assist for this call"
                />
              )}
            </Box>
          </Box>
        )}
        <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <AgentView
            onGoToWorkspace={() => navigate('workspace')}
            assistNoteOpen={callAssistNoteOpen}
            onViewAssist={() => {
              setCallAssistNoteOpen(false);
              setCallAssistOpen(true);
            }}
            onDismissAssist={() => setCallAssistNoteOpen(false)}
          />
        </Box>
        <BreakModal />
        <CallAssistPopup
          open={callAssistOpen}
          lead={lead}
          onClose={() => setCallAssistOpen(false)}
          onVersionChange={handleContextVersion}
        />
        <CallAssistFeedbackForm
          open={!!feedbackRequest}
          request={feedbackRequest}
          onClose={closeFeedback}
          onSubmitted={closeFeedback}
        />
        <CallScreen
          open={dialerOpen}
          onClose={() => setDialerOpen(false)}
          timerSeconds={Math.floor(callElapsedMs / 1000)}
          phone={phone}
          lead={lead}
          startCall={startCall}
          endCall={endCall}
          callActive={callActive}
          callConnected={callStatus === CALL_STATUS.CONNECTED}
          callEnding={callEnding}
          recovering={recovering}
        />
      </Box>
    );
  }


  /* ── Supervisor / Counselor shell ── */
  const View = isCounselor ? COUNSELOR_VIEWS[view] : SUPERVISOR_VIEWS[view];
  const student360Match = !isAgent && !isCounselor ? location.pathname.match(STUDENT_360_PATTERN) : null;

  return (
    <Box
      className={collapsed && !isWorkspaceRoute ? 'sh-shell--collapsed' : undefined}
      sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <Header onToggleCollapse={handleToggleCollapse} />
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Sidebar: always visible — workspace is the counselor Home. Toggling
            the hamburger switches between 250px expanded and 56px icon-only. */}
        <Sidebar view={activeNavId} onNavigate={navigate} collapsed={collapsed} />
        <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, bgcolor: 'background.default' }}>
            <Box sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              // Full-viewport workspace desk fills edge-to-edge (no page padding,
              // no page scroll — the shell owns its internal scrolling).
              ...(isWorkspaceRoute ? { overflow: 'hidden', p: 0 } : { overflowY: 'auto', p: 2.5 }),
            }}>
              {student360Match ? (
                <SupervisorWorkspace leadId={decodeURIComponent(student360Match[1])} />
              ) : isCounselor ? (
                <CounselorProvider>
                  <View key={JSON.stringify(routePayload)} onNavigate={navigate} routePayload={routePayload} />
                </CounselorProvider>
              ) : (
                <View key={JSON.stringify(routePayload)} onNavigate={navigate} routePayload={routePayload} reportId={reportId} />
              )}
            </Box>
          <Footer />
        </Box>
      </Box>
      <BreakModal />
    </Box>
  );
}
