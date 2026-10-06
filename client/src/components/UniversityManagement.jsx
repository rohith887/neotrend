import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  Divider,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import TextField from '@mui/material/TextField';
import FilterSelect from '../ui/mui/FilterSelect';
import CrmListShell from './CrmListShell.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useCachedFetch } from '../context/CacheContext.jsx';
import { useLookups } from '../api/useLookups';
import {
  AppDialog,
  AppIconButton,
  DataTable,
  PrimaryButton,
  SearchField,
  SecondaryButton,
} from '../ui/mui';
import {
  fetchUniversities,
  createUniversity,
  updateUniversity,
  deleteUniversity,
  downloadUniversityTemplate,
  previewUniversityImport,
  importUniversities,
} from '../api/universities';
import { CountryLabel } from '../utils/flag.jsx';

/* ── Helpers ─────────────────────────────────────────────────────── */
const displayValue = (v) => String(v ?? '').trim() || '—';
const countryName  = (u) => { if (!u?.country) return '—'; if (typeof u.country === 'object') return u.country.name || '—'; return String(u.country); };
const universityId = (u) => String(u?._id ?? u?.id ?? '');
const normalize    = (u) => ({
  _id:             universityId(u),
  institutionName: String(u?.institutionName ?? u?.name ?? '').trim(),
  country:         u?.country ?? null,
  city:            String(u?.city ?? '').trim(),
  stateRegion:     String(u?.stateRegion ?? '').trim(),
  ownership:       String(u?.ownership ?? 'PVT').trim().toUpperCase(),
  isActive:        u?.isActive ?? true,
  createdAt:       u?.createdAt,
  updatedAt:       u?.updatedAt,
});

const PAGE_SIZE = 25;

/* Status quick-filter tabs */
const STATUS_TABS = [
  { key: 'all',    label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

/* ═══════════════════════════════════════════════════════════════════
   University Profile Modal (view detail)
   ═══════════════════════════════════════════════════════════════════ */
function UniversityProfileModal({ university, onClose, onEdit, onDelete }) {
  const u = university;
  return (
    <AppDialog
      open onClose={onClose} size="sm"
      title={
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{displayValue(u.institutionName)}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: 12.5 }}>{countryName(u)}</Typography>
        </Box>
      }
      footer={
        <DialogActions sx={{ gap: 0.5 }}>
          <SecondaryButton size="small" startIcon={<EditIcon sx={{ fontSize: 13 }} />} onClick={() => onEdit(u)}>Edit</SecondaryButton>
          <Box sx={{ flex: 1 }} />
          <SecondaryButton size="small" onClick={onClose}>Close</SecondaryButton>
          <Button size="small" color="error" startIcon={<DeleteOutlineIcon sx={{ fontSize: 13 }} />} onClick={() => onDelete(u)}>Deactivate</Button>
        </DialogActions>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, py: 0.5 }}>
        {[
          ['Name',           displayValue(u.institutionName)],
          ['Country',        countryName(u)],
          ['City',           displayValue(u.city)],
          ['State / Region', displayValue(u.stateRegion)],
          ['Ownership',      displayValue(u.ownership)],
        ].map(([label, value]) => (
          <Box key={label}>
            <Box sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled', mb: 0.375 }}>{label}</Box>
            <Box sx={{ fontSize: 13.5, fontWeight: 500, color: 'text.primary' }}>{value}</Box>
          </Box>
        ))}
        <Box>
          <Box sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled', mb: 0.375 }}>Status</Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: u.isActive ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
            <Typography sx={{ fontSize: 13.5, color: u.isActive ? 'text.primary' : 'text.secondary' }}>{u.isActive ? 'Active' : 'Inactive'}</Typography>
          </Box>
        </Box>
      </Box>
    </AppDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Create / Edit Form Dialog
   ═══════════════════════════════════════════════════════════════════ */
function UniversityFormDialog({ mode, university, countries, onClose, onSubmit, onValidationError }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    institutionName: university?.institutionName ?? university?.name ?? '',
    country:         typeof university?.country === 'object' ? university.country._id ?? '' : university?.country ?? '',
    city:            university?.city        ?? '',
    stateRegion:     university?.stateRegion ?? '',
    ownership:       university?.ownership   ?? 'PVT',
  });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const submit = async () => {
    const name = form.institutionName.trim();
    if (!name || !form.country) { onValidationError(); return; }
    setSaving(true);
    try {
      await onSubmit({ institutionName: name, country: form.country, city: form.city.trim(), stateRegion: form.stateRegion.trim(), ownership: form.ownership });
    } finally { setSaving(false); }
  };

  return (
    <AppDialog
      open onClose={saving ? undefined : onClose} size="sm"
      title={isEdit ? 'Edit University' : 'Add University'}
      subtitle={isEdit ? `Update ${displayValue(university?.institutionName)}.` : 'Add a university to the master list.'}
      footer={
        <DialogActions>
          <SecondaryButton size="small" disabled={saving} onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton size="small" disabled={saving}
            startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <AddIcon sx={{ fontSize: 14 }} />}
            onClick={submit}>
            {isEdit ? 'Save Changes' : 'Add University'}
          </PrimaryButton>
        </DialogActions>
      }
    >
      <Stack spacing={2}>
        <TextField label="University name *" placeholder="e.g. Alaska Career College" value={form.institutionName} onChange={set('institutionName')} fullWidth autoFocus />
        <TextField select label="Country *" value={form.country} onChange={set('country')} slotProps={{ select: { native: true } }} fullWidth>
          <option value="">— Select —</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </TextField>
        <TextField label="City" placeholder="e.g. Anchorage" value={form.city} onChange={set('city')} fullWidth />
        <TextField label="State / Region" placeholder="e.g. AK" value={form.stateRegion} onChange={set('stateRegion')} fullWidth />
        <TextField select label="Ownership" value={form.ownership} onChange={set('ownership')} slotProps={{ select: { native: true } }} fullWidth>
          <option value="PVT">PVT — Private</option>
          <option value="PLC">PLC — Public</option>
        </TextField>
      </Stack>
    </AppDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Import Universities Modal (3-step)
   ═══════════════════════════════════════════════════════════════════ */
const IMPORT_STEPS = ['Upload', 'Preview', 'Result'];

function ImportUniversitiesModal({ onClose, onComplete }) {
  const { push } = useToast();
  const fileInputRef = useRef(null);
  const [step,         setStep]         = useState(0);
  const [file,         setFile]         = useState(null);
  const [preview,      setPreview]      = useState(null);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error,        setError]        = useState(null);
  const [loading,      setLoading]      = useState(false);

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setError(null); setPreview(null); setLoading(true);
    try { const data = await previewUniversityImport(f); setPreview(data); setStep(1); }
    catch (err) { setError(err?.response?.data?.message || 'Failed to parse file'); }
    finally { setLoading(false); }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true); setError(null);
    try {
      const result = await importUniversities(file);
      setImportResult(result); setStep(2);
      push(`Import completed: ${result.imported} new, ${result.updated} updated`, 'success');
      onComplete?.();
    } catch (err) { setError(err?.response?.data?.message || 'Import failed'); }
    finally { setImporting(false); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadUniversityTemplate();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: 'university-import-template.xlsx' });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { push('Failed to download template', 'danger'); }
  };

  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f) handleFileChange({ target: { files: [f] } }); };
  const resetUpload = () => { setFile(null); setPreview(null); setImportResult(null); setError(null); setStep(0); if (fileInputRef.current) fileInputRef.current.value = ''; };

  return (
    <AppDialog
      open onClose={importing ? undefined : onClose} size="md"
      title="Import Universities"
      subtitle="Upload a CSV or XLSX file with university data"
      footer={
        <DialogActions>
          <SecondaryButton size="small" disabled={importing} onClick={onClose}>Cancel</SecondaryButton>
          {step === 1 && preview && (
            <PrimaryButton size="small" disabled={importing || preview.summary.valid === 0} loading={importing}
              startIcon={<UploadFileIcon sx={{ fontSize: 14 }} />} onClick={handleImport}>
              {importing ? 'Importing…' : 'Import Universities'}
            </PrimaryButton>
          )}
          {step === 2 && <PrimaryButton size="small" onClick={onClose}>Done</PrimaryButton>}
        </DialogActions>
      }
    >
      <Stepper activeStep={step} sx={{ mb: 3 }}>
        {IMPORT_STEPS.map((label) => (
          <Step key={label}>
            <StepLabel sx={{ '& .MuiStepLabel-label': { fontSize: 12, fontWeight: 500 }, '& .MuiStepIcon-root': { fontSize: 18 } }}>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Step 0 — Upload */}
      {step === 0 && (
        <Box>
          <Box
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            sx={{ border: 2, borderColor: 'divider', borderStyle: 'dashed', borderRadius: 2, py: 5, px: 3, textAlign: 'center', cursor: 'pointer', bgcolor: 'grey.50', transition: 'border-color 0.15s, background 0.15s', '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50' } }}
          >
            <CloudUploadIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 500, mb: 0.5 }}>Drop CSV or XLSX here</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>or click to browse</Typography>
          </Box>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" hidden onChange={handleFileChange} />
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button size="small" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />} onClick={handleDownloadTemplate} sx={{ textTransform: 'none', fontSize: 12 }}>
              Download CSV Template
            </Button>
          </Box>
          {loading && <Box sx={{ mt: 2 }}><LinearProgress /><Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5, textAlign: 'center' }}>Parsing file…</Typography></Box>}
        </Box>
      )}

      {/* Step 1 — Preview */}
      {step === 1 && preview && (
        <Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2.5 }}>
            {[
              { label: 'Total',      value: preview.summary.total,      color: 'text.primary' },
              { label: 'Valid',      value: preview.summary.valid,      color: 'success.main' },
              { label: 'Invalid',    value: preview.summary.invalid,    color: preview.summary.invalid > 0    ? 'error.main'   : 'text.secondary' },
              { label: 'Duplicates', value: preview.summary.duplicates, color: preview.summary.duplicates > 0 ? 'warning.main' : 'text.secondary' },
            ].map((s) => (
              <Box key={s.label} sx={{ textAlign: 'center', py: 1.25, borderRadius: 1.5, bgcolor: 'grey.50', border: 1, borderColor: 'divider' }}>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</Typography>
                <Typography sx={{ fontSize: 10, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>

          {preview.summary.unknownCountries?.length > 0 && <Alert severity="warning" sx={{ mb: 1.5, fontSize: 12 }}>Unknown countries: {preview.summary.unknownCountries.join(', ')}</Alert>}
          {preview.summary.invalidOwnershipValues?.length > 0 && <Alert severity="warning" sx={{ mb: 1.5, fontSize: 12 }}>Invalid ownership values: {preview.summary.invalidOwnershipValues.join(', ')}</Alert>}

          {preview.rows.some((r) => !r.isValid) && (
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1, color: 'error.main' }}>Rows with errors</Typography>
              <TableContainer sx={{ maxHeight: 220, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Row', 'University', 'Country', 'Error'].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 600, fontSize: 11, py: 0.75 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.rows.filter((r) => !r.isValid).map((r) => (
                      <TableRow key={r._rowNumber}>
                        <TableCell sx={{ fontSize: 12, py: 0.5 }}>{r._rowNumber}</TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.5 }}>{r.institutionName || '—'}</TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.5 }}><CountryLabel value={r.country} fallback="—" /></TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.5, color: 'error.main' }}>{r.errors.join('; ')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button size="small" onClick={resetUpload} sx={{ textTransform: 'none', fontSize: 12 }}>Upload different file</Button>
            {preview.summary.valid > 0 && (
              <Typography sx={{ fontSize: 12, color: 'success.main', fontWeight: 500 }}>
                {preview.summary.valid} row{preview.summary.valid !== 1 ? 's' : ''} ready to import
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Step 2 — Result */}
      {step === 2 && importResult && (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography sx={{ fontSize: 32, fontWeight: 700, color: 'success.main', mb: 0.5, fontVariantNumeric: 'tabular-nums' }}>
            {importResult.imported + importResult.updated}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 3 }}>universities imported successfully</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, maxWidth: 300, mx: 'auto' }}>
            {[
              { label: 'New',     value: importResult.imported, color: 'primary.main' },
              { label: 'Updated', value: importResult.updated,  color: 'info.main' },
              { label: 'Skipped', value: importResult.skipped,  color: 'text.secondary' },
            ].map((s) => (
              <Box key={s.label} sx={{ textAlign: 'center', py: 1.25, borderRadius: 1.5, bgcolor: 'grey.50', border: 1, borderColor: 'divider' }}>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</Typography>
                <Typography sx={{ fontSize: 10, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>
          {importResult.errors?.length > 0 && (
            <Alert severity="error" sx={{ mt: 2, textAlign: 'left', fontSize: 12 }}>
              {importResult.errors.length} row(s) failed:{' '}
              {importResult.errors.slice(0, 3).map((e) => `Row ${e.row}: ${e.message}`).join('; ')}
              {importResult.errors.length > 3 && ` …and ${importResult.errors.length - 3} more`}
            </Alert>
          )}
        </Box>
      )}
    </AppDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Per-row kebab menu
   ═══════════════════════════════════════════════════════════════════ */
function UniversityRowMenu({ university, onEdit, onDelete }) {
  const [anchor, setAnchor] = useState(null);
  const close = (fn) => () => { setAnchor(null); fn?.(); };
  return (
    <>
      <AppIconButton title="Row actions" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }} size="small">
        <MoreVertIcon sx={{ fontSize: 17 }} />
      </AppIconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 170 } } }}>
        <MenuItem dense onClick={close(() => onEdit(university))}>
          <EditIcon sx={{ fontSize: 15, mr: 1.5, color: 'text.secondary' }} />Edit
        </MenuItem>
        <Divider />
        <MenuItem dense onClick={close(() => onDelete(university))} sx={{ color: 'error.main' }}>
          <DeleteOutlineIcon sx={{ fontSize: 15, mr: 1.5 }} />Deactivate
        </MenuItem>
      </Menu>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   UniversityManagement — main page
   ═══════════════════════════════════════════════════════════════════ */
export default function UniversityManagement() {
  const { push }    = useToast();
  const { countries } = useLookups();

  /* ── Filter / pagination / sort state ──────────────────────── */
  const [page,            setPage]            = useState(0);
  const [pageSize,        setPageSize]        = useState(PAGE_SIZE);
  const [sortKey,         setSortKey]         = useState('institutionName');
  const [sortDir,         setSortDir]         = useState('asc');
  const [search,          setSearch]          = useState('');
  const [countryFilter,   setCountryFilter]   = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('');
  const [statusTab,       setStatusTab]       = useState('all'); // quick status tab
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [dialog,            setDialog]            = useState(null);
  const [profileUniversity, setProfileUniversity] = useState(null);
  const [importOpen,        setImportOpen]        = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(0); }, [debouncedSearch, countryFilter, ownershipFilter, pageSize, statusTab]);

  /* ── Fetch ──────────────────────────────────────────────────── */
  const sortParam = `${sortDir === 'desc' ? '-' : ''}${sortKey}`;
  const fetcher = useCallback(async () => {
    const params = { page: page + 1, limit: pageSize, sort: sortParam };
    if (debouncedSearch) params.search  = debouncedSearch;
    if (countryFilter)   params.country = countryFilter;
    if (ownershipFilter) params.ownership = ownershipFilter;
    // Status tab maps to isActive param when not 'all'
    if (statusTab === 'active')   params.isActive = true;
    if (statusTab === 'inactive') params.isActive = false;
    return fetchUniversities(params);
  }, [page, pageSize, sortParam, debouncedSearch, countryFilter, ownershipFilter, statusTab]);

  const cacheKey = useMemo(
    () => `universities-${page}-${pageSize}-${sortParam}-${debouncedSearch}-${countryFilter}-${ownershipFilter}-${statusTab}`,
    [page, pageSize, sortParam, debouncedSearch, countryFilter, ownershipFilter, statusTab]
  );

  const { data: res, loading, error, refetch } = useCachedFetch(cacheKey, fetcher, { staleTime: 15_000 });

  const rows  = useMemo(() => Array.isArray(res?.universities) ? res.universities.map(normalize) : [], [res]);
  const total = res?.total ?? 0;

  const loadData = useCallback(() => refetch(), [refetch]);

  /* ── Status counts for working views (uses existing API, limit 1) ── */
  const countsFetcher = useCallback(async () => {
    const [active, inactive] = await Promise.all([
      fetchUniversities({ page: 1, limit: 1, isActive: true }),
      fetchUniversities({ page: 1, limit: 1, isActive: false }),
    ]);
    return { active: active?.total ?? 0, inactive: inactive?.total ?? 0 };
  }, []);
  const { data: statusCounts } = useCachedFetch('universities-status-counts', countsFetcher, { staleTime: 60_000 });

  const handleSortChange = useCallback((key, dir) => { setSortKey(key); setSortDir(dir); setPage(0); }, []);

  /* ── Handlers ───────────────────────────────────────────────── */
  const closeDialog  = () => setDialog(null);

  const handleCreate = async (payload) => {
    try { await createUniversity(payload); closeDialog(); loadData(); push(`${payload.institutionName} added`, 'success'); }
    catch (err) { push(err?.response?.data?.message || 'Could not create university', 'danger'); }
  };

  const handleUpdate = async (university, payload) => {
    try { await updateUniversity(university._id, payload); closeDialog(); loadData(); push(`${payload.institutionName} updated`, 'success'); }
    catch (err) { push(err?.response?.data?.message || 'Could not update university', 'danger'); }
  };

  const handleDelete = async (university) => {
    if (!window.confirm(`Deactivate "${university.institutionName}"?`)) return;
    try { await deleteUniversity(university._id); setProfileUniversity(null); loadData(); push(`${university.institutionName} deactivated`, 'success'); }
    catch (err) { push(err?.response?.data?.message || 'Could not deactivate university', 'danger'); }
  };

  /* ── Country options ────────────────────────────────────────── */
  const countryOptions = useMemo(() => {
    const seen = new Set(); const opts = [];
    for (const c of countries) {
      if (c.id && c.name && !seen.has(c.id)) { seen.add(c.id); opts.push({ value: c.id, label: c.name }); }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [countries]);

  /* ── Export CSV ─────────────────────────────────────────────── */
  const downloadCsv = () => {
    const header = 'University,Country,City,State / Region,Ownership,Status';
    const body   = rows.map((r) => [
      `"${String(r.institutionName ?? '').replace(/"/g,'""')}"`,
      `"${String(countryName(r)).replace(/"/g,'""')}"`,
      `"${String(r.city ?? '').replace(/"/g,'""')}"`,
      `"${String(r.stateRegion ?? '').replace(/"/g,'""')}"`,
      `"${String(r.ownership ?? '').replace(/"/g,'""')}"`,
      r.isActive ? 'Active' : 'Inactive',
    ].join(',')).join('\r\n');
    const blob = new Blob([`${header}\r\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'universities.csv' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  /* ── Table columns ─────────────────────────────────────────── */
  const columns = useMemo(() => [
    {
      key: 'institutionName', label: 'University', sortable: true,
      render: (v, row) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography component="span" onClick={() => setProfileUniversity(row)}
            sx={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', lineHeight: 1.3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              color: 'text.primary', '&:hover': { color: 'primary.main', textDecoration: 'underline', textDecorationThickness: 1, textUnderlineOffset: 2 } }}>
            {displayValue(v)}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'country', label: 'Country', sortable: true,
      render: (_v, row) => <Typography sx={{ fontSize: 13 }}>{countryName(row)}</Typography>,
    },
    {
      key: 'city', label: 'City', sortable: true,
      render: (v) => <Typography sx={{ fontSize: 13, color: v ? 'text.primary' : 'text.disabled' }}>{displayValue(v)}</Typography>,
    },
    {
      key: 'stateRegion', label: 'State / Region', sortable: true,
      render: (v) => <Typography sx={{ fontSize: 13, color: v ? 'text.primary' : 'text.disabled' }}>{displayValue(v)}</Typography>,
    },
    {
      key: 'ownership', label: 'Ownership', sortable: true, width: 110,
      render: (v) => (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>{v || '—'}</Typography>
          {v && <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{v === 'PVT' ? '· Private' : '· Public'}</Typography>}
        </Box>
      ),
    },
    {
      key: 'isActive', label: 'Status', sortable: true, width: 90,
      render: (v) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: v ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, color: v ? 'text.primary' : 'text.secondary' }}>{v ? 'Active' : 'Inactive'}</Typography>
        </Box>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  /* ── Toolbar ────────────────────────────────────────────────── */
  const toolbar = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5, px: 0.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
      <SearchField
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search universities…"
        sx={{ minWidth: 180, flex: '1 1 240px', maxWidth: 320, '& .MuiOutlinedInput-root': { minHeight: 30 } }}
      />

      <FilterSelect label="Country"   value={countryFilter}   onChange={(e) => setCountryFilter(e.target.value)}
        options={[{ value: '', label: 'All Countries' }, ...countryOptions]} sx={{ minWidth: 140, height: 30 }} />
      <FilterSelect label="Ownership" value={ownershipFilter} onChange={(e) => setOwnershipFilter(e.target.value)}
        options={[{ value: '', label: 'All' }, { value: 'PVT', label: 'PVT — Private' }, { value: 'PLC', label: 'PLC — Public' }]}
        sx={{ minWidth: 140, height: 30 }} />

      <Box sx={{ flex: 1 }} />

      <Tooltip title="Refresh">
        <span>
          <SecondaryButton size="small" onClick={loadData} sx={{ minWidth: 0, px: 1, height: 30 }}>
            <RefreshIcon sx={{ fontSize: 15 }} />
          </SecondaryButton>
        </span>
      </Tooltip>
      <SecondaryButton size="small" startIcon={<DownloadIcon sx={{ fontSize: 13 }} />} onClick={downloadCsv} sx={{ minWidth: 0, px: 1, fontSize: 12.5, height: 30, textTransform: 'none' }}>Export CSV</SecondaryButton>
      <SecondaryButton size="small" startIcon={<UploadFileIcon sx={{ fontSize: 13 }} />} onClick={() => setImportOpen(true)} sx={{ minWidth: 0, px: 1, fontSize: 12.5, height: 30, textTransform: 'none' }}>Import</SecondaryButton>
    </Box>
  );

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
      <CrmListShell
        title="University Management"
        headerActions={
          <PrimaryButton size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={() => setDialog({ type: 'new' })}>
            Add University
          </PrimaryButton>
        }
        tabs={STATUS_TABS.map((t) => {
          const count = t.key === 'all' ? total : (t.key === 'active' ? (statusCounts?.active ?? 0) : (statusCounts?.inactive ?? 0));
          return { key: t.key, label: t.label, count: loading && t.key === 'all' ? '…' : count.toLocaleString() };
        })}
        activeTab={statusTab}
        onTabChange={setStatusTab}
        error={error ? <><strong>Could not load universities.</strong> {error}</> : null}
        onRetry={loadData}
      >
        <DataTable
          columns={columns}
          data={rows}
          keyField="_id"
          dense
          loading={loading}
          sortable
          controlledPage={page}
          onPageChange={(_, p) => setPage(p)}
          controlledPageSize={pageSize}
          onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
          controlledSortKey={sortKey}
          controlledSortDir={sortDir}
          onSortChange={(_, p) => handleSortChange(p.sortKey, p.sortDir)}
          totalCount={total}
          pageSizeOptions={[25, 50, 100]}
          emptyTitle="No universities found"
          emptyText="Try adjusting your search or filters."
          toolbar={toolbar}
          renderActions={(row) => (
            <UniversityRowMenu
              university={row}
              onEdit={(u) => setDialog({ type: 'edit', university: u })}
              onDelete={handleDelete}
            />
          )}
          containerSx={{
            maxHeight: 'calc(100vh - 240px)',
            '& .MuiTableCell-root': { px: 1.25 },
            '& .MuiTableCell-head': { py: 0.5, fontSize: 10.5 },
            '& .MuiTableCell-body': { py: 0.375, fontSize: 12.5 },
          }}
        />
      </CrmListShell>

      {/* ── Modals & dialogs ────────────────────────────────────── */}
      {profileUniversity && (
        <UniversityProfileModal
          university={profileUniversity}
          onClose={() => setProfileUniversity(null)}
          onEdit={(u) => { setProfileUniversity(null); setDialog({ type: 'edit', university: u }); }}
          onDelete={handleDelete}
        />
      )}

      {dialog?.type === 'new' && (
        <UniversityFormDialog mode="create" countries={countries} onClose={closeDialog}
          onSubmit={handleCreate}
          onValidationError={() => push('University name and country are required', 'warning')} />
      )}

      {dialog?.type === 'edit' && dialog?.university && (
        <UniversityFormDialog mode="edit" university={dialog.university} countries={countries} onClose={closeDialog}
          onSubmit={(payload) => handleUpdate(dialog.university, payload)}
          onValidationError={() => push('University name and country are required', 'warning')} />
      )}

      {importOpen && (
        <ImportUniversitiesModal onClose={() => setImportOpen(false)} onComplete={loadData} />
      )}
    </>
  );
}
