import { useEffect, useState } from 'react';
import { Alert, Box, DialogActions, TextField, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { submitCallAssistFeedback } from '../../api/leads.js';
import AppDialog from '../../ui/mui/AppDialog.jsx';
import PrimaryButton from '../../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';

/* ==========================================================================
   CALL ASSIST FEEDBACK FORM — compact post-call rating shown after the agent
   ends a call. Four agree/disagree ratings + one optional comment; designed
   for ~1–2 minutes, no stars, no scales, no extra questions.

   The `request` carries the EXACT generation version (generatedContextVersion)
   that was shown during the call — captured when Call Assist opened, never
   re-queried here. Submission is purely additive to the call flow: a failure
   shows a retry state and never touches the completed call state. callId is
   the real TASA Call._id from the click-to-call session (null when no dialer
   session existed), so Feedback stays linked to the exact call that produced
   the context the agent rated.
   ========================================================================== */

const CATEGORIES = [
  { key: 'openingScript', label: 'Opening Script' },
  { key: 'studentContext', label: 'Student Context' },
  { key: 'conversationFocus', label: 'Conversation Focus' },
  { key: 'nextQuestion', label: 'Next Question' },
];

const OPTIONS = ['agree', 'disagree'];

const emptyRatings = () => ({
  openingScript: null,
  studentContext: null,
  conversationFocus: null,
  nextQuestion: null,
});

export default function CallAssistFeedbackForm({ open, request, onClose, onSubmitted }) {
  const [ratings, setRatings] = useState(emptyRatings);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  // Reset for every newly offered feedback (keyed by the request nonce); a
  // closed dialog leaves no stale ratings attached to the next call/student.
  useEffect(() => {
    if (!open) return;
    setRatings(emptyRatings());
    setComment('');
    setError(null);
    setSubmitted(false);
    setSubmitting(false);
  }, [open, request?.nonce]);

  const allRated = CATEGORIES.every((c) => ratings[c.key] != null);
  const canSubmit = open && allRated && !submitting && !submitted;

  const setRating = (key, value) =>
    setRatings((prev) => (prev[key] === value ? { ...prev, [key]: null } : { ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!canSubmit || !request) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCallAssistFeedback(request.leadId, {
        callId: request?.callId ?? null,
        generatedContextVersion: request.version,
        openingScript: ratings.openingScript,
        studentContext: ratings.studentContext,
        conversationFocus: ratings.conversationFocus,
        nextQuestion: ratings.nextQuestion,
        comment: comment.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      // Feedback must never interfere with the completed call — the agent
      // simply retries; the call stays ended either way.
      setError(err?.response?.data?.message || 'Could not submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <AppDialog
      open={open}
      title="Call Assist Feedback"
      subtitle={request ? `${request.studentName || 'Student'} · ${request.version}` : undefined}
      onClose={handleClose}
      disableEscapeKeyDown={submitting}
      size="sm"
      slotProps={{ paper: { sx: { maxWidth: 480 } } }}
      footer={
        submitted ? (
          <DialogActions sx={{ px: 2.5, pb: 2, pt: 0 }}>
            <PrimaryButton size="small" onClick={onSubmitted}>
              Done
            </PrimaryButton>
          </DialogActions>
        ) : (
          <DialogActions sx={{ px: 2.5, pb: 2, pt: 0 }}>
            <SecondaryButton size="small" onClick={handleClose} disabled={submitting}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              size="small"
              onClick={handleSubmit}
              disabled={!allRated || submitting}
              loading={submitting}
            >
              {allRated ? (submitting ? 'Submitting…' : 'Submit Feedback') : 'Rate each item to submit'}
            </PrimaryButton>
          </DialogActions>
        )
      }
    >
      {submitted ? (
        <Box sx={{ textAlign: 'center', py: 2.5 }}>
          <CheckCircleIcon sx={{ fontSize: 32, color: 'success.main' }} />
          <Typography sx={{ fontSize: 14, fontWeight: 700, mt: 1 }}>Feedback submitted</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>
            Thanks for helping improve Call Assist.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.5 }}>
            How useful was Call Assist during the call?
          </Typography>

          <Box>
            {CATEGORIES.map((c, i) => (
              <Box
                key={c.key}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.25,
                  py: 0.75,
                  borderBottom: i < CATEGORIES.length - 1 ? 1 : 0,
                  borderColor: 'divider',
                }}
              >
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{c.label}</Typography>
                <Box
                  sx={{
                    display: 'inline-flex',
                    borderRadius: '999px',
                    border: 1,
                    borderColor: 'divider',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {OPTIONS.map((opt) => {
                    const selected = ratings[c.key] === opt;
                    return (
                      <Box
                        key={opt}
                        component="button"
                        type="button"
                        onClick={() => setRating(c.key, opt)}
                        disabled={submitting}
                        aria-pressed={selected}
                        sx={{
                          px: 1.1,
                          py: 0.4,
                          fontSize: 11.5,
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          border: 'none',
                          cursor: 'pointer',
                          bgcolor: selected ? (opt === 'agree' ? 'success.main' : 'error.main') : 'transparent',
                          color: selected ? '#fff' : 'text.secondary',
                          transition: 'background-color 120ms ease, color 120ms ease',
                          '&:hover': {
                            bgcolor: selected ? undefined : 'action.hover',
                          },
                          '&:focus-visible': { outline: '2px solid rgba(15, 118, 110, 0.6)', outlineOffset: 1 },
                        }}
                      >
                        {opt}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Box>

          <Box sx={{ mt: 1.25 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5 }}>
              What should be improved? (optional)
            </Typography>
            <TextField
              multiline
              rows={2}
              placeholder="Optional comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              fullWidth
            />
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: 1.25 }}>
              {error} Your call record is untouched — you can try again.
            </Alert>
          )}
        </Box>
      )}
    </AppDialog>
  );
}