import { useCallback, useEffect, useState } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import AlarmIcon from '@mui/icons-material/Alarm';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import EventIcon from '@mui/icons-material/Event';
import EventNoteIcon from '@mui/icons-material/EventNote';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import PageHeader from '../../ui/PageHeader.jsx';
import KpiStrip from '../../ui/KpiStrip.jsx';
import { AppCard, AppTabs, SearchField } from '../../ui/mui/index.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { fetchCallbacks } from '../../api/dashboard.js';

const TABS = [
  { id: 'overdue', label: 'Overdue', icon: <AlarmIcon sx={{ fontSize: 15 }} /> },
  { id: 'today', label: 'Due Today', icon: <EventAvailableIcon sx={{ fontSize: 15 }} /> },
  { id: 'upcoming', label: 'Upcoming', icon: <EventIcon sx={{ fontSize: 15 }} /> },
  { id: 'all', label: 'All', icon: null },
];

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const CallbackRow = ({ item, onOpen }) => {
  const id = item?.id ?? item?._id ?? item?.leadId ?? null;
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onOpen && onOpen(item)}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onOpen) { e.preventDefault(); onOpen(item); } }}
      title="Open this student's workflow"
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25,
        borderBottom: 1, borderColor: 'divider',
        cursor: onOpen ? 'pointer' : 'default',
        '&:hover': onOpen ? { bgcolor: 'action.hover' } : undefined,
      }}
    >
      <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.soft', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
        {String(item.studentName || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{item.studentName || 'Unknown'}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          {item.mobile || ''} {item.referenceId ? `· ${item.referenceId}` : ''} {item.reason ? `· ${item.reason}` : ''}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{fmtTime(item.dueAt)}</Typography>
      </Box>
    </Box>
  );
};

const DEFAULT_CALLBACKS = { dueNow: [], upcoming: [], overdue: [], today: [], pendingCount: 0, overdueCount: 0 };

export default function CounselorFollowUps({ onNavigate, routePayload }) {
  const [activeTab, setActiveTab] = useState('overdue');
  const [search, setSearch] = useState('');

  // KPI shortcuts on the dashboard pass a target tab (overdue/today/upcoming/all)
  // via routePayload so the follow-up view opens pre-filtered to that bucket.
  useEffect(() => {
    if (routePayload && routePayload.tab && ['overdue', 'today', 'upcoming', 'all'].includes(routePayload.tab)) {
      setActiveTab(routePayload.tab);
    }
  }, [routePayload]);

  const fetcher = useCallback(async () => {
    return await fetchCallbacks();
  }, []);

  const { data, error, loading } = useCachedFetch('counselor-followups', fetcher, { refetchInterval: 30000 });
  const callbacks = data ?? DEFAULT_CALLBACKS;

  const items = activeTab === 'all'
    ? [...callbacks.overdue, ...callbacks.today, ...callbacks.upcoming]
    : callbacks[activeTab] || [];

  const filtered = search
    ? items.filter((i) => String(i.studentName || '').toLowerCase().includes(search.toLowerCase()) || String(i.mobile || '').includes(search))
    : items;

  const openStudent = useCallback((item) => {
    const id = item?.id ?? item?._id ?? item?.leadId ?? null;
    if (!id) return;
    onNavigate?.('workspace', { _id: id });
  }, [onNavigate]);

  return (
    <Box>
      <PageHeader title="Follow-ups" subtitle="Manage your scheduled and overdue follow-ups" />

      {error && (
        <Box sx={{ mb: 2, p: 1.5, border: 1, borderColor: 'error.light', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'error.soft' }}>
          <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
          <Typography sx={{ fontSize: 13, color: 'error.main' }}>{error}</Typography>
        </Box>
      )}

      <KpiStrip
        items={[
          { icon: AlarmIcon, label: 'Overdue', value: callbacks.overdueCount || callbacks.overdue.length, tone: 'danger' },
          { icon: EventAvailableIcon, label: 'Due Today', value: callbacks.today.length, tone: 'warning' },
          { icon: EventIcon, label: 'Upcoming', value: callbacks.upcoming.length, tone: 'info' },
        ]}
        compact
        ariaLabel="Follow-up metrics"
        sx={{ mb: 2 }}
      />

      <AppCard
        title="Follow-up Queue"
        icon={<EventNoteIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
        contentSx={{ p: 0 }}
      >
        <Box sx={{ px: 2, pt: 1.5 }}>
          <AppTabs tabs={TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Follow-up filters" />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, pb: 1.5, pt: 0.5, flexWrap: 'wrap' }}>
          <SearchField
            placeholder="Search students..."
            sx={{ minWidth: 220, flex: 1 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>

        {loading && filtered.length === 0 ? (
          <Box sx={{ p: 3 }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={56} sx={{ mb: 0.5 }} />)}
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <EventNoteIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', mb: 0.25 }}>
              No follow-ups {activeTab === 'overdue' ? 'overdue' : activeTab === 'today' ? 'due today' : activeTab === 'upcoming' ? 'upcoming' : 'found'}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              {callbacks.pendingCount === 0 ? 'Your callback queue is clear.' : 'Follow-ups will appear here once callbacks are scheduled.'}
            </Typography>
          </Box>
        ) : (
          <Box>
            {filtered.map((item) => (
              <CallbackRow
                key={item.id ?? item._id ?? item.leadId ?? `${activeTab}-${item.studentName}`}
                item={item}
                onOpen={openStudent}
              />
            ))}
          </Box>
        )}
      </AppCard>
    </Box>
  );
}
