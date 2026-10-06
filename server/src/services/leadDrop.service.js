const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notification.service');
const { logEvent } = require('./systemLog.service');

/**
 * LEAD DROP WORKFLOW
 *
 * A controlled soft-drop layer over the existing lead. A lead is NEVER
 * deleted, unassigned or re-created — dropping is done through the regular
 * 'Drop Lead' disposition (with a mandatory reason), and the lead stays in
 * its bucket with its full history (RNRs, callbacks, remarks, ownership,
 * disposition history) intact. Only its state moves:
 *
 *   active → (Drop Lead saved) → drop-requested / Drop Pending
 *                                → (supervisor Approves) → dropped → (revived) → active
 *                                → (supervisor Denies)   → active
 *
 *   dropStatus       meaning                                  in active queues?
 *   --------------   --------------------------------------   ----------------
 *   active           normal working lead                       yes
 *   drop-requested   Drop Lead submitted, supervisor approval  no (on hold)
 *                    pending — no silent drop happens
 *   dropped          supervisor approved the drop —            no
 *                    excluded from active calling/work queues,
 *                    still assigned and visible in the
 *                    agent/counselor bucket (revivable)
 *
 * Submitting 'Drop Lead' records: Interaction + dispositionHistory + Activity
 * ('DISPOSITION_SAVED') via interaction.service, drops the lead's dropStatus
 * to 'drop-requested', appends a REQUESTED dropHistory event, and sends a
 * supervisor drop-request alert. Approving (here) moves it to 'dropped' with
 * the pre-drop snapshot + an APPROVED event; denying restores the active
 * working state with a DENIED event. Reviving records a REVIVED event. Every
 * decision is an Activity doc + system-log entry — the full audit trail
 * explains every request / approve / deny / revive with who, why and when.
 */

const COUNSELOR_TAG_STATUSES = ['completed', 'documents-pending', 'offer-received', 'visa-process'];

/**
 * Query fragment that EXCLUDES dropped AND pending-drop leads from any active
 * queue/query. Pending leads are on hold awaiting the supervisor decision —
 * they can't be worked or re-dropped until the request is resolved.
 */
const activeLeadsFilter = () => ({ dropStatus: { $nin: ['dropped', 'drop-requested'] } });

const actorName = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || user.username || '';

// Mirrors the access model used across the workspace (lead.controller
// canManageLead): Supervisor/Admin → any lead; Agent → owned / fetching;
// Counselor → workflow-stage students or explicitly assigned leads.
const canActOnLead = (lead, user, roleName, roleCode) => {
  const role = String(roleName || roleCode || '').toUpperCase();
  const me = String(user._id);
  if (role === 'SUPERVISOR' || role === 'ADMIN') return true;
  if (role === 'AGENT') {
    return Boolean(
      (lead.assignedTo && String(lead.assignedTo) === me) ||
      (lead.fetchedBy && String(lead.fetchedBy) === me)
    );
  }
  if (role === 'COUNSELOR') {
    return (
      COUNSELOR_TAG_STATUSES.includes(String(lead.status || '')) ||
      String(lead.status || '') === 'dropped' ||
      Boolean(
        (lead.assignedTo && String(lead.assignedTo) === me) ||
        (lead.counselorAssigned && String(lead.counselorAssigned) === me)
      )
    );
  }
  return false;
};

const refreshLead = (id) =>
  Lead.findById(id)
    .populate('dropHistory.by', 'firstName lastName email')
    .populate('assignedTo', 'firstName lastName email')
    .populate('currentDisposition', 'name label color')
    .lean();

/** Shared drop-decision audit pipeline (Activity + system log). */
const recordDropEvent = async ({ lead, actorId, actorName, action, reason, leadRef }) => {
  await Activity.create({
    user: actorId,
    type: action, // 'DROP_APPROVED' | 'DROP_DENIED'
    lead: lead._id,
    metadata: new Map(
      Object.entries({ leadRef: String(leadRef || ''), reason }).map(([k, v]) => [k, String(v || '')])
    ),
  });
  logEvent({
    module: 'leadDrop',
    action,
    username: actorName,
    userId: String(actorId),
    role: 'SUPERVISOR',
    leadId: String(lead._id),
    leadName: String(lead.studentName || '').trim(),
    message: reason,
  });
};

/**
 * Supervisor APPROVES a pending drop request → the lead becomes a real
 * dropped lead: pre-drop working state snapshot, dropStatus 'dropped', and it
 * becomes revivable again. The decision is appended to dropHistory +
 * dispositionHistory and mirrored onto every pending drop-request alert.
 */
const approveDropRequest = async ({ alertId, supervisorId, supervisorName, reason }) => {
  const alert = await Notification.findOne({
    _id: alertId,
    user: supervisorId,
    type: 'drop-request',
  });
  if (!alert) throw new ApiError(404, 'Drop request alert not found');
  // Idempotent: an already-resolved alert just returns the current lead.
  if (String(alert.dropDecision || 'pending') !== 'pending') {
    return refreshLead(alert.lead);
  }
  const lead = await Lead.findById(alert.lead);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (String(lead.dropStatus || 'active') !== 'drop-requested') {
    throw new ApiError(409, 'This drop request has already been resolved.');
  }

  const reasonText = String(reason || '').trim() || `Approved by ${supervisorName}`;
  const now = new Date();
  const setFields = {
    status: 'dropped',
    dropStatus: 'dropped',
    droppedFromStatus: lead.status && lead.status !== 'dropped' ? lead.status : 'assigned',
    lastCallAt: now,
  };
  if (lead.currentDisposition) setFields.droppedFromDisposition = lead.currentDisposition;

  await Lead.updateOne(
    { _id: lead._id },
    {
      $set: setFields,
      $push: {
        dispositionHistory: {
          disposition: lead.currentDisposition || undefined,
          dispositionName: 'Drop Approved',
          note: reasonText,
          changedBy: supervisorId,
          changedAt: now,
        },
        dropHistory: {
          action: 'APPROVED',
          by: supervisorId,
          reason: reasonText,
          at: now,
        },
      },
    }
  );

  await recordDropEvent({
    lead: lead._id,
    actorId: supervisorId,
    actorName: supervisorName,
    action: 'DROP_APPROVED',
    reason: reasonText,
    leadRef: String(lead.referenceId || ''),
  }).catch(() => {});
  await notificationService.resolveDropAlerts({
    leadId: lead._id,
    decision: 'approved',
    supervisorId,
    supervisorName,
    reason: reasonText,
  });

  return refreshLead(lead._id);
};

/**
 * Supervisor DENIES a pending drop request → the pending drop is cancelled
 * and the lead returns to its active working state (dropStatus 'active',
 * original status preserved). The decision is appended to dropHistory +
 * dispositionHistory and mirrored onto every pending drop-request alert.
 */
const denyDropRequest = async ({ alertId, supervisorId, supervisorName, reason }) => {
  const alert = await Notification.findOne({
    _id: alertId,
    user: supervisorId,
    type: 'drop-request',
  });
  if (!alert) throw new ApiError(404, 'Drop request alert not found');
  if (String(alert.dropDecision || 'pending') !== 'pending') {
    return refreshLead(alert.lead);
  }
  const lead = await Lead.findById(alert.lead);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (String(lead.dropStatus || 'active') !== 'drop-requested') {
    throw new ApiError(409, 'This drop request has already been resolved.');
  }

  const reasonText = String(reason || '').trim() || `Denied by ${supervisorName}`;
  const now = new Date();

  await Lead.updateOne(
    { _id: lead._id },
    {
      $set: {
        dropStatus: 'active',
        status:
          lead.droppedFromStatus && lead.droppedFromStatus !== 'dropped'
            ? lead.droppedFromStatus
            : lead.status || 'assigned',
        lastCallAt: now,
      },
      $push: {
        dispositionHistory: {
          disposition: lead.currentDisposition || undefined,
          dispositionName: 'Drop Denied',
          note: reasonText,
          changedBy: supervisorId,
          changedAt: now,
        },
        dropHistory: {
          action: 'DENIED',
          by: supervisorId,
          reason: reasonText,
          at: now,
        },
      },
    }
  );

  await recordDropEvent({
    lead: lead._id,
    actorId: supervisorId,
    actorName: supervisorName,
    action: 'DROP_DENIED',
    reason: reasonText,
    leadRef: String(lead.referenceId || ''),
  }).catch(() => {});
  await notificationService.resolveDropAlerts({
    leadId: lead._id,
    decision: 'denied',
    supervisorId,
    supervisorName,
    reason: reasonText,
  });

  return refreshLead(lead._id);
};

/**
 * Revive a dropped lead back into the active queue.
 *
 * Restores the exact pre-drop working state (status + current disposition)
 * from the droppedFromStatus / droppedFromDisposition snapshot, clears the
 * drop marker and records the REVIVED event on the audit trail. History is
 * never deleted or reset. Requires a reason and the same ownership access as
 * a drop.
 */
const reviveLead = async ({ leadId, actor, roleName, roleCode, reason }) => {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!canActOnLead(lead, actor, roleName, roleCode)) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  const isDropped =
    String(lead.dropStatus || 'active') === 'dropped' ||
    String(lead.status || '') === 'dropped';
  if (!isDropped) {
    throw new ApiError(409, 'This lead is not dropped');
  }

  const reasonText = String(reason || '').trim();
  if (!reasonText) throw new ApiError(400, 'Revive reason is required');

  const restoreStatus =
    lead.droppedFromStatus && lead.droppedFromStatus !== 'dropped'
      ? lead.droppedFromStatus
      : lead.status !== 'dropped'
        ? lead.status
        : 'assigned';
  const restoreDisposition = lead.droppedFromDisposition || undefined;

  const setFields = {
    status: restoreStatus,
    dropStatus: 'active',
    lastCallAt: new Date(),
  };
  // The droppedFromDisposition snapshot is captured AFTER the 'Drop Lead'
  // disposition was saved, so it is the drop disposition itself — restoring it
  // would leave the lead labelled 'Drop Lead' after revive. Only restore a REAL
  // pre-drop disposition (i.e. one that differs from the current one); otherwise
  // clear currentDisposition so the revived lead reads as a normal active lead.
  // dropStatus is the single source of truth for the dropped state going forward —
  // the historical dropHistory trail is preserved untouched for audit.
  const unsetFields = {};
  if (restoreDisposition && String(restoreDisposition) !== String(lead.currentDisposition || '')) {
    setFields.currentDisposition = restoreDisposition;
  } else {
    unsetFields.currentDisposition = '';
  }

  const pushFields = {
    dispositionHistory: {
      disposition: lead.currentDisposition || undefined,
      dispositionName: 'Drop Revived',
      note: reasonText,
      changedBy: actor._id,
      changedAt: new Date(),
    },
    dropHistory: {
      action: 'REVIVED',
      by: actor._id,
      reason: reasonText,
      at: new Date(),
    },
  };

  await Lead.updateOne({ _id: lead._id }, { $set: setFields, $unset: unsetFields, $push: pushFields });

  await Activity.create({
    user: actor._id,
    type: 'LEAD_REVIVED',
    lead: lead._id,
    metadata: new Map(
      Object.entries({ leadRef: String(lead.referenceId || ''), reason: reasonText }).map(([k, v]) => [k, String(v)])
    ),
  });

  logEvent({
    module: 'leadDrop',
    action: 'LEAD_REVIVED',
    username: actorName(actor),
    userId: String(actor._id),
    role: String(roleName || '').toUpperCase(),
    leadId: String(lead._id),
    leadName: String(lead.studentName || '').trim(),
    message: reasonText,
  });

  return refreshLead(lead._id);
};

/** Full drop/revive trail for a lead (audit/360 view). */
const getDropHistory = async (leadId) => {
  const lead = await Lead.findById(leadId)
    .populate('dropHistory.by', 'firstName lastName email')
    .lean();
  if (!lead) throw new ApiError(404, 'Lead not found');
  return (lead.dropHistory || [])
    .map((e) => ({
      _id: String(e._id),
      action: e.action,
      by: e.by
        ? { _id: String(e.by._id), name: [e.by.firstName, e.by.lastName].filter(Boolean).join(' ') || e.by.email }
        : null,
      reason: e.reason,
      at: e.at ? e.at.toISOString() : null,
    }))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
};

module.exports = {
  activeLeadsFilter,
  canActOnLead,
  approveDropRequest,
  denyDropRequest,
  reviveLead,
  getDropHistory,
  refreshLead,
};