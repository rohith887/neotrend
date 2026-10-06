import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AppDialog from '../../ui/mui/AppDialog.jsx';
import PrimaryButton from '../../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';
import { useShortlist } from '../../hooks/useShortlist.js';
import { createApplication } from '../../api/applications.js';

/* ==========================================================================
   SHORTLIST PANEL — the student's university shortlist inside Student 360.
   Plain-text rows (no pills), inline status/priority editing, per-entry
   notes, soft remove, and a single Confirm action that marks every active
   entry Confirmed and sets the student's next action to "Start Application"
   (the lifecycle stage itself does not advance).
   ========================================================================== */

const STATUS_OPTIONS = ['Considering', 'Shortlisted', 'Confirmed', 'Rejected', 'Removed'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const authorName = (note) => {
  const a = note?.createdBy;
  if (!a) return '';
  return [a.firstName, a.lastName].filter(Boolean).join(' ');
};

export default function ShortlistPanel({ lead, onLeadUpdated, onApplicationStarted }) {
  const shortlist = useShortlist(lead?._id);

  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [noteFor, setNoteFor] = useState(null); // entry being annotated
  const [noteText, setNoteText] = useState('');

  const run = async (universityId, fn) => {
    setBusyId(universityId);
    setRowError(null);
    try {
      const result = await fn();
      // Adding can advance the lifecycle (PREFERENCES → UNIVERSITY_SHORTLIST);
      // confirming returns an updated lead — surface both to the workspace.
      if (result?.lead) onLeadUpdated?.(result.lead);
      return result;
    } catch (err) {
      setRowError(err?.response?.data?.message || err?.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusChange = (entry, status) =>
    run(String(entry.university?._id), () => shortlist.update(entry.university._id, { status }));

  const handlePriorityChange = (entry, priority) =>
    run(String(entry.university?._id), () => shortlist.update(entry.university._id, { priority }));

  const handleRemove = (entry) =>
    run(String(entry.university?._id), () => shortlist.remove(entry.university._id));

  const openNote = (entry) => {
    setNoteFor(entry);
    setNoteText('');
  };

  const saveNote = async () => {
    if (!noteText.trim() || !noteFor) return;
    await run(String(noteFor.university?._id), () =>
      shortlist.update(noteFor.university._id, { note: noteText.trim() })
    );
    setNoteFor(null);
    setNoteText('');
  };

  const handleConfirmAll = async () => {
    setConfirming(true);
    setRowError(null);
    try {
      const result = await shortlist.confirmAll();
      if (result?.lead) onLeadUpdated?.(result.lead);
      setConfirmOpen(false);
    } catch (err) {
      setRowError(err?.response?.data?.message || err?.message || 'Confirm failed');
    } finally {
      setConfirming(false);
    }
  };

  const removedEntries = shortlist.entries.filter((e) => e.status === 'Removed');
  const confirmable = shortlist.pendingCount > 0;

  /* ── Start Application (confirmed entries only) ──────────────── */
  const [startEntry, setStartEntry] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [startResult, setStartResult] = useState(null);

  const openStartApplication = (entry) => {
    setStartEntry(entry);
    setStartError(null);
    setStartResult(null);
  };

  const handleStartApplication = async () => {
    if (!startEntry) return;
    setStarting(true);
    setStartError(null);
    try {
      const result = await createApplication(lead._id, startEntry._id);
      setStartResult(result?.application ?? null);
      if (result?.lead) onLeadUpdated?.(result.lead); // lifecycle advanced to APPLICATION
      shortlist.refetch();
      onApplicationStarted?.(); // refresh the workspace applications cache
    } catch (err) {
      setStartError(err?.response?.data?.message || err?.message || 'Could not start the application');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Shortlist · {shortlist.activeEntries.length}
        </Typography>
        <PrimaryButton
          size="small"
          disabled={!confirmable || confirming}
          onClick={() => setConfirmOpen(true)}
          startIcon={<CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
          sx={{ textTransform: 'none', fontSize: 12 }}
        >
          Confirm Shortlist
        </PrimaryButton>
      </Box>

      {(rowError || shortlist.error) && (
        <Alert severity="warning" sx={{ mb: 1.25, fontSize: 12.5 }}>
          {rowError || String(shortlist.error?.message || shortlist.error)}
        </Alert>
      )}

      {shortlist.loading && shortlist.entries.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 3 }}>
          <CircularProgress size={18} />
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Loading shortlist…</Typography>
        </Box>
      ) : shortlist.activeEntries.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 2.5, textAlign: 'center' }}>
          No universities on this student&apos;s shortlist yet. Use the Find Universities tab to add some.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {shortlist.activeEntries.map((entry) => {
            const uni = entry.university ?? {};
            const uid = String(uni._id ?? entry.university);
            const busy = busyId === uid;
            return (
              <Box
                key={uid}
                sx={{
                  borderTop: 1, borderColor: 'divider', px: 1.25, py: 0.875,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap title={uni.institutionName} sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
                      {uni.institutionName || 'University'}
                      {!uni.isActive && (
                        <Typography component="span" sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 400 }}> · inactive</Typography>
                      )}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 11, color: 'text.disabled', lineHeight: 1.5 }}>
                      Added {fmtDate(entry.createdAt)} · {[uni.country?.name, uni.city].filter(Boolean).join(' · ') || ''}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                    {entry.status === 'Confirmed' && (
                      <PrimaryButton
                        size="small"
                        onClick={() => openStartApplication(entry)}
                        sx={{ textTransform: 'none', fontSize: 11.5, px: 1.25, minWidth: 0 }}
                      >
                        Start Application
                      </PrimaryButton>
                    )}
                    <TextField
                      select
                      size="small"
                      label="Priority"
                      value={entry.priority || 'Medium'}
                      onChange={(e) => handlePriorityChange(entry, e.target.value)}
                      disabled={busy}
                      SelectProps={{ sx: { fontSize: 12 } }}
                      InputLabelProps={{ shrink: true, sx: { fontSize: 10.5 } }}
                      sx={{ width: 96, '& .MuiInputBase-input': { pt: 1.4, pb: 0.5, fontSize: 12 } }}
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <MenuItem key={p} value={p}>{p}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      size="small"
                      label="Status"
                      value={entry.status}
                      onChange={(e) => handleStatusChange(entry, e.target.value)}
                      disabled={busy}
                      SelectProps={{ sx: { fontSize: 12 } }}
                      InputLabelProps={{ shrink: true, sx: { fontSize: 10.5 } }}
                      sx={{ width: 116, '& .MuiInputBase-input': { pt: 1.4, pb: 0.5, fontSize: 12 } }}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <MenuItem key={s} value={s}>{s}</MenuItem>
                      ))}
                    </TextField>
                    <SecondaryButton
                      size="small"
                      title="Add note"
                      onClick={() => openNote(entry)}
                      startIcon={<NoteAddOutlinedIcon sx={{ fontSize: 13 }} />}
                      sx={{ minWidth: 0, px: 1 }}
                    >
                      Note{entry.notes?.length ? ` (${entry.notes.length})` : ''}
                    </SecondaryButton>
                    <Button
                      size="small"
                      color="error"
                      disabled={busy}
                      onClick={() => handleRemove(entry)}
                      startIcon={<DeleteOutlineOutlinedIcon sx={{ fontSize: 13 }} />}
                      sx={{ textTransform: 'none', fontSize: 12, minWidth: 0, px: 1 }}
                    >
                      Remove
                    </Button>
                  </Box>
                </Box>

                {/* Notes history — plain text lines */}
                {entry.notes?.length > 0 && (
                  <Box sx={{ mt: 0.5, pl: 0.5 }}>
                    {entry.notes.map((n, i) => (
                      <Typography key={n._id ?? i} sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.6 }}>
                        “{n.text}” — {authorName(n) || 'Unknown'}{n.createdAt ? `, ${fmtDate(n.createdAt)}` : ''}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {removedEntries.length > 0 && (
        <Typography sx={{ fontSize: 11, color: 'text.disabled', px: 1.25, pt: 1 }}>
          {removedEntries.length} previously removed {removedEntries.length === 1 ? 'university is' : 'universities are'} kept in history.
        </Typography>
      )}

      {/* ── Confirm dialog ──────────────────────────────────────── */}
      <AppDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="sm"
        title="Confirm shortlist?"
      >
        <Typography sx={{ fontSize: 13, lineHeight: 1.6 }}>
          All entries currently Considering or Shortlisted ({shortlist.pendingCount})
          will be marked Confirmed, and the student&apos;s next action will be set to
          &quot;Start Application&quot;. The pipeline stage itself does not change.
        </Typography>
        <DialogActions sx={{ px: 0, pt: 2 }}>
          <SecondaryButton size="small" onClick={() => setConfirmOpen(false)} disabled={confirming}>
            Cancel
          </SecondaryButton>
          <PrimaryButton size="small" loading={confirming} onClick={handleConfirmAll} disabled={!confirmable}>
            Confirm {shortlist.pendingCount} {shortlist.pendingCount === 1 ? 'Entry' : 'Entries'}
          </PrimaryButton>
        </DialogActions>
      </AppDialog>

      {/* ── Start Application (compact creation flow) ───────────── */}
      <AppDialog
        open={!!startEntry}
        onClose={() => { if (!starting) setStartEntry(null); }}
        size="sm"
        title="Start Application"
      >
        {startResult ? (
          <>
            <Typography sx={{ fontSize: 13, lineHeight: 1.6 }}>
              Application created for <Box component="strong" sx={{ fontWeight: 700 }}>{startEntry?.university?.institutionName}</Box>.
            </Typography>
            <DialogActions sx={{ px: 0, pt: 2 }}>
              <PrimaryButton size="small" onClick={() => setStartEntry(null)}>Done</PrimaryButton>
            </DialogActions>
          </>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 0.6, columnGap: 2, pb: 1.5 }}>
              {[
                ['Student', lead?.studentName || '—'],
                ['University', startEntry?.university?.institutionName || '—'],
                ['Shortlist', startEntry ? `Confirmed · ${startEntry.priority || 'Medium'} priority` : '—'],
                ['Owner', 'You'],
              ].map(([k, v]) => (
                <Box key={k} sx={{ display: 'contents' }}>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{k}</Typography>
                  <Typography noWrap title={v} sx={{ fontSize: 12.5, fontWeight: k === 'University' ? 600 : 500 }}>{v}</Typography>
                </Box>
              ))}
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.6 }}>
              The application starts in <strong>Draft</strong> status and the student&apos;s
              journey moves to the application stage. University details come from the
              university record — nothing needs re-entering.
            </Typography>
            {(startError) && (
              <Typography sx={{ fontSize: 12, color: 'error.dark', pt: 1 }}>{startError}</Typography>
            )}
            <DialogActions sx={{ px: 0, pt: 2 }}>
              <SecondaryButton size="small" disabled={starting} onClick={() => setStartEntry(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton size="small" loading={starting} onClick={handleStartApplication}>
                Create Application
              </PrimaryButton>
            </DialogActions>
          </>
        )}
      </AppDialog>

      {/* ── Note dialog ─────────────────────────────────────────── */}
      <AppDialog
        open={!!noteFor}
        onClose={() => { setNoteFor(null); setNoteText(''); }}
        size="sm"
        title={`Note — ${noteFor?.university?.institutionName ?? ''}`}
      >
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          placeholder="Why is this university on / off the list?"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          sx={{ '& .MuiOutlinedInput-input': { fontSize: 13 } }}
        />
        <DialogActions sx={{ px: 0, pt: 2 }}>
          <SecondaryButton size="small" onClick={() => { setNoteFor(null); setNoteText(''); }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton size="small" disabled={!noteText.trim()} onClick={saveNote}>
            Save Note
          </PrimaryButton>
        </DialogActions>
      </AppDialog>
    </Box>
  );
}
