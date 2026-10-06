import { useCallback, useEffect, useState } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { AppDialog, AppIconButton, DataTable, FilterSelect, SearchField, StatusChip } from '../../ui/mui/index.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { fetchPayments, fetchPaymentSummary, fetchPayment } from '../../api/payments.js';

const STATUS_LABELS = {
  'pending':         'Pending',
  'link-sent':       'Link Sent',
  'partially-paid':  'Partially Paid',
  'paid':            'Paid',
  'failed':          'Failed',
  'refunded':        'Refunded',
};

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending',      value: 'pending' },
  { label: 'Link Sent',    value: 'link-sent' },
  { label: 'Partially Paid', value: 'partially-paid' },
  { label: 'Paid',         value: 'paid' },
  { label: 'Failed',       value: 'failed' },
  { label: 'Refunded',     value: 'refunded' },
];

const TYPE_OPTIONS = [
  { label: 'All Types',        value: '' },
  { label: 'Registration Fee', value: 'Registration Fee' },
  { label: 'Application Fee',  value: 'Application Fee' },
  { label: 'Other Fee',        value: 'Other Fee' },
];

const fmtCurrency = (v) => {
  if (v == null || v === 0) return '₹0';
  return `₹${Number(v).toLocaleString('en-IN')}`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const initialsOf = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '—';

const statusTone = (v) => {
  switch (v) {
    case 'paid':            return 'success';
    case 'pending':         return 'warning';
    case 'link-sent':       return 'info';
    case 'partially-paid':  return 'info';
    case 'failed':          return 'danger';
    default:                return 'neutral';
  }
};

const STAGE_CHIP_SX = { height: 22, fontSize: 11, fontWeight: 600, '& .MuiChip-label': { px: 0.75 } };

const columns = [
  {
    key: 'studentName',
    label: 'Student',
    sortable: true,
    width: 200,
    render: (v, row) => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.01em',
            bgcolor: 'primary.soft', color: 'primary.main',
          }}
        >
          {initialsOf(v)}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {v || '—'}
          </Typography>
          {row.referenceId && (
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: 'monospace', lineHeight: 1.4, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.referenceId}
            </Typography>
          )}
        </Box>
      </Box>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: 118,
    render: (v) => (
      <StatusChip
        status={STATUS_LABELS[v] || v || 'Pending'}
        tone={statusTone(v)}
        variant="outlined"
        dot={false}
        sx={STAGE_CHIP_SX}
      />
    ),
  },
  {
    key: 'paymentType',
    label: 'Type',
    sortable: true,
    width: 130,
    render: (v) => <Typography sx={{ fontSize: 12.5, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v || '—'}</Typography>,
  },
  {
    key: 'amount',
    label: 'Amount',
    sortable: true,
    align: 'right',
    width: 118,
    render: (v, row) => (
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {fmtCurrency(v)} <Typography component="span" sx={{ fontSize: 10.5, color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>{row.currency || 'INR'}</Typography>
      </Typography>
    ),
  },
  {
    key: 'dueDate',
    label: 'Due',
    sortable: true,
    align: 'right',
    width: 92,
    render: (v) => <Typography sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDate(v)}</Typography>,
  },
  {
    key: 'paidDate',
    label: 'Paid',
    sortable: true,
    align: 'right',
    width: 92,
    render: (v) => <Typography sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDate(v)}</Typography>,
  },
  {
    key: 'transactionRef',
    label: 'Txn Ref',
    width: 130,
    render: (v) => (
      <Typography sx={{ fontSize: 11, color: v ? 'text.primary' : 'text.disabled', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {v || '—'}
      </Typography>
    ),
  },
];

export default function CounselorPayments() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPayment, setDetailPayment] = useState(null);

  const listParamsKey = `page=${page + 1}&limit=${pageSize}&search=${search}&status=${statusFilter}&type=${typeFilter}&sort=${sortDir === 'desc' ? `-${sortKey}` : sortKey}`;

  const fetchList = useCallback(async () => {
    const params = { page: page + 1, limit: pageSize };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.paymentType = typeFilter;
    if (sortKey) params.sort = sortDir === 'desc' ? `-${sortKey}` : sortKey;
    const res = await fetchPayments(params);
    return res;
  }, [page, pageSize, search, statusFilter, typeFilter, sortKey, sortDir]);

  const fetchSummary = useCallback(async () => {
    return fetchPaymentSummary();
  }, []);

  const { data: listData, error: listError, loading: listLoading } = useCachedFetch(`counselor-payments-list:${listParamsKey}`, fetchList, { refetchInterval: 30000 });
  const { data: summary } = useCachedFetch('counselor-payments-summary', fetchSummary, { refetchInterval: 30000 });

  const payments = listData?.payments || [];
  const total = listData?.total || 0;
  const loading = listLoading && payments.length === 0;
  const error = listError;
  const filtering = Boolean(search || statusFilter || typeFilter);

  useEffect(() => { setPage(0); }, [search, statusFilter, typeFilter]);

  const handleSortChange = useCallback((key, dir) => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  const handleView = useCallback(async (row) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const payment = await fetchPayment(row._id);
      setDetailPayment(payment);
    } catch {
      setDetailPayment(row);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const renderActions = useCallback(
    (row) => (
      <AppIconButton title="View payment details" onClick={() => handleView(row)}>
        <VisibilityIcon sx={{ fontSize: 16 }} />
      </AppIconButton>
    ),
    [handleView]
  );

  const kpis = [
    { key: 'students', label: 'Students', value: summary?.totalStudents ?? 0, color: 'primary.main' },
    { key: 'pending', label: 'Pending', value: summary?.pending ?? 0, color: 'warning.main' },
    { key: 'linkSent', label: 'Link Sent', value: summary?.linkSent ?? 0, color: 'info.main' },
    { key: 'paid', label: 'Paid', value: summary?.paid ?? 0, color: 'success.main' },
    { key: 'collected', label: 'Collected', value: fmtCurrency(summary?.totalCollected ?? 0), color: 'success.main' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, px: 0.5 }}>
      {/* ── Page header ───────────────────────────────────────────── */}
      <Box sx={{ flexShrink: 0, mb: 1.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'text.primary', lineHeight: 1.25, letterSpacing: '-0.01em' }}>
          Payments
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
          Track student payment status, dues and transaction activity.
        </Typography>
      </Box>

      {/* ── Compact KPI strip ─────────────────────────────────────── */}
      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          mb: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        {kpis.map((k) => (
          <Box
            key={k.key}
            sx={{
              flex: '1 1 0%',
              minWidth: { xs: '50%', sm: 128 },
              px: 1.75,
              py: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              minHeight: 52,
              justifyContent: 'center',
              '& + &': { borderInlineStart: { md: '1px solid' }, borderInlineStartColor: { md: 'divider' } },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: k.color, flexShrink: 0 }} />
              <Typography component="span" sx={{ fontSize: 11, fontWeight: 500, color: 'text.disabled', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {k.label}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.1, color: k.color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {k.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── Error banner ──────────────────────────────────────────── */}
      {error && (
        <Box sx={{ mb: 1.5, p: 1.25, border: 1, borderColor: 'error.light', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'error.soft' }}>
          <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
          <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>{error}</Typography>
        </Box>
      )}

      {/* ── Table container ───────────────────────────────────────── */}
      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          overflow: 'hidden',
          boxShadow: 1,
        }}
      >
        {loading && payments.length === 0 ? (
          <Box sx={{ p: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}
          </Box>
        ) : (
          <DataTable
            columns={columns}
            data={payments}
            keyField="_id"
            dense
            sortable
            emptyTitle={filtering ? 'No matching payment records' : 'No payment records'}
            emptyText={filtering ? 'Try changing or clearing your filters.' : 'Payments will appear here once payment records are created.'}
            emptyCellSx={{ py: 5 }}
            renderActions={renderActions}
            toolbar={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%', py: 1.25, px: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                <SearchField placeholder="Search by student or ref ID..." sx={{ flex: '1 1 240px', maxWidth: 480, minWidth: 210 }} value={search} onChange={(e) => setSearch(e.target.value)} />
                <FilterSelect label="Status" options={STATUS_OPTIONS} sx={{ width: 148 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
                <FilterSelect label="Type" options={TYPE_OPTIONS} sx={{ width: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
                <Typography sx={{ ml: 'auto', fontSize: 12, color: 'text.disabled', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {total} {total === 1 ? 'record' : 'records'}
                </Typography>
              </Box>
            }
            containerSx={{ maxHeight: 'max(320px, calc(100vh - 300px))' }}
            controlledPage={page}
            onPageChange={(_, p) => setPage(p)}
            controlledPageSize={pageSize}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setPage(0); }}
            controlledSortKey={sortKey}
            controlledSortDir={sortDir}
            onSortChange={handleSortChange}
            totalCount={total}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        )}
      </Box>

      {/* ── Payment Details Modal ───────────────────────────────────── */}
      <AppDialog
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailPayment(null); }}
        title="Payment Details"
        subtitle={detailPayment?.studentName ? `${detailPayment.studentName} — ${detailPayment.referenceId || ''}` : ''}
        size="md"
        footer={null}
      >
        {detailLoading ? (
          <Box sx={{ py: 3 }}>
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={28} sx={{ mb: 1 }} />)}
          </Box>
        ) : detailPayment ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 0.5 }}>
            <DetailRow label="Student" value={detailPayment.studentName} />
            <DetailRow label="Reference ID" value={detailPayment.referenceId} />
            <DetailRow label="Payment Type" value={detailPayment.paymentType} />
            <DetailRow label="Amount" value={`${fmtCurrency(detailPayment.amount)} ${detailPayment.currency || 'INR'}`} />
            <DetailRow label="Status">
              <StatusChip status={STATUS_LABELS[detailPayment.status] || detailPayment.status} size="small" />
            </DetailRow>
            <DetailRow label="Due Date" value={fmtDate(detailPayment.dueDate)} />
            <DetailRow label="Paid Date" value={fmtDate(detailPayment.paidDate)} />
            <DetailRow label="Transaction Ref" value={detailPayment.transactionRef || '—'} mono />
            <DetailRow label="Payment Link" value={detailPayment.paymentLink || '—'} />
            <DetailRow label="Remarks" value={detailPayment.remarks || '—'} />
            <DetailRow label="Created" value={fmtDate(detailPayment.createdAt)} />
            <DetailRow label="Last Updated" value={fmtDate(detailPayment.updatedAt)} />
            {detailPayment.createdBy && (
              <DetailRow
                label="Created By"
                value={[detailPayment.createdBy.firstName, detailPayment.createdBy.lastName].filter(Boolean).join(' ') || detailPayment.createdBy.email}
              />
            )}
          </Box>
        ) : null}
      </AppDialog>
    </Box>
  );
}

function DetailRow({ label, value, children, mono }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: '1px solid', borderColor: 'divider', gap: 2 }}>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', flexShrink: 0 }}>{label}</Typography>
      {children || (
        <Typography sx={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: mono ? 'monospace' : undefined }}>
          {value || '—'}
        </Typography>
      )}
    </Box>
  );
}