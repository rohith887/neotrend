const mongoose = require('mongoose');
const Call = require('../models/Call');
const ApiError = require('../utils/ApiError');

const CALL_LIVE = Call.CALL_LIVE;
const CALL_TERMINAL = Call.CALL_TERMINAL;

/**
 * Persist a live call record.
 *
 * `provider` records who actually placed the leg: 'browser-sip.js' when the
 * agent's own softphone dials the student (default flow), 'asterisk' when the
 * server originates over AMI. The record is written BEFORE the leg is placed so
 * the real Mongo _id is available as the call identity; the caller marks it
 * failed if the origination is rejected.
 */
const createCall = async ({ leadId, agentId, agentNumber, studentNumber, provider = 'asterisk', channel = '' }) => {
  try {
    const call = await Call.create({
      lead: leadId,
      agent: agentId,
      agentNumber: String(agentNumber || '').trim(),
      studentNumber: String(studentNumber || '').trim(),
      provider: String(provider || 'asterisk'),
      channel: String(channel || '').trim(),
      status: 'initiated',
      startedAt: new Date(),
      statusUpdatedAt: new Date(),
    });
    return call;
  } catch (err) {
    // Duplicate live call for this agent — the partial unique index caught a
    // second Start that slipped past the read-only active-call check. Same
    // gate, enforced atomically by the DB.
    if (err && err.code === 11000) {
      throw new ApiError(409, 'You already have an active call. End it before starting another.');
    }
    throw err;
  }
};

/**
 * Fetch a Call the given agent owns (every call the agent created).
 * @throws {ApiError} 400 invalid id / 404 not found
 */
const getOwnedCall = async (callId, agentId) => {
  if (!mongoose.isValidObjectId(callId)) throw new ApiError(400, 'Invalid call id');
  const call = await Call.findOne({ _id: callId, agent: agentId });
  if (!call) throw new ApiError(404, 'Call not found');
  return call;
};

/**
 * The agent's most recent still-live call (initiated/ringing/answered/
 * connected) — used to reject a second concurrent click-to-call.
 */
const getActiveCallForAgent = (agentId) =>
  Call.findOne({ agent: agentId, status: { $in: [...CALL_LIVE] } }).sort({ startedAt: -1 });

/**
 * Mark a call ended (manual Agent "End Call" flow — the SIP side is not wired
 * yet, so there is no gateway hang-up to perform).
 */
const markEnded = async (call, { status = 'completed', errorMessage = '' } = {}) => {
  const now = new Date();
  const set = {
    status: CALL_TERMINAL.has(status) ? status : 'completed',
    statusUpdatedAt: now,
    ...(call.endedAt ? {} : { endedAt: now }),
  };
  if (errorMessage) set.errorMessage = String(errorMessage).trim();
  await Call.updateOne({ _id: call._id }, { $set: set });
  return Call.findById(call._id);
};

/**
 * Back-link a saved disposition to its Call. Returns false when the call
 * reference does not belong to this agent+lead (caller treats that as a
 * validation failure).
 */
const linkInteraction = async (callId, interactionId, { agentId, leadId } = {}) => {
  const query = { _id: callId };
  if (agentId) query.agent = agentId;
  if (leadId) query.lead = leadId;
  const res = await Call.updateOne(query, { $set: { interaction: interactionId } });
  return res.matchedCount > 0;
};

/**
 * Record the Asterisk-provided identifiers against the TASA Call record.
 * providerCallId = the agent-leg Uniqueid, channel = the agent-leg channel
 * name, linkedId = the call-chain root shared by every bridged leg. The
 * provider ids are written only once (first leg wins) so a late student-leg
 * uniqueid never overwrites the originator.
 */
const setProvider = async (callId, { uniqueId, channel, linkedId } = {}) => {
  const call = await Call.findById(callId);
  if (!call) return null;
  const set = {};
  if (uniqueId && !call.providerCallId) set.providerCallId = String(uniqueId);
  if (channel && call.channel !== channel) set.channel = String(channel);
  if (linkedId && call.linkedId !== linkedId) set.linkedId = String(linkedId);
  if (uniqueId) set.provider = 'asterisk';
  if (Object.keys(set).length === 0) return call;
  await Call.updateOne({ _id: call._id }, { $set: set });
  return Call.findById(call._id);
};

// Forward-only progression order for the live (non-terminal) statuses.
const LIVE_ORDER = ['initiated', 'ringing', 'answered', 'connected'];

/**
 * Apply a gateway/browser status transition idempotently.
 *
 * Two drivers report into this same helper: the AMI event stream and the
 * agent's own softphone (browser-originated calls, where the browser is the
 * only party that can see the SIP session state). Both can deliver races (a
 * Hangup for the agent leg and for the student leg, Dial Busy followed by a
 * clearing Hangup, a late report after a manual End Call, etc.), so this
 * helper enforces three invariants:
 *   - a terminal status is final (first terminal wins);
 *   - a live status never regresses (ringing → answered → connected only);
 *   - answeredAt / endedAt are stamped exactly once.
 * Returns the updated Call, or null when the call id is unknown.
 */
const applyProviderStatus = async (callId, { status, providerStatus } = {}) => {
  const call = await Call.findById(callId);
  if (!call) return null;

  const current = call.status;
  if (status && CALL_TERMINAL.has(current)) return call; // terminal is final

  const set = { statusUpdatedAt: new Date() };
  if (providerStatus) set.providerStatus = String(providerStatus).slice(0, 300);

  if (status && CALL_TERMINAL.has(status)) {
    set.status = status;
    if (!call.endedAt) set.endedAt = new Date();
  } else if (status) {
    const curIdx = LIVE_ORDER.indexOf(current);
    const nextIdx = LIVE_ORDER.indexOf(status);
    if (nextIdx < 0) return call;
    if (nextIdx < curIdx) return call; // no regression
    set.status = status;
    if ((status === 'answered' || status === 'connected') && !call.answeredAt) {
      set.answeredAt = new Date();
    }
  }

  if (Object.keys(set).length === 1) return call; // nothing to change
  await Call.updateOne({ _id: call._id }, { $set: set });
  return Call.findById(call._id);
};

/**
 * Look up a still-live Call by a provider identifier (Uniqueid or channel).
 * Used as a guard / cross-check when correlating late AMI events.
 */
const getLiveByProvider = (value) => {
  if (!value) return Promise.resolve(null);
  return Call.findOne({
    $or: [{ providerCallId: value }, { channel: value }],
    status: { $in: [...CALL_LIVE] },
  });
};

/**
 * Every still-live Call across all agents. The telephony facade rebuilds its
 * in-memory Uniqueid → callId correlation map from these after a process
 * restart or an AMI reconnect, so live events find the right Call record
 * again without any persistence of the map itself.
 */
const listLiveCalls = () =>
  Call.find({ status: { $in: [...CALL_LIVE] } }).sort({ startedAt: -1 }).limit(500);

module.exports = {
  createCall,
  getOwnedCall,
  getActiveCallForAgent,
  markEnded,
  linkInteraction,
  setProvider,
  applyProviderStatus,
  getLiveByProvider,
  listLiveCalls,
  CALL_LIVE,
  CALL_TERMINAL,
};