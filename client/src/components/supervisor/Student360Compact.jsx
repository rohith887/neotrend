import { useCallback } from 'react';
import { Avatar, Box, Button, CircularProgress, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import PersonIcon from '@mui/icons-material/Person';
import { useNavigate } from 'react-router-dom';
import { lifecycleOf, stageLabel, stageTone, dueLabel, isOverdue } from '../../utils/lifecycle.js';
import { CountryLabel } from '../../utils/flag.jsx';
import StatusChip from '../../ui/mui/StatusChip.jsx';
import { fetchLeadById, fetchInteractions } from '../../api/leads.js';
import { fetchLeadLifecycle } from '../../api/lifecycle.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import LifecycleStrip from '../LifecycleStrip.jsx';
import ActivityPanel from '../ActivityPanel.jsx';

/* ==========================================================================
   STUDENT 360 (COMPACT) — supervisor read-only case inspection.
   Mounted at /leads/:leadId. Premium CRM-style layout with compact header,
   lead snapshot, 2-column workspace, and clean information hierarchy.
   ========================================================================== */

const CARD_SX = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '12px',
  bgcolor: 'background.paper',
  overflow: 'hidden',
};

const CARD_HEADER_SX = {
  px: 2,
  pt: 1.5,
  pb: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const CARD_BODY_SX = {
  px: 2,
  pb: 2,
  pt: 0,
};

const FIELD_GAP_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
  gap: '10px 20px',
};

const formatStatusLabel = (raw) => {
  if (!raw) return 'Not Started';
  return String(raw)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const journeyTone = (v) => {
  const val = (v || 'not-started').toLowerCase();
  if (val === 'completed') return 'success';
  if (val === 'in-progress') return 'info';
  return 'neutral';
};

const fmtDateTime = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const display = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.name || v.code || v.label || null;
  return String(v);
};

const Field = ({ label, value, node }) => {
  const text = display(value);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 500, color: 'text.disabled', lineHeight: 1.3, mb: '1px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </Typography>
      <Typography
        noWrap
        title={text || undefined}
        sx={{ fontSize: 13, fontWeight: 500, color: text ? 'text.primary' : 'text.disabled', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {node || text || '—'}
      </Typography>
    </Box>
  );
};

const SnapshotCell = ({ label, children }) => (
  <Box sx={{ minWidth: 0, flex: '1 1 0' }}>
    <Typography sx={{ fontSize: 10, fontWeight: 600, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2, mb: '2px' }}>
      {label}
    </Typography>
    <Box sx={{ minHeight: 22, display: 'flex', alignItems: 'center' }}>{children}</Box>
  </Box>
);

const Dash = () => <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>—</Typography>;

function CompactInner({ leadId }) {
  const navigate = useNavigate();
  const backToLeads = useCallback(() => navigate('/leads'), [navigate]);

  const leadFetcher = useCallback(() => fetchLeadById(leadId), [leadId]);
  const lcFetcher = useCallback(() => fetchLeadLifecycle(leadId), [leadId]);
  const interactionsFetcher = useCallback(() => fetchInteractions(leadId), [leadId]);

  const { data: lead, error, loading } = useCachedFetch(`student360-${leadId}`, leadFetcher, { staleTime: 30_000 });
  const { data: lifecycleData } = useCachedFetch(`lead-lifecycle-${leadId}`, lcFetcher, { staleTime: 30_000 });
  const { data: interactions = [] } = useCachedFetch(`interactions-${leadId}`, interactionsFetcher, { staleTime: 30_000 });

  const valid = !!lead && String(lead._id) === String(leadId);

  if (!valid) {
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

  const assignedAgent = lead.assignedTo
    ? [lead.assignedTo.firstName, lead.assignedTo.lastName].filter(Boolean).join(' ')
    : null;

  const prefCountryValues = (lead.preferredCountries || []).map((pc) => pc?.country?.name || pc.country).filter(Boolean);
  const prefCountryText = prefCountryValues.join(', ');
  const prefCountryNode = prefCountryValues.length
    ? <Box component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', columnGap: '8px', rowGap: 2 }}>{prefCountryValues.map((c, i) => <CountryLabel key={i} value={c} />)}</Box>
    : null;

  const lc = lifecycleOf(lead);
  const overdue = lc ? isOverdue(lc.nextActionDue) : false;
  const due = lc ? dueLabel(lc.nextActionDue) : null;

  const journeySteps = [
    { key: 'registrationStatus', label: 'Registration' },
    { key: 'documentStatus', label: 'Documents' },
    { key: 'paymentStatus', label: 'Payments' },
    { key: 'applicationStatus', label: 'Applications' },
    { key: 'visaStatus', label: 'Visa' },
  ];

  const applications = Array.isArray(lead.applications) ? lead.applications : [];

  const sourceName = display(lead.source?.name ?? lead.source);
  const intake = display(lead.intake);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
        <Button
          size="small"
          startIcon={<ArrowBackIcon sx={{ fontSize: 15 }} />}
          onClick={backToLeads}
          sx={{ color: 'text.secondary', fontWeight: 500, '&:hover': { color: 'primary.main' } }}
        >
          Leads
        </Button>

        <Avatar
          sx={{ width: 34, height: 34, bgcolor: 'primary.soft', color: 'primary.main', fontSize: 14, fontWeight: 700 }}
        >
          {(lead.studentName || 'S').charAt(0).toUpperCase()}
        </Avatar>

        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: 'text.primary', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              {lead.studentName || 'Student'}
            </Typography>
            {lead.referenceId && (
              <Typography sx={{ fontSize: 12, color: 'text.disabled', fontFamily: 'monospace', fontWeight: 500 }}>
                {lead.referenceId}
              </Typography>
            )}
          </Box>
          <Typography sx={{ fontSize: 11.5, color: 'text.disabled', lineHeight: 1.3, mt: '1px' }}>
            {[intake, sourceName].filter(Boolean).join(' · ') || 'Lead'}
          </Typography>
        </Box>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
          {lead.status && (
            <StatusChip status={formatStatusLabel(lead.status)} variant="outlined" dot={false} sx={{ height: 22, fontSize: 11, fontWeight: 500 }} />
          )}
          {lead.interestLevel && (
            <StatusChip status={lead.interestLevel} variant="outlined" dot={false} sx={{ height: 22, fontSize: 11, fontWeight: 500 }} />
          )}
        </Box>
      </Box>

      {/* ── Lifecycle strip ──────────────────────────────────────── */}
      <LifecycleStrip lead={lead} />

      {/* ── Lead snapshot ────────────────────────────────────────── */}
      <Box sx={{ ...CARD_SX, px: 2, py: 1.25, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <SnapshotCell label="Stage">
          {lc?.stage ? <StatusChip status={stageLabel(lc.stage)} tone={stageTone(lc.stage)} size="small" sx={{ height: 20, fontSize: 11 }} /> : <Dash />}
        </SnapshotCell>
        <SnapshotCell label="Status">
          {lead.status ? (
            <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.primary' }}>{formatStatusLabel(lead.status)}</Typography>
          ) : <Dash />}
        </SnapshotCell>
        <SnapshotCell label="Owner">
          {assignedAgent ? (
            <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.primary' }}>{assignedAgent}</Typography>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>Unassigned</Typography>
          )}
        </SnapshotCell>
        <SnapshotCell label="Next Action">
          {lc?.nextAction ? (
            <Typography noWrap title={lc.nextAction} sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.primary', maxWidth: 180 }}>{lc.nextAction}</Typography>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>No next action</Typography>
          )}
        </SnapshotCell>
        <SnapshotCell label="Due">
          {due ? (
            <Typography sx={{ fontSize: 12.5, fontWeight: overdue ? 600 : 500, color: overdue ? 'warning.dark' : 'text.primary' }}>{due}</Typography>
          ) : <Dash />}
        </SnapshotCell>
      </Box>

      {/* ── 2-column workspace ───────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 380px' }, gap: 1.5, alignItems: 'start' }}>

        {/* ── LEFT COLUMN ────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>

          {/* Student Information */}
          <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>Student Information</Typography>
            </Box>
            <Box sx={CARD_BODY_SX}>
              <Box sx={FIELD_GAP_SX}>
                <Field label="Mobile" value={lead.mobile} />
                <Field label="Email" value={lead.email} />
                <Field label="Date of Birth" value={lead.dateOfBirth} />
                <Field label="Gender" value={lead.gender} />
                <Field label="Highest Education" value={lead.highestEducation} />
                <Field label="Preferred Country" value={prefCountryText} node={prefCountryNode} />
              </Box>
            </Box>
          </Box>

          {/* Academic Information */}
          <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>Academic Information</Typography>
            </Box>
            <Box sx={CARD_BODY_SX}>
              <Box sx={FIELD_GAP_SX}>
                <Field label="College" value={lead.collegeName} />
                <Field label="Passing Year" value={lead.passingYear} />
                <Field label="GPA / Percentage" value={lead.gpa} />
                <Field label="Work Experience" value={lead.workExperience} />
              </Box>
            </Box>
          </Box>

          {/* Study Preferences */}
          <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>Study Preferences</Typography>
            </Box>
            <Box sx={CARD_BODY_SX}>
              <Box sx={FIELD_GAP_SX}>
                <Field label="Preferred Country" value={prefCountryText} node={prefCountryNode} />
                <Field label="Intake" value={lead.intake} />
                <Field label="Preferred Universities" value={(lead.preferredUniversities || []).map((pu) => pu?.university?.name || pu.university).filter(Boolean).join(', ')} />
              </Box>
            </Box>
          </Box>

          {/* Journey */}
          <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>Journey</Typography>
            </Box>
            <Box sx={{ ...CARD_BODY_SX, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {journeySteps.map(({ key, label }) => {
                const raw = lead[key];
                const val = raw || 'not-started';
                const isCompleted = val === 'completed';
                const isInProgress = val === 'in-progress';
                return (
                  <StatusChip
                    key={key}
                    status={`${label}: ${formatStatusLabel(val)}`}
                    tone={isCompleted ? 'success' : isInProgress ? 'info' : 'neutral'}
                    variant="outlined"
                    dot={false}
                    sx={{ height: 22, fontSize: 11, fontWeight: 500, '& .MuiChip-label': { px: 0.75 } }}
                  />
                );
              })}
            </Box>
          </Box>

          {/* Applications */}
          <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>Applications</Typography>
              {applications.length > 0 && (
                <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{applications.length}</Typography>
              )}
            </Box>
            <Box sx={CARD_BODY_SX}>
              {applications.length === 0 ? (
                <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 0.5 }}>No applications yet. Applications will appear here once the student starts one.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {applications.map((app, i) => (
                    <Box key={app._id || i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: i < applications.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {display(app.university)}
                      </Typography>
                      {app.status && <StatusChip status={app.status} tone={journeyTone(app.status === 'Offer Received' ? 'completed' : 'in-progress')} variant="outlined" dot={false} sx={{ height: 20, fontSize: 10.5 }} />}
                      {app.submittedAt && (
                        <Typography sx={{ fontSize: 11, color: 'text.disabled', flexShrink: 0 }}>
                          {new Date(app.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* ── RIGHT COLUMN — Activity (sticky) ────────────────────── */}
        <Box
          sx={{
            ...CARD_SX,
            position: { lg: 'sticky' },
            top: { lg: 0 },
            maxHeight: { lg: 'calc(100vh - 200px)' },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ ...CARD_HEADER_SX, pb: 0.5 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>Activity</Typography>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ActivityPanel
              lead={lead}
              interactions={interactions}
              lifecycleEvents={lifecycleData?.events ?? []}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function Student360Compact({ leadId }) {
  return <CompactInner leadId={leadId} />;
}
