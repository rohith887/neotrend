import { useEffect, useState } from 'react';
import { Box, CircularProgress, Drawer, Typography } from '@mui/material';
import CallMadeIcon from '@mui/icons-material/CallMade';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { fetchReportDrilldown } from '../../api/dashboard.js';
import { AppIconButton } from '../../ui/mui/index.js';
import StatusChip from '../../ui/mui/StatusChip.jsx';
import CloseIcon from '@mui/icons-material/Close';

/* ==========================================================================
   PERFORMANCE DRILLDOWN DRAWER — the actual interactions behind one
   Performance Summary cell (period × metric). Same right-side slide-out
   pattern as AssignedLeadsDrawer, but lists interactions (not leads) since
   the Performance Summary table is call/interaction data, not lead status.

   Clicking a row opens that student in the workspace via onOpenLead — the
   same fetchCall → onGoToWorkspace flow the rest of the Agent Dashboard uses.
   ========================================================================== */

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const fmtDuration = (sec) => {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const DISPOSITION_TONE = {
  RNR: 'warning',
  'No Answer': 'warning',
  Busy: 'warning',
  'Not Interested': 'danger',
};
const dispositionTone = (name) => DISPOSITION_TONE[name] || 'neutral';

export default function PerformanceDrilldownDrawer({ open, onClose, periodLabel, metricLabel, period, metric, onOpenLead }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !period || !metric) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReportDrilldown(period, metric)
      .then((data) => { if (!cancelled) setRows(data || []); })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.message || 'Could not load this breakdown'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, period, metric]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 420, maxWidth: { xs: '100vw', sm: '92vw' }, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column' } } }}
    >
      <Box sx={{ flexShrink: 0, height: 3, bgcolor: 'primary.main' }} />

      <Box component="header" sx={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1.25,
        px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover',
      }}>
        <CallMadeIcon aria-hidden="true" sx={{ fontSize: 17, color: 'primary.main' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {metricLabel}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'primary.main', lineHeight: 1.2, mt: 0.25 }} noWrap>
            {periodLabel}
          </Typography>
        </Box>
        <Box component="span" sx={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22,
          px: 0.875, borderRadius: 99, fontSize: 12, fontWeight: 700, color: '#fff', bgcolor: 'primary.main',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {rows.length}
        </Box>
        <AppIconButton title="Close" ariaLabel="Close breakdown" onClick={onClose} size="small">
          <CloseIcon sx={{ fontSize: 18 }} />
        </AppIconButton>
      </Box>

      <Box component="main" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : error ? (
          <Typography sx={{ fontSize: 13, color: 'error.main', textAlign: 'center', py: 3, px: 2 }}>{error}</Typography>
        ) : rows.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'text.disabled', textAlign: 'center', py: 4, px: 2 }}>
            No calls in this period yet.
          </Typography>
        ) : (
          rows.map((r) => {
            const duration = fmtDuration(r.durationSec);
            return (
              <Box
                key={r.interactionId}
                onClick={() => onOpenLead?.(r.leadId)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
                  borderBottom: 1, borderColor: 'divider', cursor: 'pointer',
                  transition: 'background-color 100ms ease',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', lineHeight: 1.25 }}>
                    {r.studentName || 'Unnamed lead'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {fmtWhen(r.calledAt)}
                    </Typography>
                    {duration && (
                      <Typography sx={{ fontSize: 11.5, color: 'text.disabled', whiteSpace: 'nowrap' }}>
                        · {duration}
                      </Typography>
                    )}
                  </Box>
                </Box>
                {r.dispositionName && (
                  <StatusChip status={r.dispositionName} tone={dispositionTone(r.dispositionName)} size="small" dot={false} sx={{ height: 20, fontSize: 10.5, flexShrink: 0 }} />
                )}
                <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
              </Box>
            );
          })
        )}
        {rows.length >= 200 && (
          <Typography sx={{ fontSize: 11, color: 'text.disabled', textAlign: 'center', py: 1.5 }}>
            Showing the most recent 200
          </Typography>
        )}
      </Box>
    </Drawer>
  );
}
