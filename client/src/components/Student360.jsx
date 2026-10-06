import { useCallback, useEffect } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import { useNavigate } from 'react-router-dom';
import { fetchLeadById } from '../api/leads.js';
import { useCachedFetch } from '../context/CacheContext.jsx';
import { AgentProvider, useAgent } from '../context/AgentContext.jsx';
import AgentWorkspace from './AgentWorkspace.jsx';

/* ==========================================================================
   STUDENT 360 — supervisor entry point into the SAME Agent Workspace used
   by calling agents (header, profile tabs, calls, timeline). Mounted at
   /leads/:leadId. Loads the exact lead by id (GET /api/leads/:id) and
   injects it into a workspace-local AgentProvider context so every panel
   (summary strip, profile, activity) shares one source of truth. No lead
   claiming happens — supervisors open any student read-only.
   ========================================================================== */

// Keeps the fetched lead in sync with the AgentContext the panels read.
// Skips when the context already holds this lead (e.g. after a profile save
// produced a fresher copy inside the workspace).
function LeadInjector({ lead }) {
  const { lead: ctxLead, updateLead } = useAgent();
  useEffect(() => {
    if (lead && (!ctxLead || ctxLead._id !== lead._id)) updateLead(lead);
  }, [lead, ctxLead, updateLead]);
  return null;
}

function Student360Inner({ leadId }) {
  const navigate = useNavigate();
  const backToLeads = useCallback(() => navigate('/leads'), [navigate]);

  const fetcher = useCallback(() => fetchLeadById(leadId), [leadId]);
  const { data: lead, error, loading } = useCachedFetch(
    `student360-${leadId}`,
    fetcher,
    { staleTime: 30_000 }
  );

  // Only render once the loaded record is the requested student — prevents
  // flashing the previous student's data while a new id is loading.
  const valid = !!lead && String(lead._id) === String(leadId);

  if (!valid) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.25, px: 3, textAlign: 'center' }}>
        {error && !loading ? (
          <>
            <Box
              aria-hidden="true"
              sx={{
                width: 52, height: 52, borderRadius: '50%', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                color: 'warning.main', bgcolor: 'warning.soft', border: 1, borderColor: 'warning.border',
              }}
            >
              <ErrorOutlinedIcon sx={{ fontSize: 24 }} />
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }}>Could not open this student</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', maxWidth: 340, lineHeight: 1.5 }}>{error}</Typography>
          </>
        ) : (
          <>
            <CircularProgress size={22} />
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>Loading student…</Typography>
          </>
        )}
        <Button size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />} onClick={backToLeads} sx={{ mt: 0.75 }}>
          Back to Leads
        </Button>
      </Box>
    );
  }

  return (
    <>
      <LeadInjector lead={lead} />
      <AgentWorkspace mode="view" onBack={backToLeads} />
    </>
  );
}

export default function Student360({ leadId }) {
  return (
    <AgentProvider>
      <Student360Inner leadId={leadId} />
    </AgentProvider>
  );
}
