import { useCallback, useEffect, useState } from 'react';
import client from '../../api/client.js';
import { fetchCallbacks } from '../../api/dashboard.js';
import { fetchMyStudents } from '../../api/counselor.js';
import { CALL_ACTIVE, CALL_STATUS, useCounselor } from '../../context/CounselorContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import CounselorWorkspaceShell from './CounselorWorkspaceShell.jsx';
import CounselorQueueDashboard from './CounselorQueueDashboard.jsx';

/* ═══════════════════════════════════════════════════════════════════════
   COUNSELOR WORKSPACE — Agent-style clone.

   STRUCTURE (mirrors Agent Workspace):
     Empty State → Fetch Student → Agent-style loaded workspace.

   When no student is loaded:
     → Agent-style empty workspace with "Fetch Student" as primary action.

   When a student is loaded:
     → Agent-style 2-column layout (35%/65%):
       Left:  CounselorActionPanel (counseling workflow)
       Right: Journey stages (universities, shortlist, applications, etc.)

   Data comes from existing counselor endpoints:
     GET /counselor/my-students   (counselor queue)
     GET /leads/:id               (hydrates the full lead)
     GET /agent/dashboard/callbacks (follow-ups, shared with Counselor)

   Call state (start/end/timer) lives in useCounselor().
   No new backend, no mock data.
   ═══════════════════════════════════════════════════════════════════════ */

const DEFAULT_CALLBACKS = { dueNow: [], upcoming: [], overdue: [], today: [], pendingCount: 0, overdueCount: 0 };
const DEFAULT_STUDENTS = { students: [], total: 0 };

const idOf = (row) => row?._id ?? row?.id ?? row?.leadId ?? null;

export default function CounselorCallWorkspace({ routePayload, onNavigate }) {
  const { setActiveStudent, callStatus, startCall } = useCounselor();
  const { push } = useToast();

  const [student, setStudent] = useState(null);
  const [fetchingStudent, setFetchingStudent] = useState(false);

  // ── Counselor queue (my-students) + follow-ups (callbacks/RNR) ──────
  const fetchStudentsCb = useCallback(async () => fetchMyStudents({ limit: 100 }), []);
  const { data: studentsData, loading: studentsLoading, refetch: refetchStudents } = useCachedFetch(
    'cw-my-students', fetchStudentsCb, { staleTime: 30_000, refetchInterval: 30_000 }
  );

  const { data: callbacks, loading: callbacksLoading, refetch: refetchCallbacks } = useCachedFetch(
    'cw-callbacks', fetchCallbacks, { staleTime: 30_000, refetchInterval: 30_000 }
  );

  const students = studentsData?.students ?? DEFAULT_STUDENTS.students;
  const cbs = callbacks ?? DEFAULT_CALLBACKS;

  // ── Load a student into the workspace ──────────────────────────────
  const loadStudent = useCallback(async (row) => {
    const leadId = idOf(row);
    if (!leadId) return null;
    setFetchingStudent(true);
    try {
      const { data } = await client.get(`/leads/${leadId}`);
      const fresh = data.data?.lead ?? row;
      setStudent(fresh);
      setActiveStudent(fresh);
      return fresh;
    } catch (err) {
      push(err?.response?.data?.message || 'Could not load student', 'danger');
      return null;
    } finally {
      setFetchingStudent(false);
    }
  }, [setActiveStudent, push]);

  // ── "Call Now" / "Open Lead" — load into workspace ──────────────────
  const handleOpen = useCallback(async (entry, opts = {}) => {
    const loaded = await loadStudent(entry);
    refetchStudents();
    refetchCallbacks();
    if (loaded && opts.autoStart && callStatus === CALL_STATUS.IDLE) {
      startCall(loaded);
    }
  }, [loadStudent, refetchStudents, refetchCallbacks, callStatus, startCall]);

  // ── Back to empty workspace ─────────────────────────────────────────
  const handleBack = useCallback(() => {
    setStudent(null);
    setActiveStudent(null);
  }, [setActiveStudent]);

  // ── "Fetch Student" — auto-load the next student from queue ─────────
  // Mirrors Agent's fetchCall: picks the next appropriate student from the
  // counselor's queue, prioritizing callbacks/RNRs, then ready students.
  const fetchNext = useCallback(async () => {
    // Build prioritized list: callbacks first (overdue → today → upcoming),
    // then assigned students not already in callbacks.
    const callbackIds = new Set([
      ...(cbs.overdue ?? []).map(idOf),
      ...(cbs.today ?? []).map(idOf),
      ...(cbs.upcoming ?? []).map(idOf),
    ]);

    // Priority 1: Overdue callbacks
    const overdue = (cbs.overdue ?? []).find((r) => !CALL_ACTIVE.has(callStatus));
    if (overdue) {
      await handleOpen(overdue, {});
      return;
    }

    // Priority 2: Today's callbacks
    const todayCb = (cbs.today ?? []).find((r) => !CALL_ACTIVE.has(callStatus));
    if (todayCb) {
      await handleOpen(todayCb, {});
      return;
    }

    // Priority 3: Upcoming callbacks
    const upcomingCb = (cbs.upcoming ?? []).find((r) => !CALL_ACTIVE.has(callStatus));
    if (upcomingCb) {
      await handleOpen(upcomingCb, {});
      return;
    }

    // Priority 4: Assigned students not yet in callbacks (ready/available)
    const readyStudent = students.find((s) => !callbackIds.has(idOf(s)));
    if (readyStudent) {
      await handleOpen(readyStudent, {});
      return;
    }

    // Priority 5: Any assigned student (fallback)
    if (students.length > 0) {
      await handleOpen(students[0], {});
      return;
    }

    push('No students in your counseling queue', 'info');
  }, [students, cbs, callStatus, handleOpen, push]);

  // ── Refresh queues after actions ────────────────────────────────────
  const refreshLists = useCallback(() => {
    refetchStudents();
    refetchCallbacks();
  }, [refetchStudents, refetchCallbacks]);

  // ── Initial load from dashboard shortcut state ──────────────────────
  useEffect(() => {
    if (routePayload?._id) {
      loadStudent(routePayload).then((loaded) => {
        if (loaded && routePayload?.autoStart && callStatus === CALL_STATUS.IDLE) {
          startCall(loaded);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading state ──────────────────────────────────────────────────
  const isLoading = studentsLoading || callbacksLoading;
  const callActive = CALL_ACTIVE.has(callStatus);

  // ════════════════════════════════════════════════════════════════════
  // RENDER: Student loaded → Agent-style workspace shell
  // ════════════════════════════════════════════════════════════════════
  if (student) {
    return (
      <CounselorWorkspaceShell
        student={student}
        onBack={handleBack}
        refreshStats={refreshLists}
        initialStage={routePayload?.stage ?? null}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER: No student → Counselor Queue Dashboard (KPI row + Follow-up
  // Queue + My Tasks + Performance Summary). Fetch Student stays the
  // primary action inside the dashboard header.
  // ════════════════════════════════════════════════════════════════════
  return (
    <CounselorQueueDashboard
      studentsLoading={isLoading}
      cbs={cbs}
      callbacksLoading={callbacksLoading}
      onOpenStudent={(row) => handleOpen(row, {})}
      onFetchStudent={fetchNext}
      onNavigate={onNavigate}
      fetchingStudent={fetchingStudent}
      callActive={callActive}
    />
  );
}
