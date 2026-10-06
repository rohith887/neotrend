const Lead = require('../models/Lead');
const User = require('../models/User');
const config = require('../config');
const callService = require('../services/call.service');
const telephonyService = require('../services/telephony.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { logEvent } = require('../services/systemLog.service');


const maskPhone = (value) => {
  const s = String(value || '').trim();
  if (!s || s.length <= 4) return s ? '*'.repeat(s.length) : '';
  return `${s.slice(0, 3)}****${s.slice(-2)}`;
};

const publicCall = (call) => ({
  callId: String(call._id),
  lead: call.lead ? String(call.lead) : null,
  providerCallId: call.providerCallId || null,
  channel: call.channel || null,
  status: call.status,
  agentNumber: maskPhone(call.agentNumber),
  studentNumber: maskPhone(call.studentNumber),
  startedAt: call.startedAt,
  answeredAt: call.answeredAt,
  endedAt: call.endedAt,
  errorMessage: call.errorMessage,
  interaction: call.interaction ? String(call.interaction) : null,
});

// Agents and Counselors both place real calls through this browser softphone
// path (both carry the `lead:fetch` permission the routes already gate on).
// Supervisors and other roles still cannot originate/end calls.
const CALLER_ROLE_CODES = new Set(['agent', 'counselor']);
const agentOnly = (req) => {
  const roleCode = String(req.role?.code || '').toLowerCase();
  if (!CALLER_ROLE_CODES.has(roleCode)) throw new ApiError(403, 'Only agents and counselors can make calls');
};

const actorName = (req) =>
  [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email;

const logCallEvent = (req, { action, call, message, statusCode, metadata = null }) => {
  logEvent({
    module: 'telephony',
    action,
    username: actorName(req),
    userId: String(req.user._id),
    role: String(req.role.name || '').toUpperCase(),
    leadId: call ? String(call.lead || req.body.leadId || '') : '',
    leadName: call ? String(req.leadName || '') : '',
    message,
    apiPath: req.originalUrl,
    statusCode,
    ipAddress: req.ip,
    requestId: String(req._tasaRequestId || ''),
    metadata: {
      callId: call ? String(call._id) : null,
      providerCallId: call?.providerCallId || null,
      channel: call?.channel || null,
      callStatus: call?.status || null,
      ...(metadata || {}),
    },
  });
};

/**
 * Start a call.
 *
 * Browser-originated flow (default, CALL_ORIGINATOR=browser):
 *   1. Persist the Call record FIRST — the REAL Mongo _id is the TASA call id.
 *   2. Return the browser dial string + the caller's own PJSIP endpoint. The
 *      agent's SIP.js softphone dials the student as a normal SIP INVITE; the
 *      PBX handles the leg exactly as it handles a desk-phone call.
 *   3. The browser reports the real lifecycle (ringing → answered → connected →
 *      terminal) to POST /calls/:callId/status, which is stored on the record.
 *      Nothing is simulated and the server never needs to reach the PBX.
 *
 * Legacy AMI flow (CALL_ORIGINATOR=ami):
 *   1. Persist the Call record FIRST.
 *   2. telephonyService.originateCall issues AMI `Originate`
 *      (Channel SIP/<agent ext>, Exten = student, Context gr-cloud-calling).
 *   3. If Originate fails, the record is marked `failed` and an honest error
 *      returns — an active call is NEVER left behind.
 */
const startCall = asyncHandler(async (req, res) => {
  agentOnly(req);

  const agentId = String(req.user._id);
  const leadId = String(req.body.leadId);

  const lead = await Lead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');
  req.leadName = String(lead.studentName || '').trim();

  const isAssigned  = lead.assignedTo && String(lead.assignedTo) === agentId;
  const isFetchedBy = lead.fetchedBy && String(lead.fetchedBy) === agentId;
  // A lead at the Counselor stage carries counselor ownership on
  // `counselorAssigned`, separate from the agent's `assignedTo`/`fetchedBy`.
  const isCounselorAssigned = lead.counselorAssigned && String(lead.counselorAssigned) === agentId;
  if (!isAssigned && !isFetchedBy && !isCounselorAssigned) {
    throw new ApiError(403, 'Forbidden: you are not assigned to this lead');
  }

  const existing = await callService.getActiveCallForAgent(agentId);
  console.log(`[call-diag] START agentId=${agentId} leadId=${leadId} existingActive=${existing ? `${existing._id}|${existing.status}` : 'none'} at=${new Date().toISOString()}`);
  if (existing) {
    const isStale =
      ['initiated', 'ringing', 'answered'].includes(existing.status) &&
      Date.now() - new Date(existing.startedAt).getTime() > 10 * 60 * 1000;
    if (!isStale) {
      throw new ApiError(409, 'You already have an active call. End it before starting another.');
    }
    const cancelled = await callService.markEnded(existing, { status: 'cancelled' });
    logCallEvent(req, {
      action: 'CALL_STALE_CANCELLED',
      call: cancelled,
      statusCode: 200,
      message: `Stale ${existing.status} call auto-cancelled (never connected)`,
    });
  }

  const agentNumber   = String(req.user.mobile || '').trim();
  // Manual dial: an agent may type a number in the dialer pad for the loaded
  // lead (e.g. a secondary / callback number). The lead lifecycle and Call
  // record stay intact — only the dialed number is overridden.
  const manualNumber = String(req.body.manualNumber || '').trim();
  if (manualNumber && !/^[0-9+\-()*# .]{4,20}$/.test(manualNumber)) {
    throw new ApiError(422, 'That manual number is not valid — use digits, +, - or ( ).');
  }
  const studentNumber = manualNumber || String(lead.mobile || '').trim();
  if (!agentNumber) {
    throw new ApiError(422, 'Your profile has no mobile number. Add one (or ask a supervisor) before making calls.');
  }
  if (!studentNumber) {
    throw new ApiError(422, 'This lead has no mobile number to call.');
  }

  const browserOrigination = telephonyService.isBrowserOrigination();

  // Browser-originated calls need the CALLER's own provisioned PJSIP endpoint:
  // the browser is what dials, so an unprovisioned agent cannot place a call.
  let callerPhone = null;
  let dialNumber = '';
  if (browserOrigination) {
    const caller = await User.findById(agentId)
      .select('sipProvisionStatus sipExtension sipUsername sipWssUrl sipDomain');
    const extension = String(caller?.sipExtension || '').trim();
    const username = String(caller?.sipUsername || '').trim();
    const wssUrl = String(caller?.sipWssUrl || '').trim();
    if (String(caller?.sipProvisionStatus || '') !== 'provisioned' || !extension || !username || !wssUrl) {
      throw new ApiError(422, 'Your phone is not provisioned yet. Ask a supervisor to provision your extension, then try again.');
    }
    callerPhone = {
      extension,
      username,
      wssUrl,
      domain: String(caller?.sipDomain || config.freepbx.domain || '').trim(),
    };

    dialNumber = telephonyService.buildBrowserDialNumber(studentNumber);
    if (!dialNumber) throw new ApiError(422, 'No dialable student number to call.');
  } else {
    // The agent-leg endpoint: the agent's own PJSIP WebRTC extension when it is
    // configured on their user, else the shared AMI_EXTENSION fallback.
    callerPhone = {
      extension: String(req.user.sipExtension || '').trim() || telephonyService.getAgentExtension(),
    };
    // Fail fast on a genuinely unconfigured gateway — no junk Call records.
    telephonyService.assertAmiConfigured();
  }

  // 1) Persist the live Call record FIRST (real _id — never fabricated).
  let call;
  try {
    call = await callService.createCall({
      leadId: lead._id,
      agentId,
      agentNumber,
      studentNumber,
      provider: browserOrigination ? config.telephony.browserProvider : 'asterisk',
    });
    console.log(`[call-diag] START created call=${call._id} status=${call.status} origination=${browserOrigination ? 'browser' : 'ami'}`);
  } catch (err) {
    if (err.isOperational) throw err;
    throw err;
  }

  if (browserOrigination) {
    // The record exists so the lifecycle the browser reports always has a real
    // identity. If the browser never places the leg it reports `failed`, which
    // closes the record — nothing is left blocking the next Start Call.
    logCallEvent(req, {
      action: 'CALL_STARTED',
      call,
      statusCode: 201,
      message: `Call initiated (browser WebRTC, ext ${callerPhone.extension}) for ${String(lead.studentName || 'student').slice(0, 60)}`,
      metadata: { origination: 'browser' },
    });
    return success(
      res,
      {
        ...publicCall(call),
        origination: 'browser',
        dialNumber,
        domain: callerPhone.domain,
        wssUrl: callerPhone.wssUrl,
        extension: callerPhone.extension,
      },
      'Call initiated — the browser phone now dials the student',
      201
    );
  }

  // 2) Place the call through Asterisk AMI (legacy mode).
  try {
    await telephonyService.originateCall({
      callId: String(call._id),
      leadId: String(lead._id),
      agentId,
      studentNumber,
      extension: callerPhone.extension,
      callerIdNum: agentNumber,
      callerIdName: actorName(req),
    });
  } catch (err) {
    // 3) Originate failed — never leave an active call behind.
    console.log(`[call-diag] START originate FAILED call=${call._id} err=${err.message}`);
    const failed = await callService.markEnded(call, {
      status: 'failed',
      errorMessage: String(err?.message || 'Originate failed').slice(0, 500),
    });
    logCallEvent(req, {
      action: 'CALL_ORIGINATE_FAILED',
      call: failed,
      statusCode: err?.statusCode || 502,
      message: `Originate failed for ${String(lead.studentName || 'student').slice(0, 40)}`,
    });
    throw err;
  }

  logCallEvent(req, {
    action: 'CALL_STARTED',
    call,
    statusCode: 201,
    message: `Call initiated (AMI Originate) for ${String(lead.studentName || 'student').slice(0, 60)}`,
  });

  return success(res, publicCall(call), 'Call initiated', 201);
});


const configStatus = asyncHandler(async (req, res) => {
  return success(res, telephonyService.getConfigStatus(), 'Telephony config status');
});

/**
 * Browser softphone configuration for the CALLING USER ONLY.
 *
 * Returns the WSS endpoint + the caller's own PJSIP extension/password so the
 * browser can REGISTER the agent leg over WebRTC. The password is the caller's
 * own device credential (per-agent or the shared AMI_EXTENSION fallback) and is
 * deliberately NOT bundled into the client build — it travels over the same
 * authenticated HTTPS session as every other API call.
 *
 * `enabled` is false when no WSS server is configured (the app then degrades
 * to the legacy AMI→desktop-softphone flow).
 */
const sipConfig = asyncHandler(async (req, res) => {
  const caller = await User.findById(req.user._id).select('+sipPassword +sipUsername sipExtension sipDomain sipWssUrl sipProvisionStatus');
  const wssUrl = String(caller?.sipWssUrl || '').trim();
  const username = String(caller?.sipUsername || '').trim();
  const extension = String(caller?.sipExtension || '').trim();
  const password = String(caller?.sipPassword || '').trim();
  const enabled = Boolean(
    caller?.sipProvisionStatus === 'provisioned' &&
    wssUrl && username && extension && password
  );

  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');

  return success(res, {
    enabled,
    username: enabled ? username : '',
    password: enabled ? password : '',
    domain: String(caller?.sipDomain || config.freepbx.domain || '').trim(),
    wss_url: wssUrl,
    extension,
    channelTech: config.telephony.ami.channelTech,
    // Which side places the outbound leg. 'browser' (default) = this softphone
    // dials the student; 'ami' = the server originates and the browser only
    // answers. The client uses this to pick its start-call path.
    origination: config.telephony.originator,
  }, 'SIP configuration');
});


const getStatus = asyncHandler(async (req, res) => {
  const call = await callService.getOwnedCall(req.params.callId, req.user._id);
  return success(res, publicCall(call), 'Call status');
});


/**
 * Browser-reported call lifecycle.
 *
 * For a browser-originated call the agent's softphone is the only party that
 * can see the SIP session, so it reports what it observes (ringing / answered /
 * connected / terminal outcome). Owner-only, forward-only and terminal-final —
 * the same guards the AMI event path uses, so a late or duplicate report can
 * never reopen or rewind a call.
 */
const reportStatus = asyncHandler(async (req, res) => {
  agentOnly(req);
  const call = await callService.getOwnedCall(req.params.callId, req.user._id);
  const status = String(req.body.status || '').trim().toLowerCase();

  if (call.provider !== config.telephony.browserProvider) {
    throw new ApiError(409, 'This call was not placed by the browser phone, so its status comes from the gateway.');
  }
  if (callService.CALL_TERMINAL.has(call.status)) {
    // Already closed (manual End Call won the race) — the record is final.
    return success(res, publicCall(call), 'Call status');
  }

  const updated = await callService.applyProviderStatus(call._id, {
    status,
    providerStatus: `browser:${status}`,
  });

  if (status === 'failed' && updated) {
    logCallEvent(req, {
      action: 'CALL_ENDED',
      call: updated,
      statusCode: 200,
      message: `Browser call ended with status ${updated.status}`,
    });
  }
  return success(res, publicCall(updated || call), 'Call status updated');
});


const getActiveForCaller = asyncHandler(async (req, res) => {
  agentOnly(req);
  const existing = await callService.getActiveCallForAgent(req.user._id);
  return success(res, existing ? publicCall(existing) : null, 'Active call status');
});


const endActiveCall = asyncHandler(async (req, res) => {
  agentOnly(req);
  const existing = await callService.getActiveCallForAgent(req.user._id);
  if (!existing) {
    return success(res, { ended: false }, 'No active call to end');
  }

  console.log(`[call-diag] END-ACTIVE call=${existing._id} statusBefore=${existing.status} channel=${existing.channel || '-'} provider=${existing.provider || '-'}`);
  await endCallAtGateway(req, existing);
  const updated = await callService.markEnded(existing, { status: 'completed' });
  return success(res, { ended: true, ...publicCall(updated) }, 'Call ended');
});


const endCall = asyncHandler(async (req, res) => {
  agentOnly(req);
  console.log(`[call-diag] END attempt callId=${req.params.callId} agentId=${req.user._id} at=${new Date().toISOString()}`);
  const call = await callService.getOwnedCall(req.params.callId, req.user._id);
  console.log(`[call-diag] END call=${call._id} statusBefore=${call.status} channel=${call.channel || '-'}`);
  if (!callService.CALL_LIVE.has(call.status)) {
    console.log(`[call-diag] END 409 not active status=${call.status}`);
    throw new ApiError(409, 'This call is not active.');
  }

  await endCallAtGateway(req, call);
  const updated = await callService.markEnded(call, { status: 'completed' });
  logCallEvent(req, {
    action: 'CALL_ENDED',
    call: updated,
    statusCode: 200,
    message: `Call ended with status ${updated.status}`,
  });
  return success(res, publicCall(updated), 'Call ended');
});

/**
 * Shared for endCall + endActiveCall: close the leg at the gateway that owns it.
 *
 * Browser-originated call → the agent's softphone already sent the BYE on its
 * own SIP session, so there is nothing to do at a gateway: the record is simply
 * closed. AMI-originated call → the real AMI `Hangup` is issued against the
 * tracked channel; if Asterisk is unreachable the call is left live and an
 * honest error returns — an ended state is never fabricated.
 */
const endCallAtGateway = async (req, call) => {
  if (call.provider === config.telephony.browserProvider) {
    console.log(`[call-diag] END browser-originated call=${call._id} — no gateway action needed`);
    return { browserOriginated: true, confirmed: true, absent: false };
  }
  try {
    const result = await telephonyService.hangupCall({
      channel: call.channel,
      providerCallId: call.providerCallId,
    });
    console.log(`[call-diag] END hangup result confirmed=${result.confirmed} absent=${result.absent}`);
    return result;
  } catch (err) {
    console.log(`[call-diag] END hangup FAILED call=${call._id} err=${err.message}`);
    logCallEvent(req, {
      action: 'CALL_END_FAILED',
      call,
      statusCode: err?.statusCode || 503,
      message: `End Call failed — AMI hangup error: ${String(err?.message || 'unknown').slice(0, 80)}`,
    });
    throw err;
  }
};

module.exports = { startCall, configStatus, sipConfig, getStatus, reportStatus, getActiveForCaller, endActiveCall, endCall };