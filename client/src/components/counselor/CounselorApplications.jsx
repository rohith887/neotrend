import { useCallback, useState } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import PageHeader from '../../ui/PageHeader.jsx';
import KpiStrip from '../../ui/KpiStrip.jsx';
import { AppCard, DataTable, SearchField, StatusChip } from '../../ui/mui/index.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { CountryLabel } from '../../utils/flag.jsx';
import { fetchMyStudents } from '../../api/counselor.js';

const APP_STATUSES = {
  'not-started': 'Not Started',
  draft: 'Draft',
  submitted: 'Submitted',
  'under-review': 'Under Review',
  'offer-received': 'Offer Received',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

const columns = [
  {
    key: 'studentName',
    label: 'Student',
    sortable: true,
    strong: true,
    render: (v) => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <Box sx={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, bgcolor: 'primary.soft', color: 'primary.main' }}>
          {String(v || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')}
        </Box>
        <Box sx={{ fontSize: 13, fontWeight: 600 }}>{v}</Box>
      </Box>
    ),
  },
  { key: 'referenceId', label: 'Ref ID', sortable: true },
  {
    key: 'countryPreferred',
    label: 'Country',
    sortable: true,
    render: (_, row) => <Typography component="span" sx={{ fontSize: 12.5 }}><CountryLabel value={row.countryPreferred} fallback="—" /></Typography>,
  },
  { key: 'intake', label: 'Intake' },
  {
    key: 'applicationStatus',
    label: 'Application Status',
    sortable: true,
    render: (v) => <StatusChip status={APP_STATUSES[v] || 'Not Started'} size="small" />,
  },
  { key: 'status', label: 'Lead Status', sortable: true },
];

export default function CounselorApplications() {
  const [search, setSearch] = useState('');

  const fetcher = useCallback(async () => {
    const data = await fetchMyStudents();
    return data?.students || [];
  }, []);

  const { data: allRows, error, loading } = useCachedFetch('counselor-applications', fetcher, { refetchInterval: 30000 });

  const rows = (allRows ?? []).filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!String(r.studentName || '').toLowerCase().includes(q) && !String(r.referenceId || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const draftCount = rows.filter((r) => r.applicationStatus === 'draft').length;
  const submittedCount = rows.filter((r) => r.applicationStatus === 'submitted').length;
  const reviewCount = rows.filter((r) => r.applicationStatus === 'under-review').length;
  const offerCount = rows.filter((r) => r.applicationStatus === 'offer-received').length;
  const rejectedCount = rows.filter((r) => r.applicationStatus === 'rejected').length;

  return (
    <Box>
      <PageHeader title="Applications" subtitle="University Applications — track and manage student applications" />

      {error && (
        <Box sx={{ mb: 2, p: 1.5, border: 1, borderColor: 'error.light', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'error.soft' }}>
          <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
          <Typography sx={{ fontSize: 13, color: 'error.main' }}>{error}</Typography>
        </Box>
      )}

      <KpiStrip
        items={[
          { icon: InventoryIcon, label: 'Total', value: rows.length, tone: 'primary' },
          { icon: InventoryIcon, label: 'Draft', value: draftCount, tone: 'info' },
          { icon: InventoryIcon, label: 'Submitted', value: submittedCount, tone: 'warning' },
          { icon: InventoryIcon, label: 'Under Review', value: reviewCount, tone: 'info' },
          { icon: InventoryIcon, label: 'Offers', value: offerCount, tone: 'success' },
          { icon: InventoryIcon, label: 'Rejected', value: rejectedCount, tone: 'danger' },
        ]}
        compact
        ariaLabel="Application metrics"
        sx={{ mb: 2 }}
      />

      <AppCard
        title="Application Tracker"
        subtitle="All university applications across your caseload"
        icon={<InventoryIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
        contentSx={{ p: 0 }}
      >
        {loading ? (
          <Box sx={{ p: 3 }}>{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            keyField="_id"
            dense
            initialPageSize={25}
            pageSizeOptions={[10, 25, 50]}
            emptyTitle="No applications yet"
            emptyText="University applications will appear here once students are assigned to you."
            toolbar={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', width: '100%' }}>
                <SearchField placeholder="Search by student or reference ID..." fullWidth sx={{ minWidth: 280 }} value={search} onChange={(e) => setSearch(e.target.value)} />
              </Box>
            }
            containerSx={{ maxHeight: 480 }}
          />
        )}
      </AppCard>
    </Box>
  );
}
