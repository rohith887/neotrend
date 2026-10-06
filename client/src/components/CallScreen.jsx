import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import CallEndIcon from '@mui/icons-material/CallEnd';
import CallMadeIcon from '@mui/icons-material/CallMade';
import DialpadIcon from '@mui/icons-material/Dialpad';
import BackspaceIcon from '@mui/icons-material/Backspace';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import { useToast } from '../context/ToastContext.jsx';
import { browserPhone } from '../telephony/browserPhone.js';

/* ==========================================================================
   COMPACT PHONE WIDGET — a small, draggable softphone panel docked at the
   top-right corner of the agent workspace.

   Clean enterprise light theme: solid white card, subtle borders and
   elevation shadow, theme tokens throughout (primary/success/warning/error
   + their .soft/.border pairs) so it matches the rest of the CRM exactly
   instead of a standalone dark "phone app" look.

   Auto-opens when a CRM call goes live. Drag it by its header handle; close
   it with the × (the call keeps going — the chip / Phone button reopen it).
   Contents adapt to size: caller block, live status + timer, DTMF/dial
   keypad (toggle), and every call action — hold, mute, transfer, conference,
   hang up. SIP-leg actions need the browser softphone; the legacy
   desktop-softphone flow keeps CRM actions (dial/hang up) available.
   ========================================================================== */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const KEY_LETTERS = { '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ', '0': '+', '*': '', '#': '' };

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function fmtTimer(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

export default function CallScreen({
  open,
  onClose,
  timerSeconds = 0,
  phone,
  lead,
  startCall,
  endCall,
  callActive = false,
  callConnected = false,
  callEnding = false,
  recovering = false,
}) {
  const { push } = useToast();
  const theme = useTheme();

  const panelRef = useRef(null);
  const [pos, setPos] = useState(null); // null → auto dock top-right on open
  const [drag, setDrag] = useState(null);

  const [dialDigits, setDialDigits] = useState('');
  const [dtmfSeq, setDtmfSeq] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [armMode, setArmMode] = useState(null); // 'transfer' | 'conference'
  const [targetValue, setTargetValue] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const ready = phone.state === 'registered';
  const sipLive = !!phone.inCall; // this browser holds the SIP leg
  const hasLead = !!lead;

  // Auto-dock at the top-right corner the first time the panel opens.
  useEffect(() => {
    if (!open) return undefined;
    if (pos === null && panelRef.current) {
      const w = panelRef.current.offsetWidth;
      setPos({ x: clamp(window.innerWidth - w - 16, 0, window.innerWidth - w), y: 16 });
    }
    return undefined;
  }, [open, pos]);

  // A live SIP leg rules the widget; a half-typed dial string is cleared.
  useEffect(() => {
    if (sipLive) setDialDigits('');
  }, [sipLive]);

  // A manual dial-pad override is scoped to the lead it was typed for. Fetching
  // a NEW lead must not let a stale digit string silently override that lead's
  // stored mobile on the next Call click (server precedence is
  // `manualNumber || lead.mobile` in call.controller.js — this is a pure local
  // UI reset, it never touches browserPhone/SIP registration).
  useEffect(() => {
    setDialDigits('');
  }, [lead?._id]);

  // Reset transient UI whenever the widget closes.
  useEffect(() => {
    if (!open) {
      setShowKeypad(false);
      setArmMode(null);
      setTargetValue('');
      setDtmfSeq('');
      setBusyAction('');
    }
  }, [open]);

  const onHandleDown = useCallback(
    (e) => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      setDrag({ dx: e.clientX - rect.left, dy: e.clientY - rect.top });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    []
  );
  const onHandleMove = useCallback(
    (e) => {
      if (!drag || !panelRef.current) return;
      const pw = panelRef.current.offsetWidth;
      const ph = panelRef.current.offsetHeight;
      setPos({
        x: clamp(e.clientX - drag.dx, 0, Math.max(0, window.innerWidth - pw)),
        y: clamp(e.clientY - drag.dy, 0, Math.max(0, window.innerHeight - ph)),
      });
    },
    [drag]
  );
  const onHandleUp = useCallback(() => setDrag(null), []);

  const callerName = lead?.studentName || '';
  const callerNumber = lead?.mobile || '';
  const displayValue = sipLive ? (dtmfSeq || '') : dialDigits;

  const statusLine = useMemo(() => {
    if (phone.transferring) return `Transferring to ${phone.transferring}…`;
    if (phone.confState === 'dialing') return `Calling ${phone.confParticipant}…`;
    if (sipLive && phone.held) return 'On hold';
    if (sipLive && phone.muted) return 'Muted';
    if (sipLive) return phone.confState === 'active' ? '3-way call' : 'Connected';
    if (callActive) {
      if (recovering && !sipLive) return phone.state === 'registered' ? 'Session Lost — call connection was interrupted by page refresh.' : 'Reconnecting your softphone…';
      if (phone.enabled && !ready) return phone.state === 'connecting' ? 'Phone connecting…' : phone.error || 'Phone offline';
      if (callEnding) return 'Ending call…';
      return phone.enabled ? 'Ringing your softphone…' : 'Ringing …';
    }
    return ready ? `Ready · Phone ${phone.extension}` : 'Not registered';
  }, [phone.transferring, phone.confState, phone.confParticipant, phone.held, phone.muted, sipLive, callActive, phone.enabled, ready, phone.state, phone.error, callEnding, phone.extension, recovering]);

  const statusOk = sipLive && !phone.held && !phone.muted;
  const statusWarn = sipLive && (phone.held || phone.muted);

  const runAction = useCallback(
    async (name, fn, okMsg) => {
      if (busyAction) return;
      setBusyAction(name);
      try {
        await fn();
        if (okMsg) push(okMsg, 'success');
      } catch (err) {
        push(err?.message || `Could not ${name}.`, 'danger');
      } finally {
        setBusyAction('');
      }
    },
    [busyAction, push]
  );

  const handleKey = (digit) => {
    if (sipLive) {
      browserPhone.dtmf(digit);
      setDtmfSeq((s) => (s + digit).slice(-18));
    } else {
      setDialDigits((s) => (s + digit).slice(-19));
    }
  };

  const handleCall = () => {
    if (!hasLead) {
      push('Load a lead first — the CRM dials through the lead.', 'warning');
      return;
    }
    startCall(lead, dialDigits || undefined);
  };

  const handleHangup = async () => {
    await endCall();
    browserPhone.hangup();
  };

  const toggleArm = (mode) => {
    setArmMode((m) => (m === mode ? null : mode));
    setShowKeypad(false);
  };

  const commitArm = () => {
    const value = targetValue.trim();
    if (!value) return;
    runAction(
      armMode === 'transfer' ? 'transfer' : 'add participant',
      () => (armMode === 'transfer' ? browserPhone.transfer(value) : browserPhone.conferenceAdd(value))
    );
    setTargetValue('');
    setArmMode(null);
  };

  const keypadOpen = showKeypad || !callActive;

  const statusDotColor = statusOk ? theme.palette.success.main : statusWarn ? theme.palette.warning.main : callActive ? theme.palette.warning.main : theme.palette.text.disabled;

  if (!open) return null;

  return (
    <Box
      ref={panelRef}
      sx={{
        position: 'fixed',
        left: pos ? pos.x : 16,
        top: pos ? pos.y : 16,
        zIndex: 1300,
        width: 320,
        maxWidth: 'calc(100vw - 24px)',
        borderRadius: 2.5,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        boxShadow: '0 16px 40px -12px rgba(15,23,42,0.22), 0 4px 14px -6px rgba(15,23,42,0.1)',
        overflow: 'hidden',
      }}
    >
      {/* ── Drag handle / header ── */}
      <Box
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        role="toolbar"
        aria-label="Draggable phone"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.375,
          py: 0.875,
          cursor: drag ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
        }}
      >
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: statusDotColor,
            boxShadow: statusOk || callActive ? `0 0 0 3px ${alpha(statusDotColor, 0.18)}` : 'none',
            flexShrink: 0,
            ...(callActive && !statusOk
              ? {
                  animation: 'dialerPulseDot 1.6s ease-in-out infinite',
                  '@keyframes dialerPulseDot': {
                    '0%, 100%': { boxShadow: `0 0 0 0 ${alpha(statusDotColor, 0.35)}` },
                    '50%': { boxShadow: `0 0 0 4px ${alpha(statusDotColor, 0)}` },
                  },
                }
              : {}),
          }}
        />
        <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'text.primary', letterSpacing: 0.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {callerName || (sipLive ? 'Agent call' : 'Phone')}
        </Typography>
        <IconButton
          size="small"
          aria-label="Toggle keypad"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowKeypad((v) => !v)}
          sx={{
            color: showKeypad ? 'primary.main' : 'text.secondary',
            bgcolor: showKeypad ? 'primary.soft' : 'transparent',
            borderRadius: 1.5,
            p: 0.5,
            transition: 'background-color 120ms ease, color 120ms ease',
            '&:hover': { bgcolor: showKeypad ? 'primary.soft' : 'action.hover' },
          }}
        >
          <DialpadIcon sx={{ fontSize: 17 }} />
        </IconButton>
        <IconButton
          size="small"
          aria-label="Close dialer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          sx={{ color: 'text.secondary', borderRadius: 1.5, p: 0.5, transition: 'background-color 120ms ease, color 120ms ease', '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } }}
        >
          <CloseIcon sx={{ fontSize: 17 }} />
        </IconButton>
      </Box>

      {/* ── Caller / status row ── */}
      <Box sx={{ px: 1.625, pt: 1.375, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            background: `linear-gradient(150deg, ${theme.palette.primary.main}, ${theme.palette.primary.hover || theme.palette.primary.dark})`,
            border: '1px solid',
            borderColor: 'primary.border',
            boxShadow: `0 3px 10px -3px ${alpha(theme.palette.primary.main, 0.45)}`,
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          {callerName ? initials(callerName) : <PhoneInTalkIcon sx={{ fontSize: 19 }} />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.1, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayValue || callerNumber || phone.extension || '—'}
          </Typography>
          <Typography sx={{ fontSize: 11, color: statusOk ? 'success.main' : statusWarn ? 'warning.dark' : 'text.secondary', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {statusLine}
          </Typography>
        </Box>
        {callConnected && (
          <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'text.primary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {fmtTimer(timerSeconds)}
          </Typography>
        )}
      </Box>

      {/* ── Conference participant chip ── */}
      {phone.confState !== 'idle' && phone.confParticipant && (
        <Box sx={{ mx: 1.625, mt: 1, display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, borderRadius: 1.5, bgcolor: 'success.soft', border: 1, borderColor: 'success.border' }}>
          <GroupAddIcon sx={{ fontSize: 14, color: 'success.main' }} />
          <Typography sx={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: 'success.dark', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {phone.confState === 'dialing' ? `Connecting ${phone.confParticipant}…` : `3-way with ${phone.confParticipant}`}
          </Typography>
          {phone.confState === 'active' && (
            <IconButton size="small" onClick={() => runAction('drop participant', () => browserPhone.conferenceDrop(), 'Participant dropped')} aria-label="Drop participant" sx={{ color: 'error.main', p: 0.4 }}>
              <RemoveCircleIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>
      )}

      {/* ── Keypad (dial while idle, DTMF in call) ── */}
      {keypadOpen && (
        <Box sx={{ px: 1.625, pt: 1.375 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.625 }}>
            {KEYS.map((d) => (
              <Button
                key={d}
                onClick={() => handleKey(d)}
                sx={{
                  minWidth: 0,
                  p: 0,
                  py: 0.75,
                  borderRadius: 1.5,
                  color: 'text.primary',
                  bgcolor: 'grey.50',
                  border: 1,
                  borderColor: 'divider',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                  transition: 'transform 100ms ease, background-color 120ms ease',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:active': { transform: 'scale(0.97)', bgcolor: 'grey.100' },
                  flexDirection: 'column',
                  lineHeight: 0.9,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700 }}>{d}</span>
                {KEY_LETTERS[d] ? (
                  <span style={{ fontSize: 7, fontWeight: 600, letterSpacing: 1, color: theme.palette.text.disabled, marginTop: 2 }}>{KEY_LETTERS[d]}</span>
                ) : null}
              </Button>
            ))}
          </Box>
          {!callActive && (
            <Button
              onClick={() => setDialDigits((s) => s.slice(0, -1))}
              disabled={!dialDigits}
              sx={{
                mt: 0.625,
                width: '100%',
                py: 0.65,
                borderRadius: 1.5,
                fontWeight: 600,
                color: 'text.secondary',
                bgcolor: 'grey.50',
                border: 1,
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
                '&.Mui-disabled': { color: 'text.disabled', bgcolor: 'grey.50' },
              }}
              title="Delete last digit"
            >
              <BackspaceIcon sx={{ fontSize: 16 }} /> Clear
            </Button>
          )}
        </Box>
      )}

      {/* ── Transfer / conference input ── */}
      {armMode && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.625, pt: 1.375 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder={armMode === 'transfer' ? 'Number or extension' : 'Add participant number'}
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitArm(); }}
            sx={{
              '& .MuiOutlinedInput-root': { color: 'text.primary', bgcolor: 'background.paper', borderRadius: 1.5, fontSize: 12.5 },
            }}
          />
          <Button
            onClick={commitArm}
            disabled={!targetValue.trim()}
            size="small"
            sx={{
              height: 34,
              px: 1.5,
              borderRadius: 1.5,
              fontWeight: 700,
              fontSize: 12,
              color: '#ffffff',
              bgcolor: 'success.main',
              boxShadow: `0 2px 8px -2px ${alpha(theme.palette.success.main, 0.5)}`,
              '&:hover': { bgcolor: 'success.dark' },
              '&.Mui-disabled': { bgcolor: 'grey.100', color: 'text.disabled', boxShadow: 'none' },
            }}
          >
            {armMode === 'transfer' ? 'Transfer' : 'Add'}
          </Button>
        </Box>
      )}

      {/* ── Actions ── */}
      <Box sx={{ px: 1.625, py: 1.375, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.75 }}>
        <RoundAction
          icon={phone.held ? <PlayCircleIcon sx={{ fontSize: 20 }} /> : <PauseCircleIcon sx={{ fontSize: 20 }} />}
          label={phone.held ? 'Resume' : 'Hold'}
          active={phone.held}
          warn={phone.held}
          disabled={!sipLive || !!busyAction}
          onClick={() => runAction(phone.held ? 'resume' : 'hold', () => browserPhone.toggleHold())}
        />
        <RoundAction
          icon={phone.muted ? <MicOffIcon sx={{ fontSize: 20 }} /> : <MicIcon sx={{ fontSize: 20 }} />}
          label={phone.muted ? 'Unmute' : 'Mute'}
          active={phone.muted}
          warn={phone.muted}
          disabled={!sipLive || !!busyAction}
          onClick={() => runAction(phone.muted ? 'unmute' : 'mute', () => browserPhone.toggleMute())}
        />
        <RoundAction
          icon={<CompareArrowsIcon sx={{ fontSize: 20 }} />}
          label="Transfer"
          disabled={!sipLive || !!busyAction}
          onClick={() => toggleArm('transfer')}
        />
        <RoundAction
          icon={<GroupAddIcon sx={{ fontSize: 20 }} />}
          label="Conference"
          disabled={!sipLive || !!busyAction || phone.confState !== 'idle'}
          onClick={() => toggleArm('conference')}
        />
      </Box>

      {/* ── Hang up / Call ── */}
      <Box sx={{ px: 1.625, pb: 1.625, pt: 0.25 }}>
        {callActive ? (
          <Button
            onClick={handleHangup}
            fullWidth
            startIcon={<CallEndIcon sx={{ fontSize: 18 }} />}
            sx={{
              py: 1.1,
              borderRadius: 999,
              fontWeight: 800,
              letterSpacing: 0.2,
              color: '#ffffff',
              bgcolor: 'error.main',
              boxShadow: `0 8px 20px -8px ${alpha(theme.palette.error.main, 0.6)}`,
              transition: 'background-color 120ms ease, box-shadow 120ms ease',
              '&:hover': { bgcolor: 'error.dark' },
              '&:active': { transform: 'translateY(1px)' },
            }}
          >
            Hang Up
          </Button>
        ) : (
          <Button
            onClick={handleCall}
            fullWidth
            disabled={!hasLead}
            startIcon={<CallMadeIcon sx={{ fontSize: 18 }} />}
            title={hasLead ? 'Call the loaded lead (typed number wins when present)' : 'Load a lead to call'}
            sx={{
              py: 1.1,
              borderRadius: 999,
              fontWeight: 800,
              letterSpacing: 0.2,
              color: '#ffffff',
              bgcolor: hasLead ? 'success.main' : 'grey.200',
              boxShadow: hasLead ? `0 8px 20px -8px ${alpha(theme.palette.success.main, 0.55)}` : 'none',
              transition: 'background-color 120ms ease, box-shadow 120ms ease',
              '&:hover': hasLead ? { bgcolor: 'success.dark' } : undefined,
              '&:active': hasLead ? { transform: 'translateY(1px)' } : undefined,
              '&.Mui-disabled': { color: 'text.disabled' },
            }}
          >
            Call
          </Button>
        )}
      </Box>
    </Box>
  );
}

function RoundAction({ icon, label, onClick, disabled, active = false, warn = false }) {
  const tone = warn ? 'warning' : 'success';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <IconButton
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        sx={{
          width: 44,
          height: 44,
          transition: 'transform 100ms ease, background-color 120ms ease',
          ...(active
            ? {
                color: `${tone}.dark`,
                bgcolor: `${tone}.soft`,
                border: 1,
                borderColor: `${tone}.border`,
              }
            : {
                color: 'text.secondary',
                bgcolor: 'grey.50',
                border: 1,
                borderColor: 'divider',
              }),
          '&:hover:not(:disabled)': active ? { bgcolor: `${tone}.soft` } : { bgcolor: 'action.hover' },
          '&:active:not(:disabled)': { transform: 'scale(0.95)' },
          '&.Mui-disabled': { color: 'text.disabled', bgcolor: 'grey.50', border: 1, borderColor: 'divider' },
        }}
      >
        {icon}
      </IconButton>
      <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: disabled ? 'text.disabled' : active ? `${tone}.dark` : 'text.secondary', lineHeight: 1 }}>
        {label}
      </Typography>
    </Box>
  );
}
