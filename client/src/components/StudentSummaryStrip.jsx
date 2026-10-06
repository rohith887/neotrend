import { Box, Tooltip, Typography } from '@mui/material';
import BadgeIcon from '@mui/icons-material/Badge';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EmailIcon from '@mui/icons-material/Email';
import EventIcon from '@mui/icons-material/Event';
import PhoneIcon from '@mui/icons-material/Phone';
import PublicIcon from '@mui/icons-material/Public';
import SchoolIcon from '@mui/icons-material/School';
import SellIcon from '@mui/icons-material/Sell';
import { CALL_ACTIVE, CALL_STATUS } from '../context/AgentContext.jsx';
import StatusChip from '../ui/mui/StatusChip.jsx';
import { CountryLabel } from '../utils/flag.jsx';

/* ==========================================================================
   CANDIDATE SUMMARY STRIP — ONE compact horizontal row, no field cards.

     Line 1 — identity:  Name  #LeadID   [disposition/status]   ● Ready(right)
     Line 2 — inline data:  phone | email | education | country |
             lead source | intake | assigned | owner | callback
             (values only, icon + text, joined by thin dividers, ellipsis-
             truncated with tooltip on hover).

   Compact: ~10-14px vertical padding, 14-16px horizontal, 1px border,
   8px radius, very subtle shadow. Never wraps into tall field cards.
   Presentation only — same props/derivations; nothing is duplicated.
   ========================================================================== */

const AD = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.name || '';
const display = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v.trim() || '—';
  return v.name || v.code || v.label || '—';
};
const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ── One compact metadata pill: tiny label + readable value ──────────── */
const Field = ({ icon, label, value, node }) => {
  const v = display(value);
  return (
    <Tooltip title={v === '—' ? '' : `${label}: ${v}`} arrow placement="top">
      <Box
        component="span"
        aria-label={label}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          minWidth: 0,
          px: 1,
          py: '5px',
          borderRadius: 1.25,
          bgcolor: 'action.hover',
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Box component="span" sx={{ display: 'inline-flex', color: 'text.disabled', flexShrink: 0 }} aria-hidden="true">
          {icon}
        </Box>
        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.1 }}>
          <Box component="span" sx={{ fontSize: 9.5, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            {label}
          </Box>
          <Box
            component="span"
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: 'text.primary',
              maxWidth: 240,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {node || v}
          </Box>
        </Box>
      </Box>
    </Tooltip>
  );
};

export default function StudentSummaryStrip({ lead, interactions = [], callStatus }) {
  // Current lead/disposition status — the workflow state of the record
  // (distinct from the transient call-state badge next to it).
  const currentStatus =
    (typeof lead.currentDisposition === 'object' && lead.currentDisposition !== null
      ? lead.currentDisposition.name || lead.currentDisposition.label
      : lead.currentDisposition)
    || lead.status
    || null;

  // Live call-state badge — only rendered when a callStatus is provided.
  const showCallState = callStatus != null;
  const callActive = CALL_ACTIVE.has(callStatus);
  const callDone = callStatus === CALL_STATUS.ENDED;
  const badge = callActive
    ? { label: 'On Call', tone: 'danger', pulse: true }
    : callDone
      ? { label: 'Completed', tone: 'warning', pulse: false }
      : { label: 'Ready', tone: 'success', pulse: false };

  // Latest scheduled callback date (lives on the newest interaction).
  const latestCallback = (interactions ?? [])
    .filter((it) => it.callbackDateTime)
    .sort((a, b) => new Date(b.callbackDateTime) - new Date(a.callbackDateTime))[0];

  const assignedAgent = AD(lead.assignedTo) || null;
  const assignedDate = fmtDate(lead.assignedAt) || fmtDate(lead.createdAt);
  const callbackDate = fmtDate(latestCallback?.callbackDateTime);

  return (
    <Box
      component="header"
      sx={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        mx: 1.5,
        mt: 1.5,
        mb: 0,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        boxShadow: 'xs',
        px: '14px',
        py: '10px',
      }}
    >
      {/* ── Identity row ─────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flexWrap: 'wrap', columnGap: '8px', rowGap: '2px' }}>
          <Tooltip title={display(lead.studentName)} arrow placement="top">
            <Typography
              component="span"
              sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}
            >
              {display(lead.studentName)}
            </Typography>
          </Tooltip>
          <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>
            #{lead.referenceId ?? '—'}
          </Box>
          {currentStatus && (
            <StatusChip
              status={currentStatus}
              tone="neutral"
              variant="outlined"
              dot={false}
              title="Current lead status"
              sx={{ height: 20, fontSize: 10.5, ml: '2px' }}
            />
          )}
        </Box>
        <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75, ml: 1 }}>
          {showCallState && (
            <StatusChip status={badge.label} tone={badge.tone} pulse={badge.pulse} />
          )}
        </Box>
      </Box>

      {/* ── Metadata row — compact pills, wraps naturally, readable ── */}
      <Box
        component="span"
        sx={{
          mt: 1,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          gap: '8px',
          minWidth: 0,
          borderTop: 1,
          borderColor: 'divider',
          pt: 1,
        }}
      >
        <Field icon={<PhoneIcon sx={{ fontSize: 13 }} />} label="Phone" value={lead.mobile ?? lead.phone} />
        <Field icon={<EmailIcon sx={{ fontSize: 13 }} />} label="Email" value={lead.email} />
        <Field icon={<SchoolIcon sx={{ fontSize: 13 }} />} label="Education" value={lead.highestEducation} />
        <Field icon={<PublicIcon sx={{ fontSize: 13 }} />} label="Country" value={lead.countryPreferred?.name ?? lead.countryPreferred ?? lead.countryInterested} node={<CountryLabel value={lead.countryPreferred?.name ?? lead.countryPreferred ?? lead.countryInterested} fallback="—" />} />
        <Field icon={<SellIcon sx={{ fontSize: 13 }} />} label="Lead Source" value={lead.source?.name ?? lead.source ?? lead.leadSource} />
        <Field icon={<EventIcon sx={{ fontSize: 13 }} />} label="Intake" value={lead.intake} />
        <Field icon={<CalendarMonthIcon sx={{ fontSize: 13 }} />} label="Assigned" value={assignedDate} />
        <Field icon={<BadgeIcon sx={{ fontSize: 13 }} />} label="Owner" value={assignedAgent} />
        {callbackDate && <Field icon={<EventIcon sx={{ fontSize: 13 }} />} label="Callback" value={callbackDate} />}
      </Box>
    </Box>
  );
}
