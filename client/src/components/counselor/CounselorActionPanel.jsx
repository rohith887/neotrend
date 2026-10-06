import { useState } from 'react';
import { Alert, Box, LinearProgress, TextField, Typography } from '@mui/material';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { createInteraction } from '../../api/leads.js';
import { completeCounseling } from '../../api/counselor.js';
import { useDispositions } from '../../api/useDispositions.js';
import { useCounselor } from '../../context/CounselorContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import StatusChip from '../../ui/mui/StatusChip.jsx';
import PrimaryButton from '../../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';
import RemarkHistory from '../RemarkHistory.jsx';
import MentionInput from '../MentionInput.jsx';
import { lifecycleOf, stageLabel, stageTone } from '../../utils/lifecycle.js';



function SectionHeader({ icon, title, optional = false }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: 1.25, mb: 0.625 }}>
      <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
        {icon}
      </Box>
      <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
        {title}
        {optional && (
          <Box component="span" sx={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'text.disabled', fontSize: 10, ml: 0.25 }}>
            (Optional)
          </Box>
        )}
      </Typography>
      <Box sx={{ flex: 1, height: 1, bgcolor: 'divider', ml: 0.25 }} />
    </Box>
  );
}

export default function CounselorActionPanel({ lead, interactions = [], onCompleted }) {
  const { resetCallStatus, bumpInteraction, activeCall } = useCounselor();
  const { push } = useToast();
  const { dispositions, loading: dispLoading, error: dispError } = useDispositions();

  const [dispositionId, setDispositionId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [mentionIds, setMentionIds] = useState([]);
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completingCounseling, setCompletingCounseling] = useState(false);
  const [saved, setSaved] = useState(false);

  const counselingCompleted = lead?.counselingStatus === 'completed';
  const selectedDisp = dispositions.find((d) => d.id === dispositionId);
  const needsCallback = !!selectedDisp?.requiresCallback;

  const leadId = lead?._id ?? lead?.id;
  const lc = lifecycleOf(lead);
  const disposition = lead?.currentDisposition;
  const dispName = typeof disposition === 'string' ? disposition : disposition?.name || disposition?.label || null;

  const handleSubmit = async () => {
    if (!dispositionId || !leadId) return;
    setSubmitting(true);
    try {
      await createInteraction({
        leadId,
        dispositionId,
        remarks: remarks.trim() || undefined,
        mentions: mentionIds.length ? mentionIds : undefined,
        callbackDate: callbackDate || undefined,
        callbackTime: callbackTime || undefined,
        callId: activeCall?.id || undefined,
      });
      push('Remark logged successfully', 'success');
      resetCallStatus();
      bumpInteraction?.();
      setRemarks(''); setMentionIds([]); setCallbackDate(''); setCallbackTime(''); setDispositionId('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to log remark', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteCounseling = async () => {
    if (counselingCompleted) return;
    if (!window.confirm('Mark counseling as completed? This will make the student eligible for Registration.')) return;
    setCompletingCounseling(true);
    try {
      await completeCounseling(leadId);
      push('Counseling completed. Student is now eligible for Registration.', 'success');
      bumpInteraction?.();
      onCompleted?.();
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to complete counseling', 'danger');
    } finally {
      setCompletingCounseling(false);
    }
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Pinned panel header (matches right workspace nav bar) ── */}
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.5, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider', minWidth: 0, overflow: 'hidden' }}>
        <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main', flexShrink: 0 }} aria-hidden="true">
          <FactCheckIcon sx={{ fontSize: 14 }} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
          {lc?.stage && <StatusChip status={stageLabel(lc.stage)} tone={stageTone(lc.stage)} size="small" sx={{ height: 20, fontSize: 10.5, '& .MuiChip-label': { fontWeight: 600 } }} />}
          {dispName && <StatusChip status={dispName} tone="default" size="small" variant="outlined" sx={{ height: 20, fontSize: 10.5, '& .MuiChip-label': { fontWeight: 600 } }} />}
          <StatusChip status={counselingCompleted ? 'Completed' : 'In Progress'} tone={counselingCompleted ? 'success' : 'warning'} size="small" sx={{ height: 20, fontSize: 10.5, '& .MuiChip-label': { fontWeight: 600 } }} />
        </Box>
      </Box>

      {/* ── Content — non-scrolling flex column; Remark History (fill) owns
             the leftover space, exactly like the Agent DispositionPanel. ── */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', px: 1.25, pb: 1 }}>

        {dispError && (
          <Alert severity="warning" sx={{ py: 0.25, px: 1.25, mt: 1, fontSize: 12.5, '& .MuiAlert-icon': { fontSize: 16, py: 0.25 } }}>
            {dispError}
          </Alert>
        )}

        {/* ── Disposition / Workflow ───────────────────────────── */}
        <SectionHeader />
        <TextField
          select
          label="Disposition"
          value={dispositionId}
          onChange={(e) => setDispositionId(e.target.value)}
          disabled={dispLoading || submitting}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          fullWidth
          size="small"
        >
          <option value="">Select Disposition</option>
          {dispositions.map((d) => <option key={d.id} value={d.id}>{d.label || d.name}</option>)}
        </TextField>

        {needsCallback && (
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
            <TextField label="Callback Date" type="date" size="small" sx={{ flex: 1 }} InputLabelProps={{ shrink: true }} value={callbackDate} onChange={(e) => setCallbackDate(e.target.value)} disabled={submitting} />
            <TextField label="Time" type="time" size="small" sx={{ flex: 1 }} InputLabelProps={{ shrink: true }} value={callbackTime} onChange={(e) => setCallbackTime(e.target.value)} disabled={submitting} />
          </Box>
        )}

        {submitting && <LinearProgress sx={{ mt: 1 }} />}

        {/* ── Remarks / Call Notes ─────────────────────────────── */}
        <SectionHeader icon={<ChatBubbleIcon sx={{ fontSize: 13 }} />} title="Remarks / Call Notes" optional />
        <MentionInput
          label="Remarks"
          placeholder="Enter counseling notes, observations, or follow-up notes… (type @ to mention a teammate)"
          value={remarks}
          onChange={(next, ids) => { setRemarks(next); setMentionIds(ids); }}
          disabled={submitting}
          minRows={2}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
          <PrimaryButton size="small" startIcon={<CheckCircleIcon sx={{ fontSize: 13 }} />} onClick={handleSubmit} disabled={submitting || !dispositionId} loading={submitting}>
            {submitting ? 'Saving…' : 'Log Remark'}
          </PrimaryButton>
          {!counselingCompleted ? (
            <SecondaryButton size="small" startIcon={<CheckCircleIcon sx={{ fontSize: 13 }} />} color="success" onClick={handleCompleteCounseling} disabled={completingCounseling}>
              {completingCounseling ? 'Completing…' : 'Counseling Complete'}
            </SecondaryButton>
          ) : (
            <Typography sx={{ fontSize: 11.5, color: 'success.main', fontWeight: 500 }}>
              Student eligible for Registration.
            </Typography>
          )}
          {saved && <Typography sx={{ fontSize: 11, color: 'success.main' }}>Saved</Typography>}
        </Box>

        {/* ── Remark History — same `fill` behavior as the Agent
               DispositionPanel: natural flow, no fixed height, no clipping,
               no blank area — fills leftover space identically. ── */}
        <RemarkHistory interactions={interactions} fill />
      </Box>
    </Box>
  );
}
