  import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
  import { Avatar, Box, Divider, Typography } from '@mui/material';
  import ArrowBackIcon from '@mui/icons-material/ArrowBack';
  import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
  import CheckCircleIcon from '@mui/icons-material/CheckCircle';
  import EmailIcon from '@mui/icons-material/Email';
  import NotificationsIcon from '@mui/icons-material/Notifications';
  import PersonIcon from '@mui/icons-material/Person';
  import PhoneIcon from '@mui/icons-material/Phone';
  import PublicIcon from '@mui/icons-material/Public';
  import RestartAltIcon from '@mui/icons-material/RestartAlt';
  import SchoolIcon from '@mui/icons-material/School';
  import SourceIcon from '@mui/icons-material/Source';
  import client from '../api/client.js';
  import { auditEvent } from '../api/audit.js';
  import { CALL_STATUS, useAgent } from '../context/AgentContext.jsx';
  import { useToast } from '../context/ToastContext.jsx';
  import { useCachedFetch } from '../context/CacheContext.jsx';
  import { buildProfilePayload, fromLead } from '../utils/leadProfile.js';
  import { fetchLeadLifecycle } from '../api/lifecycle.js';
  import { useWorkQueue } from '../hooks/useWorkQueue.js';
  import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
  import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
  import WorkQueueDrawer from './workqueue/WorkQueueDrawer.jsx';
  import CallbackQueueView from './workqueue/CallbackQueueView.jsx';
  import ActivityPanel from './ActivityPanel.jsx';
  import CallDock from './CallDock.jsx';
import StudentOverviewPanel from './StudentOverviewPanel.jsx';
import StudentProfileForm from './StudentProfileForm.jsx';
import LeadStatusStrip from './LeadStatusStrip.jsx';
import CallAssistWelcomeNote from './callassist/CallAssistWelcomeNote.jsx';
  import DispositionPanel from './DispositionPanel.jsx';
  import SupervisorDispositionPanel from './supervisor/SupervisorDispositionPanel.jsx';
  import StatusChip from '../ui/mui/StatusChip.jsx';
  import WhatsAppActionButton from './WhatsAppActionButton.jsx';
  import WhatsAppSidebar from './WhatsAppSidebar.jsx';

  /* ── Supervisor header quick-strip helpers ─────────────────────────────
     Compact labeled fields for the supervisor lead header. Values are read
     from the already-loaded lead document (populated by GET /leads/:id);
     missing values render as an em dash so the strip never collapses.    */
  const headerValue = (v) => (v == null || String(v).trim() === '' ? '—' : String(v).trim());

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

  // Compact rounded-rectangle CRM pill: small muted icon + readable
  // medium-weight value, with the field name surfaced on hover/focus via
  // tooltip so pills stay clean. Matches the Counselor/Agent header pill
  // family. Empties are hidden so the strip never shows dead pills.
  // Supervisor has FULL access — values are shown complete, never masked.
  const HeaderPill = ({ icon, label, value, sx }) => {
    const text = headerValue(value);
    if (text === '—') return null;
    return (
      <Box
        component="span"
        title={`${label}: ${text}`}
        aria-label={`${label}: ${text}`}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.75,
          height: 26, borderRadius: '999px', px: 1, flexShrink: 0, minWidth: 0,
          bgcolor: 'grey.50', border: 1, borderColor: 'divider', color: 'text.secondary',
          whiteSpace: 'nowrap', ...sx,
        }}
      >
        <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0, color: 'text.disabled', fontSize: 12 }} aria-hidden="true">
          {icon}
        </Box>
        <Box component="span" sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: 220 }}>
          {text}
        </Box>
      </Box>
    );
  };

  /* ==========================================================================
    AGENT WORKSPACE — professional CTI calling workspace.
    A compact activity bar (assigned | agent | callback | disposition |
    break | fetch | whatsapp | start | end) over a two-pane desk — Disposition
    & Notes (left, ~40%) | Student Profile (right, ~60%). The columns are
    fixed (never resizable) so the desk keeps a stable layout; the page never
    scrolls — each column's content scrolls internally.
    All backend logic + API behaviour unchanged — only the presentation
    uses MUI.
    ========================================================================== */

  export default function AgentWorkspace({ student, role = 'agent', onBack, mode = 'work', onLeadSaved, assistNoteOpen, onViewAssist, onDismissAssist }) {
    const ctx = useAgent();

    const {
      availability,
      breaking,
      openBreakModal,
      endBreak,
      fetchCall,
      startCall,
      endCall,
      fetchingLead,
      lead: ctxLead,
      callStatus,
      interactionVersion,
      updateLead,
    } = ctx;

    const { push } = useToast();

    const isAgent = role === 'agent';
    const isSupervisor = role === 'supervisor' || mode === 'supervisor';

    // View mode — legacy supervisor Student 360 (read-only 3-column desk),
    // no CTI controls and no polling of agent-only endpoints.
    const isView = mode === 'view';

    // Supervisor mode reuses the AGENT 35/65 layout (left disposition/notes,
    // right editable student profile) but with restricted call/disposition
    // operations. No CTI state is needed, so polling stays soft.
    const pollingEnabled = isAgent && !isView;

    // Lead source: student prop (supervisor/counselor) takes priority over context (agent).
    const lead = student || ctxLead;

    // ── Work queue (callbacks today / overdue / tomorrow) ─────────
    const { queue, loading: queueLoading, refresh: refreshQueue } = useWorkQueue(30000, pollingEnabled);
    const [queueOpen, setQueueOpen] = useState(false);
    const closeQueue = useCallback(() => setQueueOpen(false), []);

    // WhatsApp template composer — opens when a lead is loaded.
    const [waOpen, setWaOpen] = useState(false);
    const openWhatsApp = useCallback(() => {
      setWaOpen(true);
      if (lead?._id) {
        auditEvent({
          action: 'WHATSAPP_TEMPLATE_OPENED',
          module: 'workflow',
          leadId: lead._id,
          leadName: lead.studentName,
          message: `WhatsApp composer opened for ${String(lead.studentName || 'student').slice(0, 60)}`,
        });
      }
    }, [lead]);
    const closeWhatsApp = useCallback(() => setWaOpen(false), []);

    // "Call Now" / "Open Lead" — claim the chosen lead into the workspace
    // (same backend path as Fetch Call), then keep the queue fresh.
    // opts.autoStart (callback "Call" button) also starts the dial immediately.
    const handleQueueCall = useCallback(
      async (entry, opts = {}) => {
        setQueueOpen(false);
        const loaded = await fetchCall(entry.id);
        refreshQueue();
        if (opts.autoStart && loaded) startCall(loaded);
      },
      [fetchCall, refreshQueue, startCall]
    );

    // ── Interaction history (profile timeline + activity panel) ─────
    const fetchInteractionsCb = useCallback(async () => {
      if (!lead?._id) return [];
      const { data } = await client.get('/interactions', { params: { leadId: lead._id } });
      return data.data ?? [];
    }, [lead?._id]);

    const { data: interactions = [], error: historyError, loading: loadingHistory, refetch: refetchInteractions } = useCachedFetch(
      `interactions-${lead?._id}`,
      fetchInteractionsCb,
      { staleTime: 60_000 }
    );

    // ── Lifecycle event history (lazy — only the timeline needs it) ──
    // Current stage/waiting-on comes from the lead document itself; this
    // fetch is purely for recorded events (stage changes + assignments).
    const fetchLifecycleCb = useCallback(async () => {
      if (!lead?._id) return { lifecycle: null, events: [] };
      const payload = await fetchLeadLifecycle(lead._id);
      return { lifecycle: payload.lifecycle ?? null, events: payload.events ?? [] };
    }, [lead?._id]);

    const {
      data: lifecycleData = { lifecycle: null, events: [] },
      refetch: refetchLifecycle,
    } = useCachedFetch(`lead-lifecycle-${lead?._id}`, fetchLifecycleCb, { staleTime: 30_000 });

    // ── Editable student profile — state owned here so the disposition
    // form can validate + persist profile changes together. The profile
    // panel only edits it via props.
    const [profileForm, setProfileForm] = useState(null);
    const [profileSaving, setProfileSaving] = useState(false);

    // Currently selected disposition (name) in the left dock. The center
    // Student Profile form is only editable when this is 'Interested';
    // the Student Summary header always stays visible.
    const [selectedDisposition, setSelectedDisposition] = useState(null);

    const leadId = lead?._id ?? null;

    // (Re)hydrate the form whenever a new lead is loaded — and fully clear it
    // when the lead is cleared (e.g. after a disposition is saved) so no stale
    // student details linger in the workspace after the lead is removed.
    useEffect(() => {
      setProfileForm(lead ? fromLead(lead) : null);
    }, [lead]);

    // True once the form differs from the loaded lead's current record.
    const profileDirty = useMemo(
      () => !!profileForm && !!lead && JSON.stringify(profileForm) !== JSON.stringify(fromLead(lead)),
      [profileForm, lead]
    );

    // Persist the profile (and keep the record + queue fresh).
    // Returns true only when the profile was saved (or nothing to save).
    const saveProfile = useCallback(async () => {
      if (!lead || !profileForm) return false;
      if (!profileForm.studentName.trim()) {
        push('Student name is required', 'danger');
        return false;
      }
      setProfileSaving(true);
      try {
        const { data } = await client.patch(`/leads/${lead._id}`, buildProfilePayload(profileForm));
        updateLead(data.data.lead);
        onLeadSaved?.(data.data.lead);
        setProfileForm(fromLead(data.data.lead));
        refetchLifecycle();
        push('Student profile updated successfully', 'success');
        if (pollingEnabled) refreshQueue();
        return true;
      } catch (err) {
        push(err?.response?.data?.message ?? 'Could not update profile', 'danger');
        return false;
      } finally {
        setProfileSaving(false);
      }
    }, [lead, profileForm, updateLead, push, refreshQueue, pollingEnabled, refetchLifecycle]);

    const discardProfile = useCallback(() => {
      if (lead) setProfileForm(fromLead(lead));
    }, [lead]);

    // Refresh the work queue + lifecycle whenever a disposition is saved.
    useEffect(() => {
      if (interactionVersion > 0 && pollingEnabled) {
        refreshQueue();
        refetchLifecycle();
      }
    }, [interactionVersion, pollingEnabled, refreshQueue, refetchLifecycle]);

    useEffect(() => {
      if (!lead?._id || interactionVersion === 0) return;
      refetchInteractions();
    }, [interactionVersion, lead?._id]); // eslint-disable-line react-hooks/exhaustive-deps

    const onBreak = availability === 'break';

    // ── Disposition form ref + state for unified submit button ──────
    const dispoFormRef = useRef(null);
    const [dispoState, setDispoState] = useState({
      formReady: false,
      isRnrBlocked: false,
      noLead: true,
      callStatus: CALL_STATUS.IDLE,
      submitting: false,
      selectedDispName: null,
    });

    // Reset per-student workflow state when the loaded student changes, so
    // no disposition selection leaks between students.
    useEffect(() => {
      setSelectedDisposition(null);
      setDispoState({
        formReady: false,
        isRnrBlocked: false,
        noLead: true,
        callStatus: CALL_STATUS.IDLE,
        submitting: false,
        selectedDispName: null,
      });
    }, [leadId]);

    // Pending callbacks — single source for the drawer count.
    const pendingCount = queue.pendingCount ?? (
      queue.callbacksOverdue.length + queue.callbacksToday.length + queue.callbacksTomorrow.length + queue.callbacksLater.length
    );

    // Supervisor header values — full access (never masked).
    const assignedAgent = lead?.assignedTo
      ? [lead.assignedTo.firstName, lead.assignedTo.lastName].filter(Boolean).join(' ')
      : '';
    const dispositionName = (() => {
      const d = lead?.currentDisposition;
      if (!d) return null;
      return (typeof d === 'object' ? d.name || d.label : d) || null;
    })();

    return (
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1, p: 1.25, overflow: 'hidden' }}>

        {/* ── Caller / Lead activity bar — Assigned | Agent | Callback | Disposition | Break | WhatsApp ── */}
        {isAgent && (
          <LeadStatusStrip
            lead={lead}
            interactions={interactions}
            onTagsChange={({ tags, history }) => {
              const fresh = { ...lead, tags, history };
              updateLead(fresh);
              onLeadSaved?.(fresh);
            }}
            onBreak={onBreak}
            breaking={breaking}
            onBreakIn={openBreakModal}
            onBreakOut={endBreak}
            onWhatsApp={openWhatsApp}
            onDropStatusChange={(fresh) => {
              updateLead(fresh);
              onLeadSaved?.(fresh);
              refreshQueue();
              refetchLifecycle();
            }}
          />
        )}

        {/* ── Supervisor / view strip — the agent workspace uses the activity bar above ── */}
        {(isSupervisor || isView) && (
          <Box
            sx={{
                flexShrink: 0,
                minHeight: isSupervisor ? 0 : 40,
                display: 'flex',
                flexDirection: isSupervisor ? 'column' : 'row',
                alignItems: isSupervisor ? 'stretch' : 'center',
                gap: isSupervisor ? 0.5 : 1.25,
                flexWrap: 'nowrap',
                px: 1.25,
                py: isSupervisor ? 0.75 : 0.5,
                bgcolor: 'transparent',
                borderBottom: 1,
                borderColor: 'divider',
              }}
          >
            {/* ── Supervisor Student 360 strip (read-only) ──────────── */}
            {isView && (
              <>
                <SecondaryButton
                  size="small"
                  startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
                  onClick={onBack}
                >
                  Back to Leads
                </SecondaryButton>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.disabled', letterSpacing: '-0.01em' }}>
                  Student 360 — read-only workspace view
                </Typography>
              </>
            )}

            {/* ── Supervisor View strip — full context, no call controls ── */}
            {isSupervisor && lead && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                {/* ── Row 1 — identity + status + WhatsApp ─────────── */}
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, rowGap: 0.5 }}>
                  {onBack && (
                    <SecondaryButton
                      size="small"
                      startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
                      onClick={onBack}
                    >
                      Back to Leads
                    </SecondaryButton>
                  )}
                  <Avatar
                    sx={{ width: 30, height: 30, bgcolor: 'primary.soft', color: 'primary.main', fontSize: 13, fontWeight: 700, flexShrink: 0 }}
                  >
                    {(lead.studentName || 'S').charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 0.6 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: 160, sm: 220, md: 280 } }}>
                      {lead.studentName || 'Student'}
                    </Typography>
                    {lead.referenceId && (
                      <Typography sx={{ fontSize: 11.5, color: 'text.disabled', fontFamily: 'monospace', fontWeight: 500, flexShrink: 0 }}>
                        {lead.referenceId}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                    <StatusChip
                      status={dispositionName || 'No disposition set'}
                      variant="outlined"
                      dot={false}
                      sx={{ height: 22, fontSize: 11, fontWeight: 500 }}
                    />
                    <Box title="Send a WhatsApp template message to this student">
                      <WhatsAppActionButton onClick={openWhatsApp} />
                    </Box>
                  </Box>
                </Box>

                {/* ── Row 2 — quick-info pills (full values) ───────── */}
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', overflowX: 'auto', minWidth: 0 }}>
                  <HeaderPill icon={<EmailIcon sx={{ fontSize: 12 }} />} label="Email" value={lead.email} />
                  <HeaderPill icon={<PhoneIcon sx={{ fontSize: 12 }} />} label="Mobile" value={lead.mobile ?? lead.phone} />
                  <HeaderPill icon={<SchoolIcon sx={{ fontSize: 12 }} />} label="University" value={headerUniversity(lead)} />
                  <HeaderPill icon={<CalendarMonthIcon sx={{ fontSize: 12 }} />} label="Intake" value={lead.intake} />
                  <HeaderPill icon={<PublicIcon sx={{ fontSize: 12 }} />} label="Country" value={headerCountry(lead)} />
                  <HeaderPill icon={<SourceIcon sx={{ fontSize: 12 }} />} label="Lead Source" value={lead.source?.name ?? lead.source} />
                  <HeaderPill icon={<PersonIcon sx={{ fontSize: 12 }} />} label="Assigned Agent" value={assignedAgent} />
                </Box>
              </Box>
            )}

            {/* ── WhatsApp — non-agent modes (agent's lives on the activity bar above) ── */}
            {lead && !isSupervisor && (
              <Box sx={{ ml: 'auto', flexShrink: 0 }} title="Send a WhatsApp template message to this student">
                <WhatsAppActionButton onClick={openWhatsApp} />
              </Box>
            )}
          </Box>
        )}

        {/* ── Call Assist welcome note — top-right, below the header, in
            normal flow (never covers disposition/notes or student fields) ── */}
        {isAgent && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <CallAssistWelcomeNote
              open={assistNoteOpen}
              onView={onViewAssist}
              onDismiss={onDismissAssist}
            />
          </Box>
        )}

        {/* ── Workspace zones (visible together on desktop) ─────────
            Agent:  LEFT = Disposition & Notes (~40%)  |  RIGHT = Student (~60%)
            Supervisor Student 360 (isView) / counselor keep their desk:
            Overview | Student 360 | Activity. Split by thin dividers. */}
        <Box sx={{
          flex: '1 1 0',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: (isAgent || isSupervisor)
              ? 'minmax(320px, 35%) minmax(0, 1fr)'
              : 'minmax(224px, 22%) minmax(0, 1fr) minmax(176px, 16%)',
          },
          gap: 0,
          alignItems: 'stretch',
          bgcolor: 'transparent',
          overflowX: 'hidden',
          overflowY: { xs: 'auto', md: 'hidden' },
        }}>
          {isSupervisor ? (
            <>
              {/* ── Supervisor LEFT — disposition review + notes (~35%) ── */}
              <Box component="aside" sx={{ bgcolor: 'background.paper', minWidth: 0, minHeight: 0, maxHeight: { xs: '55vh', md: 'none' }, display: 'flex', flexDirection: 'column', borderRight: { xs: 0, md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: 'divider', overflowY: 'auto' }}>
                <SupervisorDispositionPanel lead={lead} interactions={interactions} />
              </Box>

              {/* ── Supervisor RIGHT — editable Student Information (~65%) ── */}
              <Box component="section" sx={{ bgcolor: 'background.paper', minWidth: 0, minHeight: 0, maxHeight: { xs: '55vh', md: 'none' }, display: 'flex', flexDirection: 'column', overflowY: { xs: 'auto', md: 'hidden' } }}>
                <StudentProfileForm
                  lead={lead}
                  interactions={interactions}
                  form={profileForm}
                  setForm={setProfileForm}
                  saving={profileSaving}
                  selectedDisposition={selectedDisposition}
                  onSubmitDisposition={() => dispoFormRef.current?.submit()}
                  dispoState={dispoState}
                  readOnly={false}
                  editable
                  onLeadUpdated={(freshLead) => {
                    if (freshLead) updateLead(freshLead);
                    onLeadSaved?.(freshLead);
                    refetchLifecycle();
                  }}
                />

                {/* ── Save Profile — sticky bottom-right (no disposition submit) ── */}
                <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', px: 1.5, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, flexWrap: 'wrap', bgcolor: 'background.paper' }}>
                  <Typography sx={{ mr: 'auto', fontSize: 11.5, color: 'text.disabled' }}>
                    {profileDirty ? 'Unsaved student changes' : 'All student data saved'}
                  </Typography>
                  <SecondaryButton size="small" startIcon={<RestartAltIcon sx={{ fontSize: 13 }} />} onClick={discardProfile} disabled={profileSaving || !profileDirty}>
                    Discard
                  </SecondaryButton>
                  <PrimaryButton
                    size="small"
                    startIcon={<CheckCircleIcon sx={{ fontSize: 13 }} />}
                    disabled={profileSaving || !profileDirty}
                    loading={profileSaving}
                    onClick={() => saveProfile()}
                    sx={{ minWidth: 0 }}
                  >
                    {profileSaving ? 'Saving…' : 'Save Profile'}
                  </PrimaryButton>
                </Box>
              </Box>
            </>
          ) : isAgent ? (
            <>
              {/* ── Agent LEFT — Disposition & Notes (~40%) ──────── */}
              <Box component="aside" sx={{ bgcolor: 'background.paper', minWidth: 0, minHeight: 0, maxHeight: { xs: '55vh', md: 'none' }, display: 'flex', flexDirection: 'column', borderRight: { xs: 0, md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: 'divider', overflowY: { xs: 'auto', md: 'hidden' } }}>
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <DispositionPanel
                    profileForm={profileForm}
                    profileDirty={profileDirty}
                    onSaveProfile={saveProfile}
                    onDispositionChange={setSelectedDisposition}
                    dispoFormRef={dispoFormRef}
                    onDispoStateChange={setDispoState}
                    interactions={interactions}
                  />
                </Box>

                {/* ── Discard + Submit Disposition — anchored bottom of workflow panel ── */}
                <Box sx={{ flexShrink: 0, mt: 'auto', borderTop: 1, borderColor: 'divider', px: 1.5, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, flexWrap: 'wrap', bgcolor: 'background.paper' }}>
                  <SecondaryButton size="small" startIcon={<RestartAltIcon sx={{ fontSize: 13 }} />} onClick={discardProfile} disabled={dispoState?.submitting}>
                    Discard
                  </SecondaryButton>
                  <PrimaryButton
                    size="small"
                    startIcon={<CheckCircleIcon sx={{ fontSize: 13 }} />}
                    disabled={dispoState?.noLead || dispoState?.submitting || !dispoState?.formReady}
                    loading={dispoState?.submitting}
                    onClick={() => dispoFormRef.current?.submit()}
                    sx={{ minWidth: 0 }}
                  >
                    {dispoState?.submitting ? 'Saving…' : dispoState?.isRnrBlocked ? 'RNR Limit Reached' : 'Submit Disposition'}
                  </PrimaryButton>
                </Box>
              </Box>

              {/* ── Agent RIGHT — Student Information (~65%) ────── */}
              <Box component="section" sx={{ bgcolor: 'background.paper', minWidth: 0, minHeight: 0, maxHeight: { xs: '55vh', md: 'none' }, display: 'flex', flexDirection: 'column', overflowY: { xs: 'auto', md: 'hidden' } }}>
                <StudentProfileForm
                  lead={lead}
                  interactions={interactions}
                  form={profileForm}
                  setForm={setProfileForm}
                  saving={profileSaving}
                  selectedDisposition={selectedDisposition}
                  onSubmitDisposition={() => dispoFormRef.current?.submit()}
                  dispoState={dispoState}
                  readOnly={isView}
                  compact
                  onLeadUpdated={(freshLead) => {
                    if (freshLead) updateLead(freshLead);
                    onLeadSaved?.(freshLead);
                    refetchLifecycle();
                  }}
                />
              </Box>
            </>
          ) : (
            <>
              {/* ── LEFT zone — Overview (view) / Counsel (counselor) ── */}
              <Box component="aside" sx={{ bgcolor: 'background.paper', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderRight: 1, borderColor: 'divider' }}>
                {isView ? (
                  <StudentOverviewPanel
                    lead={lead}
                    interactions={interactions}
                    onLeadUpdated={(freshLead) => {
                      if (freshLead) updateLead(freshLead);
                      refetchLifecycle();
                    }}
                  />
                ) : (
                  <CallDock
                    profileForm={profileForm}
                    profileDirty={profileDirty}
                    onSaveProfile={saveProfile}
                    onDispositionChange={setSelectedDisposition}
                    dispoFormRef={dispoFormRef}
                    onDispoStateChange={setDispoState}
                    role={role}
                    student={student}
                  />
                )}
              </Box>

              {/* ── CENTER: Student 360 ─────────────────────────────── */}
              <Box component="section" sx={{ bgcolor: 'background.paper', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <StudentProfileForm
                  lead={lead}
                  interactions={interactions}
                  form={profileForm}
                  setForm={setProfileForm}
                  saving={profileSaving}
                  selectedDisposition={selectedDisposition}
                  onSubmitDisposition={() => dispoFormRef.current?.submit()}
                  dispoState={dispoState}
                  readOnly={isView}
                  onLeadUpdated={(freshLead) => {
                    if (freshLead) updateLead(freshLead);
                    refetchLifecycle();
                  }}
                />
              </Box>

              {/* ── RIGHT: Activity ─────────────────────────────────── */}
              <Box component="aside" sx={{ bgcolor: 'background.paper', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider' }}>
                <ActivityPanel
                  lead={lead}
                  interactions={interactions}
                  lifecycleEvents={lifecycleData?.events ?? []}
                  loadingHistory={loadingHistory}
                  historyError={historyError}
                />
              </Box>
            </>
          )}
        </Box>

        {/* ── Work queue drawer (callback workspace) ─────────────── */}
        {isAgent && (
          <WorkQueueDrawer
            open={queueOpen}
            onClose={closeQueue}
            title="Callback Workspace"
            icon={<NotificationsIcon sx={{ fontSize: 16 }} />}
            count={pendingCount}
          >
            <CallbackQueueView
              queue={queue}
              loading={queueLoading}
              onCallNow={(e) => handleQueueCall(e, { autoStart: true })}
              onOpenLead={handleQueueCall}
              onRefresh={refreshQueue}
              activeLeadId={lead?._id ?? null}
              callStatus={callStatus}
              onBreak={onBreak}
              fetchingLead={fetchingLead}
            />
            <Divider sx={{ borderStyle: 'dashed' }} />
          </WorkQueueDrawer>
        )}

      </Box>

      {/* ── WhatsApp — unified sidebar (Conversation + Templates), push panel that shares width with the workspace ── */}
      <WhatsAppSidebar
        open={waOpen}
        onClose={closeWhatsApp}
        lead={lead}
        onSent={() => {
          // Refresh interactions so the send registers in activity history.
          refetchInteractions();
        }}
      />
      </Box>
    );
  }
