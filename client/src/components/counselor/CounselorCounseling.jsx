import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, IconButton, Skeleton, Tooltip, Typography,
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GroupsIcon from '@mui/icons-material/Groups';
import { SearchField } from '../../ui/mui/index.js';
import { useCachedFetch } from '../../context/CacheContext.jsx';
import { fetchMyStudents } from '../../api/counselor.js';
import { useCounselor } from '../../context/CounselorContext.jsx';
import CounselorWorkspace from '../CounselorWorkspace.jsx';

const INK = 'text.primary';

/* Compact client-side filters over data the queue already carries.
   No new statuses — just views over counselingStatus. */
const QUEUE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'not-started', label: 'Not Started' },
  { id: 'completed', label: 'Completed' },
];

const formatStatusLabel = (raw) => {
  if (!raw) return 'Not Started';
  return raw.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

function CallQueue({ onSelect, selectedId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const cacheKey = `counselor-counseling-queue:${searchQuery.trim()}`;

  const fetcher = useCallback(async () => {
    const params = { limit: 50 };
    if (searchQuery.trim()) params.search = searchQuery.trim();
    const res = await fetchMyStudents(params);
    return res.students || [];
  }, [searchQuery]);

  const { data: students, error, loading } = useCachedFetch(cacheKey, fetcher, { refetchInterval: 30000 });

  const visible = useMemo(() => {
    const all = students ?? [];
    if (filter === 'all') return all;
    return all.filter((s) => (s.counselingStatus || 'not-started') === filter);
  }, [students, filter]);

  const countFor = (id) => {
    const all = students ?? [];
    if (id === 'all') return all.length;
    return all.filter((s) => (s.counselingStatus || 'not-started') === id).length;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 1.25, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <SearchField
          placeholder="Search name or Ref ID..."
          fullWidth
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ '& .MuiInputBase-root': { fontSize: 12.5 } }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.75, flexWrap: 'wrap' }}>
          {QUEUE_FILTERS.map((f) => {
            const active = filter === f.id;
            const n = countFor(f.id);
            return (
              <Box
                key={f.id}
                onClick={() => setFilter(f.id)}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.4,
                  px: 0.75, py: '2px', borderRadius: 1, cursor: 'pointer', userSelect: 'none',
                  bgcolor: active ? 'grey.100' : 'transparent',
                  transition: 'background-color 120ms ease',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography sx={{
                  fontSize: 10.5, lineHeight: 1.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? INK : 'text.secondary',
                }}>
                  {f.label}
                </Typography>
                <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: active ? 'text.secondary' : 'text.disabled' }}>
                  {n}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {error && (
        <Box sx={{ px: 1.25, py: 0.75 }}>
          <Typography sx={{ fontSize: 11.5, color: 'error.main' }}>{error}</Typography>
        </Box>
      )}

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && (students ?? []).length === 0 ? (
          <Box sx={{ p: 1.25 }}>
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={52} sx={{ mb: 0.5, borderRadius: 1 }} />)}
          </Box>
        ) : visible.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3, px: 1.5 }}>
            <GroupsIcon sx={{ fontSize: 28, color: 'text.disabled', mb: 0.75 }} />
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
              {(students ?? []).length === 0 ? 'No students in queue' : `No ${formatStatusLabel(filter === 'all' ? '' : filter).toLowerCase()} students`}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.25 }}>
              {(students ?? []).length === 0 ? 'Students appear when ready for counseling.' : 'Try a different filter.'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {visible.map((s) => {
              const isSelected = selectedId === s._id;
              const counselingLabel = formatStatusLabel(s.counselingStatus || 'not-started');
              return (
                <Box
                  key={s._id}
                  onClick={() => onSelect(s)}
                  sx={{
                    px: 1.25, py: 0.75,
                    cursor: 'pointer', borderBottom: 1, borderColor: 'divider',
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    borderLeft: isSelected ? 2 : 2, borderLeftColor: isSelected ? 'primary.main' : 'transparent',
                    transition: 'background-color 120ms ease',
                    '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.studentName}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: 'monospace', flexShrink: 0 }}>
                      {s.referenceId}
                    </Typography>
                    <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>·</Typography>
                    <Typography noWrap sx={{ fontSize: 10.5, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {counselingLabel}
                    </Typography>
                    {s.interestLevel && s.interestLevel !== 'Medium' && (
                      <Typography sx={{ fontSize: 10, color: s.interestLevel === 'Urgent' ? 'error.main' : s.interestLevel === 'High' ? 'warning.main' : 'text.disabled', fontWeight: 600, marginLeft: 'auto', flexShrink: 0 }}>
                        {s.interestLevel}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}

const QUEUE_COLLAPSED_KEY = 'counselor-queue-collapsed';

export default function CounselorCounseling({ routePayload }) {
  const { setActiveStudent } = useCounselor();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    try { return localStorage.getItem(QUEUE_COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  const toggleLeft = useCallback(() => {
    setLeftCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(QUEUE_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, []);

  const handleSelectStudent = useCallback((student) => {
    setSelectedStudent(student);
    setActiveStudent(student);
  }, [setActiveStudent]);

  const handleBack = useCallback(() => {
    setSelectedStudent(null);
    setActiveStudent(null);
  }, [setActiveStudent]);

  useEffect(() => {
    if (routePayload) {
      setSelectedStudent(routePayload);
      setActiveStudent(routePayload);
    }
  }, [routePayload, setActiveStudent]);

  const LEFT_WIDTH = leftCollapsed ? 52 : '19%';
  const LEFT_MIN = leftCollapsed ? 52 : 224;
  const LEFT_MAX = leftCollapsed ? 52 : 300;

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* LEFT: Counseling Queue — collapsible */}
      <Box sx={{
        width: LEFT_WIDTH, minWidth: LEFT_MIN, maxWidth: LEFT_MAX, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider',
        overflow: 'hidden',
        transition: 'width 180ms ease, min-width 180ms ease, max-width 180ms ease',
      }}>
        {leftCollapsed ? (
          /* Collapsed rail — vertical expand control */
          <Box sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pt: 1.5, gap: 1.5, flexShrink: 0,
          }}>
            <Tooltip title="Expand queue" placement="right" arrow>
              <IconButton
                size="small"
                onClick={toggleLeft}
                sx={{
                  width: 32, height: 32, borderRadius: 1.5,
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                }}
              >
                <ChevronRightIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Counseling Queue" placement="right" arrow>
              <AssignmentIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
            </Tooltip>
          </Box>
        ) : (
          /* Expanded — full queue content */
          <>
            <Box sx={{ px: 1.25, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AssignmentIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Counseling Queue</Typography>
                <Tooltip title="Collapse queue" placement="bottom" arrow>
                  <IconButton
                    size="small"
                    onClick={toggleLeft}
                    sx={{
                      width: 24, height: 24, borderRadius: 1,
                      color: 'text.disabled',
                      '&:hover': { bgcolor: 'action.hover', color: 'text.secondary' },
                    }}
                  >
                    <ChevronLeftIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.15 }}>
                Students requiring attention
              </Typography>
            </Box>
            <CallQueue onSelect={handleSelectStudent} selectedId={selectedStudent?._id} />
          </>
        )}
      </Box>

      {/* RIGHT: Workspace */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedStudent ? (
          <CounselorWorkspace student={selectedStudent} onBack={handleBack} leftCollapsed={leftCollapsed} />
        ) : (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <AssignmentIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.secondary' }}>
              Select a student to begin
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.disabled', textAlign: 'center', maxWidth: 280 }}>
              Choose a student from the queue to open their workspace.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
