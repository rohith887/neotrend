import { useCallback, useEffect, useState } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import { DataTable, SearchField, FilterSelect, StatusChip } from '../../ui/mui/index.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { fetchMyStudents } from '../../api/counselor.js';
import { CountryLabel } from '../../utils/flag.jsx';

const VISA_STATUSES = {
  gathering: 'Gathering Docs',
  filed: 'Application Filed',
  interview: 'Interview Scheduled',
  received: 'Visa Received',
  denied: 'Visa Denied',
};

const VISA_STAGE_OPTIONS = [
  { label: 'All Stages', value: '' },
  { label: 'Gathering Docs', value: 'gathering' },
  { label: 'Application Filed', value: 'filed' },
  { label: 'Interview Scheduled', value: 'interview' },
  { label: 'Visa Received', value: 'received' },
  { label: 'Visa Denied', value: 'denied' },
];

const STAGE_CHIP_SX = { height: 22, fontSize: 11, fontWeight: 500, '& .MuiChip-label': { px: 0.75 } };

const formatStatusLabel = (raw) => {
  if (!raw) return 'Not Started';
  return raw.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const visaTone = (v) => {
  if (!v || v === 'not-started') return 'neutral';
  if (v === 'received') return 'success';
  if (v === 'denied') return 'danger';
  return 'info';
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
    key: 'visaStatus',
    label: 'Visa Stage',
    sortable: true,
    width: 140,
    render: (v) => (
      <StatusChip
        status={VISA_STATUSES[v] || 'Not Started'}
        tone={visaTone(v)}
        variant="outlined"
        dot={false}
        sx={STAGE_CHIP_SX}
      />
    ),
  },
  {
    key: 'counselingStatus',
    label: 'Counseling',
    width: 110,
    render: (v) => <StatusChip status={formatStatusLabel(v)} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />,
  },
  {
    key: 'countryPreferred',
    label: 'Country',
    sortable: true,
    width: 110,
    render: (_, row) => <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}><CountryLabel value={row.countryPreferred} fallback="—" /></Typography>,
  },
  { key: 'intake', label: 'Intake', width: 80, render: (v) => <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{v || '—'}</Typography> },
  {
    key: 'status',
    label: 'Lead Status',
    sortable: true,
    width: 110,
    render: (v) => <StatusChip status={formatStatusLabel(v)} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />,
  },
];

export default function CounselorVisaProcess({ onNavigate }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [visaFilter, setVisaFilter] = useState('');

  useEffect(() => { setPage(0); }, [search, visaFilter]);

  const cacheKey = `counselor-visa:${search}:${visaFilter}:${page}:${pageSize}:${sortKey}:${sortDir}`;

  const fetcher = useCallback(async () => {
    const params = { page: page + 1, limit: pageSize };
    if (search) params.search = search;
    if (visaFilter) params.visaStatus = visaFilter;
    if (sortKey) params.sort = `${sortKey}:${sortDir}`;
    const data = await fetchMyStudents(params);
    return { students: data?.students || [], total: data?.total || 0 };
  }, [page, pageSize, search, visaFilter, sortKey, sortDir]);

  const { data, error, loading } = useCachedFetch(cacheKey, fetcher, { refetchInterval: 30000 });
  const rows = data?.students ?? [];
  const total = data?.total ?? 0;

  const handleSortChange = useCallback((key, dir) => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, pt: 2, pb: 1.5, px: 0.5 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
          Visa Process
        </Typography>
      </Box>

      {error && (
        <Box sx={{ mx: 0.5, mb: 1.5, p: 1.25, border: 1, borderColor: 'error.light', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'error.soft' }}>
          <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
          <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>{error}</Typography>
        </Box>
      )}

      {loading && rows.length === 0 ? (
        <Box sx={{ p: 3 }}>{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyField="_id"
          dense
          sortable
          emptyTitle="No visa cases"
          emptyText="Visa process tracking will appear here once students are assigned to you."
          onRowClick={(row) => onNavigate?.('counseling', row)}
          toolbar={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%', pb: 1.25, borderBottom: 1, borderColor: 'divider' }}>
              <SearchField placeholder="Search by name or ref ID..." sx={{ minWidth: 220, flex: '1 1 220px' }} value={search} onChange={(e) => setSearch(e.target.value)} />
              <FilterSelect label="Visa Stage" options={VISA_STAGE_OPTIONS} sx={{ minWidth: 140 }} value={visaFilter} onChange={(e) => setVisaFilter(e.target.value)} />
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
