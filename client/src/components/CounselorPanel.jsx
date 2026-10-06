import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, TextField, Skeleton, Chip, Alert,
  LinearProgress,
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DescriptionIcon from '@mui/icons-material/Description';
import EventNoteIcon from '@mui/icons-material/EventNote';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import InventoryIcon from '@mui/icons-material/Inventory';
import PersonIcon from '@mui/icons-material/Person';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import TimelineIcon from '@mui/icons-material/Timeline';
import SendIcon from '@mui/icons-material/Send';
import SaveIcon from '@mui/icons-material/Save';
import { AppCard, AppTabs, PrimaryButton, StatusChip } from '../ui/mui/index.js';
import { fetchInteractions, createInteraction, updateCounselorStatus, addCounselorNote, fetchCounselorNotes } from '../api/leads.js';
import { useDispositions } from '../api/useDispositions.js';
import { useToast } from '../context/ToastContext.jsx';
import { useCounselor } from '../context/CounselorContext.jsx';

/* ==========================================================================
   COUNSELOR PANEL — renders in the left column (where CallDock lives for
   agents). Provides the same 7-tab counselor workspace but in a compact
   single-column layout that fits the left column width (360px).
   ========================================================================== */

const WORKSPACE_TABS = [
  { id: 'overview',     label: 'Overview',     icon: <PersonIcon sx={{ fontSize: 14 }} /> },
  { id: 'counseling',   label: 'Counseling',   icon: <AssignmentIcon sx={{ fontSize: 14 }} /> },
  { id: 'registration', label: 'Reg',           icon: <PersonAddAlt1Icon sx={{ fontSize: 14 }} /> },
  { id: 'documents',    label: 'Docs',          icon: <DescriptionIcon sx={{ fontSize: 14 }} /> },
  { id: 'applications', label: 'Apps',          icon: <InventoryIcon sx={{ fontSize: 14 }} /> },
  { id: 'visa',         label: 'Visa',          icon: <FlightTakeoffIcon sx={{ fontSize: 14 }} /> },
  { id: 'activity',     label: 'Activity',      icon: <TimelineIcon sx={{ fontSize: 14 }} /> },
];

const REG_OPTIONS = [
  { label: 'Not Started', value: '' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed',   value: 'completed' },
];

const DOC_OPTIONS = [
  { label: 'Not Started', value: '' },
  { label: 'Gathering',   value: 'gathering' },
  { label: 'Submitted',   value: 'submitted' },
  { label: 'Verified',    value: 'verified' },
];

const APP_OPTIONS = [
  { label: 'Not Started',    value: '' },
  { label: 'Draft',          value: 'draft' },
  { label: 'Submitted',      value: 'submitted' },
  { label: 'Under Review',   value: 'under-review' },
  { label: 'Offer Received', value: 'offer-received' },
  { label: 'Accepted',       value: 'accepted' },
  { label: 'Rejected',       value: 'rejected' },
];

const VISA_OPTIONS = [
  { label: 'Not Started',       value: '' },
  { label: 'Gathering Docs',    value: 'gathering' },
  { label: 'Application Filed', value: 'filed' },
  { label: 'Interview Scheduled', value: 'interview' },
  { label: 'Visa Received',     value: 'received' },
  { label: 'Visa Denied',       value: 'denied' },
];

const NOTE_CATEGORIES = [
  { label: 'General',      value: 'general' },
  { label: 'Registration', value: 'registration' },
  { label: 'Documents',    value: 'documents' },
  { label: 'Application',  value: 'application' },
  { label: 'Visa',         value: 'visa' },
];

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const InfoRow = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.4 }}>
    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
    <Typography sx={{ fontSize: 12, fontWeight: 500, textAlign: 'right', maxWidth: '55%' }}>{value || '—'}</Typography>
  </Box>
);

/* ── Overview Tab ─────────────────────────────────────────────────── */
function OverviewTab({ student }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>Personal</Typography>
        <InfoRow label="Name" value={student.studentName} />
        <InfoRow label="Ref ID" value={student.referenceId} />
        <InfoRow label="Mobile" value={student.mobile} />
        <InfoRow label="Email" value={student.email} />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>Academic</Typography>
        <InfoRow label="Education" value={student.highestEducation} />
        <InfoRow label="College" value={student.collegeName} />
        <InfoRow label="GPA" value={student.gpa} />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>Journey</Typography>
        <InfoRow label="Registration" value={student.registrationStatus || 'Not started'} />
        <InfoRow label="Documents" value={student.documentStatus || 'Not started'} />
        <InfoRow label="Application" value={student.applicationStatus || 'Not started'} />
        <InfoRow label="Visa" value={student.visaStatus || 'Not started'} />
      </Box>
    </Box>
  );
}

/* ── Counseling Tab ───────────────────────────────────────────────── */
function CounselingTab({ student }) {
  const { push } = useToast();
  const { resetCallStatus } = useCounselor();
  const { dispositions, loading: dispLoading } = useDispositions();
  const [interactions, setInteractions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [dispositionId, setDispositionId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const data = await fetchInteractions(student._id);
        if (!cancel) setInteractions(Array.isArray(data) ? data : []);
      } catch { if (!cancel) setInteractions([]); }
      finally { if (!cancel) setLoadingHistory(false); }
    })();
    return () => { cancel = true; };
  }, [student._id]);

  const handleSubmit = useCallback(async () => {
    if (!dispositionId || !student._id) return;
    setSubmitting(true);
    try {
      await createInteraction({
        leadId: student._id,
        dispositionId,
        remarks: remarks.trim() || undefined,
        callbackDate: callbackDate || undefined,
        callbackTime: callbackTime || undefined,
      });
      push('Remark logged successfully', 'success');
      resetCallStatus();
      setRemarks(''); setCallbackDate(''); setCallbackTime(''); setDispositionId('');
      const data = await fetchInteractions(student._id);
      setInteractions(Array.isArray(data) ? data : []);
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to log remark', 'danger');
    } finally { setSubmitting(false); }
  }, [student._id, dispositionId, remarks, callbackDate, callbackTime, push, resetCallStatus]);

  const selectedDisp = dispositions.find((d) => d.id === dispositionId);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Log Note</Typography>
      {submitting && <LinearProgress sx={{ mb: 0.5 }} />}
      <TextField
        select
        label="Disposition"
        size="small"
        value={dispositionId}
        onChange={(e) => setDispositionId(e.target.value)}
        disabled={dispLoading}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        fullWidth
      >
        <option value="">Select Disposition</option>
        {dispositions.map((d) => <option key={d.id} value={d.id}>{d.label || d.name}</option>)}
      </TextField>
      <TextField label="Remarks" multiline rows={2} size="small" fullWidth value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Counseling notes..." />
      {selectedDisp?.requiresCallback && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField label="Date" type="date" size="small" sx={{ flex: 1 }} InputLabelProps={{ shrink: true }} value={callbackDate} onChange={(e) => setCallbackDate(e.target.value)} />
          <TextField label="Time" type="time" size="small" sx={{ flex: 1 }} InputLabelProps={{ shrink: true }} value={callbackTime} onChange={(e) => setCallbackTime(e.target.value)} />
        </Box>
      )}
      <PrimaryButton onClick={handleSubmit} disabled={submitting || !dispositionId} startIcon={<SendIcon sx={{ fontSize: 15 }} />} size="small">
        {submitting ? 'Saving...' : 'Log Remark'}
      </PrimaryButton>

      {loadingHistory ? (
        <Box sx={{ pt: 1 }}>{[1, 2].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
      ) : interactions.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1, mb: 0.5 }}>Recent History</Typography>
          {interactions.slice(0, 5).map((ix) => (
            <Box key={ix._id} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 'none' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                <Chip label={ix.dispositionName || '—'} size="small" sx={{ height: 18, fontSize: 10 }} />
                <Typography sx={{ fontSize: 10, color: 'text.secondary', ml: 'auto' }}>{fmtTime(ix.calledAt)}</Typography>
              </Box>
              {ix.remarks && <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4 }}>{ix.remarks}</Typography>}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/* ── Status Editor Tab (Registration / Documents / Applications / Visa) ── */
function StatusEditorTab({ student, field, options, title, description }) {
  const { push } = useToast();
  const [status, setStatus] = useState(student[field] || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateCounselorStatus(student._id, { [field]: status || null });
      push(`${title} status updated`, 'success');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to update status', 'danger');
    } finally { setSaving(false); }
  }, [student._id, field, status, title, push]);

  return (
    <Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1.5 }}>{description}</Typography>
      {saving && <LinearProgress sx={{ mb: 1 }} />}
      <TextField
        select
        label={`${title} Status`}
        size="small"
        fullWidth
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </TextField>
      <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
        <PrimaryButton onClick={handleSave} disabled={saving} startIcon={<SaveIcon sx={{ fontSize: 15 }} />} size="small">
          {saving ? 'Saving...' : 'Save'}
        </PrimaryButton>
        {saved && <Typography sx={{ fontSize: 11, color: 'success.main' }}>Saved</Typography>}
      </Box>
    </Box>
  );
}

/* ── Activity Tab ─────────────────────────────────────────────────── */
function ActivityTab({ student }) {
  const { push } = useToast();
  const [notes, setNotes] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState('general');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [n, ix] = await Promise.all([
        fetchCounselorNotes(student._id),
        fetchInteractions(student._id),
      ]);
      setNotes(Array.isArray(n) ? n : []);
      setInteractions(Array.isArray(ix) ? ix : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [student._id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddNote = useCallback(async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await addCounselorNote(student._id, { text: noteText.trim(), category: noteCategory });
      push('Note added', 'success');
      setNoteText('');
      const n = await fetchCounselorNotes(student._id);
      setNotes(Array.isArray(n) ? n : []);
    } catch (err) {
      push(err?.response?.data?.message || 'Failed to add note', 'danger');
    } finally { setSaving(false); }
  }, [student._id, noteText, noteCategory, push]);

  const timeline = [
    ...notes.map((n) => ({
      id: `note-${n._id || n.createdAt}`,
      type: 'note',
      title: `Note (${n.category || 'general'})`,
      detail: n.text,
      time: n.createdAt,
    })),
    ...interactions.map((ix) => ({
      id: `ix-${ix._id}`,
      type: 'interaction',
      title: ix.dispositionName || 'Call logged',
      detail: ix.remarks || '',
      time: ix.calledAt,
    })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Note</Typography>
      <TextField
        select
        label="Category"
        size="small"
        value={noteCategory}
        onChange={(e) => setNoteCategory(e.target.value)}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        fullWidth
      >
        {NOTE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </TextField>
      <TextField label="Note" multiline rows={2} size="small" fullWidth value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note..." />
      <PrimaryButton onClick={handleAddNote} disabled={saving || !noteText.trim()} startIcon={<SendIcon sx={{ fontSize: 15 }} />} size="small">
        {saving ? 'Saving...' : 'Add Note'}
      </PrimaryButton>

      {loading ? (
        <Box sx={{ pt: 1 }}>{[1, 2].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
      ) : timeline.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1, mb: 0.5 }}>Timeline</Typography>
          {timeline.slice(0, 8).map((item) => (
            <Box key={item.id} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 'none' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                <Chip label={item.type === 'note' ? 'Note' : item.title} size="small" sx={{ height: 18, fontSize: 10 }} color={item.type === 'note' ? 'info' : 'default'} />
                <Typography sx={{ fontSize: 10, color: 'text.secondary', ml: 'auto' }}>{fmtTime(item.time)}</Typography>
              </Box>
              {item.detail && <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4 }}>{item.detail}</Typography>}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COUNSELOR PANEL
   ═══════════════════════════════════════════════════════════════════ */
export default function CounselorPanel({ student }) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!student) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', py: 4, px: 2, gap: '4px', color: 'text.disabled' }}>
        <PersonIcon sx={{ fontSize: 34, opacity: 0.5 }} />
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.secondary' }}>No Student Selected</Typography>
        <Typography sx={{ fontSize: 12.5, maxWidth: 260, lineHeight: 1.5 }}>Select a student from My Students to open their workspace.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Student identity header */}
      <Box sx={{ px: 1.5, pt: 1.5, pb: 0, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <Box
            sx={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, bgcolor: 'primary.soft', color: 'primary.main',
            }}
          >
            {String(student.studentName || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {student.studentName || 'Student'}
            </Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled', lineHeight: 1.2 }}>
              {student.referenceId || ''} {student.mobile ? `· ${student.mobile}` : ''}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.75 }}>
          {student.status && <StatusChip status={student.status} size="small" sx={{ height: 18, fontSize: 10 }} />}
          {student.registrationStatus && <Chip label={`Reg: ${student.registrationStatus}`} size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
          {student.documentStatus && <Chip label={`Docs: ${student.documentStatus}`} size="small" color="info" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
          {student.applicationStatus && <Chip label={`App: ${student.applicationStatus}`} size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
          {student.visaStatus && <Chip label={`Visa: ${student.visaStatus}`} size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
        </Box>
      </Box>

      {/* Tabs */}
      <AppTabs
        tabs={WORKSPACE_TABS}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Counselor workspace"
        sx={{ flexShrink: 0, px: 1.5, borderBottom: 1, borderColor: 'divider', minHeight: 0, '& .MuiTab-root': { minHeight: 36, py: 0, fontSize: 11.5 } }}
      />

      {/* Tab content — scrolls */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, py: 1.5 }}>
        {activeTab === 'overview'     && <OverviewTab student={student} />}
        {activeTab === 'counseling'   && <CounselingTab student={student} />}
        {activeTab === 'registration' && (
          <StatusEditorTab student={student} field="registrationStatus" options={REG_OPTIONS} title="Registration" description="Track registration progress with TASA and the university." />
        )}
        {activeTab === 'documents' && (
          <StatusEditorTab student={student} field="documentStatus" options={DOC_OPTIONS} title="Documents" description="Track document collection, submission, and verification." />
        )}
        {activeTab === 'applications' && (
          <StatusEditorTab student={student} field="applicationStatus" options={APP_OPTIONS} title="Application" description="Track university application from draft to offer." />
        )}
        {activeTab === 'visa' && (
          <StatusEditorTab student={student} field="visaStatus" options={VISA_OPTIONS} title="Visa" description="Track visa progress from gathering to approval." />
        )}
        {activeTab === 'activity'     && <ActivityTab student={student} />}
      </Box>
    </Box>
  );
}
