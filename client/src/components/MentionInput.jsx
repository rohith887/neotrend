import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, MenuItem, MenuList, Popover, TextField, Typography } from '@mui/material';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import { fetchMentionableUsers } from '../api/users.js';

/* ═══════════════════════════════════════════════════════════════════════
   MENTION INPUT — multiline text field with @mention autocomplete.

   Typing "@" opens a dropdown of the same active Agent / Counselor /
   Supervisor users every workspace uses. Selecting one inserts "@Full Name"
   into the text AND records the real user id so the saved remark keeps an
   identity link (the displayed text is never the source of truth — the id is).

   onChange(nextValue, mentionIds):
     • nextValue  — the edited text (typed mentions included)
     • mentionIds — the resolved user ids for every "@Name" in the text
       (picker-inserted mentions via their id; hand-typed names via an exact
       full-name match, then a first/last-name fallback), deduped, in text
       order. Senders send this array to the backend; invalid names simply
       produce no stored mention.
   ═══════════════════════════════════════════════════════════════════════ */

// An "@token" that may be in-progress at the caret — one or two name words.
// This is the FULL token including the leading "@" — used for ALL_TOKENS_RE.
const TOKEN_RE_FULL = /@([A-Za-z][A-Za-z'.]*)(?:\s+([A-Za-z][A-Za-z'.]*))? ?$/;

// Content-only match (no leading @) — used after slicing past the "@".
const TOKEN_RE_CONTENT = /^([A-Za-z][A-Za-z'.]*)(?:\s+([A-Za-z][A-Za-z'.]*))? ?$/;

// Every "@Token" present anywhere in a piece of text.
const ALL_TOKENS_RE = /@([A-Za-z][A-Za-z'.]*(?:\s+[A-Za-z][A-Za-z'.]*)?)/g;

const activeTokenAt = (value, cursorPos) => {
  if (cursorPos == null) return null;
  const before = value.slice(0, cursorPos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  const after = before.slice(atIdx + 1);
  const m = after.match(TOKEN_RE_CONTENT);
  if (!m) return null;
  return { atIdx, query: after.trim() };
};

export default function MentionInput({
  value = '',
  onChange,
  label = 'Remarks',
  placeholder = 'Type @ to mention a teammate…',
  minRows = 3,
  maxRows,
  disabled = false,
  size = 'medium',
  error = false,
  helperText,
}) {
  const [mentionable, setMentionable] = useState([]);
  const [mention, setMention] = useState(null); // { open, anchorEl, query, index }
  const inputRef = useRef(null);
  const nameToIdRef = useRef(new Map()); // display name → user id (picker-inserted)

  useEffect(() => {
    let cancelled = false;
    fetchMentionableUsers()
      .then((rows) => { if (!cancelled) setMentionable(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setMentionable([]); });
    return () => { cancelled = true; };
  }, []);

  // Resolve every "@Name" in the text to a real user id (deduped, text order).
  // Pickered mentions win; exact full-name matches and a first/last-name
  // fallback let hand-typed "@diya" still link to Diya's record.
  const deriveIds = (textValue) => {
    const ids = [];
    const seen = new Set();
    const lower = (s) => s.toLowerCase();
    const byFull = (token) => mentionable.find((u) => lower(u.name) === lower(token));
    const byPart = (token) =>
      mentionable.find((u) => {
        const first = lower(u.name.split(/\s+/)[0] || '');
        const last = lower(u.name.split(/\s+/).slice(-1)[0] || '');
        const t = lower(token);
        return t.length >= 3 && (first === t || last === t);
      });
    const re = new RegExp(ALL_TOKENS_RE.source, 'g');
    let m;
    while ((m = re.exec(textValue)) !== null) {
      const token = m[1];
      const id = nameToIdRef.current.get(token) || byFull(token)?.id || byPart(token)?.id;
      if (id && !seen.has(String(id))) {
        seen.add(String(id));
        ids.push(String(id));
      }
    }
    return ids;
  };

  const filtered = useMemo(() => {
    if (!mention?.open) return [];
    const tokens = (mention.query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const score = (u) => {
      if (!tokens.length) return 0;
      const words = u.name.toLowerCase().split(/\s+/).filter(Boolean);
      let s = 0;
      if (words.length >= tokens.length) {
        let ok = true;
        for (let i = 0; i < tokens.length; i += 1) {
          if (!words[i] || !words[i].startsWith(tokens[i])) { ok = false; break; }
          s += 2;
        }
        if (ok) return s;
      }
      for (const t of tokens) {
        if (u.name.toLowerCase().includes(t) || (u.email || '').toLowerCase().includes(t)) s += 1;
      }
      return s;
    };
    return mentionable
      .map((u) => ({ u, s: score(u) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.u)
      .slice(0, 10);
  }, [mentionable, mention]);

  const handleChange = (e) => {
    const nextValue = e.target.value;
    const pos = e.target.selectionStart;
    onChange?.(nextValue, deriveIds(nextValue));
    const tok = activeTokenAt(nextValue, pos);
    setMention((prev) =>
      tok
        ? { open: true, anchorEl: e.target, query: tok.query, index: 0 }
        : prev && { ...prev, open: false }
    );
  };

  const insertMention = (user) => {
    if (!mention || !user) { setMention((m) => (m ? { ...m, open: false } : m)); return; }
    const el = inputRef.current;
    const pos = el?.selectionStart ?? value.length;
    const atIdx = activeTokenAt(value, pos)?.atIdx ?? pos;
    const next = `${value.slice(0, atIdx)}@${user.name} ${value.slice(pos)}`;
    nameToIdRef.current.set(user.name, user.id);
    onChange?.(next, deriveIds(next));
    setMention({ ...mention, open: false });
    window.requestAnimationFrame(() => {
      if (el) {
        const caret = atIdx + user.name.length + 2;
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (!mention?.open || !filtered.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMention((m) => ({ ...m, index: (m.index + 1) % filtered.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMention((m) => ({ ...m, index: (m.index - 1 + filtered.length) % filtered.length }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered[mention.index]) {
        e.preventDefault();
        insertMention(filtered[mention.index]);
      } else if (e.key === 'Enter') {
        setMention((m) => ({ ...m, open: false }));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMention((m) => (m ? { ...m, open: false } : m));
    }
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <TextField
        label={label}
        placeholder={placeholder}
        multiline
        minRows={minRows}
        maxRows={maxRows}
        value={value}
        inputRef={inputRef}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        error={error}
        helperText={helperText}
        fullWidth
        size={size}
      />
      <Popover
        open={!!mention?.open && filtered.length > 0}
        anchorEl={mention?.open ? mention.anchorEl : null}
        onClose={() => setMention((m) => (m ? { ...m, open: false } : m))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            onMouseDown: (e) => e.preventDefault(), // keep textarea focus while clicking
            sx: { mt: 0.5, minWidth: 260, maxWidth: 320, py: 0.5, boxShadow: 3, border: 1, borderColor: 'divider' },
          },
        }}
      >
        <MenuList dense disablePadding>
          {filtered.map((user, idx) => {
            const active = idx === mention?.index;
            return (
              <MenuItem
                key={user.id}
                selected={active}
                onClick={() => insertMention(user)}
                onMouseEnter={() => setMention((m) => (m ? { ...m, index: idx } : m))}
                sx={{ fontSize: 12.5, gap: 1, '&.Mui-selected': { bgcolor: 'primary.soft' } }}
              >
                <AlternateEmailIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Box component="span" sx={{ display: 'block', fontWeight: 600, fontSize: 12.5 }}>{user.name}</Box>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 11, color: 'text.disabled' }}>
                    <Box component="span">{user.roleName || 'User'}</Box>
                    {user.email && <Typography component="span" sx={{ fontSize: 11, color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</Typography>}
                  </Box>
                </Box>
              </MenuItem>
            );
          })}
        </MenuList>
      </Popover>
    </Box>
  );
}