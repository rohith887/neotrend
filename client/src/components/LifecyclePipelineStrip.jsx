import { Box, Tooltip, Typography } from '@mui/material';
import {
  LIFECYCLE_STAGES,
  STAGE_LABELS,
  stageTone,
} from '../utils/lifecycle.js';

/**
 * LifecyclePipelineStrip — supervisor pipeline visibility for Reports.
 *
 * One neutral segment per lifecycle stage sized by student count, plus
 * compact attention counters (overdue next actions, unassigned, stalled).
 * Data comes from GET /supervisor/lifecycle (report:read gated). Purely
 * presentational — all aggregation happens server-side.
 */

const toneColor = (tone, theme) => {
  switch (tone) {
    case 'success': return theme.palette.success.main;
    case 'info': return theme.palette.info.main;
    case 'warning': return theme.palette.warning.main;
    case 'default': return theme.palette.text.disabled;
    default: return theme.palette.mode === 'light' ? 'grey.400' : 'grey.600';
  }
};

function AttentionCell({ label, value }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
      <Typography sx={{ fontSize: 9.5, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function LifecyclePipelineStrip({ data }) {
  const counts = data?.counts ?? {};
  const attention = data?.attention ?? {};
  const waitingOn = data?.waitingOn ?? {};

  const total = LIFECYCLE_STAGES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return (
    <Box
      sx={{
        flexShrink: 0,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
        boxShadow: 'xs',
        px: 2,
        py: 1.25,
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ flex: '1 1 420px', minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Student Pipeline
          </Typography>
          <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
            {total} active student{total === 1 ? '' : 's'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'action.hover' }}>
          {LIFECYCLE_STAGES.map((stage) => {
            const n = counts[stage] ?? 0;
            if (!n || !total) return null;
            return (
              <Tooltip key={stage} title={`${STAGE_LABELS[stage]} · ${n}`}>
                <Box sx={{ width: `${(n / total) * 100}%`, bgcolor: (t) => toneColor(stageTone(stage), t) }} />
              </Tooltip>
            );
          })}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.25, mt: 0.75, flexWrap: 'wrap' }}>
          {LIFECYCLE_STAGES.map((stage) => (
            <Box key={stage} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: (t) => toneColor(stageTone(stage), t) }} />
              <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
                {STAGE_LABELS[stage]}
              </Typography>
              <Typography sx={{ fontSize: 10.5, fontWeight: 600 }}>
                {counts[stage] ?? 0}
              </Typography>
            </Box>
          ))}
          {LIFECYCLE_STAGES.every((s) => (counts[s] ?? 0) === 0) && (
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
              No students in the pipeline yet.
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <AttentionCell label="Overdue" value={attention.overdueNextActions ?? 0} />
        <AttentionCell label="Unassigned" value={attention.unassigned ?? 0} />
        <AttentionCell label="Stalled" value={attention.stalled ?? 0} />
        <AttentionCell label="Moved 24h" value={attention.progressedToday ?? 0} />
      </Box>

      {Object.keys(waitingOn).length > 0 && (
        <Box sx={{ flexShrink: 0, pl: 2, borderLeft: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
            Waiting on
          </Typography>
          {Object.entries(waitingOn)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([who, n]) => (
              <Typography key={who} sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.6 }}>
                {who} · <Box component="span" fontWeight={600}>{n}</Box>
              </Typography>
            ))}
        </Box>
      )}
    </Box>
  );
}
