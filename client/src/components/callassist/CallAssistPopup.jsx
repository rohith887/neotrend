import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { fetchCallAssistContext } from '../../api/leads.js';

/* ==========================================================================
   CALL ASSIST POPUP — compact live-call assistant for the Agent workspace.

   Floating, non-modal, backdrop-free panel. It is draggable (drag the title
   bar), minimizable (collapses to a small "✨ Call Assist" launcher) and
   closable — so it never blocks interaction with the workspace underneath.

   It only ever renders context for the CURRENT active student: every time the
   active lead changes the cached context is cleared and rebuilt for the new
   student, and the panel position/minimize state resets, so stale student
   data can never leak into a later call.

   Data contract mirrors the backend service (server/src/services/
   callAssist.service.js). `generated` is rule-driven today ('rules-v1') but
   the same payload shape is what an LLM would return later — no client
   redesign needed.
   ========================================================================== */

const DATE_FMT_OPTS = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, DATE_FMT_OPTS);
  } catch {
    return '';
  }
};
const fmtDur = (sec) => {
  const s = Number.isFinite(sec) ? Math.max(0, Math.round(sec)) : 0;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
};

function SectionHeading({ children }) {
  return (
    <Typography
      sx={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'text.secondary', mb: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

export default function CallAssistPopup({ open, lead, onClose, onVersionChange }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const leadId = lead?._id;
  const loadedLeadRef = useRef(null);

  // ── Draggable / minimizable floating panel ─────────────────────
  const [pos, setPos] = useState(null);        // {x,y} in viewport px after a drag
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef(null);
  const dragRef = useRef(null);                // drag-in-progress snapshot

  // State resets — a new student (or a closed panel) never inherits the
  // previous student's panel position or minimized state.
  useEffect(() => {
    setPos(null);
    setMinimized(false);
  }, [leadId]);
  useEffect(() => {
    if (!open) {
      setMinimized(false);
      setDragging(false);
      dragRef.current = null;
    }
  }, [open]);

  const startDrag = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('button')) return; // title-bar buttons keep working
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: pos ? pos.x : rect.left,
      startTop: pos ? pos.y : rect.top,
      width: rect.width,
      height: rect.height,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const min = 8;
    const maxX = Math.max(min, window.innerWidth - d.width - 8);
    const maxY = Math.max(min, window.innerHeight - d.height - 8);
    const x = Math.min(maxX, Math.max(min, d.startLeft + (e.clientX - d.startX)));
    const y = Math.min(maxY, Math.max(min, d.startTop + (e.clientY - d.startY)));
    setPos({ x, y });
  };

  const endDrag = (e) => {
    const d = dragRef.current;
    if (d && e.currentTarget.hasPointerCapture?.(d.pointerId)) {
      e.currentTarget.releasePointerCapture?.(d.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  // Anchor at the drag position when set, else bottom-right default.
  const anchorStyle = pos ? { left: pos.x, top: pos.y } : { right: 12, bottom: 12 };

  const load = useCallback((targetLeadId, { silent = false } = {}) => {
    if (!targetLeadId) return;
    loadedLeadRef.current = targetLeadId;
    setError(null);
    setLoading(true);
    let cancelled = false;
    fetchCallAssistContext(targetLeadId)
      .then((ctx) => {
        if (cancelled) return;
        setContext(ctx);
        // Surface the EXACT generation this context used so the end-of-call
        // feedback form can reference the same version (never re-queried).
        const version = ctx?.generatedContextVersion || ctx?.generated?.builder || null;
        if (version) onVersionChange?.(version);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.message || 'Could not load call assist context');
        loadedLeadRef.current = null;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [onVersionChange]);

  // Build/refresh the context ONLY when the active student changes. Closing
  // and reopening the popup for the same lead reuses the cached context
  // (no extra API call); switching students always rebuilds from scratch.
  useEffect(() => {
    if (!open || !leadId) return undefined;
    if (loadedLeadRef.current === leadId) return undefined;
    setContext(null); // never show a previous student's context
    return load(leadId);
  }, [open, leadId, load]);

  const loadingState = loading && !context && !error;

  const copyScript = useCallback(() => {
    const script = context?.generated?.openingScript;
    if (!script) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(script).catch(() => {});
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [context]);

  if (!open || !leadId) return null;

  // Minimized → a small launcher that reopens the panel in place.
  if (minimized) {
    return (
      <Box
        component="button"
        type="button"
        style={anchorStyle}
        onClick={() => setMinimized(false)}
        aria-label="Open Call Assist"
        title="Open Call Assist"
        sx={{
          zIndex: 1290,
          position: 'fixed',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.25,
          py: 0.6,
          borderRadius: '999px',
          border: 1,
          borderColor: 'primary.main',
          bgcolor: 'primary.main',
          color: '#fff',
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: 6,
          whiteSpace: 'nowrap',
          '&:hover': { bgcolor: 'primary.dark' },
        }}
      >
        <AutoAwesomeIcon sx={{ fontSize: 14 }} />
        Call Assist
      </Box>
    );
  }

  const previous = context?.previous;
  const generated = context?.generated;
  const profile = context?.profile;
  const current = context?.current;
  const journey = context?.journey;

  const studentFacts = [
    ['Intake', profile?.intake],
    ['Education', profile?.education],
    ['Country', profile?.country],
    ['Course', profile?.course],
    ['University', profile?.universities?.join(', ')],
    ['Lead Source', profile?.leadSource],
    ['Disposition', current?.disposition?.label || current?.disposition?.name || null],
    ['Status', current?.status],
    ['Stage', journey?.stage],
  ].filter(([, v]) => v != null && String(v).trim() !== '');

  const historyRows = (previous?.history || []).slice(0, 2);

  return (
    <Box
      ref={panelRef}
      role="dialog"
      aria-label="Call Assist"
      style={anchorStyle}
      sx={{
        position: 'fixed',
        zIndex: 1290,
        width: 356,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'min(72vh, 560px)',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2.5,
        boxShadow: 10,
        overflow: 'hidden',
        userSelect: dragging ? 'none' : undefined,
      }}
    >
      {/* ── Header (drag handle) ────────────────────────────── */}
      <Box
        onPointerDown={startDrag}
        onPointerMove={dragging ? onDragMove : undefined}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.25,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ✨ Call Assist
        </Typography>
        {context?.studentName && (
          <Typography sx={{ fontSize: 11, color: 'text.disabled', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {context.studentName}
            {context.referenceId ? ` · ${context.referenceId}` : ''}
          </Typography>
        )}
        <Box sx={{ ml: 'auto', flexShrink: 0 }}>
          <IconButton onClick={() => setMinimized(true)} size="small" aria-label="Minimize Call Assist" title="Minimize" sx={{ p: 0.5 }}>
            <RemoveIcon sx={{ fontSize: 15 }} />
          </IconButton>
          <IconButton onClick={onClose} size="small" aria-label="Close Call Assist" sx={{ p: 0.5 }}>
            <CloseIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Box>
      </Box>

      {/* ── Body ───────────────────────────────────────────── */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.25, py: 1 }}>
        {loadingState && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 3 }}>
            <CircularProgress size={16} />
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Preparing context…</Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, alignItems: 'flex-start', py: 1.5 }}>
            <Typography sx={{ fontSize: 12, color: 'error.main' }}>{error}</Typography>
            <Box
              component="button"
              type="button"
              onClick={() => { setContext(null); load(leadId); }}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, border: 1, borderColor: 'divider', borderRadius: '999px', px: 1, py: 0.4, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'text.secondary', bgcolor: 'background.paper' }}
            >
              <RefreshIcon sx={{ fontSize: 12 }} /> Retry
            </Box>
          </Box>
        )}

        {context && !loading && (
          <>
            {/* ── Opening script ─────────────────────────── */}
            {generated?.openingScript && (
              <Box sx={{ mb: 1.25 }}>
                <SectionHeading>Opening Script</SectionHeading>
                <Box sx={{ position: 'relative', bgcolor: 'primary.soft', border: 1, borderColor: 'primary.border', borderRadius: 1.5, p: 1, pr: 6 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'text.primary', lineHeight: 1.5 }}>
                    “{generated.openingScript}”
                  </Typography>
                  <Box
                    component="button"
                    type="button"
                    onClick={copyScript}
                    aria-label="Copy opening script"
                    title={copied ? 'Copied' : 'Copy opening script'}
                    sx={{
                      position: 'absolute', top: 6, right: 6, display: 'inline-flex', alignItems: 'center', gap: 0.4,
                      border: 'none', bgcolor: 'transparent', cursor: 'pointer', p: 0.4, borderRadius: 1,
                      color: copied ? 'success.main' : 'primary.main',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    {copied ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                  </Box>
                </Box>
              </Box>
            )}

            {/* ── Student context ────────────────────────── */}
            {studentFacts.length > 0 && (
              <Box sx={{ mb: 1.25 }}>
                <SectionHeading>Student Context</SectionHeading>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.35 }}>
                  {studentFacts.map(([label, valueCell]) => (
                    <Box key={label} component="span" title={`${label}: ${valueCell}`} sx={{ display: 'inline-flex', alignItems: 'center', height: 20, borderRadius: '999px', px: 0.75, fontSize: 11, fontWeight: 600, color: 'text.primary', bgcolor: 'grey.50', border: 1, borderColor: 'divider', whiteSpace: 'nowrap' }}>
                      <Box component="span" sx={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'text.disabled', mr: 0.5 }}>
                        {label}
                      </Box>
                      {valueCell}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* ── Previous context ───────────────────────── */}
            {(historyRows.length > 0 || previous?.scheduledCallback || (previous?.recentRemarks || []).length > 0) && (
              <Box sx={{ mb: 1.25 }}>
                <SectionHeading>Previous Context</SectionHeading>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
                  {historyRows.map((it, i) => (
                    <Box key={`h-${i}`} sx={{ fontSize: 11.5, lineHeight: 1.4, color: 'text.primary' }}>
                      <Typography component="span" sx={{ fontWeight: 700, fontSize: 11.5 }}>{it.disposition || 'Call'}</Typography>
                      <Typography component="span" sx={{ color: 'text.disabled' }}>
                        {it.calledAt ? ` · ${fmtDate(it.calledAt)}` : ''}
                        {it.durationSec > 0 ? ` · ${fmtDur(it.durationSec)}` : ''}
                      </Typography>
                      {it.remark && (
                        <Typography component="div" sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.1 }}>
                          {it.remark}
                        </Typography>
                      )}
                    </Box>
                  ))}
                  {previous?.scheduledCallback?.at && (
                    <Box sx={{ fontSize: 11.5, color: 'text.primary' }}>
                      <Typography component="span" sx={{ fontWeight: 700, fontSize: 11.5 }}>Callback scheduled</Typography>
                      <Typography component="span" sx={{ color: 'text.disabled' }}> · {fmtDate(previous.scheduledCallback.at)}</Typography>
                    </Box>
                  )}
                  {(previous?.recentRemarks || []).slice(0, 2).map((r, i) => (
                    <Box key={`r-${i}`} sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4 }}>
                      <Typography component="span" sx={{ color: 'text.disabled' }}>
                        {r.calledAt ? `${fmtDate(r.calledAt)} — ` : ''}
                      </Typography>
                      {r.text}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* ── Conversation focus ─────────────────────── */}
            {(generated?.conversationFocus || []).length > 0 && (
              <Box sx={{ mb: 1.25 }}>
                <SectionHeading>Conversation Focus</SectionHeading>
                <Box component="ul" sx={{ m: 0, pl: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                  {generated.conversationFocus.map((point) => (
                    <Typography component="li" key={point} sx={{ fontSize: 11.5, lineHeight: 1.4, color: 'text.primary' }}>
                      {point}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            {/* ── Next question ──────────────────────────── */}
            {generated?.nextQuestion && (
              <Box>
                <SectionHeading>Next Question</SectionHeading>
                <Box sx={{ bgcolor: 'grey.50', border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'text.primary', lineHeight: 1.5 }}>
                    “{generated.nextQuestion}”
                  </Typography>
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}