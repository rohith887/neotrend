import { Box, Tooltip, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { deriveStepStates } from '../CounselorWorkspace.jsx';

/* ═══════════════════════════════════════════════════════════════════════
   LIFECYCLE PROGRESS — compact one-row lifecycle navigator for the
   Counselor Dashboard's Journey column (and anywhere a student row is shown).

   Shows the five Counselor lifecycle stages aligned horizontally:
     C = Counseling, R = Registration, D = Documents, A = Applications,
     V = Visa.

   STATE SOURCE OF TRUTH:
     Per-stage state (completed / current / upcoming) is derived with
     deriveStepStates(lead) — the exact same function the Counselor
     Workspace stepper uses — so the dashboard and the workspace never
     show conflicting lifecycle states. The raw `lead.<stage>Status`
     field only ADDS a richer label + picks up warning (blocked) states.

   Each stage is a real shortcut: clicking opens the Counselor Workspace
   for that student and jumps to that stage (via onOpenStage).
   ═══════════════════════════════════════════════════════════════════════ */

// stage ids as handled by deriveStepStates / the workspace journey tabs
const STAGE_ORDER = [
  { id: 'counseling',   key: 'C', stage: 'Counseling',   field: 'counselingStatus' },
  { id: 'registration', key: 'R', stage: 'Registration', field: 'registrationStatus' },
  { id: 'documents',    key: 'D', stage: 'Documents',    field: 'documentStatus' },
  { id: 'applications', key: 'A', stage: 'Applications', field: 'applicationStatus' },
  { id: 'visa',         key: 'V', stage: 'Visa',         field: 'visaStatus' },
];

// Raw statuses that mean the stage is blocked / needs attention (warning).
const BLOCKED_STATES = new Set([
  'rejected', 'denied', 'failed', 'cancelled', 'expired', 'non-compliance',
  'not-applicable', 'on-hold', 'deferred', 'lost',
]);

const fmtLabel = (raw) => {
  if (!raw || raw === 'not-started' || raw === 'none') return 'Not Started';
  if (raw === 'not-applicable') return 'N/A';
  return String(raw)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// Presentation per stage state.
const STYLE = {
  completed: { color: 'success.main', bg: 'success.soft', label: 'Completed' },
  current:   { color: 'primary.main', bg: 'primary.soft', label: 'In Progress' },
  upcoming:  { color: 'grey.400',     bg: 'grey.100',     label: 'Pending' },
  blocked:   { color: 'warning.main', bg: 'warning.soft', label: 'Attention' },
};

function Chevron() {
  return (
    <Box sx={{ color: 'grey.400', display: 'inline-flex', alignItems: 'center', userSelect: 'none', px: '1px' }}>
      <svg width="5" height="8" viewBox="0 0 5 8" fill="none" style={{ display: 'block' }}>
        <path d="M1 1l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Box>
  );
}

export default function LifecycleProgress({ lead, onOpenStage, sx }) {
  if (!lead) {
    return <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>;
  }

  // Same canonical derivation as the Counselor Workspace stepper.
  const stepStates = deriveStepStates(lead);
  const stateById = new Map(stepStates.map((s) => [s.id, s.state]));

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, flexWrap: 'nowrap', ...sx }}>
      {STAGE_ORDER.map((cfg, i) => {
        const stepState = stateById.get(cfg.id) || 'upcoming';
        const raw = lead?.[cfg.field];
        const blocked = BLOCKED_STATES.has(String(raw || '').toLowerCase());

        // Blocked overrides the derived state, but stays green if the stage
        // is genuinely complete (a completed stage can't also be blocked).
        const displayState =
          blocked && stepState !== 'completed' ? 'blocked' : stepState;
        const tone = STYLE[displayState] || STYLE.upcoming;
        const statusLabel = fmtLabel(raw);
        const tooltip = `${cfg.stage} — ${statusLabel}`;

        return (
          <Box key={cfg.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
            <Tooltip
              title={`${tooltip} · click to open`}
              arrow
              placement="top"
              enterDelay={350}
            >
              <Box
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenStage?.(cfg.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenStage?.(cfg.id);
                  }
                }}
                aria-label={`${cfg.stage} — ${statusLabel}`}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.375,
                  px: 0.625, py: '2px', borderRadius: 1,
                  border: 1, borderColor: 'divider',
                  bgcolor: tone.bg, color: tone.color,
                  cursor: 'pointer', userSelect: 'none',
                  transition: 'transform 100ms ease, box-shadow 100ms ease',
                  '&:hover': { boxShadow: 1, transform: 'translateY(-1px)' },
                }}
              >
                {displayState === 'completed' ? (
                  <CheckCircleIcon sx={{ fontSize: 12, flexShrink: 0 }} />
                ) : (
                  <RadioButtonUncheckedIcon sx={{ fontSize: 11, flexShrink: 0 }} />
                )}
                <Typography sx={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1 }}>
                  {cfg.key}
                </Typography>
              </Box>
            </Tooltip>
            {i < STAGE_ORDER.length - 1 && <Chevron />}
          </Box>
        );
      })}
    </Box>
  );
}
