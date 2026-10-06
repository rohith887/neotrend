import { Box, Typography } from '@mui/material';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import { useAgent } from '../context/AgentContext.jsx';
import AppCard from '../ui/mui/AppCard.jsx';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import DispositionForm from './DispositionForm.jsx';
import CounselorPanel from './CounselorPanel.jsx';

/* ==========================================================================
   CALL DOCK (left column) — pure disposition workflow panel.
   The student identity is shown ONCE, in the center Student Summary Strip;
   this panel deliberately duplicates none of it. Call controls (Start/End
   Call + live timer) live in the AgentWorkspace top strip next to Fetch Call.
   MUI migration — same flow, only the presentation uses MUI.

   Role-aware:
     agent    → DispositionForm (call workflow)
     counselor → CounselorPanel (counselor-specific tabs)
   ========================================================================== */

export default function CallDock({
  profileForm,
  profileDirty,
  onSaveProfile,
  onDispositionChange,
  dispoFormRef,
  onDispoStateChange,
  role = 'agent',
  student,
}) {
  const { lead, fetchCall, fetchingLead } = useAgent();
  const isAgent = role === 'agent';

  return (
    <AppCard
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: 'none', boxShadow: 'none', borderRadius: 0, overflow: 'hidden' }}
      contentSx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: isAgent ? 0 : 0, overflow: 'hidden' }}
    >
      {/* ── Counselor panel (no lead required — uses student prop) ── */}
      {!isAgent && <CounselorPanel student={student} />}

      {/* ── Agent disposition form (requires lead from context) ── */}
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
          <DispositionForm
            key={lead._id}
            ref={dispoFormRef}
            profileForm={profileForm}
            profileDirty={profileDirty}
            onSaveProfile={onSaveProfile}
            onDispositionChange={onDispositionChange}
            onFormStateChange={onDispoStateChange}
          />
        )
      )}
    </AppCard>
  );
}
