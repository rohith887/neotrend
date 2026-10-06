/**
 * Student lifecycle — shared client mirror of the server's canonical
 * journey vocabulary (server/src/services/lifecycle.service.js).
 *
 * One student, one current stage, one waiting-on party, one next action.
 * Stages advance only through real business actions; this module is pure
 * presentation metadata (labels, tones, ordering) plus tiny formatters.
 */

export const LIFECYCLE_STAGES = [
  'NEW_LEAD',
  'ASSIGNED',
  'CONTACTED',
  'COUNSELLING',
  'INTERESTED',
  'PREFERENCES',
  'UNIVERSITY_SHORTLIST',
  'APPLICATION',
  'SUBMITTED',
  'OFFER_RECEIVED',
  'DEPOSIT_PAYMENT',
  'VISA',
  'ENROLLED',
];

export const LIFECYCLE_TERMINAL_STAGES = ['NOT_INTERESTED', 'LOST', 'ON_HOLD', 'DEFERRED', 'REJECTED'];

export const LIFECYCLE_ALL_STAGES = [...LIFECYCLE_STAGES, ...LIFECYCLE_TERMINAL_STAGES];

export const WAITING_ON_OPTIONS = [
  'Student',
  'Counselor',
  'University',
  'Finance',
  'Visa Team',
];

export const STAGE_LABELS = {
  NEW_LEAD: 'New Lead',
  ASSIGNED: 'Assigned',
  CONTACTED: 'Contacted',
  COUNSELLING: 'In Counselling',
  INTERESTED: 'Interested',
  PREFERENCES: 'Preferences Set',
  UNIVERSITY_SHORTLIST: 'Shortlisting',
  APPLICATION: 'Application',
  SUBMITTED: 'Submitted',
  OFFER_RECEIVED: 'Offer Received',
  DEPOSIT_PAYMENT: 'Deposit / Fee',
  VISA: 'Visa Process',
  ENROLLED: 'Enrolled',
  NOT_INTERESTED: 'Not Interested',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
  DEFERRED: 'Deferred',
  REJECTED: 'Rejected',
};

// Neutral by default. Green reserved for genuinely positive/live moments;
// grey for closed/paused; warning amber only where attention is needed.
export const STAGE_TONES = {
  NEW_LEAD: 'neutral',
  ASSIGNED: 'neutral',
  CONTACTED: 'info',
  COUNSELLING: 'info',
  INTERESTED: 'success',
  PREFERENCES: 'info',
  UNIVERSITY_SHORTLIST: 'info',
  APPLICATION: 'info',
  SUBMITTED: 'info',
  OFFER_RECEIVED: 'success',
  DEPOSIT_PAYMENT: 'warning',
  VISA: 'info',
  ENROLLED: 'success',
  NOT_INTERESTED: 'default',
  LOST: 'default',
  ON_HOLD: 'default',
  DEFERRED: 'default',
  REJECTED: 'default',
};

export const stageLabel = (stage) => STAGE_LABELS[stage] ?? stage ?? '';

export const stageTone = (stage) => STAGE_TONES[stage] ?? 'neutral';

export const isTerminalStage = (stage) => LIFECYCLE_TERMINAL_STAGES.includes(stage);

export const isActiveStage = (stage) =>
  LIFECYCLE_STAGES.includes(stage) && stage !== 'ENROLLED';

/** Rank for forward-only comparisons (-1 for terminal/paused stages). */
export const stageRank = (stage) => {
  const i = LIFECYCLE_STAGES.indexOf(stage);
  return i === -1 ? -1 : i;
};

/**
 * Normalize whatever the API returned into the canonical inline shape:
 * { stage, subStatus, waitingOn, nextAction, nextActionDue, owner,
 *   lastContactAt, lastActivityAt }
 * Accepts either lead.lifecycle from the API or a raw lead document.
 */
export const lifecycleOf = (leadOrLifecycle) => {
  if (!leadOrLifecycle) return null;
  if (leadOrLifecycle.stage !== undefined) {
    return {
      stage: leadOrLifecycle.stage ?? null,
      subStatus: leadOrLifecycle.subStatus || '',
      waitingOn: leadOrLifecycle.waitingOn ?? null,
      nextAction: leadOrLifecycle.nextAction || '',
      nextActionDue: leadOrLifecycle.nextActionDue ?? null,
      owner: leadOrLifecycle.owner ?? null,
      lastContactAt: leadOrLifecycle.lastContactAt ?? null,
      lastActivityAt: leadOrLifecycle.lastActivityAt ?? null,
    };
  }
  const lead = leadOrLifecycle;
  return {
    stage: lead.lifecycleStage ?? null,
    subStatus: lead.lifecycleSubStatus || '',
    waitingOn: lead.waitingOn ?? null,
    nextAction: lead.nextAction || '',
    nextActionDue: lead.nextActionDue ?? null,
    owner:
      typeof lead.assignedTo === 'object' && lead.assignedTo !== null
        ? [lead.assignedTo.firstName, lead.assignedTo.lastName].filter(Boolean).join(' ') || null
        : (lead.assignedTo ?? null),
    lastContactAt: lead.lastCallAt ?? null,
    lastActivityAt: lead.updatedAt ?? null,
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'Overdue' | 'Today' | 'Tomorrow' | 'In N days' | date string | null */
export const dueLabel = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(today)) / DAY_MS);
  if (diffDays < 0) return diffDays === -1 ? 'Yesterday' : `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export const isOverdue = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
};

/** Compact human time since an ISO timestamp ('3h ago'), or ''. */
export const agoLabel = (iso) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};
