import { Box, Divider, Tooltip, Typography } from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import PersonIcon from '@mui/icons-material/Person';
import ScheduleIcon from '@mui/icons-material/Schedule';
import FlagIcon from '@mui/icons-material/Flag';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import GlossyActionButton from '../ui/mui/GlossyActionButton.jsx';
import StatusChip from '../ui/mui/StatusChip.jsx';
import TagsBar from './TagsBar.jsx';
import WhatsAppActionButton from './WhatsAppActionButton.jsx';
import ReviveLeadButton from './ReviveLeadButton.jsx';

/* ==========================================================================
   LEAD STATUS STRIP — one compact horizontal activity bar for the call workspace.

     Assigned Date | Assigned Agent | Callback Date | Disposition(pill)
     · · · Break In | Break Out | WhatsApp

   Compact height, small muted uppercase labels with values, subtle vertical
   dividers between a small number of leading context items. Reads straight
   from lead / interactions, and hosts the agent activity actions (break,
   WhatsApp). Call controls (Fetch / Start / End) and the Live status live in
   the top nav bar instead. When no lead is loaded it renders just the
   right-side actions (Break In / Break Out) so they stay reachable.

   Dropped state (Drop Lead disposition) is surfaced by the disposition pill;
   a compact Revive action restores the lead to the active workflow (the same
   ReviveLeadButton used in the assigned drawer / counselor list).
   ========================================================================== */

const AD = (u) => {
  if (!u || typeof u === 'string') return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name || '';
};
const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};
const display = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v;
  return v.name || v.code || v.label || '—';
};

/* ── One compact item: label (uppercase) + value ────────────────────── */
const Item = ({ icon, label, value }) => {
  const v = value || '—';
  return (
    <Tooltip title={v !== '—' ? `${label}: ${v}` : ''} arrow placement="top">
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px', minWidth: 0, px: 1.5 }}>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <Box component="span" sx={{ display: 'inline-flex', color: 'text.disabled' }} aria-hidden="true">
            {icon}
          </Box>
          {label}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'text.primary',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 220,
          }}
        >
          {v}
        </Box>
      </Box>
    </Tooltip>
  );
};

export default function LeadStatusStrip({
  lead,
  interactions = [],
  onTagsChange,
  onBreak,
  breaking = false,
  onBreakIn,
  onBreakOut,
  onWhatsApp,
  onDropStatusChange,
}) {
  const hasActions = Boolean(onBreakIn || onBreakOut || onWhatsApp);
  if (!lead && !hasActions) return null;

  const assignedDate = lead ? fmtDate(lead.assignedAt) || fmtDate(lead.createdAt) : null;
  const assignedAgent = lead ? AD(lead.assignedTo) : '';

  // Latest REAL scheduled callback date. RNR interactions also carry a
  // callbackDateTime (their own "next call attempt" marker), so an RNR row
  // must be excluded here — otherwise a lead with zero real Callback
  // dispositions would show a "Callback Date" pulled from its RNR history.
  const latestCallback = (interactions ?? [])
    .filter((it) => it.callbackDateTime && String(it.dispositionName || '').trim().toUpperCase() !== 'RNR')
    .sort((a, b) => new Date(b.callbackDateTime) - new Date(a.callbackDateTime))[0];
  const callbackDate = fmtDate(latestCallback?.callbackDateTime);

  // Disposition — the workflow state of the record. 'Drop Lead' renders as
  // the disposition pill (the drop itself is a disposition save).
  const disposition = lead
    ? (typeof lead.currentDisposition === 'object' && lead.currentDisposition !== null
        ? lead.currentDisposition.name || lead.currentDisposition.label
        : lead.currentDisposition)
      || lead.status
      || null
    : null;

  const isDropped =
    String(lead?.dropStatus || 'active') === 'dropped';

  return (
    <Box
      component="header"
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        minHeight: 44,
        px: 1.5,
        py: 0.75,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        boxShadow: 'xs',
        overflowX: 'auto',
        overflowY: 'hidden',
        '&::-webkit-scrollbar': { height: 4 },
      }}
    >
      {lead && (
        <>
          {/* First item — no leading divider. */}
          <Item icon={<EventIcon sx={{ fontSize: 12 }} />} label="Assigned Date" value={display(assignedDate)} />
          <Divider orientation="vertical" flexItem sx={{ mx: 0 }} />
          <Item icon={<PersonIcon sx={{ fontSize: 12 }} />} label="Assigned Agent" value={assignedAgent || 'Unassigned'} />
          <Divider orientation="vertical" flexItem sx={{ mx: 0 }} />
          <Item icon={<ScheduleIcon sx={{ fontSize: 12 }} />} label="Callback Date" value={display(callbackDate)} />
          <Divider orientation="vertical" flexItem sx={{ mx: 0 }} />

          {/* ── Student tags — inline, compact, single-line ─────────── */}
          <TagsBar variant="header" lead={lead} readOnly={!onTagsChange} onChange={onTagsChange} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Box component="span" sx={{ display: 'inline-flex', color: 'text.disabled' }} aria-hidden="true">
              <FlagIcon sx={{ fontSize: 12 }} />
            </Box>
            Disposition
          </Box>
          {disposition ? (
            <StatusChip
              status={display(disposition)}
              tone={isDropped ? 'danger' : 'neutral'}
              variant="outlined"
              dot={false}
              title={isDropped ? 'Dropped from the active queue (can be revived)' : 'Current lead status'}
              sx={{ height: 20, fontSize: 10.5, '& .MuiChip-label': { px: 1 } }}
            />
          ) : (
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.disabled', whiteSpace: 'nowrap' }}>—</Typography>
          )}
        </>
      )}

      {/* ── Activity actions (right side) — Revive / Break In / Break Out / WhatsApp ── */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {hasActions && (
          <Box sx={{ ml: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {lead && onDropStatusChange && isDropped && (
              <ReviveLeadButton
                lead={lead}
                size="small"
                onRevived={(updated) => onDropStatusChange?.(updated || lead)}
                title="Bring this lead back into the active queue"
              />
            )}
            {onBreakIn && (
              <GlossyActionButton
                icon={<PauseCircleIcon sx={{ fontSize: 15 }} />}
                label="Break In"
                color="#D97706"
                onClick={onBreakIn}
                disabled={onBreak || breaking}
                title="Go on break"
              />
            )}
            {onBreakOut && (
              <GlossyActionButton
                icon={<PlayCircleIcon sx={{ fontSize: 15 }} />}
                label={breaking && onBreak ? 'Ending…' : 'Break Out'}
                color="#0f766e"
                onClick={onBreakOut}
                disabled={!onBreak || breaking}
                loading={breaking && onBreak}
                title="End break and resume work"
              />
            )}
            {lead && onWhatsApp && <WhatsAppActionButton onClick={onWhatsApp} />}
          </Box>
        )}
      </Box>
    </Box>
  );
}