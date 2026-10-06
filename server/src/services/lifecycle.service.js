/* ==========================================================================
   LIFECYCLE SERVICE — the single source of truth for the student journey.
   --------------------------------------------------------------------------
   Every student has ONE current stage, ONE owner (lead.assignedTo), ONE
   next action and a complete chronological event history (Activity docs).

   Design rules:
   • Stages advance ONLY through real business actions (disposition saved,
     lead assigned, preferences saved, counselor status updates, explicit
     supervisor transitions) — never from arbitrary UI clicks.
   • Existing disposition / LEAD_STATUS fields are NOT overwritten; the
     lifecycle layer reads them and coexists with them. Legacy leads with
     no stored stage get one derived lazily (idempotent backfill).
   • Forward-only automatic movement inside the happy path; terminal
     states (Lost / Not Interested / Rejected) and pauses (On Hold /
     Deferred) are explicit decisions recorded previousStage → newStage.
   ========================================================================== */
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');

const {
  LIFECYCLE_STAGES,
  LIFECYCLE_TERMINAL_STAGES,
  LIFECYCLE_ALL_STAGES,
  WAITING_ON_OPTIONS,
} = Lead;

// Position of each ordered stage — the backbone of forward-only moves.
const STAGE_ORDER = Object.fromEntries(LIFECYCLE_STAGES.map((s, i) => [s, i]));

/* Default next action per active stage — the engine's baseline suggestion.
   A stored lead.nextAction always wins over these. */
const DEFAULT_NEXT_ACTION = {
  ASSIGNED: 'Make first contact',
  CONTACTED: 'Follow up on conversation',
  COUNSELLING: 'Qualify interest and complete counselling',
  INTERESTED: 'Complete student profile',
  PREFERENCES: 'Complete study preferences',
  UNIVERSITY_SHORTLIST: 'Select universities',
  APPLICATION: 'Complete application documents',
  SUBMITTED: 'Await university response',
  OFFER_RECEIVED: 'Review offer with student',
  DEPOSIT_PAYMENT: 'Complete payment',
  VISA: 'Submit visa documents',
};

/* Who blocks the workflow by default at each stage — stored workflow data,
   not hardcoded UI text. Explicit waitingOn values always win. */
const DEFAULT_WAITING_ON = {
  SUBMITTED: 'University',
  OFFER_RECEIVED: 'Student',
  DEPOSIT_PAYMENT: 'Finance',
  VISA: 'Visa Team',
};

/* Dispositions that mean "could not reach the student" — they must never
   advance the journey past ASSIGNED. Mirrors activity.service lists. */
const NO_CONTACT_DISPOSITIONS = new Set([
  'RNR', 'No Answer', 'NA', 'Unreachable', 'Busy', 'Busy Line', 'Call Later - Busy',
]);

const isActiveStage = (stage) => LIFECYCLE_STAGES.includes(stage);
const isTerminalStage = (stage) => LIFECYCLE_TERMINAL_STAGES.includes(stage);

const rankOf = (stage) => {
  if (!isActiveStage(stage)) return -1; // terminal / unknown → lowest rank
  return STAGE_ORDER[stage];
};

/* ── Stage derivation from EXISTING lead data ────────────────────────
   Pure function over a lean/populated lead document. Used to seed the
   stored stage for legacy leads and as the "resume" target after On Hold.
   Precedence runs from the deepest milestone backwards so a lead that
   already has a visa filing is not reported as merely "Interested".    */
const deriveStage = (lead) => {
  if (!lead) return 'NEW_LEAD';
  if (lead.lifecycleStage && LIFECYCLE_ALL_STAGES.includes(lead.lifecycleStage)) {
    return lead.lifecycleStage;
  }

  // Enrollment confirmed (existing business meaning: status 'submitted').
  if (lead.status === 'submitted') return 'ENROLLED';

  // Visa in motion.
  const visaStage = lead.visaStatus || lead.visaDetails?.stage;
  if (visaStage && visaStage !== 'not-started') return 'VISA';

  // Deposit / payment received via registration fee tracking.
  if (lead.feeStatus === 'received' || lead.registrationStatus === 'fee-received') {
    return 'DEPOSIT_PAYMENT';
  }

  // Applications embedded array — furthest real application state wins.
  const apps = Array.isArray(lead.applications) ? lead.applications : [];
  const appStates = apps
    .map((a) => String(a?.status || 'not-started'))
    .filter((s) => s !== 'not-started');
  if (appStates.includes('accepted') || appStates.includes('offer-received')) return 'OFFER_RECEIVED';
  if (appStates.includes('submitted') || appStates.includes('under-review')) return 'SUBMITTED';
  if (appStates.length) return 'APPLICATION';

  // Documents being gathered/submitted/verified belong to the application push.
  if (lead.documentStatus && lead.documentStatus !== 'pending') return 'APPLICATION';

  // Registration completed without an application trail → treat as enrolled-adjacent deposit flow.
  if (lead.registrationStatus === 'completed' || lead.applicationStatus === 'draft') {
    return lead.registrationStatus === 'completed' ? 'ENROLLED' : 'APPLICATION';
  }
  if (lead.applicationStatus === 'submitted' || lead.applicationStatus === 'under-review') return 'SUBMITTED';
  if (lead.applicationStatus === 'offer-received' || lead.applicationStatus === 'accepted') return 'OFFER_RECEIVED';
  if (lead.applicationStatus === 'rejected') return 'REJECTED';

  // Disposition-driven early journey. currentDisposition may be populated
  // (object) or a raw ObjectId; dispositionHistory names are the fallback.
  const dispName =
    typeof lead.currentDisposition === 'object' && lead.currentDisposition !== null
      ? lead.currentDisposition.name
      : null;
  const historyNames = (lead.dispositionHistory || [])
    .map((h) => h.dispositionName)
    .filter(Boolean);
  const knownNames = [dispName, ...historyNames].filter(Boolean);

  if (knownNames.includes('Not Interested')) return 'NOT_INTERESTED';
  if (knownNames.includes('Interested')) return 'INTERESTED';

  // Study preferences / university shortlist captured on the profile.
  if ((lead.preferredUniversities || []).length > 0) return 'UNIVERSITY_SHORTLIST';
  if ((lead.preferredCountries || []).length > 0) return 'PREFERENCES';

  // Call-based contact stages (lastCallAt is set by every logged call).
  // Without an interaction count on hand, multiple logged dispositions
  // imply counselling has started.
  if (lead.lastCallAt) {
    return historyNames.length > 1 ? 'COUNSELLING' : 'CONTACTED';
  }

  if (lead.assignedTo || lead.fetchedBy) return 'ASSIGNED';
  if (lead.counselorAssigned) return 'COUNSELLING';
  return 'NEW_LEAD';
};

/* ── Inline lifecycle view (no extra queries) ─────────────────────────
   Built from fields already present on the lean lead + values the caller
   computed anyway (latest interaction due date). Used by GET /api/leads
   so list endpoints never wait on timeline/history queries.            */
const inlineLifecycle = (lead, { suggestedDue = null } = {}) => {
  const stage = deriveStage(lead);
  return {
    stage,
    subStatus: lead.lifecycleSubStatus || '',
    waitingOn: lead.waitingOn || DEFAULT_WAITING_ON[stage] || null,
    nextAction: lead.nextAction || DEFAULT_NEXT_ACTION[stage] || null,
    nextActionDue: lead.nextActionDue || suggestedDue || null,
    owner: lead.ownerName || null,
    counselorAssigned: lead.counselorAssigned || null,
    lastContactAt: lead.lastCallAt || null,
    lastActivityAt: lead.updatedAt || lead.createdAt || null,
    updatedAt: lead.lifecycleUpdatedAt || null,
  };
};

/* ── Transition recording ──────────────────────────────────────────── */

const recordLifecycleEvent = async ({ leadId, actorId, fromStage, toStage, metadata = {} }) => {
  await Activity.create({
    user: actorId || undefined,
    type: 'LIFECYCLE_CHANGED',
    lead: leadId,
    metadata: new Map(Object.entries({
      previousStage: fromStage || null,
      newStage: toStage || null,
      ...metadata,
    }).filter(([, v]) => v !== undefined)),
  });
};

/* Standard populate set so transition results are drop-in usable by the
   same client code paths that consume GET /api/leads/:id. */
const populatedLead = (query) =>
  query
    .populate('countryPreferred', 'name code')
    .populate('preferredCountries.country', 'name code')
    .populate('preferredUniversities.university', 'institutionName')
    .populate('source', 'name')
    .populate('assignedTo', 'firstName lastName email')
    .populate('currentDisposition', 'name label color')
    .lean();

/**
 * Apply a controlled lifecycle transition.
 *
 * @param {object} p
 * @param {ObjectId|string} p.leadId
 * @param {ObjectId|string} p.actorId        – user performing the action
 * @param {string}          p.toStage        – target stage key
 * @param {string}          [p.source]       – business action that caused it
 * @param {string}          [p.subStatus]
 * @param {string|null}     [p.waitingOn]
 * @param {string}          [p.nextAction]   – '' resets to the stage default
 * @param {Date|null}       [p.nextActionDue]
 * @param {boolean}         [p.forwardOnly]  – block moving backwards (default false)
 * @param {string}          [p.note]
 * @param {boolean}         [p.skipIfEqual]  – no-op when already at toStage (default true)
 * @returns updated populated lead document (lean), or the unchanged lead when skipped.
 */
const applyTransition = async ({
  leadId,
  actorId,
  toStage,
  source = 'manual',
  subStatus,
  waitingOn,
  nextAction,
  nextActionDue,
  forwardOnly = false,
  note = '',
  skipIfEqual = true,
}) => {
  if (!LIFECYCLE_ALL_STAGES.includes(toStage)) {
    throw Object.assign(new Error(`Unknown lifecycle stage: ${toStage}`), { statusCode: 400 });
  }

  const lead = await Lead.findById(leadId).lean();
  if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });

  const fromStage = deriveStage(lead);
  if (skipIfEqual && fromStage === toStage) {
    // Still persist any provided workflow details (waiting-on / next action).
    const patch = {};
    if (subStatus !== undefined) patch.lifecycleSubStatus = String(subStatus || '').trim();
    if (waitingOn !== undefined) patch.waitingOn = waitingOn || null;
    if (nextAction !== undefined) patch.nextAction = String(nextAction || '').trim();
    if (nextActionDue !== undefined) patch.nextActionDue = nextActionDue || null;
    if (!Object.keys(patch).length) return lead;
    return populatedLead(Lead.findByIdAndUpdate(
      leadId,
      { $set: { ...patch, lifecycleUpdatedAt: new Date() } },
      { new: true }
    ));
  }

  if (forwardOnly && rankOf(toStage) < rankOf(fromStage)) {
    return lead; // silently refuse backward drift on automatic paths
  }

  const now = new Date();
  const resolvedWaitingOn =
    waitingOn !== undefined ? waitingOn : (DEFAULT_WAITING_ON[toStage] ?? lead.waitingOn ?? null);
  const resolvedNextAction =
    nextAction !== undefined ? String(nextAction || '').trim() : '';
  const resolvedSubStatus = subStatus !== undefined ? String(subStatus || '').trim() : '';

  const updated = await populatedLead(Lead.findByIdAndUpdate(
    leadId,
    {
      $set: {
        lifecycleStage: toStage,
        lifecycleSubStatus: resolvedSubStatus,
        waitingOn: resolvedWaitingOn || null,
        nextAction: resolvedNextAction,
        nextActionDue: nextActionDue !== undefined ? nextActionDue : lead.nextActionDue || null,
        lifecycleUpdatedAt: now,
      },
    },
    { new: true }
  ));

  await recordLifecycleEvent({
    leadId,
    actorId,
    fromStage,
    toStage,
    metadata: {
      source,
      note: note || undefined,
      subStatus: resolvedSubStatus || undefined,
      waitingOn: resolvedWaitingOn || undefined,
    },
  });

  return updated;
};

/* Ensure the stored stage is at least `toStage` (forward-only, silent).
   Used by assignment flows where NEW_LEAD → ASSIGNED should happen even
   if the lead was already further along (then it's a no-op).           */
const ensureStageReached = async ({ leadId, actorId, toStage, source }) => {
  const lead = await Lead.findById(leadId).select('lifecycleStage').lean();
  if (!lead) return null;
  if (rankOf(deriveStage(lead)) >= rankOf(toStage)) return null;
  return applyTransition({ leadId, actorId, toStage, source, forwardOnly: true });
};

/* ── Decision helpers (pure) ───────────────────────────────────────── */

/**
 * Stage target for a freshly saved disposition. Returns null when the
 * disposition must not move the journey (RNR / busy / unknown outcomes
 * on students already deep in the funnel).
 */
const stageFromDisposition = ({ disposition, callIndex, currentStage }) => {
  const name = String(disposition?.name || '');
  // Dropping a lead is a queue/ownership marker, not a journey move — it
  // must never advance (or back-drive) the student lifecycle stage.
  if (name === 'Drop Lead') return null;
  if (name === 'Not Interested') return 'NOT_INTERESTED';
  if (disposition?.requiresProfile) return 'INTERESTED'; // Interested gate

  if (NO_CONTACT_DISPOSITIONS.has(name)) {
    // Could not reach the student — never advance past ASSIGNED.
    return rankOf(currentStage || '') < STAGE_ORDER.ASSIGNED ? 'ASSIGNED' : null;
  }

  // Any other logged outcome implies a conversation happened.
  if (!callIndex || callIndex <= 1) return 'CONTACTED';
  return rankOf(currentStage || '') < STAGE_ORDER.COUNSELLING ? 'COUNSELLING' : null;
};

/** Furthest stage implied by counselor status-field updates (real actions). */
const stageFromCounselorFields = (nextValues = {}) => {
  const candidates = [];
  const { visaStatus, applicationStatus, documentStatus, feeStatus, registrationStatus } = nextValues;

  if (visaStatus && visaStatus !== 'not-started') candidates.push('VISA');
  if (['offer-received', 'accepted'].includes(applicationStatus)) candidates.push('OFFER_RECEIVED');
  if (applicationStatus === 'rejected') candidates.push('REJECTED');
  if (['submitted', 'under-review', 'draft', 'not-started'].includes(applicationStatus) && applicationStatus) {
    candidates.push(applicationStatus === 'draft' || applicationStatus === 'not-started' ? 'APPLICATION' : 'SUBMITTED');
  }
  if (documentStatus && documentStatus !== 'pending') candidates.push('APPLICATION');
  if (feeStatus === 'received' || registrationStatus === 'fee-received') candidates.push('DEPOSIT_PAYMENT');
  if (registrationStatus === 'completed') candidates.push('ENROLLED');

  if (!candidates.length) return null;
  return candidates.reduce((best, s) => (rankOf(s) > rankOf(best) ? s : best));
};

/** Furthest stage implied by the lead's applications array (real records). */
const stageFromApplications = (applications = []) => {
  let best = null;
  for (const app of applications) {
    const s = String(app?.status || 'not-started');
    if (['accepted', 'offer-received'].includes(s)) best = rankOf('OFFER_RECEIVED') > rankOf(best || '') ? 'OFFER_RECEIVED' : best;
    else if (['submitted', 'under-review'].includes(s)) best = rankOf('SUBMITTED') > rankOf(best || '') ? 'SUBMITTED' : best;
    else if (s === 'rejected') best = best || null; // rejection alone doesn't move the journey
    else if (s === 'draft') best = rankOf('APPLICATION') > rankOf(best || '') ? 'APPLICATION' : best;
  }
  return best;
};

/* ── Lazy idempotent backfill for legacy leads ───────────────────────
   Leads created before the lifecycle engine have no stored stage. We
   derive once from existing data and persist — never inventing events.
   Runs batched in the background on first read; safe to call often.   */
let backfillPromise = null;

const backfillBatch = async (size = 200) => {
  const leads = await Lead.find({ lifecycleStage: { $exists: false } })
    .limit(size)
    .select('_id status visaStatus visaDetails.stage feeStatus registrationStatus applicationStatus documentStatus currentDisposition dispositionHistory dispositionName preferredCountries preferredUniversities lastCallAt assignedTo fetchedBy counselorAssigned applications')
    .lean();
  if (!leads.length) return 0;
  const ops = leads.map((lead) => ({
    updateOne: {
      filter: { _id: lead._id, lifecycleStage: { $exists: false } },
      update: { $set: { lifecycleStage: deriveStage(lead) } },
    },
  }));
  await Lead.bulkWrite(ops, { ordered: false });
  return leads.length;
};

const ensureStagesBackfilled = () => {
  if (backfillPromise) return backfillPromise;
  backfillPromise = (async () => {
    try {
      for (let i = 0; i < 500; i += 1) {
        const processed = await backfillBatch();
        if (!processed) break;
      }
    } catch (err) {
      // Backfill is best-effort; reads fall back to derivation regardless.
      backfillPromise = null;
    }
  })();
  return backfillPromise;
};

/* ── Event history (lazy-loaded, newest first) ────────────────────────
   Real recorded events only: lifecycle transitions + assignment +
   disposition saves from the Activity collection. Nothing fabricated. */
const getLeadEvents = async (leadId, limit = 100) => {
  const docs = await Activity.find({ lead: leadId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'firstName lastName')
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    type: doc.type,
    at: doc.createdAt,
    user: doc.user
      ? [doc.user.firstName, doc.user.lastName].filter(Boolean).join(' ')
      : null,
    metadata: Object.fromEntries(
      Object.entries(doc.metadata || {}).map(([k, v]) => [k, v])
    ),
  }));
};

module.exports = {
  LIFECYCLE_STAGES,
  LIFECYCLE_TERMINAL_STAGES,
  LIFECYCLE_ALL_STAGES,
  WAITING_ON_OPTIONS,
  DEFAULT_NEXT_ACTION,
  DEFAULT_WAITING_ON,
  STAGE_ORDER,
  isActiveStage,
  isTerminalStage,
  rankOf,
  deriveStage,
  inlineLifecycle,
  populatedLead,
  applyTransition,
  ensureStageReached,
  recordLifecycleEvent,
  getLeadEvents,
  stageFromDisposition,
  stageFromCounselorFields,
  stageFromApplications,
  ensureStagesBackfilled,
};
