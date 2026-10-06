// Work-type labeling for the agent work queues.
//
// The "Type" of a lead is the CURRENT work item that put it in front of the
// agent — the scheduled call it must make next. It is NEVER derived from the
// lead's lifetime RNR history: the RNR 6+ escalation bucket is a historical
// filter (6+ RNR attempts accumulated over time), not a work type. A lead in
// that bucket is only typed "RNR" when it is genuinely in RNR workload right
// now.

// A lead is an RNR work item when its CURRENT disposition is RNR — the
// interaction that queued the next attempt was "ring, no response".
const isRnrItem = (row) =>
  String(row.dispositionName || row.disposition?.name || '')
    .trim()
    .toUpperCase() === 'RNR';

// A lead's ACTUAL current work type:
//   RNR      — currently in RNR workload
//   Callback — currently holds a scheduled callback (status 'callback')
//   other    — the lead's own disposition / type
const currentWorkType = (row) => {
  if (isRnrItem(row)) return 'RNR';
  if (row.rawStatus === 'callback' || row.status === 'callback') return 'Callback';
  return row.dispositionName || row.status || 'Callback';
};

// The work type of a QUEUE context (KPI → drawer). Only the functional
// work-queue contexts carry a type of their own; every other context —
// including the RNR 6+ escalation bucket — falls back to each lead's ACTUAL
// current type, so a lead is never tagged "RNR" just because of its history.
const contextWorkType = (preset = {}) => {
  if (preset.rnr === 'current') return 'RNR';                    // RNR Leads
  if (preset.rnr === 'escalated') return null;                   // RNR 6+ → per lead
  if (Array.isArray(preset.status) && preset.status.includes('callback')) return 'Callback'; // Pending Callbacks
  return null;
};

export { isRnrItem, currentWorkType, contextWorkType };