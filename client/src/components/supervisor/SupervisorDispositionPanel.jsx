import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Divider, MenuItem, MenuList, TextField, Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import PersonIcon from '@mui/icons-material/Person';
import SendIcon from '@mui/icons-material/Send';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import { addCounselorNote, fetchCounselorNotes } from '../../api/leads.js';
import { fetchSupervisorUsers } from '../../api/supervisor.js';

/* ==========================================================================
   SUPERVISOR DISPOSITION PANEL — LEFT 35% of the Supervisor workspace.
   A read-mostly review of the student's workflow state plus a lightweight
   remark/comment surface. It deliberately does NOT include the agent
   call/disposition workflow. The panel is one unified REMARKS HISTORY:
     REMARKS HISTORY → a single chronological trail merging disposition /
                       remark events (interactions + lead.dispositionHistory)
                       with the existing supervisor-notes record
     COMMENT INPUT   → the existing counselor-notes API (SUPERVISOR-allowed)
                       at the bottom; added comments are appended, never
                       overwritten. Sits at the bottom WITHOUT its own
                       section heading.
   This is a presentation/UX-only layer — the server still enforces the
   permission boundaries (POST via the existing counselor-notes endpoint,
   which only SUPERVISOR and the assigned counselor may call).
   ========================================================================== */

const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const userDisplayName = (u) => {
  if (!u || typeof u === 'string') return 'Supervisor';
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Supervisor';
};

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

export default function SupervisorDispositionPanel({ lead, interactions = [] }) {
  const [notes, setNotes] = useState([]);
  const [, setLoadingNotes] = useState(false);
  const [noteError, setNoteError] = useState(null);

  const [text, setText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState(null);

  // ── @mention autocomplete ──────────────────────────────────────
  const [agents, setAgents] = useState([]);
  const [mention, setMention] = useState(null); // { open, anchor, query, index }
  const noteRef = useRef(null);
  const menuRef = useRef(null);
  // name → user id of mentions inserted via the picker, so the backend can
  // identify recipients by ID (not only by display name).
  const mentionIdsRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    // Supervisor can mention any CRM user: Agent + Counselor + Supervisor.
    // Fetch each relevant role (same user directory the panel already uses)
    // and merge — so "@" / "@T" searches across the whole CRM, not just
    // Agents. Each entry carries its real user id + role for downstream
    // notification routing.
    Promise.all([
      fetchSupervisorUsers({ role: 'AGENT' }),
      fetchSupervisorUsers({ role: 'COUNSELOR' }),
      fetchSupervisorUsers({ role: 'SUPERVISOR' }),
    ])
      .then(([agents, counselors, supervisors]) => {
        if (cancelled) return;
        const seen = new Map();
        for (const row of [...(agents || []), ...(counselors || []), ...(supervisors || [])]) {
          if (row && row.id && !seen.has(row.id)) seen.set(row.id, row);
        }
        setAgents([...seen.values()]);
      })
      .catch(() => { if (!cancelled) setAgents([]); });
    return () => { cancelled = true; };
  }, []);

  const filteredAgents = useMemo(() => {
    if (!mention?.open) return [];
    // Show every agent as soon as "@" is typed so the supervisor can always
    // pick one. The partial query is only used to rank/order, never to hide.
    const tokens = (mention.query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const score = (a) => {
      const name = (a.name || '').toLowerCase();
      const email = (a.email || '').toLowerCase();
      const words = name.split(/\s+/).filter(Boolean);
      let s = 0;
      // Prefix-match query tokens against name words, in order.
      if (words.length >= tokens.length) {
        let ok = true;
        for (let i = 0; i < tokens.length; i += 1) {
          if (!words[i] || !words[i].startsWith(tokens[i])) { ok = false; break; }
          s += 2;
        }
        if (ok) return s;
      }
      // Partial credit for any token that appears anywhere in name/email.
      for (const t of tokens) {
        if (name.includes(t) || email.includes(t)) s += 1;
      }
      return s;
    };
    return agents
      .map((a) => ({ a, s: score(a) }))
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a)
      .slice(0, 10);
  }, [agents, mention]);

  // Find an active "@token" ending at the current cursor position.
  // Captures a partial/full agent name (first, or first + last) that ends
  // exactly at the cursor, optionally with a trailing single space (so
  // filtering keeps working while the supervisor types the last name). Any
  // other text (or moving past the mention) closes it.
  const activeMentionToken = (value, cursorPos) => {
    if (cursorPos == null) return null;
    const before = value.slice(0, cursorPos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) return null;
    const after = before.slice(atIdx + 1);
    const m = after.match(/^([A-Za-z][A-Za-z'.]*)(?:\s+([A-Za-z][A-Za-z'.]*))? ?$/);
    if (!m) return null;
    return { atIdx, query: after.trim() };
  };

  const handleNoteChange = (e) => {
    const value = e.target.value;
    const pos = e.target.selectionStart;
    setText(value);
    const tok = activeMentionToken(value, pos);
    if (tok) {
      setMention({ open: true, query: tok.query, index: 0, selectionStart: pos });
    } else {
      setMention((m) => (m ? { ...m, open: false } : m));
    }
  };

  const insertMention = (agent) => {
    if (!mention) return;
    const pos = mention.selectionStart;
    const atIdx = activeMentionToken(text, pos)?.atIdx ?? pos;
    const next = `${text.slice(0, atIdx)}@${agent.name} ${text.slice(pos)}`;
    setText(next);
    mentionIdsRef.current.set(agent.name, agent.id);
    setMention({ ...mention, open: false });
    window.requestAnimationFrame(() => {
      const el = noteRef.current;
      if (el) {
        const caret = atIdx + agent.name.length + 2;
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  };

  const handleNoteKeyDown = (e) => {
    if (!mention?.open || !filteredAgents.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMention((m) => ({ ...m, index: (m.index + 1) % filteredAgents.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMention((m) => ({ ...m, index: (m.index - 1 + filteredAgents.length) % filteredAgents.length }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const target = filteredAgents[mention.index];
      if (target) {
        e.preventDefault();
        insertMention(target);
      } else if (e.key === 'Enter') {
        setMention((m) => ({ ...m, open: false }));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMention((m) => ({ ...m, open: false }));
    }
  };

  // Close the mention dropdown when clicking outside of it.
  useEffect(() => {
    const onDocPointer = (ev) => {
      if (menuRef.current && noteRef.current &&
          !menuRef.current.contains(ev.target) && !noteRef.current.contains(ev.target)) {
        setMention((m) => (m ? { ...m, open: false } : m));
      }
    };
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, []);

  const runFetchNotes = async (leadId) => {
    if (!leadId) return;
    setLoadingNotes(true);
    setNoteError(null);
    try {
      const loaded = await fetchCounselorNotes(leadId);
      setNotes(loaded || []);
    } catch (e) {
      setNoteError(e?.response?.data?.message || 'Could not load notes');
    } finally {
      setLoadingNotes(false);
    }
  };

  useEffect(() => {
    if (lead?._id) runFetchNotes(lead._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?._id]);

  // ── Unified activity timeline ─────────────────────────────────────
  // A single disposition save writes ONE underlying event to BOTH the
  // `interactions` collection (Interaction doc: disposition + remarks +
  // agent + calledAt) AND a `lead.dispositionHistory` audit entry (same
  // dispositionName + note + changedBy + changedAt). Rendering the two
  // collections as separate sections therefore showed the same activity
  // twice. Here we merge them into ONE chronological list where each event
  // appears once: interactions are the canonical populated activity records,
  // and dispositionHistory entries that have NO matching interaction (e.g.
  // New Enquiry, Callback Rescheduled) are added as their own events.
  // Matching is by disposition identity + timestamp (both written together
  // in the same save handler, within seconds) — never by string.
  const activityHistory = useMemo(() => {
    const dhList = lead?.dispositionHistory ?? [];
    const intList = interactions ?? [];

    const ts = (e) => new Date(e?.changedAt || e?.calledAt || e?.createdAt || 0).getTime();

    // Canonical events from interactions (agent + disposition populated).
    const events = intList.map((it) => ({
      key: String(it._id),
      kind: 'interaction',
      dispName: it.disposition?.name || it.dispositionName || '—',
      dispColor: it.disposition?.color || undefined,
      note: it.remarks || '',
      user: it.agent,
      ts: ts(it),
    }));

    // Fold in dispositionHistory entries that are not already the same event.
    for (const dh of dhList) {
      const dhName = dh.dispositionName || dh.disposition?.name || '';
      const dhTs = ts(dh);
      // Same underlying event if an interaction shares the disposition name
      // AND occurred at effectively the same moment.
      const dup = events.some(
        (e) => e.dispName === dhName && Math.abs(e.ts - dhTs) < 5000,
      );
      if (dup) continue;
      events.push({
        key: String(dh._id || `${dhName}-${dhTs}`),
        kind: 'disposition',
        dispName: dhName || '—',
        dispColor: dh.disposition?.color || undefined,
        note: dh.note || '',
        user: dh.changedBy,
        ts: dhTs,
      });
    }

    return events.sort((a, b) => b.ts - a.ts);
  }, [interactions, lead]);

  // ── Unified remarks history ──────────────────────────────────────
  // The single REMARKS HISTORY list merges the disposition/remark/activity
  // timeline above with the supervisor-notes record into one chronological
  // stream — every existing entry appears exactly once.
  const remarksList = useMemo(() => {
    const items = activityHistory.map((a) => ({
      key: `hist-${a.key}`,
      kind: a.kind,
      dispName: a.dispName,
      dispColor: a.dispColor,
      note: a.note,
      by: userDisplayName(a.user),
      ts: a.ts,
    }));
    for (const n of notes) {
      items.push({
        key: `note-${n._id || n.createdAt}`,
        kind: 'note',
        dispName: null,
        dispColor: null,
        note: n.text,
        by: userDisplayName(n.createdBy),
        ts: new Date(n.createdAt || 0).getTime(),
      });
    }
    return items.sort((a, b) => b.ts - a.ts);
  }, [activityHistory, notes]);

  const handleAddNote = async () => {
    const trimmed = text.trim();
    if (!trimmed || !lead?._id || savingNote) return;
    setSavingNote(true);
    setNoteSaveError(null);
    try {
      const ids = [];
      // Collect user ids for every "@Name" present in the note. Mentions
      // inserted via the picker carry their real id; unknowns are left to the
      // backend's name-based resolver.
      for (const name of Array.from(text.matchAll(/@([A-Za-z][A-Za-z'.]*(?:\s+[A-Za-z][A-Za-z'.]*)?)/g))) {
        const resolved = mentionIdsRef.current.get(name[1]);
        if (resolved) ids.push(resolved);
      }
      await addCounselorNote(lead._id, { text: trimmed, category: 'general', mentionedUserIds: ids.length ? ids : undefined });
      setText('');
      await runFetchNotes(lead._id);
    } catch (e) {
      setNoteSaveError(e?.response?.data?.message || 'Could not save note');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* ── Unified remarks history (disposition + remark + note events) ── */}
      <Box sx={{ px: 1.5, pt: 1.25 }}>
        <SectionHeader icon={<HistoryIcon sx={{ fontSize: 13 }} />} title="Remarks History" />
        {remarksList.length === 0 ? (
          <Typography sx={{ fontSize: 11.5, color: 'text.disabled', py: 0.5, lineHeight: 1.4 }}>
            No remarks yet. Disposition remarks and supervisor notes will appear here.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {remarksList.map((r) =>
              r.kind === 'note' ? (
                <Box key={r.key} sx={{
                  border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 0.75,
                  display: 'flex', flexDirection: 'column', gap: 0.375, bgcolor: 'action.hover',
                }}>
                  <Typography sx={{ fontSize: 11.5, color: 'text.primary', lineHeight: 1.45, wordBreak: 'break-word' }}>
                    {r.note}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PersonIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                      <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{r.by}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>{fmtDateTime(new Date(r.ts))}</Typography>
                  </Box>
                </Box>
              ) : (
                <Box key={r.key} sx={{
                  border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 0.75,
                  display: 'flex', flexDirection: 'column', gap: 0.375,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'space-between' }}>
                    <Chip label={r.dispName} size="small" sx={{
                      height: 18, fontSize: 10, fontWeight: 700,
                      ...(r.dispColor
                        ? { color: r.dispColor, border: `1px solid ${r.dispColor}`, backgroundColor: `${r.dispColor}18` }
                        : { color: 'text.secondary', border: 1, borderColor: 'divider', backgroundColor: 'action.hover' }),
                    }} />
                    <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>{fmtDateTime(new Date(r.ts))}</Typography>
                  </Box>
                  {r.note && (
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {r.note}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PersonIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                    <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{r.by}</Typography>
                  </Box>
                </Box>
              )
            )}
          </Box>
        )}
      </Box>

      {/* ── Divider before the comment input ──────────────────────── */}
      <Divider sx={{ mt: 1.5 }} />

      {/* ── Remark input + Add note (existing API, no section heading) ── */}
      <Box sx={{ px: 1.5, pt: 1 }}>
        {noteError && (
          <Typography sx={{ fontSize: 11.5, color: 'error.main', py: 0.5 }}>{noteError}</Typography>
        )}
        <Box component="form"
          sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pb: 1.5 }}
          onSubmit={(e) => { e.preventDefault(); handleAddNote(); }}>
          <Box sx={{ position: 'relative' }}>
            <TextField
              multiline
              minRows={2}
              maxRows={4}
              value={text}
              inputRef={noteRef}
              onChange={handleNoteChange}
              onKeyDown={handleNoteKeyDown}
              placeholder="@Agent, @Counselor or @Supervisor to mention · add a supervisor note / remark…"
              fullWidth
              size="small"
              disabled={savingNote}
              sx={{ '& .MuiInputBase-input': { fontSize: 12.5 } }}
            />
            {mention?.open && filteredAgents.length > 0 && (
              <Box
                ref={menuRef}
                role="listbox"
                aria-label="Mention a user"
                sx={{
                  position: 'absolute',
                  top: '100%',
                  mt: 0.25,
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  boxShadow: 3,
                  py: 0.5,
                }}
              >
                <MenuList dense disablePadding autoFocusItem={false}>
                  {filteredAgents.map((agent, idx) => {
                    const active = idx === mention.index;
                    return (
                      <MenuItem
                        key={agent.id}
                        selected={active}
                        onClick={() => insertMention(agent)}
                        onMouseEnter={() => setMention((m) => ({ ...m, index: idx }))}
                        sx={{ fontSize: 12.5, gap: 1, '&.Mui-selected': { bgcolor: 'primary.soft' } }}
                      >
                        <AlternateEmailIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                        <Box sx={{ minWidth: 0 }}>
                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box component="span" sx={{ fontWeight: 600, fontSize: 12.5 }}>{agent.name}</Box>
                            {agent.role && agent.role !== '—' ? (
                              <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: 'primary.main', bgcolor: 'primary.soft', borderRadius: 0.75, px: 0.5, py: 0.1, lineHeight: 1.4 }}>{agent.role}</Box>
                            ) : null}
                          </Box>
                          <Box component="span" sx={{ display: 'block', fontSize: 11, color: 'text.disabled' }}>{agent.role && agent.role !== '—' ? agent.role : agent.email}</Box>
                        </Box>
                      </MenuItem>
                    );
                  })}
                </MenuList>
              </Box>
            )}
          </Box>
          {noteSaveError && (
            <Typography sx={{ fontSize: 11.5, color: 'error.main' }}>{noteSaveError}</Typography>
          )}
          <Button
            variant="contained"
            color="primary"
            size="small"
            type="submit"
            disabled={savingNote || !text.trim()}
            startIcon={savingNote ? <CircularProgress size={14} color="inherit" /> : <SendIcon sx={{ fontSize: 14 }} />}
            sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 600 }}
          >
            Add note
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
