import { Box, Divider, Tooltip, Typography } from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import EventIcon from '@mui/icons-material/Event';
import FlagIcon from '@mui/icons-material/Flag';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import PublicIcon from '@mui/icons-material/Public';
import SchoolIcon from '@mui/icons-material/School';
import SellIcon from '@mui/icons-material/Sell';
import { CALL_ACTIVE, CALL_STATUS } from '../context/AgentContext.jsx';
import StatusChip from '../ui/mui/StatusChip.jsx';
import { CountryLabel } from '../utils/flag.jsx';

/* ==========================================================================
   STUDENT SNAPSHOT — LEFT column identity card. Answers "Who is this student?"
   Compact: initials avatar + prominent name + lead id, then a tight list of
   key identity facts (Country, Intake, Lead Source, Education, Mobile, Email).
   Phone & Email are actionable (tel: / mailto:). Presentation only — reads
   straight from the lead already in context; no new data fetching.
   ========================================================================== */

const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const display = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v.trim() || '—';
  return v.name || v.code || v.label || '—';
};

function Row({ icon, label, children, action }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.625 }}>
      <Box component="span" sx={{ display: 'inline-flex', color: 'text.disabled', mt: '2px', flexShrink: 0 }} aria-hidden="true">
        {icon}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
        <Box component="span" sx={{ fontSize: 9.5, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </Box>
        <Box component="span" sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', wordBreak: 'break-word', mt: '1px' }}>
          {action ?? children}
        </Box>
      </Box>
    </Box>
  );
}

export default function StudentSnapshot({ lead, callStatus }) {
  if (!lead) return null;

  const callActive = CALL_ACTIVE.has(callStatus);
  const callDone = callStatus === CALL_STATUS.ENDED;
  const badge = callActive
    ? { label: 'On Call', tone: 'danger', pulse: true }
    : callDone
      ? { label: 'Completed', tone: 'warning', pulse: false }
      : null;

  return (
    <Box
      component="section"
      aria-label="Student snapshot"
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
    >
      {/* ── Identity card ─────────────────────────────────────── */}
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
        <Box
          component="span"
          sx={{
            width: 44, height: 44, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'primary.main', bgcolor: 'primary.soft', border: 1, borderColor: 'primary.border',
            fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em',
          }}
        >
          {initialsOf(lead.studentName)}
        </Box>
        <Typography sx={{ mt: 1, fontSize: 16, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'text.primary' }}>
          {display(lead.studentName)}
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: 12, fontWeight: 600, color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>
          #{lead.referenceId ?? '—'}
        </Typography>
        {badge && (
          <Box sx={{ mt: 1 }}>
            <StatusChip status={badge.label} tone={badge.tone} pulse={badge.pulse} size="small" />
          </Box>
        )}
      </Box>

      <Divider />

      {/* ── Key facts ─────────────────────────────────────────── */}
      <Box sx={{ px: 1.5, py: 0.625 }}>
        <Row icon={<PublicIcon sx={{ fontSize: 13 }} />} label="Country">
          <CountryLabel value={lead.countryPreferred?.name ?? lead.countryPreferred ?? lead.countryInterested} fallback="—" />
        </Row>
        <Row icon={<EventIcon sx={{ fontSize: 13 }} />} label="Intake">
          {display(lead.intake)}
        </Row>
        <Row icon={<SellIcon sx={{ fontSize: 13 }} />} label="Lead Source">
          {display(lead.source?.name ?? lead.source ?? lead.leadSource)}
        </Row>
        <Row icon={<SchoolIcon sx={{ fontSize: 13 }} />} label="Education">
          {display(lead.highestEducation)}
        </Row>
        <Row icon={<FlagIcon sx={{ fontSize: 13 }} />} label="Gender">
          {display(lead.gender)}
        </Row>

        <Divider sx={{ my: 0.625 }} />

        <Row icon={<PhoneIcon sx={{ fontSize: 13 }} />} label="Mobile">
          {lead.mobile || lead.phone ? (
            <Tooltip title={display(lead.mobile ?? lead.phone)} arrow placement="top">
              <Box component="a" href={`tel:${(lead.mobile ?? lead.phone).replace(/[^\d+]/g, '')}`} sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                {display(lead.mobile ?? lead.phone)}
              </Box>
            </Tooltip>
          ) : (
            '—'
          )}
        </Row>
        <Row icon={<EmailIcon sx={{ fontSize: 13 }} />} label="Email">
          {lead.email ? (
            <Tooltip title={lead.email} arrow placement="top">
              <Box component="a" href={`mailto:${lead.email}`} sx={{ color: 'primary.main', textDecoration: 'none', wordBreak: 'break-word', '&:hover': { textDecoration: 'underline' } }}>
                {lead.email}
              </Box>
            </Tooltip>
          ) : (
            '—'
          )}
        </Row>
      </Box>
      <Box aria-hidden="true" sx={{ flexGrow: 1 }} />
    </Box>
  );
}
