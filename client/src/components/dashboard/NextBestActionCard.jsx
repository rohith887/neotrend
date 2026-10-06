import { Fragment, useEffect, useState } from 'react';
import { Box, Card, Chip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import BoltIcon from '@mui/icons-material/Bolt';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import LogoutIcon from '@mui/icons-material/Logout';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import TimerIcon from '@mui/icons-material/Timer';
import { PrimaryButton, SecondaryButton } from '../../ui/mui/index.js';
import { formatDuration } from '../../context/AgentContext.jsx';

/**
 * NextBestActionCard — the single most urgent task, presented as a compact
 * premium CRM action card (Salesforce / HubSpot / Linear style).
 *
 * Pure presentation layer: it maps an action payload + live call state into a
 * card variant, renders the right accent, icon, copy and CTA, and delegates
 * every click back to the caller. No business logic lives here.
 *
 * MUI migration — same API, variant resolution, timer and CTA rules as before;
 * only the presentation uses muiTheme.js + shared MUI components.
 *
 * Variants (accent is the only thing that changes between them):
 *   active-call — an in-progress call → blue accent
 *   callback    — a scheduled callback to resume → amber accent
 *   ready       — a lead ready to call → green accent
 *   clear       — queue is clear → neutral gray
 *   loading     — next action still being resolved → neutral gray
 */

export const NBA_VARIANT = {
  ACTIVE_CALL: 'active-call',
  CALLBACK: 'callback',
  READY: 'ready',
  CLEAR: 'clear',
  LOADING: 'loading',
};

// Brand indigo "filled primary" — the one polished workflow action colour.
const PRIMARY_BRAND_SX = {
  bgcolor: '#0f766e',
  color: '#ffffff',
  boxShadow: 'none',
  '&:hover': { bgcolor: '#115e59', boxShadow: 'none' },
};

const TONES = {
  info:    { main: 'info.main',      soft: 'info.soft',      chip: 'info' },
  warning: { main: 'warning.main',   soft: 'warning.soft',   chip: 'warning' },
  success: { main: 'success.main',   soft: 'success.soft',   chip: 'success' },
  neutral: { main: 'text.secondary', soft: 'action.hover',   chip: 'default' },
};

const ACCENTS = {
  [NBA_VARIANT.ACTIVE_CALL]: { tone: 'info',    icon: <PhoneInTalkIcon sx={{ fontSize: 18 }} />,         typeLabel: 'Active Call',    pulse: true },
  [NBA_VARIANT.CALLBACK]:    { tone: 'warning', icon: <AutorenewIcon sx={{ fontSize: 18 }} />,           typeLabel: 'Callback',       pulse: true },
  [NBA_VARIANT.READY]:       { tone: 'success', icon: <CallMadeIcon sx={{ fontSize: 18 }} />,            typeLabel: 'Ready to Call',  pulse: true },
  [NBA_VARIANT.CLEAR]:       { tone: 'neutral', icon: <CheckCircleOutlinedIcon sx={{ fontSize: 18 }} />, typeLabel: 'All Clear',      pulse: false },
  [NBA_VARIANT.LOADING]:     { tone: 'neutral', icon: <HourglassBottomIcon sx={{ fontSize: 18 }} />,     typeLabel: 'Loading',        pulse: false },
};

/* ── Action payload → card variant ─────────────────────────────── */
export const resolveNextActionVariant = (action, { callActive = false } = {}) => {
  if (callActive) return NBA_VARIANT.ACTIVE_CALL;
  if (!action) return NBA_VARIANT.LOADING;
  switch (action.action) {
    case 'callback': return NBA_VARIANT.CALLBACK;
    case 'call':
    case 'fetch': return NBA_VARIANT.READY;
    case 'clear': return NBA_VARIANT.CLEAR;
    default: return NBA_VARIANT.READY;
  }
};

const fmtDue = (iso) => {
  if (!iso) return 'No scheduled time';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(d, now)) return 'Due today';
  if (sameDay(d, tomorrow)) return 'Due tomorrow';
  return `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
};

const isOverdue = (iso) => !!iso && new Date(iso).getTime() < Date.now();

/**
 * @param {object}  props.action         Next-action payload from /agent/dashboard/next-action
 * @param {boolean} props.callActive     Whether a call is live right now (overrides the action)
 * @param {object}  props.student        Live lead (e.g. the in-progress call's lead) — optional
 * @param {string}  props.variant        Optional explicit variant override
 * @param {boolean} props.disabled       Disables the CTA (e.g. while a lead is being fetched)
 * @param {fn}      props.onAction       CTA click for callback / ready / clear variants
 * @param {fn}      props.onReturnToCall CTA click for the active-call variant
 */
export default function NextBestActionCard({
  action,
  callActive = false,
  student,
  variant: variantProp,
  disabled = false,
  onAction,
  onReturnToCall,
}) {
  const variant = variantProp || resolveNextActionVariant(action, { callActive });
  const accent = ACCENTS[variant];
  const tone = TONES[accent.tone];

  // Live duration for the active-call variant — starts ticking the moment the
  // card sees a live call (mirrors the workspace's own timer behaviour).
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!callActive) {
      setElapsedMs(0);
      return undefined;
    }
    const start = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => setElapsedMs(Date.now() - start), 1000);
    return () => window.clearInterval(id);
  }, [callActive]);

  const overdue = variant === NBA_VARIANT.CALLBACK && isOverdue(action?.dueAt);

  const ctaLabel =
    variant === NBA_VARIANT.ACTIVE_CALL ? 'Return to Call'
      : variant === NBA_VARIANT.CALLBACK ? 'Resume'
      : variant === NBA_VARIANT.READY ? (action?.action === 'call' ? 'Call Now' : 'Fetch Next')
      : variant === NBA_VARIANT.CLEAR ? 'Open Workspace'
      : '…';

  const ctaIcon =
    variant === NBA_VARIANT.ACTIVE_CALL ? <ArrowBackIcon sx={{ fontSize: 15 }} />
      : variant === NBA_VARIANT.CALLBACK ? <CallReceivedIcon sx={{ fontSize: 15 }} />
      : variant === NBA_VARIANT.READY ? (action?.action === 'call' ? <CallMadeIcon sx={{ fontSize: 15 }} /> : <BoltIcon sx={{ fontSize: 15 }} />)
      : variant === NBA_VARIANT.CLEAR ? <LogoutIcon sx={{ fontSize: 15 }} />
      : undefined;

  const handleCtaClick = variant === NBA_VARIANT.ACTIVE_CALL ? onReturnToCall : onAction;
  const ctaDisabled =
    disabled ||
    variant === NBA_VARIANT.LOADING ||
    (variant === NBA_VARIANT.ACTIVE_CALL && typeof onReturnToCall !== 'function');

  const studentName =
    variant === NBA_VARIANT.ACTIVE_CALL
      ? student?.studentName || action?.studentName
      : action?.studentName || student?.studentName;

  let title;
  const meta = [];

  switch (variant) {
    case NBA_VARIANT.ACTIVE_CALL:
      title = 'Continue current conversation';
      if (studentName) meta.push(<strong key="s">{studentName}</strong>);
      meta.push(
        <Box component="span" key="t" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}>
          <TimerIcon sx={{ fontSize: 14 }} />
          {formatDuration(elapsedMs)}
        </Box>
      );
      break;
    case NBA_VARIANT.CALLBACK:
      title = action?.title || 'Resume callback';
      if (studentName) meta.push(<strong key="s">{studentName}</strong>);
      if (action?.referenceId) meta.push(<span key="r">Lead #{action.referenceId}</span>);
      if (action?.dueAt) meta.push(<span key="d">{fmtDue(action.dueAt)}</span>);
      if (overdue) meta.push(<Chip key="o" size="small" color="error" label="Overdue" />);
      if (action?.priority) meta.push(<Chip key="p" size="small" color="error" label={action.priority} />);
      break;
    case NBA_VARIANT.READY:
      title = action?.action === 'call' ? action?.title || 'Call hot lead' : 'Ready to call';
      if (studentName) meta.push(<strong key="s">{studentName}</strong>);
      if (action?.referenceId) meta.push(<span key="r">Lead #{action.referenceId}</span>);
      if (action?.priority) meta.push(<Chip key="p" size="small" color="error" label={action.priority} />);
      if (!meta.length) meta.push(<span key="d">{action?.detail || 'A lead is waiting — start a fresh call'}</span>);
      break;
    case NBA_VARIANT.CLEAR:
      title = 'All caught up';
      meta.push(<span key="d">{action?.detail || 'No pending work — your queue is clear'}</span>);
      break;
    default:
      title = 'Loading your next action…';
      meta.push(<span key="d">Working out the most urgent task for you.</span>);
      break;
  }

  const CtaButton = variant === NBA_VARIANT.CLEAR ? SecondaryButton : PrimaryButton;

  return (
    <Card
      role="region"
      aria-label="Next best action"
      sx={{ display: 'flex', overflow: 'hidden', boxShadow: 'none' }}
    >
      <Box aria-hidden="true" sx={{ width: 3, flexShrink: 0, bgcolor: tone.main }} />
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1, minWidth: 0 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: tone.soft,
            color: tone.main,
          }}
        >
          {accent.icon}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography
              component="span"
              sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tone.main, whiteSpace: 'nowrap' }}
            >
              {accent.typeLabel}
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </Typography>
          </Box>
          {meta.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 0.5,
                mt: 0.25,
                color: 'text.secondary',
                fontSize: 12,
              }}
            >
              {meta.map((item, i) => (
                <Fragment key={i}>
                  {i > 0 && <Box component="span" aria-hidden="true" sx={{ color: 'text.disabled' }}>•</Box>}
                  {item}
                </Fragment>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ flexShrink: 0 }}>
          <CtaButton
            size="small"
            startIcon={ctaIcon}
            onClick={handleCtaClick}
            disabled={ctaDisabled}
            sx={{
              minHeight: 28,
              fontSize: 11.5,
              px: 1.25,
              ...(variant !== NBA_VARIANT.CLEAR ? PRIMARY_BRAND_SX : undefined),
            }}
          >
            {ctaLabel}
          </CtaButton>
        </Box>
      </Box>
    </Card>
  );
}
