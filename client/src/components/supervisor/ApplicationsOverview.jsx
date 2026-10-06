import { useCallback, useEffect, useState } from 'react';
import {
  Box, Chip, CircularProgress, Table, TableBody, TableCell, TableHead,
  TableRow, Typography,
} from '@mui/material';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import HistoryIcon from '@mui/icons-material/History';
import InboxIcon from '@mui/icons-material/Inbox';
import SearchField from '../../ui/mui/SearchField.jsx';
import FilterSelect from '../../ui/mui/FilterSelect.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';
import StatusChip from '../../ui/mui/StatusChip.jsx';
import AppCard from '../../ui/mui/AppCard.jsx';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { fetchApplicationsOverview } from '../../api/applications.js';
import { CountryLabel } from '../../utils/flag.jsx';

const APPLICATION_STATUSES = [
  'Draft', 'Preparing', 'Documents Pending', 'Ready to Submit', 'Submitted',
  'Under Review', 'Offer Received', 'Rejected', 'Withdrawn',
];

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const userName = (u) => {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
};

const STATUS_TONE = {
  Draft: 'neutral',
  Preparing: 'info',
  'Documents Pending': 'warning',
  'Ready to Submit': 'warning',
  Submitted: 'primary',
  'Under Review': 'primary',
  'Offer Received': 'success',
  Rejected: 'danger',
  Withdrawn: 'neutral',
};

const HEAD = ['Student', 'University', 'Status', 'Owner', 'Next Action', 'Updated'];

export default function ApplicationsOverview() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { setPage(0); }, [statusFilter, search]);

  const paramsKey = `p${page + 1}-${statusFilter}-${search}`;
  const fetcher = useCallback(() => {
    const params = { page: page + 1, limit: 10 };
    if (statusFilter) params.status = statusFilter;
    if (search.trim()) params.search = search.trim();
    return fetchApplicationsOverview(params);
  }, [page, statusFilter, search]);

  const { data, error, loading, refetch } = useCachedFetch(
    `applications-overview:${paramsKey}`,
    fetcher,
    { refetchInterval: 60_000 }
  );

  const summary = data?.summary ?? null;
  const rows = data?.applications ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 0;
  const recent = data?.recentActivity ?? [];

  const kpis = summary
    ? [
        { label: 'Total', value: summary.total },
        { label: 'In Preparation', value: summary.inPreparation },
        { label: 'Docs Pending', value: summary.awaitingDocuments },
        { label: 'Ready to Submit', value: summary.readyToSubmit },
        { label: 'Submitted / Review', value: summary.submittedInFlight },
        { label: 'Offers', value: summary.offers },
      ]
    : [];
  if (summary && summary.staleCount > 0) {
    kpis.push({ label: `Stale > ${summary.staleDays}d`, value: summary.staleCount, warn: true });
  }

  const ACTION_LABELS = {
    created: 'created',
    status_changed: '→',
    submitted: 'submitted',
    offer: 'offer received',
    rejected: 'rejected',
    withdrawn: 'withdrawn',
  };

  return (
    <AppCard
      title="Applications"
      icon={<AssignmentOutlinedIcon sx={{ fontSize: 16 }} />}
      actions={
        <SecondaryButton size="small" onClick={refetch} disabled={loading}>
          Refresh
        </SecondaryButton>
      }
    >
      {/* KPI row — pipe-separated inline */}
      {!summary && loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}><CircularProgress size={16} /></Box>
      ) : kpis.length > 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.75, fontSize: 11, color: 'text.secondary' }}>
          {kpis.map((k, i) => (
            <Box key={k.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {i > 0 && <Box component="span" sx={{ color: 'text.disabled' }}>|</Box>}
              <Box component="span">{k.label}</Box>
              <Box component="span" sx={{ fontWeight: 700, color: k.warn ? 'warning.main' : 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{k.value}</Box>
            </Box>
          ))}
        </Box>
      ) : null}

      {/* Toolbar — single compact row */}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.75 }}>
        <SearchField
          placeholder="Search university…"
          size="small"
          sx={{ minWidth: 180 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterSelect
          label="Status"
          size="small"
          sx={{ minWidth: 140 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: '', label: 'All Statuses' },
            ...APPLICATION_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
      </Box>

      {error && !data ? (
        <Typography sx={{ fontSize: 12, color: 'error.main', py: 1 }}>{error}</Typography>
      ) : (
        <>
          {/* Table or compact empty state */}
          {loading && rows.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={16} /></Box>
          ) : rows.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2.5, gap: 0.5 }}>
              <InboxIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>No applications yet</Typography>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary', textAlign: 'center' }}>
                Applications appear here when counselors start an application from a confirmed shortlist.
              </Typography>
            </Box>
          ) : (
            <>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {HEAD.map((h) => (
                      <TableCell key={h} sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap', py: 0.375 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((app) => (
                    <TableRow key={app._id} hover sx={{ '& .MuiTableCell-root': { py: 0.375 } }}>
                      <TableCell sx={{ fontSize: 11.5 }}>
                        <Box sx={{ fontWeight: 600, color: 'text.primary' }}>{app.lead?.studentName || '—'}</Box>
                        {app.lead?.referenceId && (
                          <Box sx={{ fontSize: 10, fontFamily: 'monospace', color: 'text.disabled' }}>#{app.lead.referenceId}</Box>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11.5 }}>
                        {app.university?.institutionName || '—'}
                        {app.university?.country?.name && (
                          <Box component="span" sx={{ fontSize: 10.5, color: 'text.disabled', display: 'inline-flex', alignItems: 'center', gap: '4px' }}> · <CountryLabel value={app.university.country} flagSx={{ fontSize: 12 }} /></Box>
                        )}
                      </TableCell>
                      <TableCell><StatusChip status={app.status} tone={STATUS_TONE[app.status] || 'neutral'} variant="outlined" dot={false} sx={{ height: 20, fontSize: 10 }} /></TableCell>
                      <TableCell sx={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{userName(app.owner)}</TableCell>
                      <TableCell sx={{ fontSize: 11, color: 'text.secondary', maxWidth: 180 }}>
                        <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={app.nextAction || ''}>
                          {app.nextAction || '—'}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}>{fmtDateTime(app.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {(pages > 1 || total > 0) && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                  <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>
                    {total}{pages > 1 ? ` · ${page + 1}/${pages}` : ''}
                  </Typography>
                  {pages > 1 && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <SecondaryButton size="small" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</SecondaryButton>
                      <SecondaryButton size="small" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</SecondaryButton>
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}

          {/* Recent activity feed */}
          {recent.length > 0 && (
            <Box sx={{ mt: 1, pt: 0.75, borderTop: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.375 }}>
                <HistoryIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.disabled' }}>
                  Recent Activity
                </Typography>
              </Box>
              {recent.slice(0, 4).map((ev) => {
                const action = ev.metadata?.action || '';
                const verb = ACTION_LABELS[action] || action;
                const target = ev.metadata?.universityName || '';
                const fromTo = action === 'status_changed' && ev.metadata?.from
                  ? `${ev.metadata.from} → ${ev.metadata.to || ev.metadata.status}`
                  : '';
                return (
                  <Box key={ev.id} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, py: 0.125 }}>
                    <Typography sx={{ fontSize: 10, color: 'text.disabled', flexShrink: 0, width: 82 }}>
                      {fmtDateTime(ev.at)}
                    </Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>{ev.leadName || 'Student'}</Box>
                      {' — '}
                      {[verb, fromTo].filter(Boolean).join(' ')}
                      {target ? ` (${target})` : ''}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: 'text.disabled', ml: 'auto', flexShrink: 0 }}>
                      {ev.user || 'System'}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </>
      )}
    </AppCard>
  );
}
