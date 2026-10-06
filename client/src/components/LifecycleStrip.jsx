import { Box, Typography } from '@mui/material';
import StatusChip from '../ui/mui/StatusChip.jsx';
import {
  stageLabel,
  stageTone,
  dueLabel,
  isOverdue,
  lifecycleOf,
  agoLabel,
} from '../utils/lifecycle.js';

/**
 * LifecycleStrip — the compact, always-current journey state for one student.
 *
 * Reads straight off the lead document already present in context (no extra
 * fetch): STAGE · SUB-STATUS · WAITING ON · NEXT ACTION · DUE · OWNER.
 * Neutral white/grey styling; green only for genuinely positive stages;
 * overdue due-dates get the warning tone. Shows nothing rather than
 * fabricating data.
 */

const Cell = ({ label, children }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.4, textTransform: 'uppercase', fontSize: 10 }}>
      {label}
    </Typography>
    <Box sx={{ minHeight: 24, display: 'flex', alignItems: 'center' }}>{children}</Box>
  </Box>
);

const Dash = () => (
  <Typography variant="body2" color="text.disabled">
    —
  </Typography>
);

export default function LifecycleStrip({ lead, dense = false, sx }) {
  const lc = lifecycleOf(lead);
  if (!lc || !lc.stage) return null;

  const overdue = isOverdue(lc.nextActionDue);
  const due = dueLabel(lc.nextActionDue);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1.5, md: 3 },
        flexWrap: 'wrap',
        px: dense ? 0 : 1.5,
        py: dense ? 0 : 1,
        borderRadius: 1,
        bgcolor: (t) => (dense ? 'transparent' : t.palette.mode === 'light' ? 'grey.50' : 'rgba(255,255,255,0.03)'),
        ...sx,
      }}
    >
      <Cell label="Stage">
        <StatusChip status={stageLabel(lc.stage)} tone={stageTone(lc.stage)} size="small" />
      </Cell>

      <Cell label="Status">
        {lc.subStatus ? (
          <Typography variant="body2" noWrap title={lc.subStatus}>
            {lc.subStatus}
          </Typography>
        ) : (
          <Dash />
        )}
      </Cell>

      <Cell label="Waiting on">
        {lc.waitingOn ? (
          <Typography variant="body2" noWrap>
            {lc.waitingOn}
          </Typography>
        ) : (
          <Dash />
        )}
      </Cell>

      <Cell label="Next action">
        {lc.nextAction ? (
          <Typography variant="body2" noWrap title={lc.nextAction} sx={{ maxWidth: 220 }}>
            {lc.nextAction}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.disabled">
            No next action
          </Typography>
        )}
      </Cell>

      <Cell label="Due">
        {due ? (
          <Typography variant="body2" color={overdue ? 'warning.dark' : 'text.primary'} fontWeight={overdue ? 600 : 400}>
            {due}
          </Typography>
        ) : (
          <Dash />
        )}
      </Cell>

      <Cell label="Owner">
        {lc.owner ? (
          <Typography variant="body2" noWrap>
            {lc.owner}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.disabled">
            Unassigned
          </Typography>
        )}
      </Cell>

      {lc.lastContactAt ? (
        <Cell label="Last contact">
          <Typography variant="body2" color="text.secondary">
            {agoLabel(lc.lastContactAt)}
          </Typography>
        </Cell>
      ) : null}
    </Box>
  );
}
