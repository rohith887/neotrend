import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LinkIcon from '@mui/icons-material/Link';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PaymentsIcon from '@mui/icons-material/Payments';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import QrCodeIcon from '@mui/icons-material/QrCode';
import RefreshIcon from '@mui/icons-material/Refresh';
import RuleIcon from '@mui/icons-material/Rule';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { useToast } from '../context/ToastContext.jsx';
import { useCachedFetch } from '../context/CacheContext.jsx';
import {
  deleteReferral,
  fetchReferrals,
  getReferralById,
  getStudentQRCode,
  setReferralActive,
  updateReferral,
  updateReferralStatus,
  updateRewardStatus,
} from '../api/referrals.js';
import { fetchLeadOptions } from '../api/leads.js';
import CrmListShell from './CrmListShell.jsx';
import {
  AppCard,
  AppDialog,
  AppIconButton,
  DataTable,
  FilterSelect,
  PrimaryButton,
  SearchField,
  SecondaryButton,
} from '../ui/mui/index.js';

/* ── Constants ─────────────────────────────────────────────────── */
const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending',      value: 'pending' },
  { label: 'Contacted',    value: 'contacted' },
  { label: 'Qualified',    value: 'qualified' },
  { label: 'Converted',    value: 'converted' },
  { label: 'Rejected',     value: 'rejected' },
];
const REWARD_OPTIONS = [
  { label: 'All Rewards',  value: '' },
  { label: 'Pending',      value: 'pending' },
  { label: 'Not Eligible', value: 'not-eligible' },
  { label: 'Eligible',     value: 'eligible' },
  { label: 'Processing',   value: 'processing' },
  { label: 'Paid',         value: 'paid' },
  { label: 'Cancelled',    value: 'cancelled' },
];
const SOURCE_OPTIONS = [
  { label: 'All Sources',       value: '' },
  { label: 'Employee Referral', value: 'employee-referral' },
  { label: 'Student Referral',  value: 'student-referral' },
];

const STATUS_LABEL = { pending: 'Pending', contacted: 'Contacted', qualified: 'Qualified', converted: 'Converted', rejected: 'Rejected' };
const REWARD_LABEL = { pending: 'Pending', 'not-eligible': 'Not eligible', eligible: 'Eligible', processing: 'Processing', paid: 'Paid', cancelled: 'Cancelled' };
const STATUS_DOT   = { pending: 'text.disabled', contacted: 'info.main', qualified: 'primary.main', converted: 'success.main', rejected: 'error.main' };
const REWARD_DOT   = { pending: 'text.disabled', 'not-eligible': 'text.disabled', eligible: 'success.main', processing: 'warning.main', paid: 'success.main', cancelled: 'error.main' };

/* Pipeline stage tabs */
const PIPELINE_TABS = [
  { key: '',          label: 'All' },
  { key: 'pending',   label: 'Pending' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'converted', label: 'Converted' },
  { key: 'rejected',  label: 'Rejected' },
];

/* ── Helpers ─────────────────────────────────────────────────────── */
const isEmployeeSource = (row) => row?.source === 'employee' || row?.source === 'public-qr';
const sourceLabel      = (row) => isEmployeeSource(row) ? 'Employee Referral' : 'Student Referral';
const studentName      = (s)   => { if (!s) return '—'; if (typeof s === 'string') return s; return s.studentName || '—'; };
const referrerNameOf   = (row) => {
  if (isEmployeeSource(row)) {
    if (row.referrerUser) {
      const n = [row.referrerUser.firstName, row.referrerUser.lastName].filter(Boolean).join(' ');
      return n || row.employeeName || '—';
    }
    return row.employeeName || '—';
  }
  return studentName(row.referrerStudent);
};
const fmtDate     = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const fmtDateTime = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const downloadBlob    = (dataUrl, fn) => { const a = Object.assign(document.createElement('a'), { href: dataUrl, download: fn }); document.body.appendChild(a); a.click(); a.remove(); };
const downloadRefCsv  = (rows) => {
  const header = 'Referral Code,Source,Referrer,Referred Student,Referred Mobile,Referred Email,Status,Reward Amount,Reward Status,Created';
  const val = (r, k) => {
    switch (k) {
      case 'source':    return sourceLabel(r);
      case 'referrer':  return referrerNameOf(r);
      case 'referred':  return r.referredLead ? studentName(r.referredLead) : (r.referredName || '');
      case 'createdAt': return r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
      default:          return r[k] ?? '';
    }
  };
  const cols = ['referralCode','source','referrer','referred','referredMobile','referredEmail','status','rewardAmount','rewardStatus','createdAt'];
  const body = rows.map((r) => cols.map((k) => `"${String(val(r, k)).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob([`${header}\r\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'referral-management.csv' });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};

/* ── Primitive display helpers ───────────────────────────────────── */
function DotStatus({ label, dotColor = 'text.disabled' }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <Box aria-hidden="true" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0 }} />
      <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.primary', whiteSpace: 'nowrap' }}>{label}</Typography>
    </Box>
  );
}
function ReferralStatusCell({ row }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <DotStatus label={STATUS_LABEL[row.status] || row.status} dotColor={STATUS_DOT[row.status]} />
      {row.isActive === false && <Typography component="span" sx={{ fontSize: 11, color: 'text.disabled' }}>· Inactive</Typography>}
    </Box>
  );
}

/* ── Detail dialog ──────────────────────────────────────────────── */
function ReferralDetailDialog({ referral, qrDataUrl, onClose, onOpenStudent, onRefresh }) {
  const { toast } = useToast();
  const [rewardLoading, setRewardLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [local, setLocal] = useState(referral);

  const copyLink   = async () => { try { await navigator.clipboard.writeText(local.referralLink); toast('Link copied', 'success'); } catch { toast('Failed to copy', 'danger'); } };
  const downloadQR = () => { if (!qrDataUrl) return; downloadBlob(qrDataUrl, `referral-${local.referralCode}.png`); toast('QR downloaded', 'success'); };

  const handleRewardUpdate = async (rs) => {
    setRewardLoading(true);
    try { const u = await updateRewardStatus(local._id, rs); setLocal(u); toast(`Reward marked as ${rs}`, 'success'); onRefresh?.(); }
    catch (err) { toast(err?.response?.data?.message || 'Failed', 'danger'); }
    finally { setRewardLoading(false); }
  };
  const handleStatusUpdate = async (s) => {
    setStatusLoading(true);
    try { await updateReferralStatus(local._id, s); toast(`Status updated to ${s}`, 'success'); onRefresh?.(); onClose(); }
    catch (err) { toast(err?.response?.data?.message || 'Failed', 'danger'); }
    finally { setStatusLoading(false); }
  };

  const nextStatuses   = { pending: ['contacted','rejected'], contacted: ['qualified','rejected'], qualified: ['converted','rejected'], converted: [], rejected: ['pending'] };
  const VALID_REWARD   = { pending: ['eligible'], 'not-eligible': ['eligible'], eligible: ['processing','cancelled'], processing: ['paid','cancelled'], paid: [], cancelled: [] };
  const available      = nextStatuses[local.status] || [];
  const allowedNext    = VALID_REWARD[local.rewardStatus] || [];
  const canProc        = allowedNext.includes('processing');
  const canPaid        = allowedNext.includes('paid');
  const canCancel      = allowedNext.includes('cancelled');
  const hasReward      = canProc || canPaid || canCancel;
  const hasStatus      = available.length > 0;
  const history        = [...(local.rewardHistory || [])].sort((a, b) => new Date(b.at) - new Date(a.at));

  const tdSx  = { borderBottom: '1px solid', borderColor: 'divider', py: 0.75, px: 1, fontSize: 13 };
  const thSx  = { ...tdSx, fontSize: 12.5, color: 'text.secondary', fontWeight: 500, whiteSpace: 'nowrap' };

  return (
    <AppDialog open onClose={onClose} size="md" title="Referral Details"
      subtitle={referrerNameOf(local) !== '—' ? `${referrerNameOf(local)} · ${local.referrerStudent?.referenceId || local.employeeId || ''}` : undefined}
      footer={<Stack direction="row" spacing={1} sx={{ px: 3, py: 1.5 }}><SecondaryButton size="small" onClick={onClose}>Close</SecondaryButton><PrimaryButton size="small" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />} onClick={downloadQR} disabled={!qrDataUrl}>Download QR</PrimaryButton></Stack>}
    >
      <Stack spacing={2.5}>
        <AppCard title="Referral Code" icon={<LinkIcon sx={{ fontSize: 16, color: 'primary.main' }} />} contentSx={{ pt: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, letterSpacing: '0.08em' }}>{local.referralCode}</Typography>
            <AppIconButton title="Copy code" onClick={copyLink} size="small"><ContentCopyIcon sx={{ fontSize: 16 }} /></AppIconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, wordBreak: 'break-all', fontSize: 12.5 }}>{local.referralLink}</Typography>
        </AppCard>

        {qrDataUrl && (
          <AppCard title="QR Code" icon={<QrCode2Icon sx={{ fontSize: 16, color: 'primary.main' }} />} contentSx={{ pt: 1.5 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Box component="img" src={qrDataUrl} alt={`QR for ${local.referralCode}`} sx={{ width: 180, height: 180, borderRadius: 1, border: '1px solid', borderColor: 'divider' }} />
            </Box>
          </AppCard>
        )}

        <AppCard title="Referral Information" icon={<InfoOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} />} contentSx={{ pt: 1.5 }}>
          <Table size="small"><TableBody>
            {[
              ['Referrer',         referrerNameOf(local)],
              ['Referred Student', local.referredLead
                ? <Box key="rs" component="span" onClick={() => onOpenStudent?.(local.referredLead)} sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>{studentName(local.referredLead)} <OpenInNewIcon sx={{ fontSize: 12, verticalAlign: 'middle', ml: 0.25 }} /></Box>
                : local.referredName || '—'],
              ['Referred Mobile',  local.referredMobile  || '—'],
              ['Referred Email',   local.referredEmail   || '—'],
              ['Status',           <DotStatus key="s" label={STATUS_LABEL[local.status] || local.status} dotColor={STATUS_DOT[local.status]} />],
              ['Preferred Country',local.preferredCountry?.name || '—'],
              ['Intake',           local.intake || '—'],
              ['Source',           <Typography key="src" component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>{sourceLabel(local)}</Typography>],
              ['Created',          fmtDateTime(local.createdAt)],
            ].map(([label, value]) => (
              <TableRow key={label}><TableCell sx={thSx}>{label}</TableCell><TableCell sx={tdSx}>{value}</TableCell></TableRow>
            ))}
          </TableBody></Table>
        </AppCard>

        <AppCard title="Reward Information" icon={<PaymentsIcon sx={{ fontSize: 16, color: 'primary.main' }} />} contentSx={{ pt: 1.5 }}>
          <Table size="small"><TableBody>
            {[
              ['Reward Amount',   <Typography key="a" sx={{ fontWeight: 700, fontSize: 14 }}>₹{(local.rewardAmount || 0).toLocaleString('en-IN')}</Typography>],
              ['Eligibility',     (() => { const rs = local.rewardStatus; const el = rs === 'eligible' || rs === 'processing' || rs === 'paid'; return <DotStatus key="el" label={el ? 'Eligible' : REWARD_LABEL[rs] || 'Not eligible'} dotColor={el ? 'success.main' : rs === 'cancelled' ? 'error.main' : 'text.disabled'} />; })()],
              ['Reward Status',   <DotStatus key="rs" label={REWARD_LABEL[local.rewardStatus] || local.rewardStatus} dotColor={REWARD_DOT[local.rewardStatus]} />],
              ['Processing Date', fmtDateTime(local.processingAt)],
              ['Processed By',    local.processedBy?.name || '—'],
              ['Paid Date',       fmtDateTime(local.paidAt)],
              ['Paid By',         local.paidBy?.name || '—'],
            ].map(([label, value]) => (
              <TableRow key={label}><TableCell sx={thSx}>{label}</TableCell><TableCell sx={tdSx}>{value}</TableCell></TableRow>
            ))}
          </TableBody></Table>
        </AppCard>

        {history.length > 0 && (
          <AppCard title="Reward History" icon={<HistoryIcon sx={{ fontSize: 16, color: 'primary.main' }} />} contentSx={{ pt: 1.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {history.map((entry, i) => (
                <Box key={i} sx={{ py: 1, px: 1.25, borderRadius: 1, bgcolor: i === 0 ? 'grey.50' : 'transparent', border: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 500 }}>{REWARD_LABEL[entry.from] || entry.from}</Typography>
                    <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>→</Typography>
                    <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 500 }}>{REWARD_LABEL[entry.to] || entry.to}</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: 12 }}>
                    {fmtDateTime(entry.at)}{entry.by?.name ? ` · by ${entry.by.name}` : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          </AppCard>
        )}

        {(hasReward || hasStatus) && (
          <AppCard title="Actions" icon={<RuleIcon sx={{ fontSize: 16, color: 'primary.main' }} />} contentSx={{ pt: 1.5 }}>
            {hasStatus && (
              <Box sx={{ mb: hasReward ? 2 : 0 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: 12.5, fontWeight: 500 }}>Referral Status</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {available.map((s) => <SecondaryButton key={s} size="small" loading={statusLoading} onClick={() => handleStatusUpdate(s)}>Mark as {s}</SecondaryButton>)}
                </Stack>
              </Box>
            )}
            {hasReward && (
              <Box>
                {hasStatus && <Divider sx={{ mb: 2 }} />}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: 12.5, fontWeight: 500 }}>Reward Actions</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {canProc   && <SecondaryButton size="small" startIcon={<AutorenewIcon sx={{ fontSize: 14 }} />} loading={rewardLoading} onClick={() => handleRewardUpdate('processing')}>Mark Processing</SecondaryButton>}
                  {canPaid   && <PrimaryButton   size="small" startIcon={<CheckCircleIcon sx={{ fontSize: 14 }} />} loading={rewardLoading} onClick={() => handleRewardUpdate('paid')}>Mark Paid</PrimaryButton>}
                  {canCancel && <SecondaryButton size="small" startIcon={<StopCircleIcon sx={{ fontSize: 14 }} />} loading={rewardLoading} color="error" onClick={() => handleRewardUpdate('cancelled')}>Cancel Reward</SecondaryButton>}
                </Stack>
              </Box>
            )}
          </AppCard>
        )}
      </Stack>
    </AppDialog>
  );
}

/* ── Public QR dialog ───────────────────────────────────────────── */
function PublicQRDialog({ onClose }) {
  const { toast } = useToast();
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const referralLink = `${window.location.origin}/refer`;

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(referralLink, { width: 300, margin: 2, color: { dark: '#1e1b4b', light: '#ffffff' } }))
      .then((url)  => { if (!cancelled) setQrDataUrl(url); })
      .catch(()    => { if (!cancelled) setError('Failed to generate QR code'); })
      .finally(()  => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [referralLink]);

  const copyLink   = async () => { try { await navigator.clipboard.writeText(referralLink); toast('Link copied', 'success'); } catch { toast('Failed to copy', 'danger'); } };
  const downloadQR = () => { if (!qrDataUrl) return; const a = Object.assign(document.createElement('a'), { href: qrDataUrl, download: 'tasa-public-referral-qr.png' }); document.body.appendChild(a); a.click(); a.remove(); toast('QR downloaded', 'success'); };

  return (
    <AppDialog open onClose={onClose} size="sm" title="Public Referral QR"
      footer={
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <SecondaryButton size="small" onClick={onClose}>Close</SecondaryButton>
          {qrDataUrl && <PrimaryButton size="small" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />} onClick={downloadQR}>Download QR</PrimaryButton>}
        </Box>
      }
    >
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
       : error  ? <Alert severity="error">{error}</Alert>
        : qrDataUrl && (
          <Stack spacing={1.75} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', fontSize: 12.5 }}>Scan to submit a referral</Typography>

            <Box sx={{ alignSelf: 'center', p: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, lineHeight: 0 }}>
              <Box component="img" src={qrDataUrl} alt="Public referral QR" sx={{ display: 'block', width: 176, height: 176, borderRadius: 0.5, imageRendering: 'pixelated' }} />
            </Box>

            <Divider sx={{ width: '100%' }} />

            <Box sx={{ width: '100%' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: 12.5 }}>Public Referral Link</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 13, color: 'primary.main', wordBreak: 'break-all', bgcolor: 'grey.50', px: 1, py: 0.75, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>{referralLink}</Typography>
                <AppIconButton title="Copy link" onClick={copyLink} size="small"><ContentCopyIcon sx={{ fontSize: 16 }} /></AppIconButton>
              </Box>
            </Box>

            <Alert severity="info" sx={{ width: '100%', fontSize: 12.5 }}>Anyone who scans this QR or opens this link can submit a referral.</Alert>
          </Stack>
        )
      }
    </AppDialog>
  );
}

/* ── Generate Referral dialog ───────────────────────────────────── */
function GenerateReferralDialog({ students, generating, onGenerate, onClose }) {
  const [selectedId, setSelectedId] = useState('');
  return (
    <AppDialog open onClose={onClose} size="sm" title="Generate Referral Link" subtitle="Select a student to generate a referral code"
      footer={<Stack direction="row" spacing={1} sx={{ px: 3, py: 1.5 }}><SecondaryButton size="small" onClick={onClose} disabled={generating}>Cancel</SecondaryButton><PrimaryButton size="small" startIcon={<PersonAddIcon sx={{ fontSize: 14 }} />} loading={generating} disabled={!selectedId || generating} onClick={() => onGenerate(selectedId)}>Generate</PrimaryButton></Stack>}
    >
      <Box component="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={generating}
        sx={{ width: '100%', p: 1.25, borderRadius: 1, border: '1px solid', borderColor: 'divider', fontSize: 14, bgcolor: 'background.paper', color: 'text.primary', outline: 'none', '&:focus': { borderColor: 'primary.main' } }}>
        <option value="">— Select a student —</option>
        {students.map((s) => <option key={s.id} value={s.id}>{s.studentName} ({s.referenceId})</option>)}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontSize: 12.5 }}>
        A unique referral code will be generated. The code remains stable across subsequent requests.
      </Typography>
    </AppDialog>
  );
}

/* ── Edit Referral dialog ───────────────────────────────────────── */
const fieldSx  = { width: '100%', p: 1.25, borderRadius: 1, border: '1px solid', borderColor: 'divider', fontSize: 14, bgcolor: 'background.paper', color: 'text.primary', outline: 'none', '&:focus': { borderColor: 'primary.main' } };
const labelSx  = { display: 'block', mb: 0.5, fontSize: 12.5, fontWeight: 600, color: 'text.secondary' };

function EditReferralDialog({ referral, saving, onSave, onClose }) {
  const [form, setForm] = useState({
    referredName:   referral.referredName   || '',
    referredMobile: referral.referredMobile || '',
    referredEmail:  referral.referredEmail  || '',
    intake:         referral.intake         || '',
    rewardAmount:   referral.rewardAmount   ?? '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <AppDialog open onClose={onClose} size="sm" title="Edit Referral" subtitle={`${referral.referralCode} · ${referrerNameOf(referral)}`}
      footer={<Stack direction="row" spacing={1} sx={{ px: 3, py: 1.5 }}><SecondaryButton size="small" onClick={onClose} disabled={saving}>Cancel</SecondaryButton><PrimaryButton size="small" loading={saving} disabled={saving} onClick={() => onSave(form)}>Save Changes</PrimaryButton></Stack>}
    >
      <Stack spacing={1.75}>
        <Box><Typography component="label" sx={labelSx}>Referred Student Name</Typography><Box component="input" value={form.referredName}   onChange={set('referredName')}   sx={fieldSx} /></Box>
        <Box><Typography component="label" sx={labelSx}>Mobile</Typography>              <Box component="input" value={form.referredMobile} onChange={set('referredMobile')} sx={fieldSx} /></Box>
        <Box><Typography component="label" sx={labelSx}>Email</Typography>               <Box component="input" type="email" value={form.referredEmail} onChange={set('referredEmail')} sx={fieldSx} /></Box>
        <Box><Typography component="label" sx={labelSx}>Intake</Typography>              <Box component="input" value={form.intake} onChange={set('intake')} placeholder="e.g. Fall 2026" sx={fieldSx} /></Box>
        <Box><Typography component="label" sx={labelSx}>Reward Amount (₹)</Typography>  <Box component="input" type="number" min="0" value={form.rewardAmount} onChange={set('rewardAmount')} sx={fieldSx} /></Box>
        <Alert severity="info" sx={{ fontSize: 12.5 }}>Status and reward lifecycle are managed from the referral details dialog.</Alert>
      </Stack>
    </AppDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ReferralManagement — main page
   ═══════════════════════════════════════════════════════════════════ */
export default function ReferralManagement({ onNavigate }) {
  const { toast } = useToast();

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rewardFilter, setRewardFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [page,         setPage]         = useState(0);
  const [pageSize,     setPageSize]     = useState(20);

  const [detailReferral, setDetailReferral] = useState(null);
  const [detailQR,       setDetailQR]       = useState(null);
  const [menuRow,        setMenuRow]        = useState(null);
  const [editRow,        setEditRow]        = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [publicQROpen,   setPublicQROpen]   = useState(false);
  const [generateOpen,   setGenerateOpen]   = useState(false);
  const [students,       setStudents]       = useState([]);
  const [generating,     setGenerating]     = useState(false);
  /* ── Stats (unfiltered, all pages) ─────────────────────────── */
  const statsFetcher = useCallback(async () => {
    const first = await fetchReferrals({ page: 1, limit: 100 });
    const pages = first.meta.pages || 1;
    if (pages <= 1) return { referrals: first.referrals, total: first.meta.total };
    const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchReferrals({ page: i + 2, limit: 100 })));
    return { referrals: [...first.referrals, ...rest.flatMap((r) => r.referrals)], total: first.meta.total };
  }, []);
  const { data: statsData } = useCachedFetch('referral-stats', statsFetcher, { staleTime: 60_000 });

  const stats = useMemo(() => {
    if (!statsData) return null;
    const list = statsData.referrals ?? [];
    const byStatus = { '': list.length, pending: 0, contacted: 0, qualified: 0, converted: 0, rejected: 0 };
    list.forEach((r) => { if (byStatus[r.status] !== undefined) byStatus[r.status]++; });
    return {
      total:       statsData.total ?? 0,
      byStatus,
      eligible:    list.filter((r) => ['eligible','processing','paid'].includes(r.rewardStatus)).length,
      rewardValue: list.reduce((s, r) => s + (Number(r.rewardAmount) || 0), 0),
    };
  }, [statsData]);

  /* ── Paginated fetch ────────────────────────────────────────── */
  const fetcher = useCallback(async () => {
    const params = { page: page + 1, limit: pageSize };
    if (search)       params.search       = search;
    if (statusFilter) params.status       = statusFilter;
    if (rewardFilter) params.rewardStatus = rewardFilter;
    if (sourceFilter) params.source       = sourceFilter;
    if (dateFrom)     params.from         = dateFrom;
    if (dateTo)       params.to           = dateTo;
    const { referrals: data, meta } = await fetchReferrals(params);
    return { referrals: data.map((r) => ({ ...r, id: r._id })), total: meta.total };
  }, [page, pageSize, statusFilter, rewardFilter, sourceFilter, dateFrom, dateTo]);

  const { data, loading, error, refetch } = useCachedFetch(
    `referrals-${page}-${pageSize}-${statusFilter}-${rewardFilter}-${sourceFilter}-${dateFrom}-${dateTo}`,
    fetcher, { staleTime: 15_000 }
  );
  const referrals  = data?.referrals ?? [];
  const totalCount = data?.total     ?? 0;

  /* ── Handlers ───────────────────────────────────────────────── */
  const openGenerate = async () => {
    setGenerateOpen(true);
    if (students.length === 0) {
      try { setStudents(await fetchLeadOptions()); }
      catch { toast('Failed to load students', 'danger'); }
    }
  };
  const handleGenerate = async (studentId) => {
    if (!studentId) { toast('Select a student first', 'warning'); return; }
    setGenerating(true);
    try {
      const result = await getStudentQRCode(studentId);
      setGenerateOpen(false); toast('Referral link generated', 'success'); refetch();
      setDetailReferral(result.referral); setDetailQR(result.qrDataUrl);
    } catch (err) { toast(err?.response?.data?.message || 'Failed to generate referral', 'danger'); }
    finally { setGenerating(false); }
  };

  const getStudentId = (ref) => { const s = ref?.referrerStudent; if (!s) return null; return (typeof s === 'object' && s._id) || (typeof s === 'string' ? s : null); };

  const openDetail = async (referral) => {
    setDetailQR(null);
    try {
      const full = await getReferralById(referral.id || referral._id);
      setDetailReferral(full || referral);
      const sid = getStudentId(full || referral);
      if (sid) { const r = await getStudentQRCode(sid); setDetailQR(r.qrDataUrl); }
    } catch { setDetailReferral(referral); setDetailQR(null); }
  };

  const openStudentJourney = (lead) => { if (!lead?._id) return; onNavigate?.('leads', { openLeadId: lead._id }); };
  const openReferrer       = (row) => {
    const sid = getStudentId(row);
    if (sid && !isEmployeeSource(row)) { onNavigate?.('leads', { openLeadId: sid }); return; }
    onNavigate?.('users');
  };
  const copyCode = async (ref) => { try { await navigator.clipboard.writeText(ref.referralCode); toast('Code copied', 'success'); } catch { toast('Failed to copy', 'danger'); } };
  const closeMenu = () => setMenuRow(null);

  const handleToggleActive = async (row) => {
    const next = row.isActive === false;
    if (!window.confirm(`${next ? 'Activate' : 'Deactivate'} referral ${row.referralCode}?${next ? '' : ' Its public link and QR will stop accepting referrals.'}`)) return;
    try { await setReferralActive(row.id || row._id, next); toast(`Referral ${next ? 'activated' : 'deactivated'}`, 'success'); refetch(); }
    catch (err) { toast(err?.response?.data?.message || 'Failed to update', 'danger'); }
  };
  const handleDeleteReferral = async (row) => {
    if (!window.confirm(`Permanently delete referral ${row.referralCode}? This cannot be undone.`)) return;
    try { await deleteReferral(row.id || row._id); toast('Referral deleted', 'success'); refetch(); }
    catch (err) { toast(err?.response?.data?.message || 'Failed to delete', 'danger'); }
  };
  const handleEditSave = async (form) => {
    setSaving(true);
    try {
      const payload = {
        referredName: form.referredName, referredMobile: form.referredMobile,
        ...(form.referredEmail ? { referredEmail: form.referredEmail } : { referredEmail: '' }),
        intake: form.intake,
        ...(form.rewardAmount !== '' && form.rewardAmount !== null ? { rewardAmount: Number(form.rewardAmount) } : {}),
      };
      await updateReferral(editRow.id || editRow._id, payload);
      toast('Referral updated', 'success'); setEditRow(null); refetch();
    } catch (err) { toast(err?.response?.data?.message || 'Failed to update', 'danger'); }
    finally { setSaving(false); }
  };
  const handleExport = async () => {
    try {
      const base = { limit: 100, ...(search ? { search } : {}), ...(statusFilter ? { status: statusFilter } : {}), ...(rewardFilter ? { rewardStatus: rewardFilter } : {}), ...(sourceFilter ? { source: sourceFilter } : {}), ...(dateFrom ? { from: dateFrom } : {}), ...(dateTo ? { to: dateTo } : {}) };
      const first = await fetchReferrals({ ...base, page: 1 });
      const pages = first.meta.pages || 1;
      const rest  = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchReferrals({ ...base, page: i + 2 }))) : [];
      downloadRefCsv([...first.referrals, ...rest.flatMap((r) => r.referrals)]);
      toast('Export downloaded', 'success');
    } catch { toast('Failed to export', 'danger'); }
  };

  /* ── Table columns ─────────────────────────────────────────── */
  const columns = [
    {
      key: 'referrerStudent', label: 'Referrer', sortable: true, width: '15%', accessor: (row) => referrerNameOf(row),
      render: (_, row) => (
        <Typography component="span" onClick={(e) => { e.stopPropagation(); openReferrer(row); }}
          sx={{ fontSize: 13, fontWeight: 500, cursor: onNavigate ? 'pointer' : 'default', '&:hover': onNavigate ? { color: 'primary.main', textDecoration: 'underline' } : undefined }}>
          {referrerNameOf(row)}
        </Typography>
      ),
    },
    {
      key: 'referredLead', label: 'Referred Student', sortable: false, width: '16%',
      render: (_, row) => {
        const lead = row.referredLead;
        const name = lead ? studentName(lead) : row.referredName || '—';
        if (!lead?._id) return <Typography sx={{ fontSize: 13 }}>{name}</Typography>;
        return (
          <Typography component="span" onClick={(e) => { e.stopPropagation(); openStudentJourney(lead); }}
            sx={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}>
            {name}
          </Typography>
        );
      },
    },
    {
      key: 'referralCode', label: 'Code', sortable: true, width: '10%',
      render: (_, row) => (
        <Tooltip title="Click to copy" arrow placement="top">
          <Box component="span" onClick={(e) => { e.stopPropagation(); copyCode(row); }}
            sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12.5, letterSpacing: '0.03em', cursor: 'pointer', borderBottom: '1px dashed transparent', '&:hover': { color: 'primary.main', borderBottomColor: 'primary.main' } }}>
            {row.referralCode}
          </Box>
        </Tooltip>
      ),
    },
    {
      key: 'status', label: 'Status', sortable: true, width: '12%',
      render: (_, row) => <ReferralStatusCell row={row} />,
    },
    {
      key: 'rewardAmount', label: 'Reward', align: 'right', sortable: false, width: '10%',
      render: (_, row) => <Typography sx={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>₹{(row.rewardAmount || 0).toLocaleString('en-IN')}</Typography>,
    },
    {
      key: 'rewardStatus', label: 'Reward Status', sortable: true, width: '13%',
      render: (_, row) => <DotStatus label={REWARD_LABEL[row.rewardStatus] || row.rewardStatus} dotColor={REWARD_DOT[row.rewardStatus]} />,
    },
    {
      key: 'source', label: 'Source', sortable: true, width: '13%', accessor: (row) => sourceLabel(row),
      render: (_, row) => <Typography sx={{ fontSize: 12.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>{sourceLabel(row)}</Typography>,
    },
    {
      key: 'createdAt', label: 'Created', sortable: true, width: '11%',
      render: (_, row) => <Typography sx={{ fontSize: 12.5, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(row.createdAt)}</Typography>,
    },
  ];

  /* ── Toolbar (one compact row: filters left, actions right) ─── */
  const toolbar = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.875, py: 0.625, px: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50', flexShrink: 0, flexWrap: 'wrap' }}>
      <SearchField
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, mobile, email or code…"
        sx={{ minWidth: 160, flex: '1 1 200px', maxWidth: 260, '& .MuiOutlinedInput-root': { minHeight: 30, bgcolor: 'background.paper' } }}
      />

      <FilterSelect label="Reward Status" value={rewardFilter} onChange={(e) => { setRewardFilter(e.target.value); setPage(0); }}
        options={REWARD_OPTIONS} sx={{ minWidth: 122, height: 30 }} />
      <FilterSelect label="Source" value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
        options={SOURCE_OPTIONS} sx={{ minWidth: 112, height: 30 }} />

      <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

      <TextField
        type="date" size="small" label="From" value={dateFrom}
        onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 130, '& .MuiOutlinedInput-root': { minHeight: 30, bgcolor: 'background.paper' } }}
      />
      <TextField
        type="date" size="small" label="To" value={dateTo}
        onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 130, '& .MuiOutlinedInput-root': { minHeight: 30, bgcolor: 'background.paper' } }}
      />

      <Box sx={{ flex: 1 }} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
        <Tooltip title="Refresh"><span>
          <SecondaryButton size="small" onClick={() => refetch()} sx={{ minWidth: 0, px: 1, height: 30 }}>
            <RefreshIcon sx={{ fontSize: 15 }} />
          </SecondaryButton>
        </span></Tooltip>
        <SecondaryButton size="small" startIcon={<FileDownloadIcon sx={{ fontSize: 13 }} />} onClick={handleExport} sx={{ minWidth: 0, px: 1, fontSize: 12.5, height: 30, textTransform: 'none' }}>Export CSV</SecondaryButton>
        <SecondaryButton size="small" startIcon={<QrCodeIcon sx={{ fontSize: 13 }} />} onClick={() => setPublicQROpen(true)} sx={{ minWidth: 0, px: 1, fontSize: 12.5, height: 30, textTransform: 'none' }}>Public QR</SecondaryButton>
      </Box>
    </Box>
  );

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
      {/* Fills the viewport and owns a fixed-height internal scroll area,
         matching Lead/University Management, so the table reads as the
         page's primary workspace instead of a small block floating above a
         large empty canvas. */}
      <CrmListShell
        title="Referral Management"
        headerActions={
          <PrimaryButton size="small" startIcon={<PersonAddIcon sx={{ fontSize: 14 }} />} onClick={openGenerate}>
            Generate Referral
          </PrimaryButton>
        }
        tabs={PIPELINE_TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: t.key === '' ? (stats?.total ?? 0) : (stats?.byStatus?.[t.key] ?? 0),
        }))}
        activeTab={statusFilter}
        onTabChange={(key) => { setStatusFilter(key); setPage(0); }}
        error={error}
      >
        <DataTable
          columns={columns}
          data={referrals}
          loading={loading}
          dense
          keyField="id"
          onRowClick={openDetail}
          controlledPage={page}
          onPageChange={(_, next) => setPage(next)}
          controlledPageSize={pageSize}
          onPageSizeChange={(s) => { setPageSize(Number(s)); setPage(0); }}
          totalCount={totalCount}
          initialSortKey="createdAt"
          initialSortDir="desc"
          pageSizeOptions={[10, 20, 50]}
          emptyTitle="No referrals found"
          emptyText="Generate a referral link for a student to get started."
          toolbar={toolbar}
          renderActions={(row) => (
            <AppIconButton title="Row actions" size="small" onClick={(e) => { e.stopPropagation(); setMenuRow({ row, el: e.currentTarget }); }}>
              <MoreVertIcon sx={{ fontSize: 17 }} />
            </AppIconButton>
          )}
          containerSx={{
            maxHeight: 'calc(100vh - 260px)',
            '& .MuiTableCell-root': { px: 1.125 },
            '& .MuiTableCell-head': { py: 0.625, fontSize: 10.5, bgcolor: 'grey.50' },
            '& .MuiTableCell-body': { py: 0.625, fontSize: 12.5 },
          }}
        />
      </CrmListShell>

      {/* ── Row kebab menu ───────────────────────────────────────── */}
      <Menu open={!!menuRow} anchorEl={menuRow?.el ?? null} onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { elevation: 0, sx: { mt: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, minWidth: 200, py: 0.25 } } }}>
        <MenuItem dense onClick={() => { const r = menuRow.row; closeMenu(); openDetail(r); }} sx={{ fontSize: 13, py: 0.75 }}>
          <InfoOutlinedIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />View Referral
        </MenuItem>
        {!!menuRow?.row.referredLead?._id && (
          <MenuItem dense onClick={() => { const lead = menuRow.row.referredLead; closeMenu(); openStudentJourney(lead); }} sx={{ fontSize: 13, py: 0.75 }}>
            <OpenInNewIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />View Student
          </MenuItem>
        )}
        <MenuItem dense onClick={() => { const r = menuRow.row; closeMenu(); openReferrer(r); }} sx={{ fontSize: 13, py: 0.75 }}>
          <PersonOutlineOutlinedIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />View Referrer
        </MenuItem>
        <MenuItem dense onClick={() => { const r = menuRow.row; closeMenu(); copyCode(r); }} sx={{ fontSize: 13, py: 0.75 }}>
          <ContentCopyIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />Copy Referral Code
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem dense onClick={() => { const r = menuRow.row; closeMenu(); setEditRow(r); }} sx={{ fontSize: 13, py: 0.75 }}>
          <EditOutlinedIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />Edit Referral
        </MenuItem>
        <MenuItem dense onClick={() => { const r = menuRow.row; closeMenu(); handleToggleActive(r); }} sx={{ fontSize: 13, py: 0.75 }}>
          {menuRow?.row.isActive === false
            ? <PlayCircleOutlinedIcon sx={{ fontSize: 16, mr: 1.25, color: 'success.main' }} />
            : <BlockIcon sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />}
          {menuRow?.row.isActive === false ? 'Activate Referral' : 'Deactivate Referral'}
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem dense onClick={() => { const r = menuRow.row; closeMenu(); handleDeleteReferral(r); }} sx={{ fontSize: 13, py: 0.75, color: 'error.main' }}>
          <DeleteOutlinedIcon sx={{ fontSize: 16, mr: 1.25 }} />Delete Referral
        </MenuItem>
      </Menu>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      {editRow && <EditReferralDialog referral={editRow} saving={saving} onSave={handleEditSave} onClose={() => setEditRow(null)} />}
      {generateOpen && <GenerateReferralDialog students={students} generating={generating} onGenerate={handleGenerate} onClose={() => setGenerateOpen(false)} />}
      {detailReferral && <ReferralDetailDialog referral={detailReferral} qrDataUrl={detailQR} onClose={() => { setDetailReferral(null); setDetailQR(null); }} onOpenStudent={openStudentJourney} onRefresh={refetch} />}
      {publicQROpen && <PublicQRDialog onClose={() => setPublicQROpen(false)} />}
    </>
  );
}
