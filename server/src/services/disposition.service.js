const Disposition = require('../models/Disposition');

const INTEREST_LEVELS = [
  { code: 'P1', label: 'P1 — Register / Enroll immediately',     description: 'Interested and ready to enroll/register immediately.' },
  { code: 'P2', label: 'P2 — Needs parent discussion first',     description: 'Interested but wants to discuss with parents before proceeding.' },
  { code: 'P3', label: 'P3 — Exploring options only',            description: 'Exploring options only.' },
];

/**
 * Return all active master dispositions, ordered by type then name.
 * Only exposes fields the agent needs — no internal config leaks.
 */
const listDispositions = async () => {
  const docs = await Disposition.find({ isActive: true })
    .sort({ type: 1, name: 1 })
    .lean();

  return docs.map((d) => ({
    id:               String(d._id),
    name:             d.name,
    label:            d.label || d.name,
    requiresCallback: d.requiresCallback,
    requiresProfile:  d.requiresProfile,
    priority:         d.priority,
    type:             d.type,
  }));
};

/**
 * Return static interest levels.
 * Returned as a simple array so the frontend can render them
 * identically to how it handles API-driven dispositions.
 */
const listInterestLevels = () => INTEREST_LEVELS;

// ── Default dispositions (idempotent bootstrap) ─────────────────────
// The disposition collection is managed via migration/seed scripts, but
// 'Drop Lead' and 'Switched Off / Not Reachable' are core workflow
// dispositions the application relies on (agents/counselors log them through
// the regular disposition save). Ensure they exist on every server start so
// the workflow never depends on manual seeding.
const DEFAULT_DISPOSITIONS = [
  {
    name:             'Drop Lead',
    label:            'Drop Lead',
    type:             'normal',
    priority:         null,
    color:            '#d64545',
    requiresCallback: false,
    requiresProfile:  false,
    isActive:         true,
  },
  {
    name:             'Switched Off / Not Reachable',
    label:            'Switched Off / Not Reachable',
    type:             'normal',
    priority:         null,
    color:            '#94a3b8',
    requiresCallback: false,
    requiresProfile:  false,
    isActive:         true,
  },
];

const ensureDefaultDispositions = async () => {
  for (const d of DEFAULT_DISPOSITIONS) {
    await Disposition.updateOne(
      { name: d.name },
      { $set: d },
      { upsert: true }
    );
  }
  return true;
};

module.exports = { listDispositions, listInterestLevels, ensureDefaultDispositions };
