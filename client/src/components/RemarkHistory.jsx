import { useMemo } from 'react';
import { Box, Chip, Divider, Typography } from '@mui/material';
import ForumIcon from '@mui/icons-material/Forum';
import PersonIcon from '@mui/icons-material/Person';

/* ── Small helpers (kept local; same data shape as ActivityPanel) ────── */

const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const agentName = (it) => {
  if (!it.agent) return 'Agent';
  return [it.agent.firstName, it.agent.lastName].filter(Boolean).join(' ') || 'Agent';
};

const dispName = (it) => it.disposition?.name || it.dispositionName || '—';
const dispColor = (it) => it.disposition?.color || undefined;

function DispositionChip({ name, color }) {
  return (
    <Chip
      label={name}
      size="small"
      sx={{
        height: 18, fontSize: 10, fontWeight: 700, letterSpacing: '-0.01em',
        ...(color ? {
          color, border: `1px solid ${color}`, backgroundColor: `${color}18`,
        } : {
          color: 'text.secondary', border: 1, borderColor: 'divider', backgroundColor: 'action.hover',
        }),
      }}
    />
  );
}

/* ── Section header ──────────────────────────────────────────────────── */
function SectionHeader({ icon, title }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', pt: 1.5, pb: 0.75 }}>
      <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
        {icon}
      </Box>
      <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </Typography>
    </Box>
  );
}

// Highlight "@Name" tokens that resolve to a real stored mention (matched
// against the interaction's `mentionedUsers` snapshot — the identity link,
// never the raw title text). Plain "@text" left untouched stays plain text.
const MENTION_TOKEN_RE = /@([A-Za-z][A-Za-z'.]*(?:\s+[A-Za-z][A-Za-z'.]*)?)/g;

function MentionedText({ text, mentions }) {
  const mentionsByName = useMemo(() => {
    const map = new Map();
    (mentions || []).forEach((m) => {
      if (m && m.name) {
        const key = m.name.toLowerCase();
        if (!map.has(key)) map.set(key, m);
      }
    });
    return map;
  }, [mentions]);

  const source = text || '';

  const nodes = useMemo(() => {
    const out = [];
    const re = new RegExp(MENTION_TOKEN_RE.source, 'g');
    let last = 0;
    let m;
    let k = 0;
    while ((m = re.exec(source)) !== null) {
      if (m.index > last) out.push(source.slice(last, m.index));
      const hit = mentionsByName.get(m[1].toLowerCase());
      if (hit) {
        out.push(
          <Box
            component="span"
            key={`mention-${k++}`}
            title={hit.role ? `${hit.name} · ${hit.role}` : hit.name}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              bgcolor: 'primary.soft',
              color: 'primary.main',
              borderRadius: 0.75,
              px: 0.5,
              fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            @{hit.name}
          </Box>
        );
      } else {
        out.push(m[0]);
      }
      last = m.index + m[0].length;
    }
    if (last < source.length) out.push(source.slice(last));
    return out;
  }, [source, mentionsByName]);

  return <>{nodes}</>;
}

/* ── Remark History — compact chronological list (newest first) ─────── */
export default function RemarkHistory({ interactions = [], maxHeight = 220, fill = false, scrollable = true }) {
  const remarks = useMemo(() => {
    return [...(interactions || [])]
      .filter((it) => it.remarks && it.remarks.trim())
      .sort((a, b) => new Date(b.calledAt || b.createdAt || 0) - new Date(a.calledAt || a.createdAt || 0));
  }, [interactions]);

  return (
    <Box sx={fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : undefined}>
      <Divider sx={{ mt: 1.5 }} />
      <SectionHeader icon={<ForumIcon sx={{ fontSize: 13 }} />} title="Remark History" />
      {fill ? (
        <Box sx={{ flex: 1, minHeight: 0, mt: 0.5 }}>
          {remarks.length === 0 ? (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography sx={{ fontSize: 11.5, color: 'text.disabled', textAlign: 'center', lineHeight: 1.4 }}>
                No remarks yet — notes from saved dispositions appear here.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: '100%', minHeight: 0, overflowY: 'auto', pr: 0.25 }}>
              {remarks.map((it) => (
                <Box key={it._id} sx={{
                  border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 0.75,
                  display: 'flex', flexDirection: 'column', gap: 0.375,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'space-between' }}>
                    <DispositionChip name={dispName(it)} color={dispColor(it)} />
                    <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>{fmtDateTime(it.calledAt || it.createdAt)}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 12, color: 'text.primary', lineHeight: 1.45, wordBreak: 'break-word' }}>
                    <MentionedText text={it.remarks} mentions={it.mentionedUsers} />
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PersonIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                    <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{agentName(it)}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <Box sx={{ mt: 0.5 }}>
          {remarks.length === 0 ? (
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', py: 1, lineHeight: 1.4 }}>
              No remarks yet — notes from saved dispositions appear here.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pr: 0.25, ...(scrollable ? { maxHeight, overflowY: 'auto' } : {}) }}>
              {remarks.map((it) => (
                <Box key={it._id} sx={{
                  border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 0.75,
                  display: 'flex', flexDirection: 'column', gap: 0.375,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'space-between' }}>
                    <DispositionChip name={dispName(it)} color={dispColor(it)} />
                    <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>{fmtDateTime(it.calledAt || it.createdAt)}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 12, color: 'text.primary', lineHeight: 1.45, wordBreak: 'break-word' }}>
                    <MentionedText text={it.remarks} mentions={it.mentionedUsers} />
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PersonIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                    <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{agentName(it)}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
