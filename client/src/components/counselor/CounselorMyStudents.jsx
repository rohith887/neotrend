import { useCallback, useEffect, useState } from 'react';
import {
  Box, Chip, Popover, Skeleton, Typography,
} from '@mui/material';
import ChecklistIcon from '@mui/icons-material/Checklist';
import StatusChip from '../../ui/mui/StatusChip.jsx';
import { DataTable, SearchField, FilterSelect } from '../../ui/mui/index.js';
import PageHeader from '../../ui/PageHeader.jsx';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { fetchMyStudents } from '../../api/counselor.js';
import ReviveLeadButton from '../ReviveLeadButton.jsx';
import StudentDetailView from './StudentDetailView.jsx';

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Completed', value: 'completed' },
  { label: 'Documents Pending', value: 'documents-pending' },
  { label: 'Offer Received', value: 'offer-received' },
  { label: 'Visa Process', value: 'visa-process' },
  { label: 'Dropped', value: 'dropped' },
];

const JOURNEY_STAGE_OPTIONS = [
  { label: 'All Stages', value: '' },
  { label: 'Not Started', value: 'not-started' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed', value: 'completed' },
];

const PRIORITY_OPTIONS = [
  { label: 'All Priorities', value: '' },
  { label: 'Urgent', value: 'Urgent' },
  { label: 'High', value: 'High' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Low', value: 'Low' },
];

const PRIORITY_STYLE = {
  Urgent: { color: 'error.main', fontWeight: 700 },
  High: { color: 'warning.main', fontWeight: 600 },
  Medium: { color: 'info.main', fontWeight: 500 },
  Low: { color: 'text.disabled', fontWeight: 500 },
};

const STAGE_CHIP_SX = { height: 20, fontSize: 10.5, fontWeight: 500, '& .MuiChip-label': { px: 0.625 } };

const STATUS_TONE_MAP = {
  'completed': 'success',
  'in-progress': 'info',
  'not-started': 'neutral',
  'not available': 'neutral',
  'none': 'default',
  'pending': 'warning',
  'paid': 'success',
};

const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const formatStatusLabel = (raw) => {
  if (!raw) return 'Not Started';
  return raw
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const journeyTone = (v) => {
  const val = (v || 'not-started').toLowerCase();
  if (val === 'completed') return 'success';
  if (val === 'in-progress') return 'info';
  return 'neutral';
};

// One row of the Journey detail popover — same label/value pairing the six
// stage columns used to render individually, just stacked instead of spread
// across the table.
function JourneyRow({ label, chip }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>{label}</Typography>
      {chip}
    </Box>
  );
}

// Journey column — a compact trigger that opens a Popover with the exact
// same six stage values the old Counseling/Registration/Documents/Payments/
// Applications/Visa columns rendered (same formatStatusLabel/tone logic,
// including the Registration "Not Available" rule), just not permanently
// occupying six columns of horizontal space. Same Popover-on-button pattern
// already used by RevealPill in StudentProfileForm.jsx.
function JourneyCell({ row }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={(e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          height: 24, px: 1, borderRadius: '999px', cursor: 'pointer',
          border: 1, borderColor: open ? 'primary.main' : 'divider',
          bgcolor: open ? 'primary.soft' : 'background.paper',
          color: open ? 'primary.main' : 'text.secondary',
          fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
          transition: 'border-color 120ms ease, background-color 120ms ease',
          '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
        }}
      >
        <ChecklistIcon sx={{ fontSize: 13 }} />
        View
      </Box>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={(e) => { e?.stopPropagation?.(); setAnchorEl(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        onClick={(e) => e.stopPropagation()}
        slotProps={{ paper: { sx: { mt: 0.5, p: 1.5, minWidth: 240, borderRadius: 1.5, border: 1, borderColor: 'divider', boxShadow: 3 } } }}
      >
        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
          Journey
        </Typography>
        <JourneyRow label="Counseling" chip={<StatusChip status={formatStatusLabel(row.counselingStatus || 'not-started')} tone={journeyTone(row.counselingStatus || 'not-started')} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />} />
        <JourneyRow
          label="Registration"
          chip={row.counselingStatus !== 'completed'
            ? <StatusChip status="Not Available" tone="neutral" variant="outlined" dot={false} sx={{ ...STAGE_CHIP_SX, opacity: 0.5 }} />
            : <StatusChip status={formatStatusLabel(row.registrationStatus)} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />}
        />
        <JourneyRow label="Documents" chip={<StatusChip status={formatStatusLabel(row.documentStatus)} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />} />
        <JourneyRow label="Payments" chip={<StatusChip status={formatStatusLabel(row.paymentStatus || 'none')} tone={STATUS_TONE_MAP[row.paymentStatus || 'none'] || 'default'} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />} />
        <JourneyRow label="Applications" chip={<StatusChip status={formatStatusLabel(row.applicationStatus)} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />} />
        <JourneyRow label="Visa" chip={<StatusChip status={formatStatusLabel(row.visaStatus)} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />} />
      </Popover>
    </>
  );
}

const columns = [
  {
    key: 'studentName',
    label: 'Student',
    sortable: true,
    width: 170,
    render: (v, row) => (
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'text.primary' }}>
          {v || '—'}
        </Typography>
        {row.referenceId && (
          <Typography sx={{ fontSize: 10, color: 'text.disabled', fontFamily: 'monospace', lineHeight: 1.3, letterSpacing: '0.02em' }}>
            {row.referenceId}
          </Typography>
        )}
      </Box>
    ),
  },
  {
    key: 'interestLevel',
    label: 'Priority',
    sortable: true,
    width: 64,
    render: (v) => (
      <Typography sx={{ fontSize: 11, fontWeight: v === 'Urgent' || v === 'High' ? 600 : 400, color: PRIORITY_STYLE[v]?.color || 'text.disabled' }}>
        {v || '—'}
      </Typography>
    ),
  },
  {
    key: 'status',
    label: 'Stage',
    sortable: true,
    width: 115,
    render: (v) => <StatusChip status={formatStatusLabel(v)} variant="outlined" dot={false} sx={STAGE_CHIP_SX} />,
  },
  {
    // Counseling/Registration/Documents/Payments/Applications/Visa — same
    // values, same render logic, moved into a popover (see JourneyCell)
    // instead of six permanently-visible columns.
    key: '_journey',
    label: 'Journey',
    width: 78,
    render: (_v, row) => <JourneyCell row={row} />,
  },
  { key: 'intake', label: 'Intake', width: 68, render: (v) => <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{v || '—'}</Typography> },
  { key: 'lastCallAt', label: 'Last Call', sortable: true, width: 80, render: (v) => <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{formatDate(v)}</Typography> },
];
export default function CounselorMyStudents({ routePayload, onNavigate }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [journeyFilter, setJourneyFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  // Default sort: oldest/never-contacted first (lastCallAt ascending — Mongo
  // sorts missing/null values first, so never-called students surface at the
  // top), so the list itself reads as a priority queue instead of an
  // arbitrary order. Still fully overridable via any sortable column header.
  const [sortKey, setSortKey] = useState('lastCallAt');
  const [sortDir, setSortDir] = useState('asc');

  // ── Deep-link filter (arrived via a Counseling Queue KPI tile) ────────
  // routePayload here is either { _id } (open a specific student — handled
  // below) or one of the KPI deepLink shapes from CounselorQueueDashboard,
  // e.g. { registrationStatus: 'active', label: 'Registration Active' }.
  const [deepLinkFilter, setDeepLinkFilter] = useState(() => {
    if (!routePayload || routePayload._id) return null;
    const { journeyStage, registrationStatus, visaStatus, label } = routePayload;
    if (!journeyStage && !registrationStatus && !visaStatus) return null;
    return { journeyStage, registrationStatus, visaStatus, label };
  });

  const listParamsKey = `page=${page + 1}&limit=${pageSize}&search=${search}&status=${statusFilter}&journey=${journeyFilter}&priority=${priorityFilter}&sort=${sortKey}:${sortDir}&deepLink=${JSON.stringify(deepLinkFilter)}`;

  const fetchList = useCallback(async () => {
    const params = { page: page + 1, limit: pageSize };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (journeyFilter) params.journeyStage = journeyFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (sortKey) params.sort = `${sortKey}:${sortDir}`;
    if (deepLinkFilter?.journeyStage) params.journeyStage = deepLinkFilter.journeyStage;
    if (deepLinkFilter?.registrationStatus) params.registrationStatus = deepLinkFilter.registrationStatus;
    if (deepLinkFilter?.visaStatus) params.visaStatus = deepLinkFilter.visaStatus;
    const res = await fetchMyStudents(params);
    return res;
  }, [page, pageSize, search, statusFilter, journeyFilter, priorityFilter, sortKey, sortDir, deepLinkFilter]);

  const { data: listData, error: listError, loading: listLoading, refetch } = useCachedFetch(`counselor-my-students:${listParamsKey}`, fetchList, { refetchInterval: 30000 });

  // Dropped students are revived from this list (disposition-driven drop keeps
  // them assigned + visible here; the active workflows exclude them).
  const reviveColumn = {
    key: '_revive',
    label: 'Actions',
    width: 84,
    render: (_v, row) =>
      row.dropStatus === 'dropped' ? (
        <ReviveLeadButton lead={row} onRevived={() => refetch()} />
      ) : (
        <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>—</Typography>
      ),
  };

  const rows = listData?.students || [];
  const total = listData?.total || 0;
  const loading = listLoading && rows.length === 0;
  const error = listError;

  // The Actions column only ever shows a Revive button for dropped students;
  // when none are on the current page it's a column of dashes, so it's
  // dropped from the table entirely rather than wasting a column's width.
  const hasDroppedOnPage = rows.some((r) => r.dropStatus === 'dropped');
  const visibleColumns = hasDroppedOnPage ? [...columns, reviveColumn] : columns;

  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, journeyFilter, priorityFilter]);

  // Selecting a student opens the premium inline detail view (who → journey
  // → next). From there the counselor can Open Workspace / Start Call — the
  // full 35/65 desk lives at /counselor/workspace.
  const openStudent = useCallback((student) => {
    const id = student?._id ?? student?.id ?? student?.leadId;
    setSelectedId(id ?? null);
  }, []);

  // Handle a routed-in student (e.g. a deep link from the dashboard).
  useEffect(() => {
    if (routePayload?._id) setSelectedId(routePayload._id);
  }, [routePayload]);

  const handleSortChange = useCallback((key, dir) => {
    setPage(0);
    setSortKey(key);
    setSortDir(dir);
  }, []);

  const handleRowClick = useCallback((row) => {
    openStudent(row);
  }, [openStudent]);

  if (selectedId) {
    return (
      <StudentDetailView
        leadId={selectedId}
        key={selectedId}
        onBack={() => setSelectedId(null)}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, px: 0.5 }}>
        <PageHeader title="My Students" subtitle="Every student assigned to your counseling queue" />
      </Box>
      {loading && rows.length === 0 ? (
        <Box sx={{ p: 3 }}>
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}
        </Box>
      ) : (
        <DataTable
          columns={visibleColumns}
          data={rows}
          loading={loading}
          keyField="_id"
          dense
          sortable
          emptyTitle="No students found"
          emptyText="Students will appear here once they are eligible for counseling."
          onRowClick={handleRowClick}
          toolbar={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', width: '100%', pb: 0.75, borderBottom: 1, borderColor: 'divider' }}>
              {deepLinkFilter && (
                <Chip
                  size="small"
                  label={`${deepLinkFilter.label || 'Filtered'} · ${total}`}
                  onDelete={() => setDeepLinkFilter(null)}
                  sx={{ height: 24, fontSize: 11.5, fontWeight: 600, bgcolor: 'info.soft', color: 'info.main' }}
                />
              )}
              <SearchField placeholder="Search by name, ref ID, or phone..." sx={{ minWidth: 200, flex: '1 1 200px' }} value={search} onChange={(e) => setSearch(e.target.value)} />
              <FilterSelect label="Status" options={STATUS_OPTIONS} sx={{ minWidth: 120 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
              <FilterSelect label="Journey" options={JOURNEY_STAGE_OPTIONS} sx={{ minWidth: 110 }} value={journeyFilter} onChange={(e) => setJourneyFilter(e.target.value)} />
              <FilterSelect label="Priority" options={PRIORITY_OPTIONS} sx={{ minWidth: 105 }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} />
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
