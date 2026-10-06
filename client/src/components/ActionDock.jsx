import { Box, Typography } from '@mui/material';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TimerIcon from '@mui/icons-material/Timer';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AppCard from '../ui/mui/AppCard.jsx';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
import StatusChip from '../ui/mui/StatusChip.jsx';
import { useAgent } from '../context/AgentContext.jsx';
import { CALL_ACTIVE, CALL_STATUS } from '../context/AgentContext.jsx';
import DispositionForm from './DispositionForm.jsx';
import CounselorPanel from './CounselorPanel.jsx';

/* ==========================================================================
   ACTION DOCK — RIGHT column advisor panel. Answers "what do I need to do
   now?":
     CALL        — live call state/timer + Start / End Call.
     DISPOSITION — the existing disposition workflow (priority, callback,
                   remarks) via DispositionForm (logic reused, not replaced).
     NEXT ACTION — derived from the existing journey data only.
   Presentation only — all behaviours read from existing context/props.
   ========================================================================== */

// Reused next-action derivation (same data/business rule as ActivityPanel).
const nextActionText = (lead) => {
  if (!lead) return { text: 'No follow-up scheduled', sub: '' };
  if (lead.counselingStatus !== 'completed') {
    return { text: 'Complete counseling', sub: 'Student not yet eligible for registration' };
  }
  if (lead.registrationStatus && !['not-started', 'completed'].includes(lead.registrationStatus)) {
    return { text: 'Registration in progress', sub: lead.registrationStatus.replace(/-/g, ' ') };
  }
  if (lead.documentStatus && !['not-started', 'completed', ''].includes(lead.documentStatus)) {
    return { text: 'Review documents', sub: lead.documentStatus.replace(/-/g, ' ') };
  }
  return { text: 'No follow-up scheduled', sub: '' };
};

const SectionLabel = ({ icon, title }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: 1.5, pt: 1.25, pb: 0.5 }}>
    <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
      {icon}
    </Box>
    <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {title}
    </Typography>
  </Box>
);

export default function ActionDock({
  profileForm,
  profileDirty,
  onSaveProfile,
  onDispositionChange,
  dispoFormRef,
  onDispoStateChange,
  role = 'agent',
  student,
  callStatus,
  callElapsedLabel,
  dispoState = {},
  onDiscard,
}) {
  const { lead, fetchCall, fetchingLead } = useAgent();
  const isAgent = role === 'agent';

  const callActive = CALL_ACTIVE.has(callStatus);
  const callStateLabel = callActive
    ? 'On Call'
    : callStatus === CALL_STATUS.ENDED
      ? 'Completed'
      : 'Ready';
  const callStateTone = callActive ? 'danger' : callStatus === CALL_STATUS.ENDED ? 'warning' : 'success';

  const next = nextActionText(lead);

  return (
    <AppCard
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: 'none', boxShadow: 'none', borderRadius: 0, overflow: 'hidden' }}
      contentSx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}
    >
      {!isAgent && <CounselorPanel student={student} />}

      {isAgent && (
        !lead ? (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', py: 3, px: 2.5, gap: '4px' }}>
            <Box
              aria-hidden="true"
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
                bgcolor: 'primary.soft',
                border: 1,
                borderColor: 'primary.border',
                mb: 1.25,
              }}
            >
              <CallMadeIcon sx={{ fontSize: 24 }} />
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }}>No Active Call</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled', maxWidth: 260, lineHeight: 1.5 }}>
              Fetch the next lead to start working.
            </Typography>
            <PrimaryButton
              size="small"
              startIcon={<CallReceivedIcon sx={{ fontSize: 14 }} />}
              onClick={() => fetchCall()}
              disabled={fetchingLead}
              loading={fetchingLead}
              sx={{ minWidth: 168, mt: 1.25 }}
            >
              {fetchingLead ? 'Fetching…' : 'Fetch Next Lead'}
            </PrimaryButton>
          </Box>
        ) : (
          <>
            {/* ── CALL — compact live state only (Start/End live in the
                   caller strip, not duplicated here) ─────────────── */}
            <Box sx={{ flexShrink: 0, pt: 1.25, pb: 0.5 }}>
              <SectionLabel icon={<CallMadeIcon sx={{ fontSize: 13 }} />} title="Call" />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5 }}>
                <StatusChip status={callStateLabel} tone={callStateTone} pulse={callActive} size="small" />
                {callActive && (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12.5, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                    <TimerIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                    {callElapsedLabel}
                  </Box>
                )}
              </Box>
            </Box>

            <DispositionForm
              key={lead._id}
              ref={dispoFormRef}
              profileForm={profileForm}
              profileDirty={profileDirty}
              onSaveProfile={onSaveProfile}
              onDispositionChange={onDispositionChange}
              onFormStateChange={onDispoStateChange}
            />

            {/* ── Next action (derived, existing journey data) ───── */}
            <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mb: 0.5 }}>
                <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
                  <ScheduleIcon sx={{ fontSize: 13 }} />
                </Box>
                <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Next Action
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}>{next.text}</Typography>
              {next.sub && <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.125 }}>{next.sub}</Typography>}
            </Box>

            {/* ── Discard + Submit Disposition (bottom of Action Center) ── */}
            <Box
              sx={{
                mt: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1.5, py: 1, borderTop: 1, borderColor: 'divider', flexWrap: 'wrap',
              }}
            >
              <SecondaryButton size="small" startIcon={<RestartAltIcon sx={{ fontSize: 13 }} />} onClick={onDiscard} disabled={dispoState?.submitting}>
                Discard
              </SecondaryButton>
              <PrimaryButton
                size="small"
                startIcon={<CheckCircleIcon sx={{ fontSize: 13 }} />}
                disabled={dispoState?.noLead || dispoState?.submitting || !dispoState?.formReady}
                loading={dispoState?.submitting}
                onClick={() => dispoFormRef.current?.submit()}
                sx={{ flex: 1, minWidth: 0 }}
              >
                {dispoState?.submitting ? 'Saving…' : dispoState?.isRnrBlocked ? 'RNR Limit Reached' : 'Submit Disposition'}
              </PrimaryButton>
            </Box>
          </>
        )
      )}
    </AppCard>
  );
}
