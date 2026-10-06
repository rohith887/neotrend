import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import client from '../api/client.js';
import { auditEvent } from '../api/audit.js';
import { getToken } from '../api/storage.js';
import { startClickToCall, fetchCallStatus, reportCallStatus, endClickToCall, fetchActiveCall, endActiveCall } from '../api/calls.js';
import { fetchLeadById } from '../api/leads.js';
import { browserPhone } from '../telephony/browserPhone.js';
import { useToast } from './ToastContext.jsx';
import { useCache } from './CacheContext.jsx';

export const BREAK_TYPES = [
  'Morning Tea Break',
  'Lunch Break',
  'Evening Tea Break',
  'Tea Break',
  'Bio Break',
  'Meeting / Briefing',
  'Training',
  'Personal Break',
  'Other',
];

export const CALL_STATUS = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  DIALING: 'dialing',
  CONNECTED: 'connected',
  ENDING: 'ending',
  ENDED: 'ended',
};

// Display labels per call state.
export const CALL_LABEL = {
  [CALL_STATUS.IDLE]:     'Ready',
  [CALL_STATUS.FETCHING]: 'Fetching Lead…',
  [CALL_STATUS.DIALING]:  'Dialing…',
  [CALL_STATUS.CONNECTED]: 'On Call',
  [CALL_STATUS.ENDING]:   'Ending Call…',
  [CALL_STATUS.ENDED]:    'Call Ended',
};

// The "call is active" set — anything the app treats as a live call that must
// gate navigation, Fetch Call and Start Call. ENDING stays in this set so the
// navigation lock and button states hold until the server confirms the end.
export const CALL_ACTIVE = new Set([CALL_STATUS.DIALING, CALL_STATUS.CONNECTED, CALL_STATUS.ENDING]);

// Terminal statuses the gateway can report — stop polling, call is over.
const CALL_TERMINAL_SERVER = new Set(['completed', 'failed', 'no-answer', 'busy', 'cancelled']);

// The browser softphone's SIP session state → the Call.status vocabulary the
// API stores. When this browser places the leg it is the only party that can
// observe it, so it is what reports the real lifecycle.
const PHONE_STATUS_TO_SERVER = {
  outgoing: 'ringing',   // INVITE sent to the PBX
  ringing: 'ringing',   // 18x progress from the far end
  answered: 'connected', // session answered → agent and student are on the line
  connected: 'connected',
  failed: 'failed',
  ended: 'completed',
};

const AgentContext = createContext(null);

export function AgentProvider({ children }) {
  const { push } = useToast();
  const { invalidate } = useCache();
  const [availability, setAvailability] = useState('offline');
  const [activeBreak, setActiveBreak] = useState(null);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const [breakModalOpen, setBreakModalOpen] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [lead, setLead] = useState(null);
  const [callStatus, setCallStatus] = useState(CALL_STATUS.IDLE);
  const [interactionVersion, setInteractionVersion] = useState(0);
  const timers = useRef([]);
  const intervalRef = useRef(null);
  const callStartedAtRef = useRef(null);
  const callDurationRef = useRef(0);
  // Browser softphone state (SIP.js WebRTC). `enabled` means the server gave
  // the caller a WSS endpoint + own extension; `state` mirrors the phone's
  // registration (idle → connecting → registered / error). `callState` mirrors
  // the SIP session of the leg this browser placed. Credentials are passed
  // straight to browserPhone.connect() — never stored in React state.
  const [phone, setPhone] = useState({
    state: 'idle',
    error: null,
    inCall: false,
    extension: null,
    enabled: false,
    origination: 'browser',
    held: false,
    muted: false,
    callState: 'idle',
    outgoing: false,
    confState: 'idle',
    confParticipant: null,
    transferring: null,
  });
  const phoneBootRef = useRef(false);
  // The call id of the call THIS BROWSER placed (browser-originated). Set the
  // moment the softphone dials, so every later SIP transition knows which Call
  // record to report to — even after the session has already hung up.
  const browserCallRef = useRef(null);
  // Last lifecycle value pushed to the API, so repeated delegate events for the
  // same state are not re-sent.
  const reportedStatusRef = useRef(null);
  // Live click-to-call session, keyed by the real TASA Call._id returned by
  // the backend. `callId` is threaded into the disposition save + Call Assist
  // feedback so the chain Lead → Call → Disposition → Feedback stays whole.
  const [activeCall, setActiveCall] = useState(null);
  const activeCallRef = useRef(null);
  const setActiveCallState = useCallback((value) => {
    activeCallRef.current = value;
    setActiveCall(value);
  }, []);
  // Gateway status polling (provider-driven, never simulated).
  const statusPollRef = useRef(null);
  const callStatusRef = useRef(CALL_STATUS.IDLE);
  // In-flight request guards. Ref-based (not state) so two rapid clicks in the
  // same React batch cannot race past each other — a state re-read would be
  // stale until the next render. Ending/starting/fetching each allow exactly
  // one in-flight request; the sequence counter rejects a stale response that
  // lands after a newer fetch was started.
  const fetchingLeadRef = useRef(false);
  const startingCallRef = useRef(false);
  const endingCallRef = useRef(false);
  const fetchSeqRef = useRef(0);
  // Single subscriber (Layout) notified ONLY on a successful disposition save,
  // so Call Assist feedback can be opened with the lead's context BEFORE the
  // active lead is cleared below.
  const onDispositionSavedRef = useRef(null);

  const after = useCallback((ms, fn) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  // Restore break state after a page refresh.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) return undefined;
    client
      .get('/breaks/active')
      .then(({ data }) => {
        if (cancelled) return;
        if (data.data) {
          setActiveBreak(data.data);
          setAvailability('break');
        } else {
          setAvailability('available');
        }
      })
      .catch(() => {
        if (!cancelled) setAvailability('available');
      });
    return () => { cancelled = true; };
  }, []);

  // Live break timer.
  useEffect(() => {
    if (activeBreak && availability === 'break') {
      const tick = () => setBreakElapsed(Date.now() - new Date(activeBreak.startedAt).getTime());
      tick();
      intervalRef.current = window.setInterval(tick, 1000);
      return () => window.clearInterval(intervalRef.current);
    }
    setBreakElapsed(0);
    return undefined;
  }, [activeBreak, availability]);

  const openBreakModal = useCallback(() => setBreakModalOpen(true), []);
  const closeBreakModal = useCallback(() => setBreakModalOpen(false), []);

  const startBreak = useCallback(
    async (type, note) => {
      setBreaking(true);
      try {
        const { data } = await client.post('/breaks/start', { type, note: note || undefined });
        setActiveBreak(data.data);
        setAvailability('break');
        setBreakModalOpen(false);
        push(`Break started: ${type}`, 'success');
      } catch (err) {
        push(err?.response?.data?.message || 'Could not start break', 'danger');
      } finally {
        setBreaking(false);
      }
    },
    [push]
  );

  const endBreak = useCallback(async () => {
    setBreaking(true);
    try {
      const { data } = await client.post('/breaks/end');
      const b = data.data;
      setActiveBreak(null);
      setAvailability('available');
      setBreakElapsed(0);
      push(`Break ended — ${b.durationMinutes} min · ${b.type}`, 'success');
    } catch (err) {
      push(err?.response?.data?.message || 'Could not end break', 'danger');
    } finally {
      setBreaking(false);
    }
  }, [push]);

  const [fetchingLead, setFetchingLead] = useState(false);

  // End the active call with the server as the source of truth, always.
  //  1) If the client still holds the call id, end that exact record.
  //  2) Whatever the result, fall back to POST /calls/end-active — the
  //     authoritative "end the caller's own live call" — so a call id lost to
  //     a reload/HMR can never orphan a live record that silently 409-blocks
  //     the next Start Call. A 409 "not active" / no live call means nothing
  //     to end and counts as success. Failures surface, never swallow.
  // NOTE: declared BEFORE fetchCall — fetchCall awaits it, so a later
  // declaration would cause a TDZ ReferenceError at render (@updateLead rule).
  const closeOutActiveCall = useCallback(async () => {
    const callId = activeCallRef.current?.id || null;
    if (callId) {
      try {
        await endClickToCall(callId);
        return true;
      } catch (err) {
        if (err?.response?.status === 409) return true;
      }
    }
    try {
      const res = await endActiveCall();
      return res ? true : false;
    } catch (err) {
      push(
        err?.response?.data?.message ||
          'Could not update the call on the server. Please try End Call again.',
        'danger'
      );
      return false;
    }
  }, [push]);

  const fetchCall = useCallback(async (leadId) => {
    if (fetchingLeadRef.current) return null;
    if (CALL_ACTIVE.has(callStatusRef.current)) {
      // Part 5/8: a still-live call must never be silently dropped. Fetching a
      // new lead while a call is live would orphan the DB record — the caller
      // must End Call first. Fetching is blocked, never auto-ending.
      push('End the active call before fetching another lead.', 'info');
      return null;
    }
    fetchingLeadRef.current = true;
    const seq = ++fetchSeqRef.current;
    setFetchingLead(true);
    // Normalized lifecycle: IDLE/ENDED → FETCHING while the next lead loads.
    setCallStatus(CALL_STATUS.FETCHING);
    try {
      // leadId optionally claims a specific lead (work queue "Call Now").
      const { data } = await client.post(
        '/activity/fetch-call',
        leadId ? { leadId } : undefined
      );
      if (fetchSeqRef.current !== seq) return null;
      setLead(data.data.lead);
      // Fetch landed on a clean idle state — clear any stale client call refs.
      callStartedAtRef.current = null;
      callDurationRef.current = 0;
      setCallStatus(CALL_STATUS.IDLE);
      setActiveCallState(null);
      invalidate('supervisor-attention');
      invalidate('supervisor-queues');
      invalidate('supervisor-dashboard-summary');
      return data.data.lead;
    } catch (err) {
      // Do NOT clear the current student on failure (Part 2) — the agent keeps
      // seeing the loaded lead and can simply retry. Drop the FETCHING state.
      setCallStatus(CALL_STATUS.IDLE);
      const msg = err?.response?.data?.message || 'No leads available';
      push(msg, 'danger');
      return null;
    } finally {
      if (fetchSeqRef.current === seq) {
        fetchingLeadRef.current = false;
        setFetchingLead(false);
      }
    }
  }, [push, invalidate]);

  // ── Click-to-call from the browser softphone ───────────────────────────
  //
  // Start Call talks to the backend (POST /api/calls/start), which validates
  // the lead + agent and persists the Call record. In the default mode the API
  // answers with the dial string, and THIS browser — already REGISTERed with
  // the PBX over WSS as its own PJSIP extension — dials the student as a normal
  // SIP INVITE. The PBX routes it exactly as it would a desk phone on the same
  // extension; no gateway, no AMI, nothing server-side placing the call.
  //
  //   - DIALING means the INVITE was accepted by the PBX.
  //   - The real lifecycle (ringing → answered → connected → ended/failed) comes
  //     from the SIP.js session, is reported to POST /calls/:callId/status, and
  //     is mirrored here by polling the Call record.
  //   - End Call sends the BYE from the browser and closes the record.
  //   - If the phone is not provisioned/registered, or the PBX rejects the
  //     INVITE, an honest error returns and the agent stays IDLE — no fakes.
  //   - Legacy mode only (CALL_ORIGINATOR=ami): the server originates over AMI
  //     and the browser merely answers the leg it rings.
  const stopStatusPolling = useCallback(() => {
    if (statusPollRef.current) {
      window.clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  // Poll the live gateway status so the workspace reflects the REAL call
  // state (ringing → connected → ended) instead of guessing.
  const startStatusPolling = useCallback((callId) => {
    stopStatusPolling();
    statusPollRef.current = window.setInterval(async () => {
      try {
        const { callId: id, status } = await fetchCallStatus(callId);
        if (!activeCallRef.current || activeCallRef.current.id !== id) {
          stopStatusPolling();
          return;
        }
        if (CALL_TERMINAL_SERVER.has(status)) {
          // Gateway ended the call — stop polling, mirror the terminal state.
          stopStatusPolling();
          setActiveCallState((c) => (c && c.id === id ? { ...c, status } : c));
          if (callStatusRef.current !== CALL_STATUS.ENDED) setCallStatus(CALL_STATUS.ENDED);
          return;
        }
        if ((status === 'answered' || status === 'connected') && callStatusRef.current !== CALL_STATUS.CONNECTED) {
          setCallStatus(CALL_STATUS.CONNECTED);
          push('Call connected', 'success');
        }
        setActiveCallState((c) => (c && c.id === id ? { ...c, status } : c));
      } catch {
        // Transient polling error — keep polling; the next tick retries.
      }
    }, 4000);
  }, [push, stopStatusPolling, setActiveCallState]);

  // Keep a live mirror of callStatus so the polling closure never reads a
  // stale value.
  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Rehydrate an in-flight call after a reload/HMR. The server is the only
  // holder of truth for "which call is still live" — the client's in-memory
  // id is gone after a refresh, and without this the End Call button
  // disappears while the live record 409-blocks every Start Call.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) return undefined;
    (async () => {
      try {
        const active = await fetchActiveCall();
        if (cancelled || !active?.callId) return;
        setActiveCallState({
          id: active.callId,
          providerCallId: active.providerCallId || null,
          status: active.status,
          // Timeline truth from the server, so the timer baseline (answeredAt,
          // else startedAt) and the record's own lifetime survive a reload.
          startedAt: active.startedAt || null,
          answeredAt: active.answeredAt || null,
        });
        if (active.status === 'answered' || active.status === 'connected') {
          setCallStatus(CALL_STATUS.CONNECTED);
        } else {
          setCallStatus(CALL_STATUS.DIALING);
        }
        // Timeline truth comes from the server, never a reset counter: re-seed
        // the duration baseline from the persisted record so End Call reports
        // the real talk time and the timer does not restart at zero.
        if (active.startedAt) callStartedAtRef.current = new Date(active.startedAt).getTime();
        // Restore the loaded lead for the live call so the workspace never
        // falls into "No Lead Loaded" after a reload. The active-call endpoint
        // returns the lead id; the fully-populated lead (same shape as
        // fetch-call) comes from the existing GET /leads/:id. Best-effort — a
        // failed restore keeps the call itself recovered and End Call working.
        if (active.lead) {
          try {
            const restoredLead = await fetchLeadById(active.lead);
            if (cancelled) return;
            if (restoredLead) setLead(restoredLead);
          } catch {
            // Lead restore is best-effort — the call stays recovered.
          }
        }
        startStatusPolling(active.callId);
      } catch {
        // No active call / not authed — stays idle.
      }
    })();
    return () => { cancelled = true; };
  }, [setActiveCallState, startStatusPolling]);

  // ── Browser softphone boots once: fetch the caller's OWN WSS + SIP
  // credentials (GET /api/calls/sip-config) and REGISTER with the PBX so the
  // agent can place and receive calls from this browser.
  useEffect(() => {
    // `phoneBootRef` alone must gate this — it is set SYNCHRONOUSLY before the
    // async work starts, so React 18 StrictMode's dev-only double-invoke
    // (mount → cleanup → mount) never runs the fetch/connect twice. Do NOT
    // pair this with a `cancelled` flag tied to the effect's cleanup: that
    // cleanup fires during StrictMode's simulated unmount too, so it would
    // cancel the ORIGINAL (real) boot attempt before `browserPhone.connect()`
    // ever runs — the softphone then silently never registers, with no error
    // (this is exactly what happened: the fetch succeeded, logged a valid
    // config, and still bailed out before calling connect()). A genuine
    // unmount (logout/nav away) is already handled by the separate
    // `browserPhone.disconnect()` cleanup effect below.
    if (!getToken() || phoneBootRef.current) return;
    phoneBootRef.current = true;
    (async () => {
      try {
        const { data } = await client.get('/calls/sip-config');
        const cfg = data?.data || {};
        setPhone((p) => ({
          ...p,
          enabled: Boolean(cfg.enabled),
          state: cfg.enabled ? 'connecting' : 'idle',
          extension: cfg.extension || null,
          origination: cfg.origination || 'browser',
        }));
        if (cfg.enabled && cfg.wss_url && cfg.username && cfg.extension) {
          // The SIP password is handed to the SIP.js stack directly — it
          // never lives in React state or the bundled client.
          await browserPhone.connect({
            wsServer: cfg.wss_url,
            username: cfg.username,
            extension: cfg.extension,
            password: cfg.password || '',
            domain: cfg.domain || '',
          });
        }
      } catch (err) {
        setPhone((p) => ({
          ...p,
          state: 'error',
          error: err?.response?.data?.message || 'Softphone setup failed.',
        }));
      }
    })();
  }, []);

  // Mirror the SIP.js phone state (registration + in-call flags) into React.
  useEffect(() => browserPhone.subscribe((s) => setPhone((p) => ({ ...p, ...s }))), []);

  // A live Call was restored from the server after a reload but THIS page does
  // not hold the SIP leg for it (the WebRTC session died with the old runtime).
  // While that holds, the call is shown as recovering/reconnecting — never a
  // second dial. Cleared the moment a real session exists or the call closes.
  const recovering = useMemo(
    () => Boolean(activeCall) && CALL_ACTIVE.has(callStatus) && !phone.inCall && phone.callState === 'idle',
    [activeCall, callStatus, phone.inCall, phone.callState]
  );

  // Report the REAL lifecycle of a call this browser placed. The softphone is
  // the only party that can see its SIP session, so each transition is pushed
  // to the API (which stores it on the Call record) and mirrored in the UI.
  // Duplicate events for a state already sent are skipped; a failed report is
  // retried on the next transition.
  useEffect(() => {
    const callId = browserCallRef.current;
    if (!callId) return;
    const serverStatus = PHONE_STATUS_TO_SERVER[phone.callState];
    if (!serverStatus) return;
    const key = `${callId}:${serverStatus}`;
    if (reportedStatusRef.current === key) return;
    reportedStatusRef.current = key;

    if (serverStatus === 'connected' && callStatusRef.current !== CALL_STATUS.CONNECTED) {
      setCallStatus(CALL_STATUS.CONNECTED);
      push('Call connected', 'success');
    }
    if (CALL_TERMINAL_SERVER.has(serverStatus)) {
      browserCallRef.current = null;
      stopStatusPolling();
    }

    reportCallStatus(callId, serverStatus).catch(() => {
      // Transient — allow the next transition to resend this state.
      if (reportedStatusRef.current === key) reportedStatusRef.current = null;
    });
  }, [phone.callState, push, setCallStatus, stopStatusPolling]);

  // Tear the softphone down on unmount (logout / HMR). Defensive: this runs in
  // an effect cleanup, so a throw here takes the whole app down with it and a
  // rejected promise would surface as an unhandled rejection. Neither may ever
  // escape — a phone that fails to shut down cleanly must not blank the CRM.
  useEffect(
    () => () => {
      try {
        Promise.resolve(browserPhone.disconnect({ quiet: true })).catch(() => {});
      } catch {
        // ignore
      }
    },
    []
  );

  const startCall = useCallback(async (currentLead, manualNumber) => {
    const leadId = currentLead?._id;
    if (!leadId) return;
    if (startingCallRef.current) return; // one in-flight Start at a time
    if (CALL_ACTIVE.has(callStatusRef.current)) {
      // Never double-start: the app is already in a live call (or ending one).
      push('You already have an active call. End it before starting a new one.', 'warning');
      return;
    }
    // When a browser softphone is configured (per-agent PJSIP extension), the
    // agent leg can only ring if this browser is REGISTERED — otherwise the
    // dial would go nowhere. If no WSS is configured the guard is skipped
    // (legacy server-side AMI origination keeps working).
    if (phone.enabled && phone.state !== 'registered') {
      push(
        phone.state === 'connecting'
          ? 'Softphone is still registering — wait for the phone to be ready.'
          : phone.error
            ? `Phone offline — ${phone.error}`
            : 'Softphone is not registered, so it cannot place the call.',
        'warning'
      );
      return;
    }
    // Browser origination needs the agent's own provisioned endpoint. Fail fast
    // with the actionable message instead of letting the API reject it.
    if (!phone.enabled && phone.origination !== 'ami') {
      push('Your phone is not provisioned yet. Ask a supervisor to provision your extension, then try again.', 'warning');
      return;
    }
    if (fetchingLeadRef.current) return; // no lead is loaded yet
    startingCallRef.current = true;
    try {
      // Backend validates the lead + agent and persists the Call. In the default
      // mode it also returns the dial string; the browser then places the leg
      // and the real lifecycle is reported back (see the effect above). Legacy
      // AMI mode has the server originate instead. DIALING is shown ONLY after
      // the call was accepted — the workspace then mirrors the real lifecycle.
      const result = await startClickToCall(leadId, manualNumber);
      const { callId, providerCallId, status, origination, dialNumber } = result || {};
      if (!callId) throw new Error('The telephony gateway did not return a call id');
      callStartedAtRef.current = Date.now();
      callDurationRef.current = 0;
      setActiveCallState({ id: callId, providerCallId: providerCallId || null, status: status || 'initiated' });
      reportedStatusRef.current = null;
      setCallStatus(CALL_STATUS.DIALING);

      if (origination === 'browser') {
        // This browser is the caller: send the INVITE to the PBX ourselves.
        browserCallRef.current = callId;
        try {
          await browserPhone.dial(dialNumber || '');
          push('Call placed — dialing the student…', 'info');
        } catch (dialErr) {
          // The record exists, so close it honestly instead of leaving a live
          // call that would block the next Start Call.
          browserCallRef.current = null;
          reportCallStatus(callId, 'failed').catch(() => {});
          throw dialErr;
        }
      } else {
        push('Call placed — ringing your softphone…', 'info');
      }
      auditEvent({
        action: 'CALL_STARTED',
        module: 'workflow',
        leadId,
        leadName: currentLead.studentName,
        message: `Call started for ${String(currentLead.studentName || 'student').slice(0, 60)}`,
        metadata: { callId, origination: origination || 'ami' },
      });
      startStatusPolling(callId);
    } catch (err) {
      if (err?.response?.status === 409) {
        // The backend says a live call already exists for this agent — the
        // most likely leftovers of a lost call id (reload/HMR) or a stale
        // record. Rather than discarding it, ADOPT the existing call so the
        // End Call action can close it out; the caller is never left with an
        // unreachable 409.
        try {
          const active = await fetchActiveCall();
          if (active?.callId) {
            setActiveCallState({
              id: active.callId,
              providerCallId: active.providerCallId || null,
              status: active.status,
              startedAt: active.startedAt || null,
              answeredAt: active.answeredAt || null,
            });
            setCallStatus(
              active.status === 'answered' || active.status === 'connected'
                ? CALL_STATUS.CONNECTED
                : CALL_STATUS.DIALING
            );
            startStatusPolling(active.callId);
            push('You already have an active call — showing it. End it before starting a new one.', 'info');
            return;
          }
        } catch {
          // Adopt failed — fall through to the honest error path below.
        }
      }
      // Unconfigured/unwired gateway or any other failure → honest error.
      // No fake ids, no retry timers — just a clean IDLE state.
      callStartedAtRef.current = null;
      callDurationRef.current = 0;
      browserCallRef.current = null;
      setActiveCallState(null);
      setCallStatus(CALL_STATUS.IDLE);
      push(err?.response?.data?.message || err?.message || 'Could not start the call. Please try again.', 'danger');
    } finally {
      startingCallRef.current = false;
    }
  }, [push, setActiveCallState, startStatusPolling, phone]);

// End the active call on the server (POST /calls/:callId/end, falling back
// to POST /calls/end-active) with retry: shared by endCall and fetchCall.
// (Defined above fetchCall — see there.)
  const endCall = useCallback(async () => {
    if (endingCallRef.current) return; // one in-flight End at a time
    endingCallRef.current = true;
    const prevStatus = callStatusRef.current;
    // Snapshot whether this end is reconciling a call whose SIP session was
    // lost on reload (the browser holds no leg for it) so the success toast can
    // be honest about what "end" means here.
    const recoveredEnd = recovering;
    let duration = 0;
    if (callStartedAtRef.current) {
      duration = Math.max(
        0,
        Math.round((Date.now() - callStartedAtRef.current) / 1000)
      );
      callDurationRef.current = duration;
      callStartedAtRef.current = null;
    }
    const activeCallId = activeCallRef.current?.id || null;
    // Enter ENDING (still in CALL_ACTIVE) so the nav lock and button states
    // hold until the server confirms the end. The success state is only
    // applied AFTER the backend accepts.
    setCallStatus(CALL_STATUS.ENDING);
    if (lead?._id) {
      auditEvent({
        action: 'CALL_ENDED',
        module: 'workflow',
        leadId: lead._id,
        leadName: lead.studentName,
        message: `Call ended for ${String(lead.studentName || 'student').slice(0, 60)}`,
        metadata: { durationSec: duration, ...(activeCallId ? { callId: activeCallId } : {}) },
      });
    }
    // Best-effort but visible backend sync: let the workflow Call record reach
    // a terminal state so the next Start Call is not blocked by the 409
    // active-call gate. closeOutActiveCall is ALWAYS called — when the client
    // still holds the id it ends that exact record, and when the id was lost
    // (reload/HMR) it falls back to the authoritative end-active endpoint.
    // activeCall is intentionally kept so the disposition save can still link
    // this callId. The server never fabricates an ended state.
    //
    // Browser-originated call: the BYE sent from THIS browser is the hangup, so
    // it goes out first; the record is then closed server-side (the lifecycle
    // effect also reports the real terminal state, so a 409 here means it is
    // already closed and counts as success). Legacy AMI mode is unchanged: the
    // server tears the leg down first and the local leg follows.
    if (browserPhone.getState().outgoing) {
      browserCallRef.current = null;
      await browserPhone.hangup();
    }
    const ok = await closeOutActiveCall();
    if (ok) {
      stopStatusPolling();
      // The record is closed — make sure no local leg is left up (no-op when
      // the BYE above already cleared it).
      browserPhone.hangup();
      if (recoveredEnd) {
        // Honest post-refresh reconciliation. The BYE for this call died with
        // the pre-reload runtime, so this browser cannot tear down the far-end
        // leg itself. The record IS closed (nothing 409-blocks the next call).
        // We never claim the far end was disconnected by us or that the PBX
        // guaranteed it — the session is simply marked lost and the agent can
        // move on.
        push('Session lost — the page refresh dropped this browser\'s SIP connection, so it could not disconnect the student line. The call record is closed; you can start a new call.', 'info');
      } else {
        push('Call ended', 'success');
      }
      setCallStatus(CALL_STATUS.ENDED);
    } else {
      // Server-end failed. Revert to the live state we were in (no fake ENDED)
      // and resume gateway polling so the true call state reappears; the agent
      // can press End Call again. closeOutActiveCall already surfaced the error.
      if (prevStatus !== CALL_STATUS.ENDING) setCallStatus(prevStatus);
      const liveId = activeCallRef.current?.id;
      if (liveId) startStatusPolling(liveId);
    }
    endingCallRef.current = false;
  }, [lead, stopStatusPolling, closeOutActiveCall, startStatusPolling, push, recovering]);

  const resetCallStatus = useCallback(() => {
    stopStatusPolling();
    callStartedAtRef.current = null;
    callDurationRef.current = 0;
    browserCallRef.current = null;
    reportedStatusRef.current = null;
    setActiveCallState(null);
    setCallStatus(CALL_STATUS.IDLE);
  }, [stopStatusPolling, setActiveCallState]);

  // Stop gateway polling on unmount.
  useEffect(() => () => {
    stopStatusPolling();
  }, [stopStatusPolling]);

  /**
   * Replace the in-memory lead with an updated copy (e.g. after the agent
   * saves student profile changes) so every panel reflects the new values.
   *
   * NOTE: must be declared BEFORE submitCall — submitCall references it in
   * its dependency array, so declaring it after caused a TDZ ReferenceError
   * ("Cannot access 'updateLead' before initialization") on mount.
   */
  const updateLead = useCallback((nextLead) => {
    setLead(nextLead);
  }, []);

  /**
   * Register the single callback that fires ONLY when a disposition save API
   * returns success. The callback receives the saved lead's context
   * ({ leadId, studentName, callId }) so the consumer (Layout) can open Call
   * Assist feedback with the correct student — before the lead is cleared.
   */
  const setOnDispositionSaved = useCallback((fn) => {
    onDispositionSavedRef.current = fn;
  }, []);

  /**
   * Submit a call outcome.
   *
   * formData must include all fields that DispositionForm collected.
   * Returns { success: boolean } so the form can reset its submitting state.
   */
  const submitCall = useCallback(async (formData) => {
    if (!lead) return { success: false };
    // Part 8 invariant: the UI may only return to IDLE when no server call is
    // live. If a disposition is saved without End Call first, close the server
    // call out here; abort the save if that fails so the frontend and backend
    // never disagree about an active call.
    if (CALL_ACTIVE.has(callStatusRef.current)) {
      const ok = await closeOutActiveCall();
      if (!ok) return { success: false };
    }
    browserCallRef.current = null;
    reportedStatusRef.current = null;
    const activeCallId = activeCallRef.current?.id || null;
    try {
      const { data } = await client.post('/interactions', {
        leadId: lead._id,
        durationSec: callDurationRef.current || 0,
        callId: activeCallId || undefined,
        ...formData,
      });
      // The interaction is persisted on the server. The active lead must be
      // cleared IMMEDIATELY (same flow as the successful save) — never via a
      // delayed timer — so every consumer re-renders with no lead: the
      // disposition panel returns to the "No Lead Loaded" state and the
      // student profile area renders nothing. The lead + its disposition /
      // remark history stay in the database (see the dropped-lead exception:
      // reopening a dropped lead reloads it via fetch-call).
      //
      // Capture the feedback context FIRST (still has lead._id / studentName
      // here) — after setLead(null) the lead is gone and a stale/next student
      // must never supply this context.
      onDispositionSavedRef.current?.({
        leadId: lead._id,
        studentName: lead.studentName,
        callId: activeCallId,
      });
      callDurationRef.current = 0;
      stopStatusPolling();
      setActiveCallState(null);
      setInteractionVersion((v) => v + 1);
      setLead(null);
      setCallStatus(CALL_STATUS.IDLE);
      push('Disposition saved. Lead updated successfully.', 'success');
      return { success: true };
    } catch (err) {
      push(err?.response?.data?.message || 'Could not save disposition', 'danger');
      return { success: false };
    }
  }, [lead, push, stopStatusPolling, closeOutActiveCall, setActiveCallState]);

  const value = useMemo(
    () => ({
      availability,
      activeBreak,
      breakElapsed,
      breakModalOpen,
      breaking,
      openBreakModal,
      closeBreakModal,
      startBreak,
      endBreak,
      lead,
      updateLead,
      callStatus,
      activeCall,
      interactionVersion,
      phone,
      recovering,
      startCall,
      endCall,
      resetCallStatus,
      fetchCall,
      fetchingLead,
      submitCall,
      setOnDispositionSaved,
      // Dev-only diagnostic surface: the real in-flight flags behind callStatus,
      // so Layout can log why the call controls are disabled.
      callRefs: { fetchingLeadRef, startingCallRef, endingCallRef },
    }),
    [
      availability,
      activeBreak,
      breakElapsed,
      breakModalOpen,
      breaking,
      openBreakModal,
      closeBreakModal,
      startBreak,
      endBreak,
      lead,
      updateLead,
      callStatus,
      activeCall,
      interactionVersion,
      phone,
      recovering,
      startCall,
      endCall,
      resetCallStatus,
      fetchCall,
      fetchingLead,
      submitCall,
      setOnDispositionSaved,
    ]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export const useAgent = () => {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    // Safe no-op fallback for consumers rendered outside AgentProvider:
    //   - BreakModal (supervisor/counselor shell) reads breakModalOpen,
    //     closeBreakModal, startBreak, breaking.
    //   - AgentWorkspace is ALSO mounted for supervisors in `mode="supervisor"`
    //     and reads the full CTI surface. Every field it destructures must
    //     exist so the Supervisor profile save path (updateLead) and the
    //     read-only call-state reads never throw. AgentProvider is untouched.
    return {
      availability: 'available',
      activeBreak: null,
      breakElapsed: 0,
      breaking: false,
      openBreakModal() {},
      closeBreakModal() {},
      startBreak() {},
      endBreak() {},
      lead: null,
      updateLead() {},
      callStatus: CALL_STATUS.IDLE,
      activeCall: null,
      interactionVersion: 0,
      startCall() {},
      endCall() {},
      resetCallStatus() {},
      fetchCall: async () => undefined,
      fetchingLead: false,
      submitCall: async () => ({ success: false }),
      setOnDispositionSaved() {},
      breakModalOpen: false,
      phone: {
        state: 'idle',
        error: null,
        inCall: false,
        extension: null,
        enabled: false,
      },
      recovering: false,
      callRefs: {
        fetchingLeadRef: { current: false },
        startingCallRef: { current: false },
        endingCallRef: { current: false },
      },
    };
  }
  return ctx;
};

export const formatDuration = (ms) => {
  if (!ms || ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};
