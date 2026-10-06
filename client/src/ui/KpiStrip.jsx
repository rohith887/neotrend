import { Box, Typography } from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';
import StatusChip from './mui/StatusChip.jsx';

/**
 * KpiStrip — single bordered enterprise KPI strip (no per-metric cards).
 * items: [{ icon, label, value, tone?, trend? }]
 *   icon  — MUI icon component (e.g. PeopleAltIcon); falls back to InsightsIcon.
 *   tone  — one of 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
 *           renders a tinted icon chip (omit for the classic muted icon).
 *   trend — optional small caption under the label.
 * live:  { badge, note } — optional right-aligned live indicator (note is muted text beside the badge)
 */

const TONE_COLOR = {
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
  violet: 'secondary',
};

export default function KpiStrip({ items, live, ariaLabel = 'Key metrics', compact = false, sx }) {
  return (
    <Box
      role="region"
      aria-label={ariaLabel}
      sx={{
        display: 'flex',
        flexWrap: compact ? 'nowrap' : 'wrap',
        overflowX: compact ? 'auto' : undefined,
        alignItems: compact ? 'center' : 'stretch',
        background: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        padding: compact ? '8px 14px' : '14px 20px',
        columnGap: compact ? 0.5 : 4,
        rowGap: compact ? 0 : '6px',
        minHeight: compact ? 56 : undefined,
        scrollbarWidth: compact ? 'thin' : undefined,
        ...sx,
      }}
    >
      {items.map((m) => {
        const Icon = m.icon || InsightsIcon;
        const toneColor = m.tone ? TONE_COLOR[m.tone] || 'primary' : null;
        const clickable = typeof m.onClick === 'function';
        return (
          <Box
            key={m.label}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => m.onClick() : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); m.onClick(); } } : undefined}
            title={m.title}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: compact ? 1 : 1.5,
              flex: '1 1 0%',
              minWidth: compact ? 0 : { xs: 150, sm: 190, md: 0 },
              padding: compact ? '3px 12px' : '6px 4px',
              cursor: clickable ? 'pointer' : 'pointer',
              borderRadius: 0.75,
              transition: 'background-color 150ms ease',
              '&:hover': { background: 'action.hover' },
              '& + &': {
                borderInlineStart: { md: '1px solid' },
                borderInlineStartColor: { md: 'divider' },
              },
            }}
          >
            {m.tone && !compact ? (
              <Box
                component="span"
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 1.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: `${toneColor}.main`,
                  background: `${toneColor}.soft`,
                }}
              >
                <Icon sx={{ fontSize: 17 }} aria-hidden="true" />
              </Box>
            ) : (
              <Icon sx={{ fontSize: compact ? 13 : 16, color: 'text.disabled', flexShrink: 0 }} aria-hidden="true" />
            )}
            <Box sx={{ minWidth: 0, display: compact ? 'inline-flex' : 'block', alignItems: compact ? 'baseline' : undefined, gap: compact ? 0.75 : undefined }}>
              <Typography component="div" sx={{ fontSize: compact ? 15 : 28, fontWeight: compact ? 700 : 600, lineHeight: 1, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                {m.value}
              </Typography>
              <Typography component="div" sx={{ fontSize: compact ? 11.5 : 13, color: 'text.disabled', marginTop: compact ? 0 : '5px', lineHeight: 1.25, whiteSpace: compact ? 'nowrap' : undefined, fontWeight: compact ? 500 : undefined }}>
                {m.label}
              </Typography>
              {m.trend && (
                <Typography component="div" sx={{ fontSize: 12, fontWeight: 500, color: 'text.disabled', marginTop: '3px', lineHeight: 1.25 }}>
                  {m.trend}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
      {live && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: compact ? 1 : 1.25, marginInlineStart: 'auto', flexShrink: 0, alignSelf: 'center' }}>
          <StatusChip status={live.badge} tone="success" />
          {live.note && (
            <Typography component="span" sx={{ fontSize: compact ? 12 : 13, color: 'text.disabled', whiteSpace: 'nowrap' }}>
              {live.note}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
