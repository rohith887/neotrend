import { useCallback, useEffect, useState } from 'react';
import { Box, Divider, Grid, Skeleton, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { DataTable, SearchField, FilterSelect, StatusChip, PrimaryButton, SecondaryButton } from '../../ui/mui/index.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import {
  fetchRegistrationQueue,
  fetchRegistrationDetail,
  updateRegistration,
} from '../../api/counselor.js';
import { CountryLabel } from '../../utils/flag.jsx';

const REG_STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Not Started', value: 'not-started' },
  { label: 'Registration Pending', value: 'registration-pending' },
  { label: 'Agreement Pending', value: 'agreement-pending' },
  { label: 'Fee Pending', value: 'fee-pending' },
  { label: 'Fee Received', value: 'fee-received' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const REG_STATUS_LABELS = {
  'not-started': 'Not Started',
  'registration-pending': 'Registration Pending',
  'agreement-pending': 'Agreement Pending',
  'fee-pending': 'Fee Pending',
  'fee-received': 'Fee Received',
  submitted: 'Submitted',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const REG_STATUS_TONES = {
  'not-started': 'neutral',
  'registration-pending': 'warning',
  'agreement-pending': 'warning',
  'fee-pending': 'warning',
  'fee-received': 'info',
  submitted: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

const AGREEMENT_OPTIONS = [
  { label: 'Not Started', value: 'not-started' },
  { label: 'Pending', value: 'pending' },
  { label: 'Signed', value: 'signed' },
];

const FEE_OPTIONS = [
  { label: 'Not Applicable', value: 'not-applicable' },
  { label: 'Pending', value: 'pending' },
  { label: 'Received', value: 'received' },
];

const STAGE_CHIP_SX = { height: 22, fontSize: 11, fontWeight: 500, '& .MuiChip-label': { px: 0.75 } };

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatStatusLabel = (raw) => {
  if (!raw) return 'Not Started';
  return raw.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const buildServerSort = (key, dir) => {
  if (!key) return undefined;
  return `${key}:${dir === 'asc' ? 'asc' : 'desc'}`;
};

const columns = [
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
        {row.referenceId && (
          <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: 'monospace', lineHeight: 1.4, letterSpacing: '0.02em' }}>
            {row.referenceId}
          </Typography>
        )}
      </Box>
    ),
  },
  {
    key: 'registrationStatus',
    label: 'Status',
    sortable: true,
    width: 130,
    render: (v) => (
      <StatusChip
        status={REG_STATUS_LABELS[v] || 'Not Started'}
        tone={REG_STATUS_TONES[v] || 'neutral'}
        variant="outlined"
        dot={false}
        sx={STAGE_CHIP_SX}
      />
    ),
  },
  {
    key: 'agreementStatus',
    label: 'Agreement',
    sortable: true,
    width: 110,
    render: (v) => {
      const tone = v === 'signed' ? 'success' : v === 'pending' ? 'warning' : 'neutral';
      return <StatusChip status={formatStatusLabel(v)} tone={tone} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />;
    },
  },
  {
    key: 'feeStatus',
    label: 'Fee',
    sortable: true,
    width: 100,
    render: (v) => {
      const tone = v === 'received' ? 'success' : v === 'pending' ? 'warning' : 'neutral';
      return <StatusChip status={formatStatusLabel(v)} tone={tone} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />;
    },
  },
  { key: 'intake', label: 'Intake', width: 80, render: (v) => <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{v || '—'}</Typography> },
  {
    key: 'countryPreferred',
    label: 'Country',
    sortable: true,
    width: 110,
    accessor: (row) => row.countryPreferred?.name || '—',
    render: (v, row) => <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}><CountryLabel value={row?.countryPreferred ?? v} fallback="—" /></Typography>,
  },
  {
    key: 'registrationDate',
    label: 'Reg. Date',
    sortable: true,
    width: 95,
    render: (v) => <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{fmtDate(v)}</Typography>,
  },
];

export default function CounselorRegistration() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState(null);

  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editStatus, setEditStatus] = useState('');
  const [editDate, setEditDate] = useState(null);
  const [editAgreement, setEditAgreement] = useState('');
  const [editFee, setEditFee] = useState('');

  const listParamsKey = `page=${page + 1}&limit=${pageSize}&search=${search}&status=${statusFilter}&sort=${sortKey}:${sortDir}`;

  const fetchList = useCallback(async () => {
    const params = { page: page + 1, limit: pageSize };
    if (search) params.search = search;
    if (statusFilter) params.registrationStatus = statusFilter;
    const sort = buildServerSort(sortKey, sortDir);
    if (sort) params.sort = sort;
    const data = await fetchRegistrationQueue(params);
    return data;
  }, [page, pageSize, search, statusFilter, sortKey, sortDir]);

  const { data: listData, error: listError, loading: listLoading } = useCachedFetch(`counselor-registration:${listParamsKey}`, fetchList, { refetchInterval: 30000 });

  const students = listData?.students || [];
  const total = listData?.total || 0;
  const loading = listLoading && students.length === 0;

  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const handleSortChange = useCallback((key, dir) => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  const loadDetail = useCallback(async (leadId) => {
    setDetailLoading(true);
    try {
      const data = await fetchRegistrationDetail(leadId);
      setDetail(data);
      const reg = data?.registration;
      setEditStatus(reg?.status || 'not-started');
      setEditDate(reg?.registrationDate ? new Date(reg.registrationDate).toISOString().slice(0, 10) : null);
      setEditAgreement(reg?.agreementStatus || 'not-started');
      setEditFee(reg?.feeStatus || 'not-applicable');
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load registration detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLeadId) loadDetail(selectedLeadId);
  }, [selectedLeadId, loadDetail]);

  const handleSelectStudent = useCallback((row) => {
    setSelectedLeadId(row._id || row.id);
    setDetail(null);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedLeadId(null);
    setDetail(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedLeadId) return;
    try {
      setSaving(true);
      await updateRegistration(selectedLeadId, {
        registrationStatus: editStatus,
        registrationDate: editDate || null,
        agreementStatus: editAgreement,
        feeStatus: editFee,
      });
      const data = await fetchRegistrationDetail(selectedLeadId);
      setDetail(data);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update registration');
    } finally {
      setSaving(false);
    }
  }, [selectedLeadId, editStatus, editDate, editAgreement, editFee]);

  /* ── Detail View ─────────────────────────────────────────────────── */
  if (selectedLeadId) {
    const student = detail?.lead;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ flexShrink: 0, pt: 2, pb: 1.5, px: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <SecondaryButton size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />} onClick={handleBack}>Back to Queue</SecondaryButton>
          </Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
            {student?.studentName || 'Registration Detail'}
          </Typography>
          {student?.referenceId && (
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', fontFamily: 'monospace', mt: 0.25 }}>
              #{student.referenceId}
            </Typography>
          )}
        </Box>

        {error && (
          <Box sx={{ mx: 0.5, mb: 1.5, p: 1.25, border: 1, borderColor: 'error.light', borderRadius: 1, bgcolor: 'error.soft' }}>
            <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>{error}</Typography>
          </Box>
        )}

        {detailLoading ? (
          <Box sx={{ px: 0.5 }}>{[1, 2, 3].map((i) => <Skeleton key={i} height={80} sx={{ mb: 1 }} />)}</Box>
        ) : detail ? (
          <Box sx={{ flex: 1, overflowY: 'auto', px: 0.5 }}>
            {/* Student Identity */}
            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>Student Identity</Typography>
                <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
              </Box>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled', mb: 0.25 }}>Name</Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{detail.lead?.studentName || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled', mb: 0.25 }}>Ref ID</Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, fontFamily: 'monospace' }}>{detail.lead?.referenceId || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled', mb: 0.25 }}>Mobile</Typography>
                  <Typography sx={{ fontSize: 12.5 }}>{detail.lead?.mobile || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled', mb: 0.25 }}>Email</Typography>
                  <Typography sx={{ fontSize: 12.5 }}>{detail.lead?.email || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled', mb: 0.25 }}>Intake</Typography>
                  <Typography sx={{ fontSize: 12.5 }}>{detail.lead?.intake || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled', mb: 0.25 }}>Country</Typography>
                  <Typography sx={{ fontSize: 12.5 }}><CountryLabel value={detail.lead?.countryPreferred} fallback="—" /></Typography>
                </Grid>
              </Grid>
            </Box>

            {/* Registration Workflow */}
            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>Registration Workflow</Typography>
                <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
              </Box>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FilterSelect
                    label="Registration Status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    options={REG_STATUS_OPTIONS.filter((o) => o.value !== '')}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Registration Date"
                    type="date"
                    size="small"
                    fullWidth
                    value={editDate || ''}
                    onChange={(e) => setEditDate(e.target.value || null)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FilterSelect
                    label="Agreement Status"
                    value={editAgreement}
                    onChange={(e) => setEditAgreement(e.target.value)}
                    options={AGREEMENT_OPTIONS}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FilterSelect
                    label="Fee Status"
                    value={editFee}
                    onChange={(e) => setEditFee(e.target.value)}
                    options={FEE_OPTIONS}
                    fullWidth
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <PrimaryButton onClick={handleSave} loading={saving} size="small">Save Changes</PrimaryButton>
              </Box>
            </Box>

            {/* Payment Records */}
            {detail.registration?.payments?.length > 0 && (
              <Box sx={{ mb: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>Payment Records</Typography>
                  <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {detail.registration.payments.map((p, i) => (
                    <Box
                      key={p._id || i}
                      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{p.description || `Payment ${i + 1}`}</Typography>
                        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{fmtDate(p.date)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>
                          {p.amount != null ? `$${Number(p.amount).toLocaleString()}` : '—'}
                        </Typography>
                        <StatusChip
                          status={p.status || 'pending'}
                          tone={p.status === 'received' ? 'success' : 'warning'}
                          size="small"
                        />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ) : null}
      </Box>
    );
  }

  /* ── Queue View ──────────────────────────────────────────────────── */
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, pt: 2, pb: 1.5, px: 0.5 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
          Registration
        </Typography>
      </Box>
      {loading && students.length === 0 ? (
        <Box sx={{ p: 3 }}>{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
      ) : (
        <DataTable
          columns={columns}
          data={students}
          keyField="_id"
          dense
          sortable
          emptyTitle="No registrations yet"
          emptyText="Students will appear here once counseling is completed."
          onRowClick={handleSelectStudent}
          toolbar={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%', pb: 1.25, borderBottom: 1, borderColor: 'divider' }}>
              <SearchField placeholder="Search by name or ref ID..." sx={{ minWidth: 220, flex: '1 1 220px' }} value={search} onChange={(e) => setSearch(e.target.value)} />
              <FilterSelect label="Status" options={REG_STATUS_OPTIONS} sx={{ minWidth: 140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
            </Box>
          }
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
  );
}
