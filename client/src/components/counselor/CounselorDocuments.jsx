import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { DataTable, SearchField, FilterSelect, StatusChip, PrimaryButton, SecondaryButton } from '../../ui/mui/index.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import {
  fetchDocumentQueue,
  fetchLeadDocuments,
  fetchDocumentSummary,
  createDocument,
  updateDocument,
  deleteDocument,
} from '../../api/documents.js';

const DOC_TYPES = [
  'Passport', 'Academic Transcripts', 'Degree Certificate',
  'GRE Score', 'GMAT Score', 'IELTS Score', 'TOEFL Score', 'PTE Score',
  'SOP', 'LOR', 'Resume / CV', 'Financial Documents', 'Bank Statements',
  'Medical Reports', 'Other',
];

const DOC_CATEGORIES = [
  'identity', 'academic', 'financial', 'test-score', 'application', 'visa', 'other',
];

const DOC_STATUS_OPTIONS = [
  { label: 'Missing', value: 'missing' },
  { label: 'Received', value: 'received' },
  { label: 'Under Review', value: 'under-review' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
];

const STATUS_TONE = {
  missing: 'warning',
  received: 'info',
  'under-review': 'primary',
  verified: 'success',
  rejected: 'danger',
};

const INITIAL_CHECKLIST = [
  { documentType: 'Passport', category: 'identity', required: true },
  { documentType: 'Academic Transcripts', category: 'academic', required: true },
  { documentType: 'Degree Certificate', category: 'academic', required: true },
  { documentType: 'SOP', category: 'application', required: true },
  { documentType: 'LOR', category: 'application', required: true },
  { documentType: 'Resume / CV', category: 'application', required: true },
  { documentType: 'Financial Documents', category: 'financial', required: true },
  { documentType: 'Bank Statements', category: 'financial', required: true },
];

const QUEUE_STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Under Review', value: 'underReview' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
];

const STAGE_CHIP_SX = { height: 22, fontSize: 11, fontWeight: 500, '& .MuiChip-label': { px: 0.75 } };

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ── Queue columns ──────────────────────────────────────────────────── */
function buildQueueColumns({ onView }) {
  return [
    {
      key: 'studentName',
      label: 'Student',
      sortable: true,
      width: 190,
      render: (v, row) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'text.primary' }}>
            {v || '—'}
          </Typography>
          {row.lead?.referenceId && (
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: 'monospace', lineHeight: 1.4, letterSpacing: '0.02em' }}>
              {row.lead.referenceId}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'completionPct',
      label: 'Completion',
      sortable: true,
      width: 130,
      render: (v) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 110 }}>
          <LinearProgress
            variant="determinate"
            value={v || 0}
            sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: 'grey.200' }}
            color={v >= 80 ? 'success' : v >= 50 ? 'warning' : 'error'}
          />
          <Typography sx={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
            {v ?? 0}%
          </Typography>
        </Box>
      ),
    },
    {
      key: 'missingDocuments',
      label: 'Missing',
      sortable: true,
      width: 85,
      align: 'center',
      render: (v) => v > 0
        ? <StatusChip status={`${v} Missing`} tone="warning" variant="outlined" dot={false} sx={STAGE_CHIP_SX} />
        : <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>0</Typography>,
    },
    {
      key: 'underReviewDocuments',
      label: 'Review',
      sortable: true,
      width: 85,
      align: 'center',
      render: (v) => v > 0
        ? <StatusChip status={`${v} Review`} tone="info" variant="outlined" dot={false} sx={STAGE_CHIP_SX} />
        : <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>0</Typography>,
    },
    {
      key: 'verifiedDocuments',
      label: 'Verified',
      sortable: true,
      width: 85,
      align: 'center',
      render: (v) => <Typography sx={{ fontSize: 12, fontWeight: 600, color: v > 0 ? 'success.main' : 'text.disabled' }}>{v ?? 0}</Typography>,
    },
    {
      key: 'rejectedDocuments',
      label: 'Rejected',
      sortable: true,
      width: 85,
      align: 'center',
      render: (v) => v > 0
        ? <StatusChip status={`${v} Rejected`} tone="danger" variant="outlined" dot={false} sx={STAGE_CHIP_SX} />
        : <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>0</Typography>,
    },
    {
      key: 'lastUpdated',
      label: 'Updated',
      sortable: true,
      width: 90,
      render: (v) => <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{fmtDate(v)}</Typography>,
    },
    {
      key: '_action',
      label: '',
      width: 64,
      render: (_, row) => (
        <PrimaryButton size="small" onClick={(e) => { e.stopPropagation(); onView(row); }} sx={{ minWidth: 0, px: 1.5, fontSize: 11.5 }}>
          View
        </PrimaryButton>
      ),
    },
  ];
}

/* ── Detail document columns ────────────────────────────────────────── */
function buildDocColumns({ onStatusChange, onEdit, onDelete }) {
  return [
    { key: 'documentType', label: 'Document', sortable: true, strong: true, width: 150 },
    { key: 'documentName', label: 'Name', sortable: true, render: (v) => <Typography sx={{ fontSize: 12, color: v ? 'text.primary' : 'text.disabled' }}>{v || '—'}</Typography> },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      width: 100,
      render: (v) => <StatusChip status={v || 'other'} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />,
    },
    {
      key: 'required',
      label: 'Req.',
      align: 'center',
      width: 50,
      render: (v) => v ? <CheckCircleIcon sx={{ fontSize: 15, color: 'success.main' }} /> : <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>—</Typography>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: 140,
      render: (v, row) => (
        <TextField
          select size="small" value={v || 'missing'}
          onChange={(e) => onStatusChange(row._id, e.target.value)}
          sx={{ minWidth: 130, fontSize: 12 }}
          SelectProps={{ sx: { fontSize: 12, py: 0 } }}
        >
          {DOC_STATUS_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 13 }}>
              <StatusChip status={opt.label} size="small" tone={STATUS_TONE[opt.value]} />
            </MenuItem>
          ))}
        </TextField>
      ),
    },
    {
      key: 'uploadedAt',
      label: 'Uploaded',
      sortable: true,
      width: 95,
      render: (v) => <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{fmtDate(v)}</Typography>,
    },
    {
      key: 'verifiedAt',
      label: 'Verified',
      sortable: true,
      width: 95,
      render: (v) => <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{fmtDate(v)}</Typography>,
    },
    {
      key: 'rejectionReason',
      label: 'Rejection',
      render: (v) => v
        ? (
          <Tooltip title={v} arrow placement="top">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, maxWidth: 140 }}>
              <InfoOutlinedIcon sx={{ fontSize: 13, color: 'error.main', flexShrink: 0 }} />
              <Typography sx={{ fontSize: 11, color: 'error.main', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v}
              </Typography>
            </Box>
          </Tooltip>
        )
        : <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>—</Typography>,
    },
    {
      key: '_actions',
      label: '',
      width: 70,
      render: (_, row) => (
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(row); }}>
            <EditIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(row._id); }} color="error">
            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      ),
    },
  ];
}

/* ── Add Document Dialog ────────────────────────────────────────────── */
function AddDocumentDialog({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ documentType: '', documentName: '', category: 'other', required: true });
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (open) setForm({ documentType: '', documentName: '', category: 'other', required: true });
  }, [open]);

  const valid = form.documentType.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Add Document</DialogTitle>
      <DialogContent sx={{ pt: '16px !important' }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <TextField
              select fullWidth size="small" label="Document Type"
              value={form.documentType} onChange={(e) => set('documentType', e.target.value)}
            >
              {DOC_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth size="small" label="Document Name (optional)"
              value={form.documentName} onChange={(e) => set('documentName', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 8 }}>
            <TextField
              select fullWidth size="small" label="Category"
              value={form.category} onChange={(e) => set('category', e.target.value)}
            >
              {DOC_CATEGORIES.map((c) => <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 4 }} sx={{ display: 'flex', alignItems: 'center' }}>
            <Button
              variant={form.required ? 'contained' : 'outlined'}
              color={form.required ? 'primary' : 'inherit'}
              size="small"
              fullWidth
              onClick={() => set('required', !form.required)}
              sx={{ height: 40 }}
            >
              {form.required ? 'Required' : 'Optional'}
            </Button>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={!valid || loading} loading={loading} onClick={() => onSubmit(form)}>
          Add
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  );
}

/* ── Edit Document Dialog ───────────────────────────────────────────── */
function EditDocumentDialog({ open, doc, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ documentType: '', documentName: '', category: 'other', required: true });
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (doc) setForm({
      documentType: doc.documentType || '',
      documentName: doc.documentName || '',
      category: doc.category || 'other',
      required: doc.required ?? true,
    });
  }, [doc]);

  const valid = form.documentType.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Edit Document</DialogTitle>
      <DialogContent sx={{ pt: '16px !important' }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <TextField
              select fullWidth size="small" label="Document Type"
              value={form.documentType} onChange={(e) => set('documentType', e.target.value)}
            >
              {DOC_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth size="small" label="Document Name (optional)"
              value={form.documentName} onChange={(e) => set('documentName', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 8 }}>
            <TextField
              select fullWidth size="small" label="Category"
              value={form.category} onChange={(e) => set('category', e.target.value)}
            >
              {DOC_CATEGORIES.map((c) => <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 4 }} sx={{ display: 'flex', alignItems: 'center' }}>
            <Button
              variant={form.required ? 'contained' : 'outlined'}
              color={form.required ? 'primary' : 'inherit'}
              size="small"
              fullWidth
              onClick={() => set('required', !form.required)}
              sx={{ height: 40 }}
            >
              {form.required ? 'Required' : 'Optional'}
            </Button>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={!valid || loading} loading={loading} onClick={() => onSubmit(doc._id, form)}>
          Save
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  );
}

/* ── Main Component ─────────────────────────────────────────────────── */
export default function CounselorDocuments() {
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selected, setSelected] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docSummary, setDocSummary] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  /* debounce search */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* fetch queue */
  const queueParamsKey = `search=${debouncedSearch}&status=${statusFilter}`;

  const fetchQueue = useCallback(async () => {
    const params = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    const res = await fetchDocumentQueue(params);
    return res;
  }, [debouncedSearch, statusFilter]);

  const { data: queueData, error: queueError, loading: queueLoading } = useCachedFetch(`counselor-documents:${queueParamsKey}`, fetchQueue, { refetchInterval: 30000 });

  const queue = queueData?.students || [];
  const queueSummary = queueData?.summary || null;
  const displayError = error || queueError;

  /* fetch student detail */
  const loadDetail = useCallback(async (leadId) => {
    setDetailLoading(true);
    try {
      const [docsRes, sumRes] = await Promise.all([
        fetchLeadDocuments(leadId),
        fetchDocumentSummary(leadId),
      ]);
      setDocs(docsRes || []);
      setDocSummary(sumRes || null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load documents');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadDetail(selected.lead._id);
  }, [selected, loadDetail]);

  /* handlers */
  const handleSelectStudent = (row) => setSelected(row);
  const handleBack = () => { setSelected(null); setDocs([]); setDocSummary(null); };

  const handleStatusChange = useCallback(async (docId, status) => {
    try {
      await updateDocument(docId, { status });
      setDocs((prev) => prev.map((d) => d._id === docId ? { ...d, status } : d));
      if (selected) loadDetail(selected.lead._id);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update status');
    }
  }, [selected, loadDetail]);

  const handleAddDocument = useCallback(async (form) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await createDocument({ lead: selected.lead._id, ...form });
      setAddOpen(false);
      await loadDetail(selected.lead._id);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to add document');
    } finally {
      setSubmitting(false);
    }
  }, [selected, loadDetail]);

  const handleEditDocument = useCallback(async (docId, form) => {
    setSubmitting(true);
    try {
      await updateDocument(docId, form);
      setEditOpen(false);
      setEditDoc(null);
      if (selected) await loadDetail(selected.lead._id);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update document');
    } finally {
      setSubmitting(false);
    }
  }, [selected, loadDetail]);

  const handleDeleteDocument = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      await deleteDocument(confirmDelete);
      setConfirmDelete(null);
      if (selected) await loadDetail(selected.lead._id);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete document');
    }
  }, [confirmDelete, selected, loadDetail]);

  const handleInitializeChecklist = useCallback(async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await Promise.all(
        INITIAL_CHECKLIST.map((item) =>
          createDocument({ lead: selected.lead._id, status: 'missing', ...item })
        )
      );
      await loadDetail(selected.lead._id);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to initialize checklist');
    } finally {
      setSubmitting(false);
    }
  }, [selected, loadDetail]);

  /* queue table columns */
  const queueColumns = useMemo(
    () => buildQueueColumns({ onView: handleSelectStudent }),
    []
  );

  /* detail table columns */
  const docColumns = useMemo(
    () => buildDocColumns({
      onStatusChange: handleStatusChange,
      onEdit: (doc) => { setEditDoc(doc); setEditOpen(true); },
      onDelete: (docId) => setConfirmDelete(docId),
    }),
    [handleStatusChange]
  );

  /* ── Render: List View ──────────────────────────────────────────── */
  if (!selected) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ flexShrink: 0, pt: 2, pb: 1.5, px: 0.5 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
            Documents
          </Typography>
        </Box>

        {displayError && (
          <Box sx={{ mx: 0.5, mb: 1.5, p: 1.25, border: 1, borderColor: 'error.light', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'error.soft' }}>
            <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
            <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>{displayError}</Typography>
          </Box>
        )}

        {queueLoading && queue.length === 0 ? (
          <Box sx={{ p: 3 }}>{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
        ) : (
          <DataTable
            columns={queueColumns}
            data={queue}
            keyField="_id"
            dense
            sortable
            initialPageSize={25}
            pageSizeOptions={[10, 25, 50]}
            emptyTitle="No students found"
            emptyText="Document tracking will appear here once students are assigned to you."
            onRowClick={(row) => setSelected(row)}
            toolbar={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%', pb: 1.25, borderBottom: 1, borderColor: 'divider' }}>
                <SearchField placeholder="Search by name or ref ID..." sx={{ minWidth: 220, flex: '1 1 220px' }} value={search} onChange={(e) => setSearch(e.target.value)} />
                <FilterSelect label="Status" options={QUEUE_STATUS_OPTIONS} sx={{ minWidth: 130 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
              </Box>
            }
          />
        )}
      </Box>
    );
  }

  /* ── Render: Detail View ────────────────────────────────────────── */
  const student = selected.lead;
  const pct = docSummary?.completionPct ?? 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, pt: 2, pb: 1.5, px: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <SecondaryButton size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />} onClick={handleBack}>Back to Queue</SecondaryButton>
        </Box>
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
          {student?.studentName || 'Student Documents'}
        </Typography>
        {student?.referenceId && (
          <Typography sx={{ fontSize: 11.5, color: 'text.disabled', fontFamily: 'monospace', mt: 0.25 }}>
            #{student.referenceId}
          </Typography>
        )}
        {docSummary && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
            <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{docSummary.total ?? 0} docs</Typography>
            <Box sx={{ width: 1, height: 12, bgcolor: 'divider' }} />
            <Typography sx={{ fontSize: 11.5, color: 'success.main', fontWeight: 600 }}>{docSummary.verified ?? 0} verified</Typography>
            <Box sx={{ width: 1, height: 12, bgcolor: 'divider' }} />
            <Typography sx={{ fontSize: 11.5, color: 'warning.main', fontWeight: 600 }}>{docSummary.missing ?? 0} missing</Typography>
            <Box sx={{ width: 1, height: 12, bgcolor: 'divider' }} />
            <Typography sx={{ fontSize: 11.5, color: 'error.main', fontWeight: 600 }}>{docSummary.rejected ?? 0} rejected</Typography>
            <Box sx={{ width: 60, ml: 0.5 }}>
              <LinearProgress variant="determinate" value={pct} sx={{ height: 4, borderRadius: 3, bgcolor: 'grey.200' }} color={pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error'} />
            </Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{pct}%</Typography>
          </Box>
        )}
      </Box>

      {error && (
        <Box sx={{ mx: 0.5, mb: 1.5, p: 1.25, border: 1, borderColor: 'error.light', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'error.soft' }}>
          <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
          <Typography sx={{ fontSize: 12.5, color: 'error.main', flex: 1 }}>{error}</Typography>
          <IconButton size="small" onClick={() => setError(null)}>
            <Typography sx={{ fontSize: 11, color: 'error.main' }}>Dismiss</Typography>
          </IconButton>
        </Box>
      )}

      {detailLoading ? (
        <Box sx={{ px: 0.5 }}>{[1, 2, 3, 4].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <DataTable
            columns={docColumns}
            data={docs}
            keyField="_id"
            dense
            sortable
            initialPageSize={25}
            pageSizeOptions={[10, 25, 50]}
            emptyTitle="No documents yet"
            emptyText="Add documents or initialize the checklist to get started."
            toolbar={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', pb: 1.25, borderBottom: 1, borderColor: 'divider' }}>
                <PrimaryButton size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                  Add Document
                </PrimaryButton>
                {docs.length === 0 && (
                  <PrimaryButton size="small" loading={submitting} onClick={handleInitializeChecklist}>
                    Initialize Checklist
                  </PrimaryButton>
                )}
              </Box>
            }
          />
        </Box>
      )}

      {/* Dialogs */}
      <AddDocumentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAddDocument}
        loading={submitting}
      />

      <EditDocumentDialog
        open={editOpen}
        doc={editDoc}
        onClose={() => { setEditOpen(false); setEditDoc(null); }}
        onSubmit={handleEditDocument}
        loading={submitting}
      />

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Delete Document</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13 }}>Are you sure you want to delete this document? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <SecondaryButton onClick={() => setConfirmDelete(null)}>Cancel</SecondaryButton>
          <PrimaryButton color="error" onClick={handleDeleteDocument}>Delete</PrimaryButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
