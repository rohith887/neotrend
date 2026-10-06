import { useCallback, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import { useNavigate } from 'react-router-dom';
import AgentWorkspace from '../AgentWorkspace.jsx';
import { fetchLeadById } from '../../api/leads.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';

/* ==========================================================================
   SUPERVISOR WORKSPACE — mounts the SAME Agent Workspace for a Supervisor.
   Per the product guidance, there is NO separate Supervisor UI: we reuse the
   existing <AgentWorkspace /> component (exact layout/components) but open it
   in `mode="supervisor"` so the supervisor gets FULL visibility (workspace +
   disposition/remark history), FULL student-data editing, and remarks — while
   the agent call/disposition workflow stays restricted. The supervisor shell
   routes `/leads/:leadId` here (replacing the old read-only Student 360).

   Because supervisors have no AgentProvider (useAgent returns a safe no-op),
   this wrapper owns the lead fetching and its own lead state, feeding the
   workspace through `student` + `onLeadSaved`. The interactions/lifecycle
   history is fetched once by <AgentWorkspace /> itself.
   ========================================================================== */

export default function SupervisorWorkspace({ leadId }) {
  const navigate = useNavigate();
  const backToLeads = useCallback(() => navigate('/leads'), [navigate]);

  const leadFetcher = useCallback(() => fetchLeadById(leadId), [leadId]);

  const { data: fetchedLead, error, loading } = useCachedFetch(`supervisor-workspace-${leadId}`, leadFetcher, { staleTime: 30_000 });

  const [leadOverride, setLeadOverride] = useState(null);

  // Before the supervisor saves an edit, show the freshly-fetched lead; once a
  // local edit lands (onLeadSaved) prefer the updated record until a refetch.
  const lead = leadOverride || fetchedLead;

  const validLead = useMemo(
    () => !!lead && String(lead._id) === String(leadId),
    [lead, leadId],
  );

  const handleLeadSaved = useCallback((freshLead) => {
    if (freshLead) setLeadOverride(freshLead);
  }, []);

  if (!validLead) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.25, px: 3, textAlign: 'center' }}>
        {error && !loading ? (
          <>
            <Box
              aria-hidden="true"
              sx={{
                width: 48, height: 48, borderRadius: '12px', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                color: 'warning.main', bgcolor: 'warning.soft', border: 1, borderColor: 'warning.border',
              }}
            >
              <ErrorOutlinedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary' }}>Could not open this lead</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', maxWidth: 340, lineHeight: 1.5 }}>{error}</Typography>
          </>
        ) : (
          <>
            <CircularProgress size={20} />
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>Loading lead…</Typography>
          </>
        )}
        <Button size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />} onClick={backToLeads} sx={{ mt: 0.5 }}>
          Back to Leads
        </Button>
      </Box>
    );
  }

  return (
    <AgentWorkspace
      student={lead}
      role="supervisor"
      mode="supervisor"
      onBack={backToLeads}
      onLeadSaved={handleLeadSaved}
    />
  );
}
