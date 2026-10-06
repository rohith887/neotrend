import { useEffect, useRef, useState } from 'react';
import { Box, Chip, Paper, Popover, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import HistoryIcon from '@mui/icons-material/History';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import { addLeadTag, removeLeadTag } from '../api/leads.js';
import { useToast } from '../context/ToastContext.jsx';


const TAG_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

const TAG_SUGGESTIONS = [
  'Urgent', 'VIP', 'Follow Up', 'Escalate', 'Payment Pending',
  'Documents Missing', 'Decision Needed', 'Re-Contact', 'Unresponsive', 'Hot Lead',
];

const nameOf = (p) => {
  if (!p || typeof p !== 'object') return '';
  const n = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return n || p.name || p.email || '';
};

const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const ms = Math.max(0, now - d.getTime());
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

function readableText(hex) {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 6 ? parseInt(h, 16) : 0x6366f1;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? 'rgba(28,28,36,0.92)' : '#ffffff';
}

const tagStyle = (color) => ({
  bgcolor: color,
  color: readableText(color),
  borderColor: 'transparent',
  fontWeight: 600,
  '& .MuiChip-label': { px: 1 },
  '& .MuiChip-deleteIcon': { color: 'inherit', opacity: 0.75, '&:hover': { opacity: 1 } },
  '&:hover': { bgcolor: color, opacity: 0.92 },
});

const smallChip = {
  height: 22,
  fontSize: 11,
  '& .MuiChip-label': { px: 1 },
  '& .MuiChip-icon': { fontSize: 13 },
};

const HEADER_MAX_VISIBLE = 2;

export default function TagsBar({ lead, readOnly = false, onChange, variant = 'card' }) {
  const { push } = useToast();
  const addAnchorRef = useRef(null);
  const historyAnchorRef = useRef(null);

  const [tags, setTags] = useState(lead?.tags ?? []);
  const [history, setHistory] = useState(lead?.tagHistory ?? []);
  const [busy, setBusy] = useState(false);

  const [addAnchor, setAddAnchor] = useState(null);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [historyAnchor, setHistoryAnchor] = useState(null);

  const leadId = lead?._id ?? lead?.id ?? null;

  // Resync from the lead whenever its embedded tag data changes (e.g. the
  // parent refetches a fresh copy — tags added by another role appear here).
  const tagsKey = JSON.stringify(lead?.tags ?? null);
  const historyKey = JSON.stringify(lead?.tagHistory ?? null);
  useEffect(() => {
    if (tagsKey !== 'null') setTags(JSON.parse(tagsKey));
    if (historyKey !== 'null') setHistory(JSON.parse(historyKey));
  }, [tagsKey, historyKey, leadId]);

  const sync = (tagsData, historyData) => {
    const t = tagsData ?? [];
    const h = historyData ?? [];
    setTags(t);
    setHistory(h);
    onChange?.({ tags: t, history: h });
  };

  const handleAdd = async (nextLabel, nextColor) => {
    if (!leadId || busy) return;
    const trimmed = String(nextLabel ?? '').trim();
    if (!trimmed) return;
    if (String(trimmed).length > 40) {
      push('Tag label must be 40 characters or fewer', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await addLeadTag(leadId, { label: trimmed, color: nextColor || color });
      sync(res?.tags, res?.history);
      setLabel('');
      push(`Tag “${trimmed}” added`, 'success');
    } catch (e) {
      push(e?.response?.data?.message || e?.message || 'Could not add tag', 'danger');
    } finally {
      setBusy(false);
      setAddAnchor(null);
    }
  };

  const handleRemove = async (tag) => {
    if (!leadId || busy) return;
    setBusy(true);
    try {
      const res = await removeLeadTag(leadId, tag._id);
      sync(res?.tags, res?.history);
      push(`Tag “${tag.label}” removed`, 'info');
    } catch (e) {
      push(e?.response?.data?.message || e?.message || 'Could not remove tag', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const canEdit = !readOnly && !!leadId;

  const flat = variant === 'toolbar' || variant === 'header';

  return (
    <Box
      sx={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        ...(variant === 'header'
          ? { flexWrap: 'nowrap', overflow: 'hidden', minWidth: 0 }
          : { flexWrap: 'wrap' }),
        px: variant === 'header' ? 0 : flat ? 0.5 : 1.5,
        py: flat ? 0.5 : 0.625,
        ...(flat
          ? { border: 'none', borderRadius: 0, boxShadow: 'none' }
          : { border: 1, borderColor: 'divider', borderRadius: 1.5, boxShadow: 'xs' }),
      }}
    >
      {/* Label */}
      {variant !== 'header' && (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mr: 0.25 }}>
          <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
            <LocalOfferIcon sx={{ fontSize: 12 }} />
          </Box>
          Tags
          {tags.length > 0 && (
            <Box component="span" sx={{ color: 'text.disabled' }}>{tags.length}</Box>
          )}
        </Box>
      )}

      {/* Active tag chips */}
      {tags.length === 0 && variant !== 'header' && (
        <Typography sx={{ fontSize: 11.5, color: 'text.disabled', fontWeight: 500 }}>No tags yet</Typography>
      )}
      {(variant === 'header'
        ? tags.slice(0, HEADER_MAX_VISIBLE)
        : tags
      ).map((t) => (
        <Chip
          key={t._id}
          size="small"
          label={t.label}
          sx={{
            ...tagStyle(t.color),
            ...(variant === 'header' ? { height: 18, fontSize: 10, flexShrink: 0, '& .MuiChip-label': { px: 0.9 } } : {}),
          }}
          onDelete={canEdit && !busy ? () => handleRemove(t) : undefined}
          title={t.createdBy ? `Added by ${nameOf(t.createdBy)}` : `Added by unspecified user`}
        />
      ))}
      {variant === 'header' && tags.length > HEADER_MAX_VISIBLE && (
        <Chip
          size="small"
          label={`+${tags.length - HEADER_MAX_VISIBLE}`}
          variant="outlined"
          onClick={() => setAddAnchor(addAnchor ? null : addAnchorRef.current)}
          ref={addAnchorRef}
          sx={{
            ...smallChip,
            height: 18, fontSize: 10, flexShrink: 0,
            color: 'text.secondary', fontWeight: 600,
            '& .MuiChip-label': { px: 0.8 },
          }}
        />
      )}

      {/* Add affordance */}
      {canEdit && (
        <Chip
          size="small"
          icon={<AddIcon sx={{ fontSize: 14 }} />}
          label={variant === 'header' ? '' : 'Add'}
          variant="outlined"
          onClick={() => setAddAnchor(addAnchor ? null : addAnchorRef.current)}
          ref={addAnchorRef}
          sx={{
            ...smallChip,
            ...(variant === 'header' ? { height: 18, flexShrink: 0, '& .MuiChip-label': { px: 0.5 } } : {}),
            borderStyle: 'dashed',
            color: 'text.secondary',
            fontWeight: 600,
            '& .MuiChip-icon': { color: 'primary.main', fontSize: 14, mb: '1px' },
            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
          }}
        />
      )}

      {/* Audit history drawer */}
      {history.length > 0 && (
        <Chip
          size="small"
          icon={<HistoryIcon sx={{ fontSize: 13 }} />}
          label={`${history.length} event${history.length === 1 ? '' : 's'}`}
          variant="outlined"
          onClick={() => setHistoryAnchor(historyAnchor ? null : historyAnchorRef.current)}
          ref={historyAnchorRef}
          sx={{
            ...smallChip,
            ...(variant === 'header' ? { height: 18, flexShrink: 0 } : {}),
            display: variant === 'header' ? 'none' : 'inline-flex',
            color: 'text.disabled',
            '& .MuiChip-icon': { color: 'text.disabled', fontSize: 13 },
          }}
        />
      )}

      {/* ── Add-tag popover ───────────────────────────────────── */}
      <Popover
        open={Boolean(addAnchor)}
        anchorEl={addAnchor}
        onClose={() => setAddAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.5, boxShadow: 4, border: 1, borderColor: 'divider', borderRadius: 1.5 } } }}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <Paper sx={{ width: 268, p: 1.25, boxShadow: 'none', border: 'none' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary', mb: 1 }}>Add a tag</Typography>

          <TextField
            autoFocus
            size="small"
            fullWidth
            placeholder="Tag label (e.g. Urgent)"
            value={label}
            disabled={busy}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd(label, color);
              }
            }}
            inputProps={{ maxLength: 40 }}
            sx={{ '& .MuiOutlinedInput-input': { fontSize: 13, py: 0.85 } }}
          />

          {/* Color swatches */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
            {TAG_COLORS.map((c) => (
              <Box
                key={c}
                component="button"
                type="button"
                disabled={busy}
                onClick={() => setColor(c)}
                aria-label={`Tag color ${c}`}
                sx={{
                  width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', p: 0,
                  bgcolor: c, border: 'none', flexShrink: 0,
                  outline: color === c ? `2px solid ${readableText(c) === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.35)'}` : 'none',
                  outlineOffset: 2,
                  boxShadow: color === c ? 0 : `0 0 0 1px rgba(0,0,0,0.12)`,
                  '&:hover': { opacity: 0.85 },
                }}
              />
            ))}
          </Box>

          {/* Quick-add suggestions */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {TAG_SUGGESTIONS.map((s) => (
              <Chip
                key={s}
                size="small"
                label={s}
                variant="outlined"
                disabled={busy}
                onClick={() => handleAdd(s, color)}
                sx={{
                  height: 22, fontSize: 11,
                  '& .MuiChip-label': { px: 0.9 },
                  color: 'text.secondary',
                  '&:hover': { borderColor: 'primary.main', color: 'primary.main', bgcolor: 'primary.soft' },
                }}
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75, mt: 1.25 }}>
            <Box
              component="button"
              type="button"
              onClick={() => setAddAnchor(null)}
              sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.secondary', bgcolor: 'transparent', border: 'none', cursor: 'pointer', px: 1, py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'grey.50' } }}
            >
              Cancel
            </Box>
            <Box
              component="button"
              type="button"
              disabled={busy || !String(label).trim()}
              onClick={() => handleAdd(label, color)}
              sx={{
                fontSize: 11.5, fontWeight: 700, color: '#fff', bgcolor: 'primary.main',
                border: 'none', cursor: 'pointer', px: 1.5, py: 0.5, borderRadius: 1,
                boxShadow: 1,
                '&:hover': { bgcolor: 'primary.hover' },
                '&:disabled': { opacity: 0.45, cursor: 'default' },
              }}
            >
              Add Tag
            </Box>
          </Box>
        </Paper>
      </Popover>

      {/* ── History popover ───────────────────────────────────── */}
      <Popover
        open={Boolean(historyAnchor)}
        anchorEl={historyAnchor}
        onClose={() => setHistoryAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 0.5, boxShadow: 4, border: 1, borderColor: 'divider', borderRadius: 1.5 } } }}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <Paper sx={{ width: 300, maxHeight: 320, overflowY: 'auto', p: 1, boxShadow: 'none', border: 'none' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary', px: 0.75, py: 0.5 }}>
            Tag history
          </Typography>
          {[...history].reverse().map((h, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex', alignItems: 'flex-start', gap: 0.75,
                px: 0.75, py: 0.5, borderRadius: 1,
                '&:hover': { bgcolor: 'grey.50' },
              }}
            >
              <Box component="span" sx={{ display: 'inline-flex', mt: 0.25, flexShrink: 0, color: h.action === 'added' ? 'success.main' : 'error.main' }} aria-hidden="true">
                {h.action === 'added' ? <AddCircleOutlineRoundedIcon sx={{ fontSize: 14 }} /> : <RemoveCircleOutlineRoundedIcon sx={{ fontSize: 14 }} />}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    component="span"
                    title={h.action === 'added' ? `Added ${h.label}` : `Removed ${h.label}`}
                    sx={{
                      display: 'inline-block', px: 0.6, py: '1px', borderRadius: '999px',
                      fontSize: 10, fontWeight: 700, lineHeight: 1.5, bgcolor: h.color,
                      color: readableText(h.color), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180,
                    }}
                  >
                    {h.label}
                  </Box>
                  <Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {h.action}
                  </Box>
                </Box>
                <Typography sx={{ fontSize: 10.5, color: 'text.secondary', lineHeight: 1.4 }}>
                  by {nameOf(h.performedBy) || 'Unknown'} · {fmtWhen(h.performedAt)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Paper>
      </Popover>
    </Box>
  );
}