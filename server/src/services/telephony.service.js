const config = require('../config');
const ApiError = require('../utils/ApiError');
const callService = require('./call.service');
const { buildClientFromConfig } = require('./ami.service');

/* ──────────────────────────────────────────────────────────────────────
   AMI telephony facade — the layer between the call controller and the
   Asterisk Manager Interface socket.

   Start Call        → AMI `Originate` (rings SIP/9999, then the
                       `gr-cloud-calling` dialplan dials the student)
   End Call          → AMI `Hangup` against the exact tracked channel
   Real lifecycle    → AMI events (Newchannel/Newstate/Dial/Answer/Bridge/
                       Hangup/OriginateResponse/Cdr) mapped to the existing
                       TASA Call.status vocabulary

   Correlation:
     providerCallId = Asterisk Uniqueid (agent leg)
     channel        = agent-leg channel (SIP/9999-xxxx)
     linkedId       = Asterisk Linkedid (call-chain root, shared by legs)
     TASA_CALLID    = Mongo Call._id (carried on the agent leg + propagated
                      to the student leg by the PBX dialplan)

   The in-memory `Uniqueid → callId` map is rebuilt from live TASA Call
   records after every boot / reconnect, so events keep finding the right
   record without persisting the map itself.
   ────────────────────────────────────────────────────────────────────── */

const amiClient = buildClientFromConfig(config);

// ── Correlation state (rebuilt from the DB; never the source of truth) ──
// uniqueId → TASA callId (string _id)
const uniqueIdMap = new Map();
// channel name → TASA callId
const channelMap = new Map();
// ActionID → TASA callId for in-flight originates (OriginateResponse has no
// uniqueid/channel correlation guarantee, so the ActionID closes that gap)
const pendingOriginateMap = new Map();
// callId → seen-connected flag (Hangup cause mapping needs to know whether
// the legs ever bridged before deciding completed vs cancelled)
const connectedMap = new Map();
// callId → timer for pruning the correlation maps after the CDR window
const cleanupTimers = new Map();
// Per-call serialized apply queue so racing AMI events never interleave
// their read→decide→write status transitions out of order.
const applyQueues = new Map();

const PRUNE_MS = 120000; // keep map entries 2min past terminal (CDR window)

/* ── Public surface ─────────────────────────────────────────────────── */

const assertAmiConfigured = () => {
  if (!config.telephony.isConfigured) {
    throw new ApiError(
      503,
      'Server-side call origination is not configured. Ask the admin to add AMI_HOST, AMI_USER and AMI_SECRET to server/.env, or set CALL_ORIGINATOR=browser.'
    );
  }
};

const getAgentExtension = () => config.telephony.ami.agentExtension;

/** Outbound origination mode: 'browser' (default) or the legacy 'ami'. */
const isBrowserOrigination = () => config.telephony.originator === 'browser';

const sanitizeNumber = (value) =>
  String(value || '').replace(/[^\d+]/g, '').trim();

/**
 * Browser-originated dial string: BROWSER_DIAL_PREFIX + digits (default '0' +
 * digits — the same verified dial string the AMI flow used), so the browser's
 * INVITE lands on the same PBX dialplan route. A leading '+' and any leading
 * zeros are stripped first so an already-prefixed number can never double up.
 * Set BROWSER_DIAL_PREFIX= (empty) to dial the stored number as-is.
 */
const buildBrowserDialNumber = (raw) => {
  const digits = sanitizeNumber(raw).replace(/^\+/, '').replace(/^0+/, '');
  if (!digits) return '';
  return `${config.telephony.browserDialPrefix}${digits}`;
};

const getConfigStatus = () => {
  const cfg = config.telephony.ami;
  const r = amiClient.readiness;
  const browser = isBrowserOrigination();
  return {
    configured: browser ? true : config.telephony.isConfigured,
    origination: config.telephony.originator,
    // AMI is only load-bearing in the legacy server-originated mode.
    amiRequired: !browser,
    ami: {
      host: cfg.host,
      port: cfg.port,
      extension: cfg.agentExtension,
      channelTech: cfg.channelTech,
      context: cfg.context,
      userConfigured: Boolean(cfg.user),
      connected: amiClient.isReady,
      readiness: r.state,
      readinessMessage: r.message,
      lastError: amiClient.lastError ? String(amiClient.lastError).slice(0, 300) : null,
      retries: amiClient.retry,
    },
    // Deliberately NOT exposed: AMI_SECRET. Health is booleans only. `lastError`
    // is a bare log line (no stack), never the AMI password.
    integrationStatus: browser ? 'browser-sip.js' : 'asterisk-ami',
    integrationMessage: browser
      ? `Calls are placed by the agent's own browser softphone over WSS ` +
        `(sip:${config.freepbx.domain}); the server only persists the call ` +
        'record and stores the browser-reported lifecycle. AMI is not used.'
      : 'Calls are originated by the TASA server over AMI (Originate → ' +
        `${cfg.channelTech}/${cfg.agentExtension} → ${cfg.context} → student). Real ` +
        'lifecycle arrives over the AMI event stream.',
  };
};


/**
 * Boot the AMI connection. Non-blocking: the client auto-reconnects forever
 * in the background; Originate/Hangup fail honestly (503) until it is ready.
 * Auth/connection errors are logged and NEVER bring the Express process down.
 */
const init = () => {
  assertAmiConfigured();
  wireAmiEvents();
  amiClient.start();

  // The AMI socket may already be up before this boot code runs (server
  // restarts with a live call open). Rebuild the correlation map from
  // whatever live Call records exist right now.
  rebuildCorrelationFromDb().catch(() => {});

  return amiClient;
};


/** Informational only. `false` does not crash anything — it is expected when
 *  AMI is down, auth is rejected, or no credentials are configured yet. */
const isAmiReady = () => amiClient.isReady;

/**
 * Graceful shutdown: Logoff + close the AMI socket and reject in-flight
 * actions so the process can exit cleanly.
 */
const shutdown = () => {
  amiClient.stop();
};

/* ── Originate ───────────────────────────────────────────────────────── */

/**
 * Originate a call for an already-persisted TASA Call record.
 *
 * The controller must create the Call FIRST (that gives us a REAL Mongo
 * _id — never a fake one) and pass it here so TASA_CALLID/TASA_LEADID/
 * TASA_AGENTID carry the true identifiers onto the channel.
 *
 * Sequence: AMI `Originate` rings SIP/<extension> (the agent softphone) into
 * the PBX `gr-cloud-calling` context at extension `s`. When the agent answers,
 * that dialplan reads var1..var7 and dials the customer through a trunk —
 * the student leg is placed by Asterisk, not by a second Node.js action.
 *
 * @returns {Promise<{accepted: boolean}>} resolves when Asterisk ACCEPTS the
 *   originate action. The real progress (ringing/answered/connected/failed)
 *   arrives over the AMI event stream from then on.
 * @throws {ApiError} 422 no number / 502 PBX rejected / 503 AMI unreachable.
 */
const notReadyError = () =>
  new ApiError(503, `${amiClient.readiness.message} Start Call is unavailable until Asterisk AMI is ready.`);

/**
 * Verified-Hathway C2C dial string: '0' + customer number. Any leading zeros
 * on the stored number are stripped first so an already-prefixed number can
 * never become a duplicated "00…" prefix. The gr-cloud-calling 's' dialplan
 * consumes this as var2/var4 and as the agent-leg CallerID.
 */
const buildDialNumber = (raw) => {
  const digits = sanitizeNumber(raw).replace(/^\+/, '').replace(/^0+/, '');
  return digits ? `0${digits}` : '';
};

const originateCall = async ({ callId, leadId, agentId, studentNumber, extension }) => {
  assertAmiConfigured();

  const dialNumber = buildDialNumber(studentNumber);
  if (!dialNumber) throw new ApiError(422, 'No dialable student number to call.');

  if (!amiClient.isReady) {
    throw notReadyError();
  }

  // The agent leg endpoint: default to the agent's own per-user PJSIP
  // WebRTC extension when one is configured, else the shared AMI_EXTENSION.
  const ext = String(extension || '').trim() || getAgentExtension();
  const cfg = config.telephony.ami;
  const agentChannel = `${cfg.channelTech}/${ext}`;

  // VERIFIED HATHWAY C2C VARIABLES — the gr-cloud-calling 's' dialplan reads
  // var1..var7 and dials the customer through a trunk itself; Node.js NEVER
  // places the customer leg. TASA_* variables are kept alongside so Asterisk
  // events still correlate back to this Mongo call (channel vars propagate to
  // bridged legs unless the dialplan clears them).
  //   var1 = AccountCode/correlation ID
  //   var2 = 0 + customer number
  //   var3 = TRUNK
  //   var4 = 0 + customer number
  //   var5 = ACCOUNT_PREFIX
  //   var6 = agent extension
  //   var7 = ActionID / call reference
  const variables = [
    `var1=${callId}`,
    `var2=${dialNumber}`,
    `var3=${cfg.trunk || ''}`,
    `var4=${dialNumber}`,
    `var5=${cfg.accountPrefix || ''}`,
    `var6=${ext}`,
    `var7=${callId}`,
    `TASA_CALLID=${callId}`,
    `TASA_LEADID=${leadId}`,
    `TASA_AGENTID=${agentId}`,
  ].join(',');

  const result = await amiClient.action('Originate', {
    // ActionID = correlation ID (verified Hathway behavior) so Asterisk echoes
    // it back on OriginateResponse and the OriginateResponse correlation map
    // needs no separate lookup.
    ActionID: String(callId),
    Channel: agentChannel,        // PJSIP/<agent ext> (WebRTC) or SIP/<agent ext>
    Exten: 's',
    Context: cfg.context,          // gr-cloud-calling
    CallerID: dialNumber,          // 0<customer number> shown on the agent phone
    Account: String(callId),       // AccountCode = correlation ID
    Priority: '1',
    WaitTime: '1',
    Variable: variables,
    Async: 'true',
  });

  if (result.Response !== 'Success') {
    const reason = String(result.Message || result.Event || 'unknown error');
    throw new ApiError(502, `The PBX rejected the call: ${reason}. Please try again.`);
  }

  // Remember this action for OriginateResponse correlation. The ActionID now
  // equals the TASA call id, so the map entry is the identity mapping.
  if (result.ActionID) {
    pendingOriginateMap.set(result.ActionID, String(callId));
    prunePendingOriginate();
  }

  return { accepted: true };
};

/**
 * Hang up the exact tracked agent channel via AMI.
 *
 * @param {{channel?: string, providerCallId?: string}} call the Call doc.
 * @returns {Promise<{confirmed: boolean, absent: boolean}>}
 *   absent=true means the channel is already gone — treat as an end and let
 *   the AMI Hangup event confirm the terminal status on the record.
 * @throws {ApiError} 503 AMI unavailable (never fabricate an ended state).
 */
const hangupCall = async ({ channel, providerCallId }) => {
  assertAmiConfigured();

  const target = String(channel || '').trim();
  const uniqueId = String(providerCallId || '').trim();

  if (!target && !uniqueId) {
    // No telephony leg was ever tracked — nothing to hang up on the PBX.
    return { confirmed: false, absent: true };
  }

  if (!amiClient.isReady) {
    throw new ApiError(503, `${amiClient.readiness.message} The call is still live, please try End Call again.`);
  }

  let result;
  try {
    result = await amiClient.action(
      'Hangup',
      target ? { Channel: target } : { Uniqueid: uniqueId }
    );
  } catch (err) {
    // AMI did not answer the action (timeout/dead socket). Never claim the
    // call ended — the internal error is already logged server-side.
    throw new ApiError(503, `Asterisk AMI did not respond to the hang-up (${amiClient.readiness.state}). The call is still live, please try End Call again.`);
  }

  if (result.Response === 'Success') {
    return { confirmed: true, absent: false };
  }

  const msg = String(result.Message || '');
  // A Hangup on an already-finished channel is a successful end; the Hangup
  // event (or an existing terminal status) is the conference.
  if (/does not exist|no such channel|not found|already hung up|cannot hang up/i.test(msg)) {
    return { confirmed: false, absent: true };
  }

  throw new ApiError(502, `Asterisk rejected the hang-up: ${msg || 'unknown error'}. The call is still live.`);
};

/* ── AMI event handling / FSM ────────────────────────────────────────── */

const wireAmiEvents = () => {
  // 'ready' = first successful login, 'reconnect' = after a drop. Rebuild
  // the correlation map both times so live events keep resolving.
  amiClient.on('ready', () => { rebuildCorrelationFromDb().catch(() => {}); });
  amiClient.on('reconnect', () => { rebuildCorrelationFromDb().catch(() => {}); });
  amiClient.on('event', (event) => { handleAmiEvent(event).catch(() => {}); });

  // CRITICAL: a rejected AMI login / dropped socket must NEVER crash the
  // Express process. Mark the client not-ready (isReady stays false) and log
  // loudly; the AMI client then enters a 5-minute auth cooldown for a
  // rejected Login (or its normal backoff for a network drop) so the API
  // keeps serving. Start/End Call return clean 503s until the login succeeds.
  amiClient.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error(`[ami] ${err && err.message ? err.message : err}`);
  });
};

/**
 * Resolve which TASA call an AMI event belongs to.
 * Priority: TASA_CALLID channel var → Uniqueid → channel name → Linkedid →
 * originating ActionID. Returns the Mongo callId string or null.
 */
const correlateEvent = (event) => {
  for (const v of eventVariableValues(event.Variable)) {
    if (v.startsWith('TASA_CALLID=')) return v.slice('TASA_CALLID='.length) || null;
  }
  if (event.Uniqueid && uniqueIdMap.has(event.Uniqueid)) return uniqueIdMap.get(event.Uniqueid);
  if (event.Channel && channelMap.has(event.Channel)) return channelMap.get(event.Channel);
  if (event.Linkedid && uniqueIdMap.has(event.Linkedid)) return uniqueIdMap.get(event.Linkedid);
  if (event.ActionID && pendingOriginateMap.has(event.ActionID)) return pendingOriginateMap.get(event.ActionID);
  return null;
};

/** Normalize the repeated `Variable:` header into a list of `a=b` strings. */
const eventVariableValues = (variable) => {
  if (variable == null) return [];
  return (Array.isArray(variable) ? variable : [variable]);
};

/** Register a channel/uniqueid under the resolved callId + persist it. */
const registerChannel = (callId, { uniqueId, channel, linkedId }) => {
  if (uniqueId) uniqueIdMap.set(uniqueId, callId);
  if (channel) channelMap.set(channel, callId);
  if (uniqueId || channel || linkedId) {
    callService.setProvider(callId, { uniqueId, channel, linkedId }).catch(() => {});
  }
};

/** Serialized, fire-and-forget status application per call (no interleave). */
const applyStatus = (callId, status, providerStatus) => {
  if (!callId) return;
  const prev = applyQueues.get(callId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => callService.applyProviderStatus(callId, { status, providerStatus }));
  applyQueues.set(callId, next);
  next.then(() => {
    if (applyQueues.get(callId) === next) applyQueues.delete(callId);
  });
};

const prunePendingOriginate = () => {
  const now = Date.now();
  if (pendingOriginateMap.size > 500) {
    pendingOriginateMap.clear();
    return;
  }
  // Entries hold only ActionID→callId; stale ones shed when the count grows.
};

/** Remove a call's correlation entries after the CDR reconciliation window. */
const scheduleCleanup = (callId) => {
  const existing = cleanupTimers.get(callId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    for (const [u, c] of uniqueIdMap) if (c === callId) uniqueIdMap.delete(u);
    for (const [ch, c] of channelMap) if (c === callId) channelMap.delete(ch);
    connectedMap.delete(callId);
    applyQueues.delete(callId);
    cleanupTimers.delete(callId);
  }, PRUNE_MS);
  cleanupTimers.set(callId, timer);
};

const terminalFromHangup = (event, wasConnected) => {
  const cause = String(event.Cause || '');
  const causeTxt = String(event['Cause-txt'] || '');
  if (wasConnected || /normal clearing|answered|no error/i.test(causeTxt) || cause === '16') {
    return { status: 'completed', note: `hangup:${cause} ${causeTxt}` };
  }
  if (/user busy|busy/i.test(causeTxt) || cause === '17') {
    return { status: 'busy', note: `hangup:${cause} ${causeTxt}` };
  }
  if (/no answer|noanswer/i.test(causeTxt) || cause === '19') {
    return { status: 'no-answer', note: `hangup:${cause} ${causeTxt}` };
  }
  if (/call rejected|rejected|cancelled|cancel/i.test(causeTxt) || cause === '21') {
    return { status: 'cancelled', note: `hangup:${cause} ${causeTxt}` };
  }
  return { status: 'failed', note: `hangup:${cause} ${causeTxt}` };
};

/**
 * AMI event → existing TASA status mapping (idempotent by construction;
 * applyProviderStatus enforces terminal-final + forward-only live moves).
 */
const handleAmiEvent = async (event) => {
  if (!event || !event.Event) return;

  switch (event.Event) {
    case 'Newchannel': {
      const callId = correlateEvent(event);
      if (!callId) return;
      registerChannel(callId, {
        uniqueId: event.Uniqueid,
        channel: event.Channel,
        linkedId: event.Linkedid,
      });
      const desc = String(event.ChannelStateDesc || '').toLowerCase();
      applyStatus(callId, desc.includes('ring') ? 'ringing' : 'initiated', `newchannel:${event.Channel}`);
      break;
    }

    case 'Newstate': {
      const callId = correlateEvent(event);
      if (!callId) return;
      const desc = String(event.ChannelStateDesc || '').toLowerCase();
      if (desc.includes('ring')) applyStatus(callId, 'ringing', `newstate:${event.ChannelStateDesc}`);
      else if (desc.includes('up')) applyStatus(callId, 'answered', `newstate:${event.ChannelStateDesc}`);
      break;
    }

    case 'Dial': {
      const callId = correlateEvent(event);
      if (!callId) return;
      // The student leg is created by the dialplan — register it so its own
      // events resolve to the same TASA call.
      if (event.DestUniqueid) uniqueIdMap.set(event.DestUniqueid, callId);
      if (event.Destination) channelMap.set(event.Destination, callId);

      const dialStatus = String(event.DialStatus || '').toUpperCase();
      if (dialStatus === 'RINGING') applyStatus(callId, 'ringing', `dial:${dialStatus}`);
      else if (dialStatus === 'ANSWER') applyStatus(callId, 'answered', `dial:${dialStatus}`);
      else if (dialStatus === 'BUSY') applyStatus(callId, 'busy', `dial:${dialStatus}`);
      else if (dialStatus === 'NOANSWER') applyStatus(callId, 'no-answer', `dial:${dialStatus}`);
      else if (dialStatus === 'CANCEL') applyStatus(callId, 'cancelled', `dial:${dialStatus}`);
      else if (dialStatus === 'CONGESTION' || dialStatus === 'CHANUNAVAIL' || dialStatus === 'FAILED') {
        applyStatus(callId, 'failed', `dial:${dialStatus}`);
      }
      break;
    }

    case 'Answer': {
      const callId = correlateEvent(event);
      if (!callId) return;
      applyStatus(callId, 'answered', `answer:${event.Channel || ''}`);
      break;
    }

    case 'Link':
    case 'Bridge': {
      const callId = correlateEvent(event)
        || correlateBridgePair(event);
      if (!callId) return;
      // Both legs are bridged → agent ↔ student are actually talking.
      if (!connectedMap.has(callId)) connectedMap.set(callId, true);
      applyStatus(callId, 'connected', `bridge:${event.Event}`);
      break;
    }

    case 'Hangup': {
      const callId = correlateEvent(event);
      if (!callId) return;
      const wasConnected = connectedMap.has(callId);
      const { status, note } = terminalFromHangup(event, wasConnected);
      applyStatus(callId, status, note);
      scheduleCleanup(callId);
      break;
    }

    case 'OriginateResponse': {
      // Correlation: the ActionID from the Originate action first binds this
      // event; a Uniqueid (agent leg) settles the map for everything after.
      const callId = correlateEvent(event);
      if (!callId) return;
      if (event.Uniqueid || event.Channel) {
        registerChannel(callId, {
          uniqueId: event.Uniqueid,
          channel: event.Channel,
          linkedId: event.Linkedid,
        });
      }
      const resp = String(event.Response || '').toLowerCase();
      if (resp === 'error' || resp === 'failure') {
        applyStatus(callId, 'failed', `originate:${event.Response}`);
      } else {
        applyStatus(callId, 'initiated', `originate:${event.Response || 'success'}`);
      }
      break;
    }

    case 'Cdr': {
      const callId = correlateEvent(event);
      if (!callId) return;
      const disp = String(event.Disposition || '').toUpperCase();
      let status = 'completed';
      if (/^BUSY/.test(disp)) status = 'busy';
      else if (/NO ANSWER|NO_ANSWER/.test(disp)) status = 'no-answer';
      else if (/FAILED|CONGESTION|CHANUNAVAIL/.test(disp)) status = 'failed';
      else if (/ANSWERED/.test(disp)) status = 'completed';
      applyStatus(callId, status, `cdr:${disp}`);
      scheduleCleanup(callId);
      break;
    }

    default:
      break;
  }
};

/** Link/Bridge events name their legs as Channel1/Channel2 by name. */
const correlateBridgePair = (event) => {
  for (const key of ['Channel1', 'Channel2', 'Channel']) {
    if (event[key] && channelMap.has(event[key])) return channelMap.get(event[key]);
  }
  return null;
};

/**
 * Rebuild the in-memory correlation map from live TASA Call records after a
 * server boot or an AMI reconnect. The DB is the only source of truth — the
 * maps are a cache so events can find their Mongo record again.
 */
const rebuildCorrelationFromDb = async () => {
  const live = await callService.listLiveCalls();
  uniqueIdMap.clear();
  channelMap.clear();
  for (const call of live) {
    const callId = String(call._id);
    if (call.providerCallId) uniqueIdMap.set(call.providerCallId, callId);
    if (call.channel) channelMap.set(call.channel, callId);
    if (call.status === 'connected') connectedMap.set(callId, true);
  }
};

module.exports = {
  init,
  shutdown,
  isAmiReady,
  isBrowserOrigination,
  assertAmiConfigured,
  getAgentExtension,
  getConfigStatus,
  getReadiness: () => amiClient.readiness,
  originateCall,
  hangupCall,
  // Exposed for tests / diagnostics only — real telephony never needs these.
  _ami: amiClient,
  _correlateEvent: correlateEvent,
  _handleAmiEvent: handleAmiEvent,
  _rebuildCorrelationFromDb: rebuildCorrelationFromDb,
  _terminalFromHangup: terminalFromHangup,
  _sanitizeNumber: sanitizeNumber,
  _buildDialNumber: buildDialNumber,
  buildBrowserDialNumber,
};