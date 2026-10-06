import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import client from '../api/client.js';
import { auditEvent } from '../api/audit.js';
import { getToken } from '../api/storage.js';
import { startClickToCall, fetchCallStatus, reportCallStatus, endClickToCall, fetchActiveCall, endActiveCall } from '../api/calls.js';
import { browserPhone } from '../telephony/browserPhone.js';
import { useToast } from './ToastContext.jsx';

/* ═══════════════════════════════════════════════════════════════════════
   COUNSELOR CONTEXT — real click-to-call, same telephony backend as the
   Agent workspace (COUNSELOR carries the same `lead:fetch` permission the
   /calls/* routes gate on, and GET /calls/sip-config already allows the
   COUNSELOR role). This mirrors AgentContext's call engine (browser softphone
   boot, click-to-call, status polling, terminal-state reconciliation) so a
   counselor's "Start Call" is a real SIP leg, not a simulated timer.

   Student queue / lead loading stays exactly as it already was (CounselorCallWorkspace's
   fetchMyStudents + GET /leads/:id) — only the CALL itself was previously
   simulated, and only that part changes here.
   ═══════════════════════════════════════════════════════════════════════ */

export const CALL_STATUS = {
  IDLE: 'idle',
  DIALING: 'dialing',
  CONNECTED: 'connected',
  ENDING: 'ending',
  ENDED: 'ended',
};

export const CALL_LABEL = {
  [CALL_STATUS.IDLE]: 'Ready',
  [CALL_STATUS.DIALING]: 'Dialing',
  [CALL_STATUS.CONNECTED]: 'On Call',
  [CALL_STATUS.ENDING]: 'Ending Call…',
  [CALL_STATUS.ENDED]: 'Call Ended',
};

// ENDING stays active so nav/button gating holds until the server confirms.
export const CALL_ACTIVE = new Set([CALL_STATUS.DIALING, CALL_STATUS.CONNECTED, CALL_STATUS.ENDING]);

const CALL_TERMINAL_SERVER = new Set(['completed', 'failed', 'no-answer', 'busy', 'cancelled']);

const PHONE_STATUS_TO_SERVER = {
  outgoing: 'ringing',
  ringing: 'ringing',
  answered: 'connected',
  connected: 'connected',
  failed: 'failed',
  ended: 'completed',
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

const CounselorContext = createContext(null);

export function CounselorProvider({ children }) {
  const { push } = useToast();

  const [activeStudent, setActiveStudent] = useState(null);
  const [callStatus, setCallStatus] = useState(CALL_STATUS.IDLE);
  const [interactionVersion, setInteractionVersion] = useState(0);
  const callStartedAtRef = useRef(null);
  const callDurationRef = useRef(0);
  const callStatusRef = useRef(CALL_STATUS.IDLE);

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
  const browserCallRef = useRef(null);
  const reportedStatusRef = useRef(null);

  const [activeCall, setActiveCall] = useState(null);
  const activeCallRef = useRef(null);
  const setActiveCallState = useCallback((value) => {
    activeCallRef.current = value;
    setActiveCall(value);
  }, []);

  const statusPollRef = useRef(null);
  const startingCallRef = useRef(false);
  const endingCallRef = useRef(false);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  const stopStatusPolling = useCallback(() => {
    if (statusPollRef.current) {
      window.clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

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

  // Rehydrate an in-flight call after a reload/HMR.
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
        });
        setCallStatus(active.status === 'answered' || active.status === 'connected' ? CALL_STATUS.CONNECTED : CALL_STATUS.DIALING);
        startStatusPolling(active.callId);
      } catch {
        // No active call / not authed — stays idle.
      }
    })();
    return () => { cancelled = true; };
  }, [setActiveCallState, startStatusPolling]);

  // Browser softphone boots once: fetch this counselor's own WSS + SIP
  // credentials and REGISTER with the PBX, exactly as the Agent workspace does.
  useEffect(() => {
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

  useEffect(() => browserPhone.subscribe((s) => setPhone((p) => ({ ...p, ...s }))), []);

  // Report the real SIP lifecycle of a call this browser placed.
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
      if (reportedStatusRef.current === key) reportedStatusRef.current = null;
    });
  }, [phone.callState, push, stopStatusPolling]);

  // Defensive teardown — an effect cleanup must never throw (that blanks the
  // app) or reject (unhandled rejection). Same contract as AgentContext.
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
  useEffect(() => () => { stopStatusPolling(); }, [stopStatusPolling]);

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
      push(err?.response?.data?.message || 'Could not update the call on the server. Please try End Call again.', 'danger');
      return false;
    }
  }, [push]);

  const startCall = useCallback(async (student, manualNumber) => {
    const leadId = student?._id;
    if (!leadId) return;
    if (startingCallRef.current) return;
    if (CALL_ACTIVE.has(callStatusRef.current)) {
      push('You already have an active call. End it before starting a new one.', 'warning');
      return;
    }
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
    if (!phone.enabled && phone.origination !== 'ami') {
      push('Your phone is not provisioned yet. Ask a supervisor to provision your extension, then try again.', 'warning');
      return;
    }
    if (student) setActiveStudent(student);
    startingCallRef.current = true;
    try {
      const result = await startClickToCall(leadId, manualNumber);
      const { callId, providerCallId, status, origination, dialNumber } = result || {};
      if (!callId) throw new Error('The telephony gateway did not return a call id');
      callStartedAtRef.current = Date.now();
      callDurationRef.current = 0;
      setActiveCallState({ id: callId, providerCallId: providerCallId || null, status: status || 'initiated' });
      reportedStatusRef.current = null;
      setCallStatus(CALL_STATUS.DIALING);

      if (origination === 'browser') {
        browserCallRef.current = callId;
        try {
          await browserPhone.dial(dialNumber || '');
          push('Call placed — dialing the student…', 'info');
        } catch (dialErr) {
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
        leadName: student.studentName,
        message: `Call started for ${String(student.studentName || 'student').slice(0, 60)}`,
        metadata: { callId, origination: origination || 'ami' },
      });
      startStatusPolling(callId);
    } catch (err) {
      if (err?.response?.status === 409) {
        try {
          const active = await fetchActiveCall();
          if (active?.callId) {
            setActiveCallState({
              id: active.callId,
              providerCallId: active.providerCallId || null,
              status: active.status,
            });
            setCallStatus(active.status === 'answered' || active.status === 'connected' ? CALL_STATUS.CONNECTED : CALL_STATUS.DIALING);
            startStatusPolling(active.callId);
            push('You already have an active call — showing it. End it before starting a new one.', 'info');
            return;
          }
        } catch {
          // Adopt failed — fall through to the honest error path below.
        }
      }
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

  const endCall = useCallback(async () => {
    if (endingCallRef.current) return;
    endingCallRef.current = true;
    const prevStatus = callStatusRef.current;
    let duration = 0;
    if (callStartedAtRef.current) {
      duration = Math.max(0, Math.round((Date.now() - callStartedAtRef.current) / 1000));
      callDurationRef.current = duration;
      callStartedAtRef.current = null;
    }
    const activeCallId = activeCallRef.current?.id || null;
    setCallStatus(CALL_STATUS.ENDING);
    if (activeStudent?._id) {
      auditEvent({
        action: 'CALL_ENDED',
        module: 'workflow',
        leadId: activeStudent._id,
        leadName: activeStudent.studentName,
        message: `Call ended for ${String(activeStudent.studentName || 'student').slice(0, 60)}`,
        metadata: { durationSec: duration, ...(activeCallId ? { callId: activeCallId } : {}) },
      });
    }
    if (browserPhone.getState().outgoing) {
      browserCallRef.current = null;
      await browserPhone.hangup();
    }
    const ok = await closeOutActiveCall();
    if (ok) {
      stopStatusPolling();
      browserPhone.hangup();
      push('Call ended', 'success');
      setCallStatus(CALL_STATUS.ENDED);
    } else {
      if (prevStatus !== CALL_STATUS.ENDING) setCallStatus(prevStatus);
      const liveId = activeCallRef.current?.id;
      if (liveId) startStatusPolling(liveId);
    }
    endingCallRef.current = false;
  }, [activeStudent, stopStatusPolling, closeOutActiveCall, startStatusPolling, push]);

  const resetCallStatus = useCallback(() => {
    stopStatusPolling();
    callStartedAtRef.current = null;
    callDurationRef.current = 0;
    browserCallRef.current = null;
    reportedStatusRef.current = null;
    setActiveCallState(null);
    setCallStatus(CALL_STATUS.IDLE);
  }, [stopStatusPolling, setActiveCallState]);

  const bumpInteraction = useCallback(() => {
    setInteractionVersion((v) => v + 1);
  }, []);

  const isOnCall = CALL_ACTIVE.has(callStatus);

  const value = useMemo(
    () => ({
      activeStudent,
      setActiveStudent,
      callStatus,
      callDuration: callDurationRef.current,
      interactionVersion,
      phone,
      activeCall,
      startCall,
      endCall,
      resetCallStatus,
      bumpInteraction,
      isOnCall,
    }),
    [activeStudent, callStatus, interactionVersion, phone, activeCall, startCall, endCall, resetCallStatus, bumpInteraction, isOnCall]
  );

  return <CounselorContext.Provider value={value}>{children}</CounselorContext.Provider>;
}

export const useCounselor = () => {
  const ctx = useContext(CounselorContext);
  if (!ctx) throw new Error('useCounselor must be used within CounselorProvider');
  return ctx;
};
