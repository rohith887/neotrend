import { useState, useMemo } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Typography,
} from '@mui/material';
import CallMadeIcon from '@mui/icons-material/CallMade';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import HistoryIcon from '@mui/icons-material/History';
import PersonIcon from '@mui/icons-material/Person';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SchoolIcon from '@mui/icons-material/School';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TimelineIcon from '@mui/icons-material/Timeline';
import AppTabs from '../ui/mui/AppTabs.jsx';
import Timeline from '../ui/Timeline.jsx';
import { stageLabel } from '../utils/lifecycle.js';

/* ── Constants ─────────────────────────────────────────────────────────── */

const TABS = [
  { id: 'timeline', label: 'Timeline', icon: <TimelineIcon sx={{ fontSize: 14 }} /> },
  { id: 'calls', label: 'Calls', icon: <HistoryIcon sx={{ fontSize: 14 }} /> },
  { id: 'remarks', label: 'Remarks', icon: <FormatQuoteIcon sx={{ fontSize: 14 }} /> },
];

/* ── Helpers ───────────────────────────────────────────────────────────── */

const fmtDur = (sec) => {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const dispName = (it) => it.disposition?.name || it.dispositionName || '—';
const dispColor = (it) => it.disposition?.color || undefined;
const agentName = (it) => {
  if (!it.agent) return '—';
  return [it.agent.firstName, it.agent.lastName].filter(Boolean).join(' ') || 'Agent';
};

// Resolve a (possibly populated) user ref to a display name.
const userName = (u) => {
  if (!u || typeof u === 'string') return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ');
};

/* ── Sub-components ────────────────────────────────────────────────────── */

function EmptyState({ icon, title, sub }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.5, px: 2, py: 2.5 }}>
      <Box sx={{
        width: 36, height: 36, borderRadius: 1.5, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', bgcolor: 'action.hover', color: 'text.disabled', mb: 0.5,
      }}>
        {icon}
      </Box>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>{title}</Typography>
      {sub && <Typography sx={{ fontSize: 11.5, color: 'text.disabled', maxWidth: 220, lineHeight: 1.4 }}>{sub}</Typography>}
    </Box>
  );
}

function DispositionChip({ name, color }) {
  return (
    <Chip
      label={name}
      size="small"
      sx={{
        height: 20, fontSize: 11, fontWeight: 700, letterSpacing: '-0.01em',
        ...(color ? {
          color, border: `1px solid ${color}`, backgroundColor: `${color}18`,
        } : {
          color: 'text.secondary', border: 1, borderColor: 'divider', backgroundColor: 'action.hover',
        }),
      }}
    />
  );
}

/* ── Main Component ────────────────────────────────────────────────────── */

export default function ActivityPanel({
  lead,
  interactions = [],
  lifecycleEvents = [],
  loadingHistory = false,
  historyError = null,
  mode = 'column',
}) {
  const [tab, setTab] = useState('timeline');
  const [expanded, setExpanded] = useState(false);

  const calls = useMemo(() => {
    return [...(interactions || [])].sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt));
  }, [interactions]);

  const remarks = useMemo(() => {
    return calls.filter((it) => it.remarks && it.remarks.trim());
  }, [calls]);

  // ── Unified timeline — merges every activity type the system already
  // records: lead creation, disposition changes (audit trail on the lead),
  // call interactions and recorded lifecycle transitions (fetched lazily
  // from GET /leads/:id/lifecycle). Sorted newest first.
  //
  // NOTE: `icon` must be an icon COMPONENT (e.g. PersonIcon), never a
  // rendered element (<PersonIcon />) — Timeline renders <Icon /> itself
  // and treats an element as a component type ("Element type is invalid").
  const timelineItems = useMemo(() => {
    if (!lead) return [];
    const items = [];

    if (lead.createdAt) {
      items.push({
        kind: 'created',
        at: lead.createdAt,
        title: 'Lead created',
        detail: lead.referenceId ? `Reference #${lead.referenceId}` : '',
        tone: 'neutral',
        icon: PersonIcon,
      });
    }

    (lead.dispositionHistory ?? []).forEach((h) => {
      const by = userName(h.changedBy);
      items.push({
        kind: 'dispo',
        at: h.changedAt || null,
        title: `Disposition → ${h.dispositionName || '—'}`,
        detail: [h.note, by].filter(Boolean).join(' · '),
        tone: 'violet',
        icon: SwapHorizIcon,
      });
    });

    // Recorded lifecycle transitions — previousStage → newStage with the
    // actor and source. Real events only; never synthesized here.
    (lifecycleEvents ?? []).forEach((ev) => {
      if (ev.type !== 'LIFECYCLE_CHANGED') return;
      const meta = ev.metadata ?? {};
      const from = stageLabel(meta.previousStage);
      const to = stageLabel(meta.newStage);
      items.push({
        kind: 'lifecycle',
        at: ev.at,
        title: from ? `${from} → ${to}` : to,
        detail: [
          meta.note || '',
          ev.user || '',
          meta.source ? `via ${meta.source}` : '',
        ].filter(Boolean).join(' · '),
        tone: 'primary',
        icon: TimelineIcon,
      });
    });

    // University shortlist actions (Phase 3) — added / re-added / status /
    // priority / note / removed / confirmed. Real events only.
    (lifecycleEvents ?? []).forEach((ev) => {
      if (ev.type !== 'SHORTLIST_UPDATED' && ev.type !== 'SHORTLIST_CONFIRMED') return;
      const meta = ev.metadata ?? {};
      const uni = meta.universityName || 'University';
      const action = String(meta.action || 'updated');
      const titles = {
        added: `Added ${uni} to shortlist`,
        're-added': `Re-added ${uni} to shortlist`,
        removed: `Removed ${uni} from shortlist`,
        status: `${uni} → ${meta.to || ''}`.trim(),
        priority: `${uni} priority ${meta.from ?? ''} → ${meta.to ?? ''}`.trim(),
        note: `Note on ${uni}`,
        confirmed: 'Shortlist confirmed',
      };
      items.push({
        kind: 'shortlist',
        at: ev.at,
        title: titles[action] || `Shortlist updated — ${uni}`,
        detail: [
          ev.user || '',
          action === 'confirmed' && meta.confirmedCount ? `${meta.confirmedCount} entries confirmed` : '',
        ].filter(Boolean).join(' · '),
        tone: 'violet',
        icon: SchoolIcon,
      });
    });

    // Application workflow actions (Phase 4) — created / status / submitted
    // / offer / rejected / withdrawn. Real events only.
    (lifecycleEvents ?? []).forEach((ev) => {
      if (ev.type !== 'APPLICATION_UPDATED') return;
      const meta = ev.metadata ?? {};
      const uni = meta.universityName || 'university';
      const action = String(meta.action || 'updated');
      const titles = {
        created: `Application created — ${uni}`,
        status_changed: `${uni}: ${meta.from ?? ''} → ${meta.to ?? ''}`.trim(),
        submitted: `Application submitted — ${uni}`,
        offer: `Offer received — ${uni}`,
        rejected: `Application rejected — ${uni}`,
        withdrawn: `Application withdrawn — ${uni}`,
      };
      items.push({
        kind: 'application',
        at: ev.at,
        title: titles[action] || `Application updated — ${uni}`,
        detail: [ev.user || '', meta.reason || ''].filter(Boolean).join(' · '),
        tone: action === 'offer' ? 'success' : action === 'rejected' || action === 'withdrawn' ? 'violet' : 'primary',
        icon: AssignmentOutlinedIcon,
      });
    });

    // Assignment events round out the journey's start.
    (lifecycleEvents ?? []).forEach((ev) => {
      if (ev.type !== 'LEAD_FETCHED') return;
      items.push({
        kind: 'assignment',
        at: ev.at,
        title: 'Assigned / fetched',
        detail: [ev.user || '', String(ev.metadata?.assignment || '')].filter(Boolean).join(' · '),
        tone: 'neutral',
        icon: PersonIcon,
      });
    });

    calls.forEach((it) => {
      const hasDuration = it.durationSec > 0;
      const agent = agentName(it);
      items.push({
        kind: 'call',
        at: it.calledAt,
        title: dispName(it),
        detail: it.remarks && it.remarks.trim() ? it.remarks : '',
        time: [
          fmtDateTime(it.calledAt),
          hasDuration ? fmtDur(it.durationSec) : '',
          agent !== '—' ? agent : '',
        ].filter(Boolean).join(' · '),
        tone: hasDuration ? 'success' : 'info',
        icon: CallMadeIcon,
      });
    });

    return items
      .filter((it) => it.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .map(({ kind, at, ...rest }) => ({ ...rest, time: rest.time || fmtDateTime(at) }));
  }, [lead, calls, lifecycleEvents]);

  const renderBody = () => {
    if (!lead) {
      return <EmptyState icon={<CallMadeIcon sx={{ fontSize: 18 }} />} title="No active call" sub="Activity appears here during calls." />;
    }
    if (loadingHistory) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3, gap: 1 }}>
          <CircularProgress size={20} />
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Loading…</Typography>
        </Box>
      );
    }
    if (historyError) {
      return <Alert severity="warning" sx={{ mx: 1.5, my: 1, fontSize: 12 }}>{historyError}</Alert>;
    }

    if (tab === 'timeline') {
      if (timelineItems.length === 0) {
        return <EmptyState icon={<TimelineIcon sx={{ fontSize: 18 }} />} title="No activity yet" sub="Appears after the first interaction." />;
      }
      return (
        <Box sx={{ px: 1.5, py: 1 }}>
          <Timeline
            items={timelineItems.map(({ tone, icon, title, detail, time }) => ({ tone, icon, title, detail, time }))}
            emptyText="No activity yet"
          />
        </Box>
      );
    }

    if (tab === 'calls') {
      if (calls.length === 0) {
        return <EmptyState icon={<HistoryIcon sx={{ fontSize: 18 }} />} title="No calls yet" sub="Call history appears after the first disposition." />;
      }
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, px: 1.5, py: 1 }}>
          {calls.map((it) => (
            <Box key={it._id} sx={{
              border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 0.875,
              display: 'flex', flexDirection: 'column', gap: 0.375,
              transition: 'border-color 120ms ease',
              '&:hover': { borderColor: 'primary.border' },
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'space-between' }}>
                <DispositionChip name={dispName(it)} color={dispColor(it)} />
                <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>{fmtDateTime(it.calledAt)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.375 }}>
                  <CallMadeIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                  <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Outbound
                  </Typography>
                </Box>
                {it.durationSec > 0 && (
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                    Duration {fmtDur(it.durationSec)}
                  </Typography>
                )}
                {it.callbackDateTime && (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.375 }}>
                    <ScheduleIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                      Callback {fmtDateTime(it.callbackDateTime)}
                    </Typography>
                  </Box>
                )}
              </Box>
              {it.remarks && (
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {it.remarks}
                </Typography>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PersonIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{agentName(it)}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      );
    }

    if (tab === 'remarks') {
      if (remarks.length === 0) {
        return <EmptyState icon={<FormatQuoteIcon sx={{ fontSize: 18 }} />} title="No remarks yet" sub="Disposition notes appear here." />;
      }
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, px: 1.5, py: 1 }}>
          {remarks.map((it) => {
            const priority = it.interestLevel || it.dispositionPriority;
            const pTone = priority === 'Urgent' || priority === 'P1' ? 'error' : priority === 'High' || priority === 'P2' ? 'warning' : 'default';
            return (
              <Box key={it._id} sx={{
                border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 0.875,
                display: 'flex', flexDirection: 'column', gap: 0.375,
                transition: 'border-color 120ms ease',
                '&:hover': { borderColor: 'primary.border' },
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'space-between' }}>
                  <DispositionChip name={dispName(it)} color={dispColor(it)} />
                  <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>{fmtDateTime(it.calledAt)}</Typography>
                </Box>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {it.remarks}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PersonIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                    <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{agentName(it)}</Typography>
                  </Box>
                  {priority && (
                    <Chip label={priority} size="small" sx={{ height: 16, fontSize: 9.5, fontWeight: 700, ...(pTone !== 'default' ? { color: `${pTone}.main`, bgcolor: `${pTone}.soft` } : {}) }} />
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      );
    }

    return null;
  };

  // Compact "band" timeline body shared by band mode (below the columns).
  const bandTimeline = () => {
    if (!lead) {
      return <EmptyState icon={<CallMadeIcon sx={{ fontSize: 16 }} />} title="No active call" sub="Activity appears here during calls." />;
    }
    if (loadingHistory) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', py: 1.5, gap: 1 }}>
          <CircularProgress size={18} />
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Loading…</Typography>
        </Box>
      );
    }
    if (historyError) {
      return <Alert severity="warning" sx={{ mx: 1.5, my: 1, fontSize: 12 }}>{historyError}</Alert>;
    }
    if (timelineItems.length === 0) {
      return <EmptyState icon={<TimelineIcon sx={{ fontSize: 16 }} />} title="No activity yet" sub="Appears after the first interaction." />;
    }
    const visible = expanded ? timelineItems : timelineItems.slice(0, 3);
    return (
      <Box sx={{ px: 1.5, py: 1 }}>
        <Timeline
          items={visible.map(({ tone, icon, title, detail, time }) => ({ tone, icon, title, detail, time }))}
          emptyText="No activity yet"
        />
      </Box>
    );
  };

  if (mode === 'band') {
    const total = timelineItems.length;
    return (
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1.5, boxShadow: 'xs' }}>
        <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.625, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'inline-flex', color: 'primary.main' }} aria-hidden="true">
            <TimelineIcon sx={{ fontSize: 14 }} />
          </Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Activity Timeline
          </Typography>
          <Typography aria-hidden="true" sx={{ flex: 1 }} />
          {total > 3 && (
            <Button
              size="small"
              onClick={() => setExpanded((v) => !v)}
              sx={{ fontSize: 11.5, fontWeight: 600, color: 'primary.main', textTransform: 'none', minWidth: 0 }}
            >
              {expanded ? 'Show less' : `View all (${total})`}
            </Button>
          )}
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {bandTimeline()}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppTabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="Activity tabs"
        sx={{
          flexShrink: 0, px: 0.75, borderBottom: 1, borderColor: 'divider', minHeight: 0,
          '& .MuiTab-root': {
            minHeight: 36, py: 0, fontSize: 12, fontWeight: 600, minWidth: 0,
            transition: 'color 120ms ease, background-color 120ms ease',
            '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
          },
          '& .MuiTabs-indicator': { height: 3 },
        }}
      />

      {/* Scrollable content — timeline only (no Journey / Next Action; those
          live in the Right Action Center) */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {renderBody()}
      </Box>
    </Box>
  );
}
