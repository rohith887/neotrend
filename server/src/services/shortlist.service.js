const mongoose = require('mongoose');
const Shortlist = require('../models/Shortlist');
const Lead = require('../models/Lead');
const University = require('../models/University');
const Activity = require('../models/Activity');
const ApiError = require('../utils/ApiError');
const lifecycle = require('./lifecycle.service');

/* ==========================================================================
   SHORTLIST SERVICE (Phase 3) â€” Student â†” University workflow.
   --------------------------------------------------------------------------
   â€¢ Entries REFERENCE canonical universities (no duplicated fields).
   â€¢ One entry per student+university (unique compound index; re-adding a
     removed university reactivates the same document).
   â€¢ Per-university status is independent of the student's canonical
     lifecycle stage. The ONLY lifecycle effect of shortlisting is the
     forward-only PREFERENCES â†’ UNIVERSITY_SHORTLIST advance on the first
     meaningful action; confirming the shortlist sets the student's next
     action to "Start Application" without advancing the stage.
   â€¢ Every meaningful action records an Activity event (SHORTLIST_UPDATED)
     â€” viewing/searching never writes anything.
   ========================================================================== */

const assertValidId = (value, label) => {
  if (!mongoose.Types.ObjectId.isValid(String(value))) {
    throw new ApiError(400, `${label} must be a valid id`);
  }
};

/* Counselor queue is workflow-stage driven (see counselor.ops.service
   getMyStudents) â€” the same status set grants shortlist management for
   students currently in the counselor stage. */
const COUNSELOR_WORKFLOW_STATUSES = ['completed', 'documents-pending', 'offer-received', 'visa-process'];

/* Supervisors manage any shortlist; counselors/agents manage students
   they own or are actively working (mirrors the Phase 2 guard). */
const assertCanManage = (lead, req) => {
  const upperRole = String(req.role?.name || '').toUpperCase();
  if (upperRole === 'SUPERVISOR') return;
  if (upperRole === 'COUNSELOR' && COUNSELOR_WORKFLOW_STATUSES.includes(lead.status)) return;
  const uid = String(req.user._id);
  const isAssigned = lead.assignedTo && String(lead.assignedTo) === uid;
  const isFetcher = lead.fetchedBy && String(lead.fetchedBy) === uid;
  if (!isAssigned && !isFetcher) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this student');
  }
};

const recordEvent = async ({ leadId, actorId, action, university, extra = {} }) => {
  await Activity.create({
    user: actorId,
    type: 'SHORTLIST_UPDATED',
    lead: leadId,
    metadata: new Map(Object.entries({
      action,
      university: String(university?._id || university || ''),
      universityName: university?.institutionName || undefined,
      ...extra,
    }).filter(([, v]) => v !== undefined && v !== '')),
  });
};

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

const populatedEntries = (query) =>
  Shortlist.find(query)
    .populate('university', 'institutionName country city stateRegion ownership isActive')
    .populate('university.country', 'name code')
    .populate('owner', 'firstName lastName')
    .populate('notes.createdBy', 'firstName lastName')
    .lean();

const sortedEntries = (entries) =>
  [...entries].sort((a, b) => {
    const aRemoved = a.status === 'Removed';
    const bRemoved = b.status === 'Removed';
    if (aRemoved !== bRemoved) return aRemoved ? 1 : -1;
    const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr !== 0) return pr;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

/** GET /leads/:id/shortlist â€” full shortlist for one student. */
const getForLead = async (leadId) => {
  assertValidId(leadId, 'Student');
  const entries = await populatedEntries({ lead: leadId });
  return sortedEntries(entries);
};

/**
 * POST /leads/:id/shortlist/:universityId
 * Idempotent: clicking Add twice returns the same entry without creating
 * a duplicate or recording a second event. Re-adding a Removed entry
 * reactivates it. First meaningful action advances the lifecycle
 * forward-only to UNIVERSITY_SHORTLIST.
 */
const add = async ({ leadId, universityId, req }) => {
  assertValidId(leadId, 'Student');
  assertValidId(universityId, 'University');

  const [lead, university] = await Promise.all([
    Lead.findById(leadId).lean(),
    University.findById(universityId).lean(),
  ]);
  if (!lead) throw new ApiError(404, 'Student not found');
  if (!university) throw new ApiError(404, 'University not found');
  if (!university.isActive) {
    throw new ApiError(400, 'This university is inactive and cannot be added to a shortlist');
  }

  assertCanManage(lead, req);

  let entry = await Shortlist.findOne({ lead: lead._id, university: university._id });
  let reactivated = false;

  if (entry) {
    if (entry.status !== 'Removed') {
      return { entry: await populatedEntries({ _id: entry._id }).then((e) => e[0]), lead: null }; // idempotent no-op
    }
    entry.status = 'Considering';
    entry.removedAt = null;
    entry.owner = req.user._id;
    await entry.save();
    reactivated = true;
  } else {
    entry = await Shortlist.create({
      lead: lead._id,
      university: university._id,
      owner: req.user._id,
      status: 'Considering',
      priority: 'Medium',
    });
  }

  await recordEvent({
    leadId: lead._id,
    actorId: req.user._id,
    action: reactivated ? 're-added' : 'added',
    university,
  });

  // Lifecycle: first meaningful shortlist action moves the student forward
  // (silent no-op once already at/beyond UNIVERSITY_SHORTLIST).
  const updatedLead = await lifecycle
    .ensureStageReached({
      leadId: lead._id,
      actorId: req.user._id,
      toStage: 'UNIVERSITY_SHORTLIST',
      source: 'shortlist',
    })
    .catch(() => null);

  return { entry: await populatedEntries({ _id: entry._id }).then((e) => e[0]), lead: updatedLead };
};

/**
 * PATCH /leads/:id/shortlist/:universityId
 * Body: { status?, priority?, note? } â€” each provided change is applied
 * and recorded as its own timeline event.
 */
const updateEntry = async ({ leadId, universityId, payload = {}, req }) => {
  assertValidId(leadId, 'Student');
  assertValidId(universityId, 'University');

  const [lead, university] = await Promise.all([
    Lead.findById(leadId).select('assignedTo fetchedBy status').lean(),
    University.findById(universityId).lean(),
  ]);
  if (!lead) throw new ApiError(404, 'Student not found');
  if (!university) throw new ApiError(404, 'University not found');

  assertCanManage(lead, req);

  const entry = await Shortlist.findOne({ lead: lead._id, university: university._id });
  if (!entry) throw new ApiError(404, 'This university is not on the student shortlist');

  const events = [];

  if (payload.status !== undefined) {
    const status = String(payload.status || '').trim();
    if (!Shortlist.SHORTLIST_STATUS.includes(status)) {
      throw new ApiError(400, `status must be one of: ${Shortlist.SHORTLIST_STATUS.join(', ')}`);
    }
    if (status !== entry.status) {
      events.push({ action: 'status', from: entry.status, to: status });
      entry.status = status;
      if (status === 'Removed') entry.removedAt = new Date();
    }
  }

  if (payload.priority !== undefined) {
    const priority = String(payload.priority || '').trim();
    if (!Shortlist.SHORTLIST_PRIORITY.includes(priority)) {
      throw new ApiError(400, `priority must be one of: ${Shortlist.SHORTLIST_PRIORITY.join(', ')}`);
    }
    if (priority !== entry.priority) {
      events.push({ action: 'priority', from: entry.priority, to: priority });
      entry.priority = priority;
    }
  }

  const noteText = String(payload.note || '').trim();
  if (noteText) {
    entry.notes.push({ text: noteText, createdBy: req.user._id, createdAt: new Date() });
    events.push({ action: 'note' });
  }

  if (events.length) {
    await entry.save();
    for (const ev of events) {
      await recordEvent({
        leadId: lead._id,
        actorId: req.user._id,
        action: ev.action,
        university,
        extra: { from: ev.from, to: ev.to },
      });
    }
  }

  return populatedEntries({ _id: entry._id }).then((e) => e[0]);
};

/** DELETE /leads/:id/shortlist/:universityId â€” soft-remove (history kept). */
const remove = async ({ leadId, universityId, req }) => {
  assertValidId(leadId, 'Student');
  assertValidId(universityId, 'University');

  const [lead, university] = await Promise.all([
    Lead.findById(leadId).select('assignedTo fetchedBy status').lean(),
    University.findById(universityId).lean(),
  ]);
  if (!lead) throw new ApiError(404, 'Student not found');
  if (!university) throw new ApiError(404, 'University not found');

  assertCanManage(lead, req);

  const entry = await Shortlist.findOne({ lead: lead._id, university: university._id });
  if (!entry) throw new ApiError(404, 'This university is not on the student shortlist');
  if (entry.status === 'Removed') return populatedEntries({ _id: entry._id }).then((e) => e[0]);

  entry.status = 'Removed';
  entry.removedAt = new Date();
  await entry.save();

  await recordEvent({
    leadId: lead._id,
    actorId: req.user._id,
    action: 'removed',
    university,
  });

  return populatedEntries({ _id: entry._id }).then((e) => e[0]);
};

/**
 * POST /leads/:id/shortlist/confirm
 * Confirms every active entry (Considering/Shortlisted â†’ Confirmed),
 * records one confirmation event, and sets the student's next action to
 * "Start Application". Deliberately does NOT advance the lifecycle stage.
 */
const confirm = async ({ leadId, req }) => {
  assertValidId(leadId, 'Student');

  const lead = await Lead.findById(leadId).lean();
  if (!lead) throw new ApiError(404, 'Student not found');

  assertCanManage(lead, req);

  const result = await Shortlist.updateMany(
    { lead: lead._id, status: { $in: ['Considering', 'Shortlisted'] } },
    { $set: { status: 'Confirmed' } }
  );
  const confirmedCount = result.modifiedCount || 0;

  if (confirmedCount > 0) {
    const sample = await University.findById(
      (await Shortlist.findOne({ lead: lead._id }).sort({ updatedAt: -1 }).lean()).university
    ).lean();
    await recordEvent({
      leadId: lead._id,
      actorId: req.user._id,
      action: 'confirmed',
      university: sample,
      extra: { confirmedCount },
    });

    // Next action becomes "Start Application" â€” same stage, details only.
    await lifecycle
      .applyTransition({
        leadId: lead._id,
        actorId: req.user._id,
        toStage: lifecycle.deriveStage(lead),
        skipIfEqual: true,
        nextAction: 'Start Application',
        source: 'shortlist-confirm',
        note: 'Shortlist confirmed',
      })
      .catch(() => {});
  }

  const entries = await populatedEntries({ lead: lead._id });
  const freshLead = await lifecycle.populatedLead(Lead.findById(lead._id));
  return { entries: sortedEntries(entries), confirmedCount, lead: freshLead };
};

module.exports = {
  getForLead,
  add,
  updateEntry,
  remove,
  confirm,
};
