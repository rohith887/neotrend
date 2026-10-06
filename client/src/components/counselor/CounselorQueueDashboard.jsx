import { useCallback, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import ContactsIcon from '@mui/icons-material/Contacts';
import ForumIcon from '@mui/icons-material/Forum';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import DescriptionIcon from '@mui/icons-material/Description';
import PaymentIcon from '@mui/icons-material/Payment';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import EventIcon from '@mui/icons-material/Event';
import AlarmIcon from '@mui/icons-material/Alarm';
import EventNoteIcon from '@mui/icons-material/EventNote';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import { fetchCounselorDashboard } from '../../api/counselor.js';
import { fetchReport } from '../../api/dashboard.js';
import { fetchMyTasks, updateMyTaskStatus } from '../../api/tasks.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import StatusChip from '../../ui/mui/StatusChip.jsx';
import PrimaryButton from '../../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';
import PerformanceSummaryTable from '../dashboard/PerformanceSummaryTable.jsx';

/* ═══════════════════════════════════════════════════════════════════════
   COUNSELOR QUEUE DASHBOARD — the Counselor Workspace "Home" screen,
   shown while no student is loaded.

   The Work Queue table (a client-side re-filter of the same rows My
   Students already shows, paginated, sortable and searchable) was removed:
   it duplicated a page that already exists and did it worse. KPI tiles
   that have an exact, already-shipped counting rule now deep-link straight
   into My Students with that same filter applied server-side, so the tile's
   number and the filtered list always agree. Tiles whose backing count
   comes from a different data source than the Lead fields My Students
   filters on (Documents/Payments/Applications — see the counting note
   below) are informational only rather than linking to a filter that could
   silently show a different set than the number promised.

   Data sources (all pre-existing, no new backend work):
     GET /counselor/dashboard   → fetchCounselorDashboard()  (KPI totals)
     GET /tasks/mine            → fetchMyTasks()  (My Tasks panel)
     GET /agent/dashboard/report → fetchReport() (Performance Summary — the
       same generic per-user call-activity report the Agent Dashboard uses)
   ═══════════════════════════════════════════════════════════════════════ */

const KPI_TONE = {
  primary: { color: 'primary.main', tint: 'primary.soft' },
  info:    { color: 'info.main',    tint: 'info.soft' },
  warning: { color: 'warning.main', tint: 'warning.soft' },
  danger:  { color: 'error.main',   tint: 'error.soft' },
  violet:  { color: 'secondary.main', tint: 'secondary.soft' },
};

// deepLink params map 1:1 onto CounselorMyStudents' fetch params and mirror
// getCounselorDashboard's own counting rule exactly (registration.inProgress
// / visa.inProgress — real Lead fields, no extra gate), so the tile's number
// and the filtered list total never disagree.
//
// Documents Pending / Payments Pending / Applications Active are NOT linked:
// their dashboard counts come from the Document/Payment collections (or the
// `applications[]` sub-document array), not the single `documentStatus` /
// `applicationStatus` Lead fields My Students filters on — a real,
// pre-existing split in the data model. Linking them to a same-named field
// filter would silently show a different count than the tile, which is
// exactly the mismatch bug already found and fixed once for this dashboard;
// better to leave them informational than reintroduce it in a new form.
const KPI_DEFS = (d) => [
  { key: 'total',        label: 'Total Students',        icon: <ContactsIcon sx={{ fontSize: 16 }} />,      tone: 'primary', value: d.totalAssignedStudents ?? 0, deepLink: {} },
  { key: 'counseling',   label: 'Counseling In Progress', icon: <ForumIcon sx={{ fontSize: 16 }} />,         tone: 'info',    value: d.counseling?.inProgress ?? 0, deepLink: { journeyStage: 'in-progress', label: 'Counseling In Progress' } },
  { key: 'registration', label: 'Registration Active',    icon: <HowToRegIcon sx={{ fontSize: 16 }} />,      tone: 'warning', value: d.registration?.inProgress ?? 0, deepLink: { registrationStatus: 'active', label: 'Registration Active' } },
  { key: 'documents',    label: 'Documents Pending',      icon: <DescriptionIcon sx={{ fontSize: 16 }} />,   tone: 'danger',  value: d.documents?.pending ?? 0 },
  { key: 'payments',     label: 'Payments Pending',       icon: <PaymentIcon sx={{ fontSize: 16 }} />,       tone: 'warning', value: d.payments?.pending ?? 0 },
  { key: 'applications', label: 'Applications Active',    icon: <AssignmentIcon sx={{ fontSize: 16 }} />,    tone: 'info',    value: d.applications?.inProgress ?? 0 },
  { key: 'visa',         label: 'Visa In Progress',       icon: <FlightTakeoffIcon sx={{ fontSize: 16 }} />, tone: 'violet',  value: d.visa?.inProgress ?? 0, deepLink: { visaStatus: 'active', label: 'Visa In Progress' } },
  { key: 'dueToday',     label: 'Callbacks Due Today',    icon: <EventAvailableIcon sx={{ fontSize: 16 }} />, tone: 'warning', value: d.followUps?.dueToday ?? 0, followUpTab: 'today' },
  { key: 'overdue',      label: 'Overdue Callbacks',      icon: <PhoneMissedIcon sx={{ fontSize: 16 }} />,   tone: 'danger',  value: d.followUps?.overdue ?? 0, followUpTab: 'overdue' },
];

const FOLLOW_UP_TABS = [
  { id: 'overdue',  label: 'Overdue',   icon: <AlarmIcon sx={{ fontSize: 13 }} /> },
  { id: 'today',    label: 'Due Today', icon: <EventAvailableIcon sx={{ fontSize: 13 }} /> },
  { id: 'upcoming', label: 'Upcoming',  icon: <EventIcon sx={{ fontSize: 13 }} /> },
];

const fmtDue = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// Same row shape as CounselorFollowUps.jsx's CallbackRow, condensed for the
// dashboard's smaller panel — same fields (studentName, mobile, referenceId,
// dueAt), same click-to-open behavior.
function FollowUpRow({ item, onOpen }) {
  return (
    <Box
      role="button" tabIndex={0}
      onClick={() => onOpen?.(item)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(item); } }}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.875,
        borderBottom: 1, borderColor: 'divider', cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: 'primary.soft', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
        {String(item.studentName || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 12, fontWeight: 600 }}>{item.studentName || 'Unknown'}</Typography>
        <Typography noWrap sx={{ fontSize: 10.5, color: 'text.secondary' }}>{item.referenceId || ''}</Typography>
      </Box>
      <Typography sx={{ fontSize: 10.5, color: 'text.disabled', flexShrink: 0 }}>{fmtDue(item.dueAt)}</Typography>
    </Box>
  );
}

const DEFAULT_CALLBACKS = { dueNow: [], upcoming: [], overdue: [], today: [], pendingCount: 0, overdueCount: 0 };

const PRIORITY_TONE = { P1: 'danger', P2: 'warning', P3: 'neutral' };

// My Tasks — the same Task model that drives Supervisor's SLA-breach alerts,
// scoped to this counselor's own assignments (GET /tasks/mine). Previously
// invisible anywhere in the counselor's own workspace; a counselor could be
// escalated on in Supervisor Alerts for a task they had no way to see.
function TaskRow({ task, onDone, completing }) {
  const overdue = task.dueAt && !['done', 'cancelled'].includes(task.status) && new Date(task.dueAt).getTime() < Date.now();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.875, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
          <StatusChip status={task.priority} tone={PRIORITY_TONE[task.priority] || 'neutral'} dot={false} size="small" sx={{ height: 17, fontSize: 9.5, fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }} />
          <Typography noWrap sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>{task.title}</Typography>
        </Box>
        <Typography noWrap sx={{ fontSize: 10.5, color: overdue ? 'error.main' : 'text.secondary', mt: 0.25 }}>
          {task.lead?.studentName ? `${task.lead.studentName} · ` : ''}{task.dueAt ? `Due ${fmtDue(task.dueAt)}` : 'No due date'}{overdue ? ' · Overdue' : ''}
        </Typography>
      </Box>
      <SecondaryButton
        size="small"
        startIcon={<CheckCircleOutlineIcon sx={{ fontSize: 13 }} />}
        onClick={() => onDone(task.id)}
        disabled={completing}
        sx={{ minHeight: 24, fontSize: 10.5, px: 1, flexShrink: 0 }}
      >
        Done
      </SecondaryButton>
    </Box>
  );
}

export default function CounselorQueueDashboard({
  cbs = DEFAULT_CALLBACKS,
  callbacksLoading = false,
  onOpenStudent,
  onFetchStudent,
  onNavigate,
  fetchingStudent = false,
  callActive = false,
  studentsLoading = false,
}) {
  const [followUpTab, setFollowUpTab] = useState('overdue');
  const [completingTaskId, setCompletingTaskId] = useState(null);
  const { push } = useToast();

  const followUpItems = cbs[followUpTab] || [];

  const fetchTasksCb = useCallback(async () => fetchMyTasks({ status: 'open' }), []);
  const { data: myTasks, loading: tasksLoading, refetch: refetchTasks } = useCachedFetch(
    'counselor-my-tasks', fetchTasksCb, { staleTime: 30_000, refetchInterval: 30_000 }
  );
  const taskRows = myTasks ?? [];

  const handleTaskDone = useCallback(async (taskId) => {
    setCompletingTaskId(taskId);
    try {
      await updateMyTaskStatus(taskId, 'done');
      await refetchTasks();
    } catch (err) {
      push(err?.response?.data?.message || 'Could not update the task', 'danger');
    } finally {
      setCompletingTaskId(null);
    }
  }, [refetchTasks, push]);

  const fetchDashboardCb = useCallback(async () => fetchCounselorDashboard(), []);
  const { data: dashboard, loading: dashboardLoading } = useCachedFetch(
    'counselor-queue-dashboard', fetchDashboardCb, { staleTime: 30_000, refetchInterval: 30_000 }
  );

  const fetchReportCb = useCallback(async () => fetchReport(), []);
  const { data: report, loading: reportLoading } = useCachedFetch(
    'counselor-queue-report', fetchReportCb, { refetchInterval: 60_000 }
  );

  const kpis = useMemo(() => KPI_DEFS(dashboard || {}), [dashboard]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: { xs: 1.5, md: 2 } }}>

      {/* ── Header: title + Fetch Student (still the primary action) ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5, flexShrink: 0, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: 17, fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em' }}>Counseling Queue</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25 }}>Workload across every student at the counseling stage</Typography>
        </Box>
        <PrimaryButton
          startIcon={<CallReceivedIcon sx={{ fontSize: 14 }} />}
          onClick={onFetchStudent}
          disabled={fetchingStudent || callActive || studentsLoading}
          loading={fetchingStudent}
          sx={{ height: 36, px: 2.5 }}
        >
          {fetchingStudent ? 'Fetching…' : 'Fetch Student'}
        </PrimaryButton>
      </Box>

      {/* ── KPI row ── */}
      <Box sx={{ mb: 1.5, flexShrink: 0 }} aria-label="Counseling workload">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(9, 1fr)' }, gap: { xs: 0.75, sm: 1 } }}>
          {kpis.map((kpi) => {
            const tone = KPI_TONE[kpi.tone];
            const clickable = !!kpi.deepLink || !!kpi.followUpTab;
            const handleClick = () => {
              if (kpi.deepLink) onNavigate?.('my-students', kpi.deepLink);
              else if (kpi.followUpTab) setFollowUpTab(kpi.followUpTab);
            };
            const active = kpi.followUpTab ? followUpTab === kpi.followUpTab : false;
            return (
              <Box
                key={kpi.key}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? handleClick : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } } : undefined}
                title={kpi.deepLink ? `Open My Students filtered by ${kpi.label.toLowerCase()}` : kpi.followUpTab ? `View ${kpi.label.toLowerCase()} in Follow-up Queue` : kpi.label}
                sx={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 1,
                  pl: 1.25, pr: 1, py: 1, minWidth: 0, height: 60,
                  cursor: clickable ? 'pointer' : 'default',
                  bgcolor: active ? tone.tint : 'background.paper',
                  border: '1px solid', borderColor: active ? tone.color : 'divider',
                  borderRadius: 1.25,
                  transition: 'border-color 150ms ease, background-color 150ms ease',
                  '&:hover': clickable ? { bgcolor: 'action.hover', borderColor: 'text.disabled' } : {},
                }}
              >
                <Box sx={{ width: 28, height: 28, borderRadius: '7px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: tone.tint, color: tone.color }}>
                  {kpi.icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: { xs: 18, sm: 20 }, fontWeight: 700, lineHeight: 1.02, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                    {dashboardLoading ? '…' : kpi.value}
                  </Box>
                  <Box sx={{ mt: 0.3, fontSize: { xs: 10, sm: 10.5 }, fontWeight: 500, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {kpi.label}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* ── Performance Summary — full width, same pattern as the Supervisor
             Dashboard (KPI row, then a full-width Performance Summary row,
             then a 50/50 row of the two remaining panels below it). ── */}
      <Box sx={{ flexShrink: 0, mb: 1.25 }}>
        <PerformanceSummaryTable data={report} loading={reportLoading} subtitle="Your own call activity" />
      </Box>

      {/* ── Follow-up Queue | My Tasks — 50/50, same as Supervisor
             Dashboard's Team Live | Lead Distribution row. ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25, alignItems: 'stretch', flex: '1 1 auto', minHeight: 0 }}>
        {/* ── Follow-up Queue — same data (fetchCallbacks) the standalone
               Follow-ups page uses, already loaded by the parent for Fetch
               Student; no new request. ── */}
        <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
          <Box sx={{ px: 1.25, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <EventNoteIcon sx={{ fontSize: 15, color: 'primary.main' }} />
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>Follow-up Queue</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, px: 1, pt: 0.75, flexShrink: 0 }}>
            {FOLLOW_UP_TABS.map((t) => {
              const active = followUpTab === t.id;
              const count = (cbs[t.id] || []).length;
              return (
                <Box
                  key={t.id}
                  role="button" tabIndex={0}
                  onClick={() => setFollowUpTab(t.id)}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.375,
                    px: 0.875, py: 0.375, borderRadius: '999px', cursor: 'pointer',
                    border: 1, borderColor: active ? 'primary.main' : 'divider',
                    bgcolor: active ? 'primary.soft' : 'transparent',
                    color: active ? 'primary.main' : 'text.secondary',
                    fontSize: 11, fontWeight: 600,
                  }}
                >
                  {t.icon}
                  {t.label}
                  <Box component="span" sx={{ color: 'text.disabled' }}>({count})</Box>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', mt: 0.5 }}>
            {callbacksLoading ? (
              <Typography sx={{ fontSize: 11.5, color: 'text.disabled', p: 1.5 }}>Loading…</Typography>
            ) : followUpItems.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                  No {followUpTab === 'today' ? 'callbacks due today' : followUpTab} follow-ups.
                </Typography>
              </Box>
            ) : (
              followUpItems.map((item) => (
                <FollowUpRow key={item.id ?? item._id ?? item.leadId ?? item.studentName} item={item} onOpen={onOpenStudent} />
              ))
            )}
          </Box>
        </Box>

        {/* ── My Tasks — the same Task model behind Supervisor's SLA-breach
               alerts, scoped to this counselor's own assignments. ── */}
        <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
          <Box sx={{ px: 1.25, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <ChecklistIcon sx={{ fontSize: 15, color: 'primary.main' }} />
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>My Tasks</Typography>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{taskRows.length}</Typography>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {tasksLoading ? (
              <Typography sx={{ fontSize: 11.5, color: 'text.disabled', p: 1.5 }}>Loading…</Typography>
            ) : taskRows.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No open tasks.</Typography>
              </Box>
            ) : (
              taskRows.map((task) => (
                <TaskRow key={task.id} task={task} onDone={handleTaskDone} completing={completingTaskId === task.id} />
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
