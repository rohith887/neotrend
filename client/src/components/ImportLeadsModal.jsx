import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  DialogActions,
  LinearProgress,
  Radio,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckIcon from '@mui/icons-material/Check';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AppDialog from '../ui/mui/AppDialog.jsx';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
import {
  validateLeadImport,
  runLeadImport,
  fetchImportTemplate,
  fetchImportErrorReport,
} from '../api/leads.js';
import { useToast } from '../context/ToastContext.jsx';

const ACCEPTED = ['.xlsx', '.xls', '.csv'];

const STATUS_BADGE = {
  valid:     { color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 14 }} />, label: 'Valid' },
  update:    { color: 'info',    icon: <AutorenewIcon sx={{ fontSize: 14 }} />,    label: 'Update' },
  duplicate: { color: 'warning', icon: <WarningAmberIcon sx={{ fontSize: 14 }} />, label: 'Duplicate' },
  invalid:   { color: 'error',   icon: <CancelIcon sx={{ fontSize: 14 }} />,       label: 'Invalid' },
};

const MODES = [
  { key: 'skip',  title: 'Skip Existing', sub: 'Rows whose mobile already exists are ignored.' },
  { key: 'update', title: 'Update Existing', sub: 'Existing leads are updated with the file values.' },
  { key: 'allow', title: 'Allow Duplicates', sub: 'Import every row, even if the number already exists.' },
];

const STAT_TONE = {
  none:    { bg: 'background.paper', border: 'divider',    num: 'text.primary' },
  valid:   { bg: 'success.soft',     border: 'success.border', num: 'success.main' },
  info:    { bg: 'info.soft',        border: 'info.border',    num: 'info.main' },
  dup:     { bg: 'warning.soft',     border: 'warning.border', num: 'warning.main' },
  invalid: { bg: 'error.soft',       border: 'error.border',   num: 'error.main' },
};

const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const fileExt = (name) => String(name || '').split('.').pop()?.toLowerCase() || '';
const acceptedExt = (name) => ACCEPTED.includes(`.${fileExt(name)}`);

const fmtVal = (v) => (v == null || v === '' ? '—' : v);

const StatCard = ({ label, value, tone = 'none' }) => {
  const t = STAT_TONE[tone] || STAT_TONE.none;
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        p: 1.25,
        border: '1px solid',
        borderColor: t.border,
        borderRadius: 2,
        bgcolor: t.bg,
      }}
    >
      <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: t.num, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </Typography>
    </Box>
  );
};

export default function ImportLeadsModal({ open, onClose, onImported }) {
  const { push } = useToast();
  const inputRef = useRef(null);
  const mountedRef = useRef(true);

  const [step, setStep] = useState('upload'); // upload | preview | importing | done
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [mode, setMode] = useState('skip');
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setFileError('');
    setMode('skip');
    setDragging(false);
    setValidating(false);
    setImporting(false);
    setPreview(null);
    setResult(null);
    setActionError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const acceptFile = (f) => {
    if (!f) return;
    if (!acceptedExt(f.name)) {
      setFileError('Unsupported file type. Please choose a .xlsx, .xls or .csv file.');
      setFile(null);
      return;
    }
    setFileError('');
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer?.files?.[0]);
  };

  const onValidate = async () => {
    if (!file) {
      setFileError('Please choose a file to import.');
      return;
    }
    setValidating(true);
    setActionError('');
    try {
      const p = await validateLeadImport(file, mode);
      if (!mountedRef.current) return;
      setPreview(p);
      setStep('preview');
    } catch (err) {
      if (!mountedRef.current) return;
      setActionError(err?.response?.data?.message || err?.message || 'Could not validate the file.');
    } finally {
      if (mountedRef.current) setValidating(false);
    }
  };

  const onImport = async () => {
    setImporting(true);
    setActionError('');
    try {
      const r = await runLeadImport(file, mode);
      if (!mountedRef.current) return;
      setResult(r);
      setStep('done');
      onImported?.(r);
    } catch (err) {
      if (!mountedRef.current) return;
      setActionError(err?.response?.data?.message || err?.message || 'Import failed.');
      setStep('preview');
    } finally {
      if (mountedRef.current) setImporting(false);
    }
  };

  const onDownloadTemplate = async () => {
    try {
      const blob = await fetchImportTemplate();
      saveBlob(blob, 'lead-import-template.xlsx');
    } catch (err) {
      push(err?.response?.data?.message || 'Could not download the template', 'danger');
    }
  };

  const onDownloadErrors = async () => {
    if (!result?.jobId) return;
    try {
      const blob = await fetchImportErrorReport(result.jobId);
      saveBlob(blob, `import-error-report-${result.jobId}.xlsx`);
      push('Error report downloaded', 'success');
    } catch (err) {
      push(err?.response?.data?.message || 'Could not download the error report', 'danger');
    }
  };

  const total = preview?.totalRows ?? 0;
  const toImport = (preview?.validRows ?? 0) + (preview?.updateRows ?? 0);

  const title =
    step === 'upload' ? 'Import Leads'
      : step === 'preview' ? 'Review & Preview'
        : step === 'importing' ? 'Importing…'
          : 'Import Complete';

  const footer =
    step === 'upload' ? (
      <>
        <SecondaryButton size="small" onClick={close} disabled={validating}>
          Cancel
        </SecondaryButton>
        <PrimaryButton size="small" onClick={onValidate} disabled={validating || !file} loading={validating}>
          {validating ? 'Validating…' : 'Validate & Preview'}
        </PrimaryButton>
      </>
    ) : step === 'preview' ? (
      <>
        <SecondaryButton size="small" onClick={() => setStep('upload')} disabled={importing} startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}>
          Back
        </SecondaryButton>
        <PrimaryButton size="small" onClick={onImport} disabled={importing || toImport === 0} loading={importing} startIcon={<FileDownloadIcon sx={{ fontSize: 14 }} />}>
          Import {toImport} Lead{toImport === 1 ? '' : 's'}
        </PrimaryButton>
      </>
    ) : step === 'importing' ? (
      <>
        <SecondaryButton size="small" disabled>
          Cancel
        </SecondaryButton>
        <PrimaryButton size="small" disabled loading>
          Importing…
        </PrimaryButton>
      </>
    ) : (
      <>
        <PrimaryButton size="small" onClick={close} startIcon={<CheckIcon sx={{ fontSize: 14 }} />}>
          Done
        </PrimaryButton>
      </>
    );

  return (
    <AppDialog
      open={open}
      onClose={close}
      title={title}
      size="lg"
      disableEscapeKeyDown={importing}
      footer={
        <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
          {footer}
        </DialogActions>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {actionError && (
          <Alert severity="error" iconMapping={{ error: <ErrorOutlineIcon fontSize="small" /> }}>
            {actionError}
          </Alert>
        )}

        {/* ── Upload step ─────────────────────────────────────────── */}
        {step === 'upload' && (
          <>
            <Box
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              aria-label="Upload a leads spreadsheet"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.75,
                px: 2.5,
                py: 4.25,
                border: '1.5px dashed',
                borderColor: dragging ? 'primary.main' : 'divider',
                borderRadius: 2.5,
                bgcolor: dragging ? 'primary.soft' : 'action.hover',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, background-color 150ms ease',
              }}
            >
              <CloudUploadIcon sx={{ fontSize: 30, color: 'primary.main' }} />
              <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>
                {file ? file.name : dragging ? 'Drop it here' : 'Drag & drop your spreadsheet here'}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>or</Typography>
              <SecondaryButton
                size="small"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                startIcon={<FolderOpenIcon sx={{ fontSize: 13 }} />}
              >
                Browse File
              </SecondaryButton>
              <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.25 }}>
                Supports .xlsx, .xls and .csv · max 10 MB
              </Typography>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />
            </Box>

            {fileError && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <ErrorOutlineIcon sx={{ fontSize: 14, color: 'error.main' }} />
                <Typography variant="body2" sx={{ color: 'error.main' }}>{fileError}</Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, flexWrap: 'wrap', px: 0.25 }}>
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>Need a starting point?</Typography>
              <Button
                size="small"
                variant="text"
                onClick={onDownloadTemplate}
                startIcon={<FileDownloadIcon sx={{ fontSize: 14 }} />}
                sx={{ p: 0, textTransform: 'none', fontWeight: 500, color: 'primary.main' }}
              >
                Download Sample Template
              </Button>
            </Box>

            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.75 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                Duplicate Handling
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {MODES.map((m) => {
                  const selected = mode === m.key;
                  return (
                    <Box
                      key={m.key}
                      component="label"
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        p: 1.1,
                        border: '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        borderRadius: 1.5,
                        bgcolor: selected ? 'primary.soft' : 'action.hover',
                        cursor: 'pointer',
                        transition: 'border-color 150ms ease, background-color 150ms ease',
                        '&:hover': { borderColor: selected ? 'primary.main' : 'primary.border' },
                      }}
                    >
                      <Radio
                        name="il-mode"
                        value={m.key}
                        checked={selected}
                        onChange={() => setMode(m.key)}
                        size="small"
                        sx={{ mt: 0.25, p: 0.5 }}
                      />
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{m.title}</Typography>
                        <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>{m.sub}</Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </>
        )}

        {/* ── Preview step ────────────────────────────────────────── */}
        {step === 'preview' && preview && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(auto-fit, minmax(110px, 1fr))' }, gap: 1.25 }}>
              <StatCard label="Total Rows" value={total} />
              <StatCard label="Valid" value={preview.validRows} tone="valid" />
              {mode === 'update' && <StatCard label="Will Update" value={preview.updateRows} tone="info" />}
              <StatCard label="Duplicate" value={preview.duplicateRows} tone="dup" />
              <StatCard label="Invalid" value={preview.invalidRows} tone="invalid" />
            </Box>

            <Typography variant="body2" sx={{ color: 'text.disabled' }}>
              {toImport > 0
                ? `${toImport} row${toImport === 1 ? '' : 's'} will be imported.`
                : 'No rows are eligible to import — fix the file or change duplicate handling.'}
            </Typography>

            <TableContainer
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                overflow: 'hidden',
                maxHeight: 300,
                overflowY: 'auto',
              }}
            >
              <Table size="small" stickyHeader sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 56 }}>Row</TableCell>
                    <TableCell>Student Name</TableCell>
                    <TableCell>Mobile</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell sx={{ width: 110 }}>Status</TableCell>
                    <TableCell>Errors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled', fontSize: 12.5 }}>
                        No data rows found.
                      </TableCell>
                    </TableRow>
                  ) : preview.rows.slice(0, 100).map((r) => {
                    const badge = STATUS_BADGE[r.status] || STATUS_BADGE.valid;
                    return (
                      <TableRow key={r.row}>
                        <TableCell sx={{ color: 'text.disabled' }}>{r.row}</TableCell>
                        <TableCell>{fmtVal(r.values?.studentName)}</TableCell>
                        <TableCell>{fmtVal(r.values?.mobile)}</TableCell>
                        <TableCell>{fmtVal(r.values?.email)}</TableCell>
                        <TableCell>
                          <Chip size="small" color={badge.color} icon={badge.icon} label={badge.label} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12.5, color: 'error.main', maxWidth: 260 }}>
                          {(r.errors || []).join('; ')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {preview.rows.length > 100 && (
              <Typography variant="body2" sx={{ px: 0.25, color: 'text.disabled' }}>
                Showing the first 100 of {preview.rows.length} rows.
              </Typography>
            )}
          </>
        )}

        {/* ── Importing step ──────────────────────────────────────── */}
        {step === 'importing' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 4 }}>
            <CircularProgress size={34} />
            <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>
              Importing {toImport} lead{toImport === 1 ? '' : 's'}…
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.disabled' }}>
              Please keep this dialog open until the import finishes.
            </Typography>
            <LinearProgress sx={{ width: '100%', borderRadius: 999, height: 8 }} />
          </Box>
        )}

        {/* ── Done step ───────────────────────────────────────────── */}
        {step === 'done' && result && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(auto-fit, minmax(110px, 1fr))' }, gap: 1.25 }}>
              <StatCard label="Imported" value={result.imported ?? 0} tone="valid" />
              {mode === 'update' && <StatCard label="Updated" value={result.updated ?? 0} tone="info" />}
              <StatCard label="Skipped" value={result.skipped ?? 0} tone="dup" />
              <StatCard label="Failed" value={result.failed ?? 0} tone={result.failed ? 'invalid' : 'none'} />
            </Box>

            <Typography variant="body2" sx={{ color: 'text.disabled' }}>
              Import from <Box component="strong" sx={{ color: 'text.primary' }}>{result.filename}</Box> completed.
              {result.imported + (result.updated ?? 0) > 0 && ' New leads are now visible in the table.'}
            </Typography>

            {result.failed > 0 && (
              <Alert
                severity="warning"
                action={
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    onClick={onDownloadErrors}
                    startIcon={<FileDownloadIcon sx={{ fontSize: 14 }} />}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Download Error Report
                  </Button>
                }
              >
                {result.failed} row{result.failed === 1 ? '' : 's'} failed to import.
              </Alert>
            )}
          </>
        )}
      </Box>
    </AppDialog>
  );
}
