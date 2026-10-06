import { keyframes } from '@emotion/react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Alert, Box, Divider, LinearProgress, TextField, Typography } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CallMadeIcon from '@mui/icons-material/CallMade';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import InfoIcon from '@mui/icons-material/Info';
import { CALL_ACTIVE, CALL_STATUS, useAgent } from '../context/AgentContext.jsx';
import { useDispositions } from '../api/useDispositions.js';
import client from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { profileCompleteOf, REQUIRED_PROFILE_FIELDS } from '../utils/leadProfile.js';
import MentionInput from './MentionInput.jsx';

// ─────────────────────────────────────────────────────────────────
// Adaptive disposition form — 4 core dispositions.
// Each disposition renders ONLY the fields it needs:
//   Interested      → Priority (P1/P2/P3) + optional Remarks
//   Callback        → Date only + optional Remarks (a default time is
//                     sent internally so the backend payload is unchanged)
//   RNR             → Date only + optional Remarks (a default time is
//                     sent internally so the backend payload is unchanged)
//   Not Interested  → Reason (+ Other Reason) + mandatory Remarks
//   Drop Lead       → mandatory Remarks (the drop reason)
//   Switched Off / Not Reachable → normal disposition, optional Remarks
//
// The API/backend contract is unchanged: priority rides in the
// interestLevel payload key, callback date/time in callbackDate/
// callbackTime, and the Not Interested reason is folded into the
// remarks payload (the backend has no dedicated reason field).
// ─────────────────────────────────────────────────────────────────
const CORE = new Set(['Interested', 'Callback', 'RNR', 'Not Interested', 'Drop Lead', 'Switched Off / Not Reachable']);

// Default time used for RNR submissions (no Time field in the UI).
const RNR_DEFAULT_TIME = '09:00';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(-3px)' },
  to: { opacity: 1, transform: 'none' },
});

// Field config per disposition NAME (as stored in the DB / API):
//   priority  — show Priority (P1/P2/P3) dropdown
//   schedule  — show the Date block
//   time      — additionally show the Time field (Date-only when false)
//   reason    — show rejection Reason dropdown (+ Other Reason)
//   remarksReq— Remarks is required
//
// NOTE: whether the mandatory student profile must be complete is a
// per-disposition business rule owned by the backend disposition record
// (requiresProfile, exposed via the dispositions API) — NOT duplicated here.
// It is enforced in formReady + handleSubmit below and on the server.
const DISP_CONFIG = {
  'Interested':     { priority: true,  schedule: false, time: true,  reason: false, remarksReq: false },
  'Callback':       { priority: false, schedule: true,  time: false, reason: false, remarksReq: false },
  'RNR':            { priority: false, schedule: true,  time: false, reason: false, remarksReq: false },
  'Not Interested': { priority: false, schedule: false, time: true,  reason: true,  remarksReq: true },
  'Drop Lead':      { priority: false, schedule: false, time: false, reason: false, remarksReq: true },
  'Switched Off / Not Reachable': { priority: false, schedule: false, time: false, reason: false, remarksReq: false },
};

const DEFAULT_CFG = { priority: false, schedule: false, time: true, reason: false, remarksReq: false };

// Section title/icon for the schedule (Date + Time) block.
const SCHEDULE_TITLE = {
  'Callback': { icon: <CalendarMonthIcon sx={{ fontSize: 13 }} />, title: 'Schedule Callback' },
  'RNR':      { icon: <CallMadeIcon sx={{ fontSize: 13 }} />, title: 'Next Call Attempt' },
};

// Rejection reasons (Not Interested).
const REASONS = [
  'Cost',
  'Already Joined',
  'No Plans to Study',
  'Parent Rejected',
  'Not Eligible',
  'Language Barrier',
  'Duplicate Lead',
  'Wrong Number',
  'Other',
];

// ── Blank form state ──────────────────────────────────────────────
const blank = () => ({
  dispositionId:   '',
  dispositionName: '',
  interestLevel:   '',
  callbackDate:    '',
  callbackTime:    '',
  reason:          '',
  otherReason:     '',
  remarks:         '',
  mentions:        [],
});

// User-facing label for each disposition field — used to explain exactly
// what is missing when submission is blocked.
const DISP_FIELD_LABELS = {
  dispositionId:   'Disposition',
  interestLevel:   'Priority',
  callbackDate:    'Date',
  callbackTime:    'Time',
  reason:          'Reason',
  otherReason:     'Other Reason',
  remarks:         'Remarks / Drop Reason',
};

// ── Small helpers ─────────────────────────────────────────────────
// Section divider with label
const FormSection = ({ icon, title, optional = false }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 2, mb: 1 }}>
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: 11,
        fontWeight: 700,
        color: 'text.secondary',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
      }}
    >
      {icon && (
        <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
          {icon}
        </Box>
      )}
      {title}
      {optional && (
        <Box component="span" sx={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'text.disabled', fontSize: 11, ml: 0.5 }}>
          (Optional)
        </Box>
      )}
    </Box>
    <Divider />
  </Box>
);

// ── Build clean submission payload ────────────────────────────────
// API contract unchanged — only maps the visible fields into the
// payload keys the backend already accepts.
const buildPayload = (form, cfg) => {
  const payload = {
    dispositionId:   form.dispositionId,
    dispositionName: form.dispositionName,
  };

  if (cfg.priority && form.interestLevel)
    payload.interestLevel = form.interestLevel;

  if (cfg.schedule) {
    const time = cfg.time ? form.callbackTime : RNR_DEFAULT_TIME;
    payload.callbackDate = form.callbackDate;
    payload.callbackTime = time;
    if (form.callbackDate && time)
      payload.callbackDateTime = `${form.callbackDate}T${time}:00`;
  }

  if (cfg.reason) {
    let reasonText = form.reason;
    if (reasonText === 'Other' && form.otherReason.trim())
      reasonText = `Other — ${form.otherReason.trim()}`;
    const notes = form.remarks.trim();
    payload.remarks = [reasonText ? `Reason: ${reasonText}` : '', notes].filter(Boolean).join('\n');
  } else if (form.remarks.trim()) {
    payload.remarks = form.remarks.trim();
  }

  // @mentions resolved by the autocomplete into real user ids (kept distinct
  // from the remarks text — the text is the display, the ids form the link).
  if (Array.isArray(form.mentions) && form.mentions.length)
    payload.mentions = form.mentions;

  return payload;
};

// ── Validation ────────────────────────────────────────────────────
const validate = (form, cfg) => {
  const e = {};

  if (!form.dispositionId) { e.dispositionId = 'Required'; }

  if (!cfg) return e;

  if (cfg.priority && !form.interestLevel)
    e.interestLevel = 'Required';

  if (cfg.schedule) {
    if (!form.callbackDate) e.callbackDate = 'Required';
    if (cfg.time && !form.callbackTime) e.callbackTime = 'Required';

    if (form.callbackDate) {
      // Date-only dispositions (RNR) validate against end-of-day so
      // "today" always remains a valid next-call date.
      const time = cfg.time ? form.callbackTime : '23:59';
      const dt = new Date(`${form.callbackDate}T${time}:00`);
      if (dt < new Date()) e.callbackDate = 'Callback date/time cannot be in the past';
    }
  }

  if (cfg.reason) {
    if (!form.reason) e.reason = 'Required';
    if (form.reason === 'Other' && !form.otherReason.trim())
      e.otherReason = 'Required';
  }

  if (cfg.remarksReq && !form.remarks.trim())
    e.remarks = 'Required';

  return e;
};

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────
const DispositionForm = forwardRef(function DispositionForm({
  profileForm,
  profileDirty,
  onSaveProfile,
  onDispositionChange,
  onFormStateChange,
  children,
}, ref) {
  const { submitCall, lead, callStatus, interactionVersion } = useAgent();
  const { push } = useToast();

  const { dispositions, interestLevels, loading: loadingOpts, error: optsError } = useDispositions();

  const [form,       setForm]       = useState(blank());
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);

  // ── RNR limits state ────────────────────────────────────────────
  const [rnrLimits, setRnrLimits]       = useState(null);
  const [rnrLimitsLoading, setRnrLimitsLoading] = useState(false);

  const noLead      = !lead;
  const coreDispositions = dispositions.filter((d) => CORE.has(d.name));
  const selectedDisp = coreDispositions.find((d) => d.id === form.dispositionId) ?? null;
  const cfg          = selectedDisp ? (DISP_CONFIG[selectedDisp.name] ?? DEFAULT_CFG) : null;
  const schedule     = cfg?.schedule && selectedDisp
    ? (SCHEDULE_TITLE[selectedDisp.name] ?? { icon: <CalendarMonthIcon sx={{ fontSize: 13 }} />, title: 'Schedule' })
    : null;

  // Fetch RNR limits from backend when the RNR disposition is selected. Not
  // Reachable has its own independent daily allowance, tracked server-side.
  // Re-fetches after every successful interaction (interactionVersion bump)
  // so the counter stays current.
  useEffect(() => {
    if (selectedDisp?.name !== 'RNR' || !lead?._id) {
      setRnrLimits(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRnrLimitsLoading(true);
      try {
        const { data } = await client.get(`/interactions/rnr-limits?leadId=${lead._id}`);
        if (!cancelled) setRnrLimits(data.data);
      } catch {
        if (!cancelled) setRnrLimits(null);
      } finally {
        if (!cancelled) setRnrLimitsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDisp?.name, lead?._id, interactionVersion]);

  // Mandatory student-profile fields (shared with the profile panel). Whether
  // they gate submission is a per-disposition business rule read from the
  // backend disposition record (requiresProfile) — only 'Interested' sets it.
  const profileRequired = !!selectedDisp?.requiresProfile;
  const profileComplete = profileCompleteOf(profileForm);
  const missingProfileFields = (profileForm ? REQUIRED_PROFILE_FIELDS : [])
    .filter(({ key }) => {
      const v = profileForm[key];
      return typeof v === 'string' ? !v.trim() : !v;
    })
    .map((f) => f.label);

  // Success-green submit only once the form passes live validation AND — when
  // the disposition requires it — the mandatory student profile is complete.
  // RNR is also blocked once the 3-per-day limit is hit.
  const dispValid = Object.keys(validate(form, cfg)).length === 0;
  const isRnrBlocked = selectedDisp?.name === 'RNR' && !!rnrLimits?.isBlocked;
  const formReady = !!cfg && dispValid && (!profileRequired || profileComplete) && !isRnrBlocked;

  // ── Expose submit handler + state to parent (AgentWorkspace) ─────
  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (noLead || submitting) return;

    // ── Gate 1: the disposition form must be fully valid ──────────
    const errs = validate(form, cfg);
    if (Object.keys(errs).length) {
      setErrors(errs);
      const missingList = Object.keys(errs)
        .map((k) => `• ${DISP_FIELD_LABELS[k] ?? k}`)
        .join('\n');
      push(
        `Complete the disposition form before submitting.\n\nMissing:\n${missingList}`,
        'danger',
        4500
      );
      return;
    }

    // ── Gate 2: mandatory student profile (only when the disposition
    // requires it — currently 'Interested'). Callback / RNR / Not Interested
    // submit even with an incomplete profile. Mirrors the backend gate.
    if (profileRequired && !profileComplete) {
      const missingList = missingProfileFields.map((f) => `• ${f}`).join('\n');
      push(
        `Complete the student profile before submitting the disposition.\n\nMissing:\n${missingList}`,
        'danger',
        4500
      );
      return;
    }

    setSubmitting(true);

    // ── Gate 2.5: RNR retry rule (server is the source of truth;
    // this is a UX pre-check to avoid an unnecessary round-trip). ──
    if (selectedDisp?.name === 'RNR' && lead?._id) {
      try {
        const { data } = await client.get(`/interactions/rnr-limits?leadId=${lead._id}`);
        if (data.data?.isBlocked) {
          setSubmitting(false);
          push(data.data.reason, 'danger', 4500);
          setRnrLimits(data.data);
          return;
        }
      } catch { /* proceed — backend will enforce */ }
    }

    // Persist any pending profile edits together with the disposition.
    if (profileDirty) {
      const saved = await onSaveProfile?.();
      if (!saved) { setSubmitting(false); return; }
    }

    const payload = buildPayload(form, cfg);
    const result  = await submitCall(payload);
    setSubmitting(false);

    if (result?.success) {
      setForm(blank());
      setErrors({});
      onDispositionChange?.(null);
    }
  };

  useImperativeHandle(ref, () => ({ submit: handleSubmit }), [handleSubmit]);

  useEffect(() => {
    onFormStateChange?.({
      formReady,
      isRnrBlocked,
      noLead,
      callStatus,
      submitting,
      selectedDispName: selectedDisp?.name ?? null,
    });
  }, [formReady, isRnrBlocked, noLead, callStatus, submitting, selectedDisp?.name, onFormStateChange]);

  // ── Field change handler ──────────────────────────────────────
  const set = (field) => (e) => {
    const value = e.target.value;
    setErrors((prev) => ({ ...prev, [field]: undefined }));

    if (field === 'dispositionId') {
      const disp = dispositions.find((d) => d.id === value);
      setForm({ ...blank(), dispositionId: value, dispositionName: disp?.name ?? '' });
      setErrors({});
      onDispositionChange?.(disp?.name ?? null);
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Remarks use the mention-aware field: it updates the text AND resolves the
  // @mention user ids in one shot.
  const setRemarks = (value, mentionIds) => {
    setErrors((prev) => ({ ...prev, remarks: undefined }));
    setForm((prev) => ({ ...prev, remarks: value, mentions: mentionIds }));
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Form body (fills panel; only Remark History scrolls) ── */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', px: 1.5, pt: 0.875, pb: 0.5 }}>

        {/* Empty-state hint */}
        {noLead && (
          <Box sx={{ py: '40px', px: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '6px', color: 'text.disabled' }}>
            <FactCheckIcon sx={{ fontSize: 34, opacity: 0.5 }} aria-hidden="true" />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.secondary' }}>No Lead Loaded</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled', maxWidth: 260, lineHeight: 1.5 }}>Fetch a lead to start logging a disposition.</Typography>
          </Box>
        )}

        {/* In-progress hint */}
        {lead && CALL_ACTIVE.has(callStatus) && (
          <Alert
            severity="info"
            sx={{ py: 0.25, px: 1.25, mb: 1.25, fontSize: 12.5, '& .MuiAlert-icon': { fontSize: 16, py: 0.25 } }}
            icon={<InfoIcon fontSize="small" />}
          >
            You can fill in the disposition while the call is active.
          </Alert>
        )}

        {/* API options load error */}
        {optsError && (
          <Alert severity="warning" sx={{ py: 0.25, px: 1.25, mb: 1.25, fontSize: 12.5, '& .MuiAlert-icon': { fontSize: 16, py: 0.25 } }}>
            {optsError} — using cached values.
          </Alert>
        )}

        {/* ── Field: Disposition ─────────────────────────────────── */}
        <TextField
          select
          label="Disposition"
          required
          value={form.dispositionId}
          onChange={set('dispositionId')}
          disabled={noLead || submitting || loadingOpts}
          error={!!errors.dispositionId}
          helperText={errors.dispositionId}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          fullWidth
          sx={{ mt: 0, mb: 1.25 }}
        >
          <option value="">Select Disposition</option>
          {coreDispositions.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </TextField>

        {/* ── Priority (Interested) ─────────────────────────────── */}
        {cfg?.priority && (
          <Box sx={{ animation: `${fadeIn} 0.18s ease both` }}>
            <TextField
              select
              label="Priority"
              required
              value={form.interestLevel}
              onChange={set('interestLevel')}
              disabled={noLead || submitting}
              error={!!errors.interestLevel}
              helperText={errors.interestLevel}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              fullWidth
              sx={{ mb: 1.25 }}
            >
              <option value="">Select Priority</option>
              {interestLevels.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </TextField>
          </Box>
        )}

        {/* ── Schedule (Callback: Date + Time · RNR: Date only) ──── */}
        {cfg?.schedule && schedule && (
          <Box sx={{ animation: `${fadeIn} 0.18s ease both` }}>
            <FormSection icon={schedule.icon} title={schedule.title} />

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Box sx={{ flex: cfg.time ? '1 1 0' : '1 1 auto' }}>
                <TextField
                  type="date"
                  label="Date"
                  required
                  value={form.callbackDate}
                  onChange={set('callbackDate')}
                  disabled={noLead || submitting}
                  error={!!errors.callbackDate}
                  helperText={errors.callbackDate}
                  slotProps={{
                    inputLabel: { shrink: true },
                    input: { min: new Date().toISOString().slice(0, 10) },
                  }}
                  fullWidth
                  sx={{ mb: 1.25 }}
                />
              </Box>
              {cfg.time && (
                <Box sx={{ flex: '1 1 0' }}>
                  <TextField
                    type="time"
                    label="Time"
                    required
                    value={form.callbackTime}
                    onChange={set('callbackTime')}
                    disabled={noLead || submitting}
                    error={!!errors.callbackTime}
                    helperText={errors.callbackTime}
                    slotProps={{ inputLabel: { shrink: true } }}
                    fullWidth
                    sx={{ mb: 1.25 }}
                  />
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* ── RNR Limits info ──────────────────────────────────── */}
        {selectedDisp?.name === 'RNR' && (rnrLimitsLoading || rnrLimits) && (
          <Box sx={{
            mt: 1.5, p: 1.5, borderRadius: 1.5,
            bgcolor: rnrLimits?.isBlocked ? 'error.light' : 'grey.50',
            border: 1, borderColor: rnrLimits?.isBlocked ? 'error.main' : 'divider',
          }}>
            {rnrLimitsLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinearProgress sx={{ flex: 1 }} size="small" />
                <Typography variant="caption" color="text.disabled">Checking limits…</Typography>
              </Box>
            ) : rnrLimits ? (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    RNR {rnrLimits.usedToday} of {rnrLimits.maxPerDay} used today
                  </Typography>
                  <Box sx={{
                    ml: 'auto', height: 6, borderRadius: 3, width: 60,
                    bgcolor: 'grey.200', overflow: 'hidden',
                  }}>
                    <Box sx={{
                      height: '100%', borderRadius: 3,
                      width: `${(rnrLimits.usedToday / rnrLimits.maxPerDay) * 100}%`,
                      bgcolor: rnrLimits.isBlocked ? 'error.main' : 'primary.main',
                    }} />
                  </Box>
                </Box>
                {rnrLimits.isBlocked && (
                  <Typography variant="caption" color="error.main" sx={{ fontWeight: 500 }}>
                    {rnrLimits.reason}
                  </Typography>
                )}
              </Box>
            ) : null}
          </Box>
        )}

        {/* ── Reason (Not Interested) ────────────────────────────── */}
        {cfg?.reason && (
          <Box sx={{ animation: `${fadeIn} 0.18s ease both` }}>
            <TextField
              select
              label="Reason"
              required
              value={form.reason}
              onChange={set('reason')}
              disabled={noLead || submitting}
              error={!!errors.reason}
              helperText={errors.reason}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              fullWidth
              sx={{ mb: 1.25 }}
            >
              <option value="">Select Reason</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </TextField>

            {form.reason === 'Other' && (
              <Box sx={{ animation: `${fadeIn} 0.18s ease both` }}>
                <TextField
                  label="Other Reason"
                  required
                  placeholder="Please specify the reason…"
                  value={form.otherReason}
                  onChange={set('otherReason')}
                  disabled={noLead || submitting}
                  error={!!errors.otherReason}
                  helperText={errors.otherReason}
                  fullWidth
                  sx={{ mb: 1.25 }}
                />
              </Box>
            )}
          </Box>
        )}

        {/* ── Section: Remarks / Reason for Drop ──────────────── */}
        {cfg && (
          <Box sx={{ animation: `${fadeIn} 0.18s ease both` }}>
            <FormSection
              icon={<ChatBubbleIcon sx={{ fontSize: 13 }} />}
              title={selectedDisp?.name === 'Drop Lead' ? 'Reason for Drop' : 'Remarks / Call Notes'}
              optional={!cfg.remarksReq}
            />

            <MentionInput
              label={selectedDisp?.name === 'Drop Lead' ? 'Reason for Drop' : 'Remarks'}
              required={cfg.remarksReq}
              placeholder={
                selectedDisp?.name === 'Drop Lead'
                  ? 'Explain why this lead is being dropped — it stays assigned and can be revived later.'
                  : 'Enter call notes, observations, or any additional context… (type @ to mention a teammate)'
              }
              value={form.remarks}
              onChange={setRemarks}
              disabled={noLead || submitting}
              error={!!errors.remarks}
              helperText={errors.remarks}
              minRows={3}
              size="medium"
            />
          </Box>
        )}

        {children}

      </Box>
    </Box>
  );
});

export default DispositionForm;