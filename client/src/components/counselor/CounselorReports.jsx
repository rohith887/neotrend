import { useCallback } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import EventNoteIcon from '@mui/icons-material/EventNote';
import PhoneIcon from '@mui/icons-material/Phone';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import PageHeader from '../../ui/PageHeader.jsx';
import { AppCard } from '../../ui/mui/index.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { fetchReport } from '../../api/dashboard.js';

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function CounselorReports() {
  const fetcher = useCallback(async () => {
    return await fetchReport();
  }, []);

  const { data: report, error, loading } = useCachedFetch('counselor-reports', fetcher, { refetchInterval: 60000 });

  const s = report?.summary || {};
  const byDisp = report?.byDisposition || [];
  const last7 = report?.last7Days || [];

  const totalCalls = last7.reduce((a, d) => a + (d.calls || 0), 0);
  const totalConnected = last7.reduce((a, d) => a + (d.connected || 0), 0);

  const REPORT_SECTIONS = [
    { icon: GroupsIcon, label: 'Total Assigned', value: s.totalAssignedLeads ?? 0, color: 'primary' },
    { icon: GroupsIcon, label: 'Active Leads', value: (s.totalAssignedLeads ?? 0) - (s.readyToCall ?? 0), color: 'info' },
    { icon: LocalFireDepartmentIcon, label: 'Hot P1 Leads', value: s.p1Leads ?? 0, color: 'error' },
    { icon: EventNoteIcon, label: 'Pending Callbacks', value: s.pendingCallbacks ?? 0, color: 'warning' },
    { icon: PhoneIcon, label: 'Calls (7d)', value: totalCalls, color: 'info' },
    { icon: CheckCircleIcon, label: 'Connected (7d)', value: totalConnected, color: 'success' },
  ];

  return (
    <Box>
      <PageHeader title="Reports" subtitle="Counselor performance and activity reports" />

      {error && (
        <Box sx={{ mb: 2, p: 1.5, border: 1, borderColor: 'error.light', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'error.soft' }}>
          <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
          <Typography sx={{ fontSize: 13, color: 'error.main' }}>{error}</Typography>
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <AppCard key={i}>
              <Skeleton height={60} />
            </AppCard>
          ))
        ) : REPORT_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <AppCard
              key={section.label}
              title={section.label}
              icon={<Icon sx={{ fontSize: 16, color: `${section.color}.main` }} />}
            >
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography sx={{ fontSize: 36, fontWeight: 700, color: 'text.primary', lineHeight: 1, mb: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  {section.value}
                </Typography>
              </Box>
            </AppCard>
          );
        })}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, mt: 2 }}>
        <AppCard
          title="Last 7 Days"
          subtitle="Daily call volume"
          icon={<BarChartIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
        >
          {loading ? (
            <Skeleton height={160} />
          ) : last7.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No activity data yet</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {last7.map((day) => (
                <Box key={day.date} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', width: 48, flexShrink: 0 }}>{fmtDate(day.date)}</Typography>
                  <Box sx={{ flex: 1, height: 8, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${Math.min(100, (day.calls / Math.max(1, ...last7.map((d) => d.calls))) * 100)}%`, bgcolor: 'primary.main', borderRadius: 1 }} />
                  </Box>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', width: 24, textAlign: 'right' }}>{day.calls}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </AppCard>

        <AppCard
          title="By Disposition"
          subtitle="All-time disposition mix"
          icon={<EventNoteIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
        >
          {loading ? (
            <Skeleton height={160} />
          ) : byDisp.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No dispositions logged yet</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {byDisp.slice(0, 8).map((d) => (
                <Box key={d.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || 'Unknown'}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>{d.count}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </AppCard>
      </Box>
    </Box>
  );
}
