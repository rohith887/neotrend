import { useCallback } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { fetchCallAssistFeedbackSummary } from '../../api/supervisor.js';
import { AppCard } from '../../ui/mui/index.js';

/* ==========================================================================
   CALL ASSIST FEEDBACK SUMMARY — minimal Phase-1 card for the supervisor
   dashboard. Shows total submissions, comment count, and agree % per
   category. No per-agent ranking, no scoring, no AI analysis.
   ========================================================================== */

const CATEGORIES = [
  { key: 'openingScript', label: 'Opening Script' },
  { key: 'studentContext', label: 'Student Context' },
  { key: 'conversationFocus', label: 'Conversation Focus' },
  { key: 'nextQuestion', label: 'Next Question' },
];

export default function CallAssistFeedbackSummary() {
  const fetcher = useCallback(() => fetchCallAssistFeedbackSummary(), []);
  const { data, loading } = useCachedFetch('call-assist-feedback-summary', fetcher, { refetchInterval: 60_000 });

  if (loading && !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={16} />
      </Box>
    );
  }

  if (!data || !data.total) return null; // hide when no feedback collected yet

  return (
    <AppCard
      title="Call Assist Feedback"
      subtitle={`${data.total} submission${data.total === 1 ? '' : 's'} · ${data.comments} comment${data.comments === 1 ? '' : 's'}`}
      icon={<AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
      contentSx={{ p: 1.5 }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {CATEGORIES.map((c) => {
          const cat = data.categories?.[c.key] || { agree: 0, disagree: 0, agreePct: 0 };
          const barWidth = `${cat.agreePct}%`;
          return (
            <Box key={c.key}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>
                  {c.label}
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: cat.agreePct >= 50 ? 'success.main' : 'text.secondary' }}>
                  {cat.agreePct}%
                </Typography>
              </Box>
              <Box sx={{ height: 5, borderRadius: '999px', bgcolor: 'action.hover', overflow: 'hidden' }}>
                <Box sx={{ width: barWidth, height: '100%', bgcolor: 'success.main', transition: 'width 320ms ease' }} />
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <ForumOutlinedIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
          {data.comments > 0 ? `${data.comments} with improvement comments` : 'No improvement comments yet'}
        </Typography>
      </Box>
    </AppCard>
  );
}