import { UserAgent } from "sip.js/lib/api/user-agent.js";
import { SimpleUser } from "sip.js/lib/platform/web/simple-user/index.js";

const REGISTER_WATCHDOG_MS = 12000;
const REGISTER_EXPIRES_SEC = 300;
const KEEPALIVE_INTERVAL_SEC = 30;
const DTMF_TONE = /^[0-9*#A-Da-d]$/;


const RINGBACK_TONES_HZ = [440, 480];
const RINGBACK_MIX = [1, 0.55];
const RINGBACK_VOLUME = 0.32;
const RINGBACK_BEEP_SEC = 2.0; // long beep
const RINGBACK_GAP_SEC = 2.0;
const RINGBACK_EDGE_SEC = 0.015; // de-click ramp
const RINGBACK_MAX_SEC = 240; // stop scheduling after this; nothing rings longer

/* ══════════════════════════════════════════════════════════════════════
   TEMPORARY DIAGNOSTIC INSTRUMENTATION — the softphone-audio investigation.

   This block only OBSERVES. It adds listeners and records what the
   SIP → ICE → RTCPeerConnection → <audio> chain actually did; it does not
   change any decision the code below makes. Every event lands on a per-call
   timeline, readable with browserPhone.getDiagnostics().

   The question it exists to answer is NOT "did ICE connect" — it is the
   full chain, per call:
       SIGNALING_OK → ICE_OK → REMOTE_TRACK_OK → AUDIO_PLAYING_OK
   where AUDIO_PLAYING_OK means the browser actually decoded and played the
   media it had already received. A call can pass the first three and still
   be silent, and that is exactly the failure this has to catch.
   ══════════════════════════════════════════════════════════════════════ */

const DIAG_KEEP_CALLS = 50;
const DIAG_AUDIO_EVENTS = [
  "loadstart", "loadedmetadata", "loadeddata", "canplay", "canplaythrough",
  "play", "playing", "pause", "waiting", "stalled", "suspend", "emptied",
  "error", "volumechange", "ratechange",
];
const DIAG_READY_STATES = [
  "HAVE_NOTHING", "HAVE_METADATA", "HAVE_CURRENT_DATA",
  "HAVE_FUTURE_DATA", "HAVE_ENOUGH_DATA",
];


class BrowserPhone {
  constructor() {
    this.user = null;
    this.remoteAudio = null;
    this.confAudio = null;
    this.cred = null;
    this.conf = null;
    this._wsServer = null;
    // Live claims on the softphone. See connect()/disconnect().
    this._leases = 0;
    this.watchdogTimer = null;
    this.subscriber = new Set();
    this._state = {
      state: "idle",
      error: null,
      inCall: false,
      extension: null,
      held: false,
      muted: false,
      callState: "idle",
      outgoing: false,
      mediaSuspended: false,
      confState: "idle",
      confParticipant: null,
      transferring: null,
    };
    this.ringbackPlaying = false;
    this._audioCtx = null;
    this._ringbackGain = null;

    // Diagnostic ring buffer — see the DIAG block above. `current` is the call
    // being recorded; `calls` retains finished ones for comparison.
    this.diag = { seq: 0, current: null, calls: [] };
  }



  getState() {
    return { ...this._state };
  }

  get isRegistered() {
    return this._state.state === "registered";
  }

  subscribe(fn) {
    this.subscriber.add(fn);
    fn(this.getState());
    return () => this.subscriber.delete(fn);
  }


  _setState(partial, { silent = false } = {}) {
    this._state = { ...this._state, ...partial };
    if (silent) return;
    const snapshot = this.getState();
    this.subscriber.forEach((fn) => {
      try {
        fn(snapshot);
      } catch {
        // A broken subscriber must never break the SIP stack.
      }
    });
  }


  _uriHost(wssServer) {
    try {
      return new URL(wssServer).hostname || "";
    } catch {
      return "";
    }
  }

  _ipHost() {
    return this.cred ? this.cred.host : "";
  }


  _dialTarget(target) {
    const t = String(target || "").trim();
    if (!t) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
    return this._ipHost() ? `sip:${t}@${this._ipHost()}` : `sip:${t}`;
  }

  _sipUri(target) {
    const dial = this._dialTarget(target);
    if (!dial) return null;
    try {
      return UserAgent.makeURI(dial) || null;
    } catch {
      return null;
    }
  }

  _sipError(err) {
    return err?.message || "The phone could not complete that action.";
  }

  /* ── Diagnostics (observation only) ───────────────────────────────────
     `_diagBegin` opens a call record; `_diag` appends one timestamped event;
     `_diagAudio` captures the exact audio-element state the user cannot see;
     `_diagVerdict` scores the four-stage chain the investigation cares about.
     All of it is wrapped so a missing/hostile browser API can never let the
     instrumentation take down a live call. */

  _diagBegin(direction, extra = {}) {
    try {
      const call = {
        id: ++this.diag.seq,
        direction,
        startedAt: new Date().toISOString(),
        t0: typeof performance !== "undefined" ? performance.now() : Date.now(),
        events: [],
        audioMain: null,
        audioConf: null,
        verdict: null,
        ...extra,
      };
      this.diag.current = call;
      this.diag.calls.push(call);
      if (this.diag.calls.length > DIAG_KEEP_CALLS) this.diag.calls.shift();
      return call;
    } catch {
      return null;
    }
  }

  _diag(event, data = {}) {
    try {
      const call = this.diag.current;
      if (!call) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      call.events.push({ ms: Math.round(now - call.t0), event, ...data });
    } catch {
      // Never let a logging failure reach the call path.
    }
  }

  _diagAudio(el, when, slot = "main") {
    try {
      const snap = {
        when,
        elExists: Boolean(el),
        inDom: Boolean(el?.isConnected),
        srcObject: null,
        track: null,
        readyState: el?.readyState ?? null,
        readyStateName: el ? DIAG_READY_STATES[el.readyState] ?? `?${el.readyState}` : null,
        paused: el?.paused ?? null,
        muted: el?.muted ?? null,
        volume: el?.volume ?? null,
        ended: el?.ended ?? null,
        autoplay: el?.autoplay ?? null,
        currentTime: el ? Math.round(el.currentTime * 100) / 100 : null,
        currentSrc: el?.currentSrc || null,
        error: el?.error ? { code: el.error.code, message: el.error.message } : null,
      };
      const stream = el?.srcObject || null;
      if (stream) {
        const tracks = typeof stream.getTracks === "function" ? stream.getTracks() : [];
        const track = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks()[0] : null;
        snap.srcObject = `MediaStream id=${stream.id} tracks=${tracks.length} state=${stream.active ? "active" : "inactive"}`;
        snap.track = track
          ? {
              id: track.id,
              kind: track.kind,
              enabled: track.enabled,
              muted: track.muted,
              readyState: track.readyState,
            }
          : null;
        snap.trackKinds = tracks.map((t) => `${t.kind}:${t.readyState}`);
      }
      const call = this.diag.current;
      if (call && slot === "main") call.audioMain = snap;
      if (call && slot === "conf") call.audioConf = snap;
      return snap;
    } catch {
      return null;
    }
  }

  _diagHookAudio(el, slot) {
    try {
      DIAG_AUDIO_EVENTS.forEach((evt) => {
        el.addEventListener(evt, () => {
          this._diag(`audio:${evt}`, this._diagAudio(el, `audio:${evt}`, slot));
        });
      });
    } catch {
      // Listener attachment is best-effort.
    }
  }

  // Events and play() promises are both unreliable: "playing" fires before any
  // RTP arrives, and a play() that resolved early says nothing about now. The
  // only trustworthy signal is currentTime actually advancing, so the element
  // is sampled on a timer FOR THE DURATION OF ONE CALL. Called from
  // onCallAnswered; stopped in _resetCallState so the evidence survives hangup.
  _diagStartAudioSampler(slot = "main") {
    try {
      if (this._diagAudioSamplerId) return;
      const el = slot === "conf" ? this.confAudio : this.remoteAudio;
      if (!el) return;
      this._diagAudioSamplerId = window.setInterval(() => {
        const call = this.diag?.current;
        if (!call) return;
        const prev = call.audioProgress?.[slot]?.currentTime ?? -1;
        if (el.currentTime !== prev || prev === 0) {
          call.audioProgress = call.audioProgress || {};
          call.audioProgress[slot] = this._diagAudio(el, "sample", slot);
        }
      }, 250);
    } catch {
      // Sampling is best-effort.
    }
  }

  _diagStopAudioSamplers() {
    if (this._diagAudioSamplerId) {
      window.clearInterval(this._diagAudioSamplerId);
      this._diagAudioSamplerId = null;
    }
  }

  /** Attach session + peer-connection observers so ICE and ontrack are visible. */
  _diagHookSession(session, from = "onCallCreated") {
    try {
      if (!session) return;
      // sip.js only surfaces onCallCreated on some paths, so this is also
      // called from dial()/onCallAnswered. Guard so one session is hooked once.
      if (!this._diagHooked) this._diagHooked = new WeakSet();
      if (this._diagHooked.has(session)) return;
      this._diagHooked.add(session);
      this._diag("session", { from, state: session.state, id: String(session.id) });
      session.stateChange?.addListener?.((state) => {
        this._diag("session", { from: "stateChange", state, id: String(session.id) });
      });

      const pc = session.sessionDescriptionHandler?.peerConnection;
      if (!pc) {
        this._diag("ice", { error: "no RTCPeerConnection exposed on sessionDescriptionHandler" });
        return;
      }
      const iceSnapshot = (why) =>
        this._diag("ice", {
          why,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState,
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
        });
      iceSnapshot("initial");
      pc.addEventListener?.("iceconnectionstatechange", () => iceSnapshot("iceconnectionstatechange"));
      pc.addEventListener?.("icegatheringstatechange", () => iceSnapshot("icegatheringstatechange"));
      pc.addEventListener?.("connectionstatechange", () => iceSnapshot("connectionstatechange"));
      pc.addEventListener?.("signalingstatechange", () => iceSnapshot("signalingstatechange"));

      // Candidates are logged with their address type so an all-private
      // candidate set (the classic "signaling fine, media dead" signature)
      // is visible without decoding the whole SDP.
      pc.addEventListener?.("icecandidate", (e) => {
        this._diag("icecandidate", {
          candidate: e.candidate
            ? `${e.candidate.candidate} type=${e.candidate.type} proto=${e.candidate.protocol}`
            : "(null = end-of-candidates)",
        });
      });

      // RTP arrival is signalled on the TRACK, not the peer connection. A
      // muted track with readyState "live" means the pipe is open but no
      // packets are landing — which is silence the UI reports as connected.
      const watchTrack = (track, origin) => {
        if (!track) return;
        this._diag("track", { origin, kind: track.kind, id: track.id, muted: track.muted, readyState: track.readyState });
        track.addEventListener?.("mute", () =>
          this._diag("track", { origin: "mute-event", kind: track.kind, id: track.id, muted: track.muted })
        );
        track.addEventListener?.("unmute", () =>
          this._diag("track", { origin: "unmute-event", kind: track.kind, id: track.id, muted: track.muted })
        );
        track.addEventListener?.("ended", () =>
          this._diag("track", { origin: "ended-event", kind: track.kind, id: track.id, readyState: track.readyState })
        );
      };
      this._diagTrackPoll = window.setInterval(() => {
        const t = pc.getReceivers?.().find((r) => r.track)?.track;
        if (t) watchTrack(t, "receiver-poll");
      }, 1000);

      pc.addEventListener?.("track", (ev) => {
        this._diag("ontrack", {
          kind: ev.track?.kind,
          trackId: ev.track?.id,
          trackReadyState: ev.track?.readyState,
          trackMuted: ev.track?.muted,
          streams: ev.streams?.length ?? 0,
          streamIds: (ev.streams || []).map((s) => s.id),
        });
        this._diag("ontrack", this._diagAudio(this.remoteAudio, "ontrack"));
        watchTrack(ev.track, "ontrack");
      });
      pc.addEventListener?.("trackended", (ev) =>
        this._diag("ontrack", { ended: true, kind: ev.track?.kind, trackId: ev.track?.id })
      );
    } catch (err) {
      this._diag("ice", { error: `hook failed: ${err?.message}` });
    }
  }

  /** Score the four-stage chain for the call currently being recorded. */
  _diagVerdict(reason) {
    try {
      const call = this.diag.current;
      if (!call) return null;
      const evs = call.events;
      const answered = evs.some((e) => e.event === "session" && e.state === "Established");
      const iceOk = evs.some(
        (e) => e.event === "ice" && ["connected", "completed"].includes(e.iceConnectionState)
      );
      // RTP actually landing. A live-but-muted track means the pipe is open
      // and no packets arrived, which is silence behind a "connected" UI.
      const trackEvents = evs.filter((e) => e.event === "track");
      const trackUnmuted = trackEvents.some((e) => e.muted === false);
      // The "track" listener is attached in onCallAnswered, but sip.js raises
      // "track" during setup — so the receiver poll is often the only witness.
      const trackOk =
        evs.some((e) => e.event === "ontrack" && e.kind === "audio") || trackEvents.length > 0;

      const playAttempts = evs.filter((e) => e.event === "play()");
      const rejected = playAttempts.filter((e) => e.resolved === false);
      const skipped = playAttempts.filter((e) => e.attempted === false);

      // AUDIBLE requires evidence of the renderer consuming samples, not a
      // promise that resolved or an event that fired while the track was still
      // muted. currentTime advancing past zero is the only proof of sound.
      const samples = Object.values(call.audioProgress || {});
      const rendered = samples.some(
        (s) => s && s.srcObject && s.paused === false && Number(s.readyState) >= 3 && s.muted === false
      );
      const maxCurrentTime = samples.reduce((m, s) => Math.max(m, s?.currentTime ?? 0), 0);
      const progressed = maxCurrentTime > 0;
      const peakReadyState = samples.reduce((m, s) => Math.max(m, Number(s?.readyState) || 0), 0);

      call.verdict = {
        reason,
        SIGNALING_OK: answered,
        ICE_OK: iceOk,
        REMOTE_TRACK_OK: trackOk,
        MEDIA_ARRIVING: trackOk && trackUnmuted,
        ELEMENT_RENDERING: rendered,
        AUDIO_PROGRESSED: progressed,
        AUDIBLE: rendered && progressed && trackOk,
        // Retained for reference; neither is sufficient on its own.
        AUDIO_PLAYING_OK: rendered && progressed,
        peakReadyState,
        maxCurrentTime: Number(maxCurrentTime.toFixed(3)),
        playCalls: playAttempts.length,
        playRejected: rejected.map((e) => ({ name: e.rejectionName, message: e.rejectionMessage })),
        // play() never attempted because el.paused was already false — the
        // classic silent-call signature: not paused, but nothing rendering.
        playSkippedNotPaused: skipped.length,
        ringbackEverStarted: evs.some((e) => e.event === "ringback:start"),
        ringbackStillPlaying: Boolean(this.ringbackPlaying),
        finalAudio: call.audioMain,
        events: evs.length,
      };
      return call.verdict;
    } catch {
      return null;
    }
  }

  /** Whole diagnostic history, oldest call first. */
  getDiagnostics() {
    try {
      return {
        summary: this.diag.calls.map((c) => ({ id: c.id, direction: c.direction, ...c.verdict })),
        calls: this.diag.calls,
      };
    } catch {
      return { summary: [], calls: [] };
    }
  }



  _ensureAudio(slot) {
    const key = slot === "conf" ? "confAudio" : "remoteAudio";
    if (this[key]) return this[key];
    try {
      const el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      el.style.display = "none";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
      this[key] = el;
      this._diagHookAudio(el, slot);
      this._diag("audio:element-created", this._diagAudio(el, "created", slot));
    } catch {
      this[key] = null;
    }
    return this[key];
  }

  _play(el) {
    if (!el) return;
    try {
      // Rendering is the only state that justifies skipping play(). Gating on
      // `el.paused` alone is unsafe: after sip.js assigns srcObject it calls
      // mediaElement.load() (which resets to HAVE_NOTHING but leaves
      // paused=false), so a freshly-loaded element can be "not paused" while
      // nothing is rendering — the classic silent-call fingerprint.
      const rendering =
        !el.paused && Number(el.readyState) >= 2 && el.currentTime > 0 && !el.ended;
      if (!rendering) {
        const p = el.play();
        this._diag("play()", { attempted: true, ...this._diagAudio(el, "play():called") });
        if (p && typeof p.then === "function") {
          p.then(
            () => this._diag("play()", { attempted: true, resolved: true, ...this._diagAudio(el, "play():resolved") }),
            (err) => {
              // Never swallow: a rejected play() against a fresh stream is the
              // difference between an audible and a silent call, so it is
              // recorded, logged, and offered for the UI to react to.
              this.lastPlayError = { name: err?.name, message: err?.message };
              if (typeof console !== "undefined" && typeof console.warn === "function") {
                console.warn(`browserPhone: audio playback did not start: ${err?.name}: ${err?.message}`);
              }
              this._diag("play()", {
                attempted: true,
                resolved: false,
                rejectionName: err?.name,
                rejectionMessage: err?.message,
                ...this._diagAudio(el, "play():rejected"),
              });
            }
          );
        }
      } else {
        this._diag("play()", {
          attempted: false,
          reason: "already rendering, play() not needed",
          ...this._diagAudio(el, "play():already-rendering"),
        });
      }
    } catch (err) {
      this.lastPlayError = { name: err?.name, message: err?.message };
      this._diag("play()", { attempted: true, resolved: false, threw: true, rejectionName: err?.name });
    }
  }

  _attachAudio(slot, stream) {
    const el = this._ensureAudio(slot);
    this._diag("_attachAudio", {
      slot,
      streamProvided: Boolean(stream),
      streamId: stream?.id ?? null,
      remoteStreamId: slot === "main" ? this.user?.remoteMediaStream?.id ?? null : null,
      ...this._diagAudio(el, "_attachAudio:entry", slot),
    });
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      this._diag("srcObject", { slot, action: "assigned", ...this._diagAudio(el, "srcObject:assigned", slot) });
    } else {
      this._diag("srcObject", { slot, action: "already-equal", ...this._diagAudio(el, "srcObject:already-equal", slot) });
    }
    this._play(el);
  }

  _detachAudio(slot) {
    const el = slot === "conf" ? this.confAudio : this.remoteAudio;
    if (!el) return;
    try {
      this._diag("_detachAudio", { slot, ...this._diagAudio(el, "_detachAudio:entry", slot) });
      el.pause();
      el.srcObject = null;
      this._diag("_detachAudio", { slot, ...this._diagAudio(el, "_detachAudio:done", slot) });
    } catch {
      // ignore
    }
  }


  _ringbackContext() {
    if (this._audioCtx) return this._audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      RINGBACK_TONES_HZ.forEach((hz, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = hz;
        const partial = ctx.createGain();
        partial.gain.value = RINGBACK_MIX[i] ?? 1;
        osc.connect(partial);
        partial.connect(gain);
        osc.start();
      });
      this._audioCtx = ctx;
      this._ringbackGain = gain;
    } catch {
      this._audioCtx = null;
      this._ringbackGain = null;
    }
    return this._audioCtx;
  }

  _startRingback() {
    if (this.ringbackPlaying) return;
    const ctx = this._ringbackContext();
    if (!ctx || !this._ringbackGain) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    this._diag("ringback:start", {
      ctxState: ctx.state,
      sampleRate: ctx.sampleRate,
      // Captured so a future silent call can be checked against the theory
      // that an open AudioContext is stealing the output device from the
      // remote <audio> element. It should not, but it should be measured.
      ctxBaseLatency: ctx.baseLatency ?? null,
      outputDeviceCount: typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices
        ? "(see devices event)"
        : "unavailable",
    });

    const now = ctx.currentTime;
    const period = RINGBACK_BEEP_SEC + RINGBACK_GAP_SEC;
    const cycles = Math.ceil(RINGBACK_MAX_SEC / period);
    const g = this._ringbackGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    for (let i = 0; i < cycles; i += 1) {
      const on = now + i * period;
      const off = on + RINGBACK_BEEP_SEC;
      g.setValueAtTime(0, on);
      g.linearRampToValueAtTime(RINGBACK_VOLUME, on + RINGBACK_EDGE_SEC);
      g.setValueAtTime(RINGBACK_VOLUME, off);
      g.linearRampToValueAtTime(0, off + RINGBACK_EDGE_SEC);
    }
    this.ringbackPlaying = true;
  }

  _stopRingback() {
    const wasPlaying = this.ringbackPlaying;
    this.ringbackPlaying = false;
    const ctx = this._audioCtx;
    const gain = this._ringbackGain;
    this._diag("ringback:stop", {
      wasPlaying,
      ctxState: ctx?.state ?? null,
      gainValue: gain?.gain?.value ?? null,
      // Conversation audio must never be muted just because ringback stopped.
      remoteAudioMuted: this.remoteAudio?.muted ?? null,
      remoteAudioVolume: this.remoteAudio?.volume ?? null,
      remoteAudioPaused: this.remoteAudio?.paused ?? null,
    });
    if (!ctx || !gain) return;
    try {
      const now = ctx.currentTime;
      const g = gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + RINGBACK_EDGE_SEC);
    } catch {
      // Context already torn down.
    }
  }

  _cleanupRingback() {
    this._stopRingback();
    const ctx = this._audioCtx;
    this._audioCtx = null;
    this._ringbackGain = null;
    this.ringbackPlaying = false;
    if (ctx) {
      try {
        ctx.close().catch(() => {});
      } catch {
        // Already closed.
      }
    }
  }


  _clearWatchdog() {
    if (this.watchdogTimer) {
      window.clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  _armWatchdog() {
    this._clearWatchdog();
    this.watchdogTimer = window.setTimeout(() => {
      this.watchdogTimer = null;
      if (this.isRegistered) return;
      this._setState({
        state: "error",
        error: "The phone server never confirmed your extension. Ask a supervisor to check it, then reload.",
      });
    }, REGISTER_WATCHDOG_MS);
  }


  _resetCallState(callState) {
    this._stopRingback();
    // Freeze the sampler evidence BEFORE the element is torn down, else a
    // post-reset tick overwrites the last healthy sample with a paused,
    // srcObject-null one and makes an audible call look silent.
    this._diagStopAudioSamplers();
    if (this._diagTrackPoll) {
      window.clearInterval(this._diagTrackPoll);
      this._diagTrackPoll = null;
    }
    this._detachAudio("main");
    this._diag("resetCallState", { callState });
    this._diagVerdict(`reset:${callState || "idle"}`);
    this._setState({
      callState: callState || "idle",
      inCall: false,
      outgoing: false,
      held: false,
      muted: false,
      transferring: null,
      confState: "idle",
      confParticipant: null,
    });
  }


  _makeDelegate(getUser) {
    return {
      onServerConnect: () => {
        if (!this.isRegistered) this._setState({ state: "connecting", error: null });
      },
      onRegistered: () => {
        this._clearWatchdog();
        this._setState({ state: "registered", error: null });
      },
      onUnregistered: () => {
        this._clearWatchdog();
        if (this._state.state !== "idle") this._setState({ state: "connecting", error: null });
      },
      onServerDisconnect: (error) => {
        // The transport dropped underneath us. Every dialog died with it, so
        // drop the call honestly instead of leaving the UI stuck on "live".
        this._clearWatchdog();
        this.conf = null;
        if (this._state.inCall) this._resetCallState("ended");
        else this._stopRingback();
        this._setState({
          state: "error",
          error: error?.message || "Lost the connection to the phone server.",
        });
      },
      onCallCreated: (session) => {
        this._diagHookSession(session);
        this._setState({ inCall: true, held: false, muted: false });
      },
      onCallReceived: () => {
        // Legacy CALL_ORIGINATOR=ami: the server originates and this
        // extension rings. There is no SIP-level ring UI in the CRM, so the
        // leg is answered automatically.
        this._diagBegin("incoming");
        this._setState({
          callState: "ringing",
          outgoing: false,
          inCall: true,
          held: false,
          muted: false,
          transferring: null,
        });
        this._startRingback();
        const user = getUser();
        Promise.resolve()
          .then(() => user?.answer())
          .catch((err) => {
            this._resetCallState("failed");
            this._setState({
              error:
                "Could not answer the incoming call — allow microphone access for this site, then try again.",
            });
            console.warn("[browserPhone] answering an incoming call failed", err);
          });
      },
      onCallAnswered: () => {
        // 200 OK + ACK: the dialog is established and SDP media is negotiated.
        this._stopRingback();
        const user = getUser();
        // onCallCreated is not guaranteed to fire on this sip.js build, so the
        // session is hooked here too; _diagHookSession is idempotent.
        this._diagHookSession(user?.session, "onCallAnswered");
        // Snapshot BEFORE attaching — this is the state the next call inherits,
        // so a stale srcObject or a non-paused element from the previous call
        // is visible right here.
        this._diag("onCallAnswered", this._diagAudio(this.remoteAudio, "onCallAnswered:entry"));
        this._attachAudio("main", user?.remoteMediaStream);
        this._diagStartAudioSampler("main");
        this._diag("onCallAnswered", {
          remoteStreamId: user?.remoteMediaStream?.id ?? null,
          remoteStreamTracks: (user?.remoteMediaStream?.getTracks() || []).map((t) => `${t.kind}:${t.readyState}`),
          ...this._diagAudio(this.remoteAudio, "onCallAnswered:after-attach"),
        });
        this._setState({ callState: "answered", inCall: true, held: false, muted: false });
        this._awaitRemoteMedia(user);
      },
      onCallHangup: () => {
        // A leg rejected before it was ever answered is a failure, not a hangup.
        const prior = this._state.callState;
        this._resetCallState(prior === "failed" ? "failed" : "ended");
      },
      onCallHold: (held) => {
        this._setState({ held: Boolean(held) });
      },
      onCallDTMFReceived: () => {
        // In-band tones are not surfaced in the CRM keypad.
      },
      onMessageReceived: () => {
        // The CRM does not use SIP MESSAGE.
      },
    };
  }


  _awaitRemoteMedia(user) {
    const deadline = Date.now() + 8000;
    const poll = () => {
      if (this._state.callState !== "answered") return;
      const stream = user?.remoteMediaStream;
      const track = stream?.getAudioTracks?.()[0];
      if (stream) {
        this._attachAudio("main", stream);
        if (track) {
          // A track OBJECT is not proof that RTP is arriving. A live-but-muted
          // track means the pipe is open and no packets have landed — and the
          // element at that point is in HAVE_NOTHING. Branding the call
          // "connected" on object existence reports every silent call as good,
          // so "connected" now requires real evidence:
          //   - the element is actually rendering (currentTime advancing), or
          //   - the remote track is unmuted (RTP present), which drives the
          //     same condition a moment later via setupRemoteMedia.
          const el = this.remoteAudio;
          const rendering = el && !el.paused && Number(el.readyState) >= 3 && el.currentTime > 0;
          const rtpArriving = !track.muted;
          if (rtpArriving || rendering) {
            this._diag("poll", {
              outcome: "connected:rtp-or-rendering",
              trackMuted: track.muted,
              trackReadyState: track.readyState,
              rendering,
              ...this._diagAudio(this.remoteAudio, "poll:track-present"),
            });
            this._setState({ callState: "connected", mediaSuspended: false });
            return;
          }
          // RTP not here yet — keep polling instead of declaring success.
          this._diag("poll", {
            outcome: "track-present-but-no-rtp-yet",
            trackMuted: track.muted,
            trackReadyState: track.readyState,
            ...this._diagAudio(this.remoteAudio, "poll:no-rtp"),
          });
        } else {
          this._diag("poll", { outcome: "stream-without-audio-track-yet", ...this._diagAudio(this.remoteAudio, "poll:no-track") });
        }
      } else {
        this._diag("poll", { outcome: "no-remote-stream-yet", ...this._diagAudio(this.remoteAudio, "poll:no-stream") });
      }
      if (Date.now() >= deadline) {
        // Give up on the UI label, but do NOT pretend the call is fine: stay
        // honest on "answered" and flag it so the UI can warn about silence
        // instead of showing a connected call with no audio.
        this._diag("poll", { outcome: "DEADLINE-EXCEEDED-mediaSuspended", ...this._diagAudio(this.remoteAudio, "poll:deadline") });
        this._setState({ mediaSuspended: true });
        this._diagVerdict("awaitRemoteMedia:deadline");
        return;
      }
      window.setTimeout(poll, 250);
    };
    this._diag("awaitRemoteMedia", { deadlineMs: 8000 });
    window.setTimeout(poll, 250);
  }

  _newSimpleUser({ delegate, audioSlot = "main" } = {}) {
    const wsServer = this._wsServer;
    const aor = `sip:${this.cred.username}@${this.cred.host}`;
    return new SimpleUser(wsServer, {
      aor,
      delegate: delegate || this._makeDelegate(() => this.user),
      media: {
        constraints: { audio: true, video: false },
        remote: { audio: this._ensureAudio(audioSlot) },
      },
      registererOptions: { expires: REGISTER_EXPIRES_SEC },
      userAgentOptions: {
        uri: UserAgent.makeURI(aor),
        // The extension's own SIP credentials are pre-seeded so the very first
        // REGISTER/INVITE is answered by the PBX's digest challenge instead of
        // bouncing once and retrying.
        authorizationUsername: this.cred.username,
        authorizationPassword: this.cred.password,
        // Without this the socket sits idle and the PBX stops delivering
        // inbound INVITEs to a tab that has been open a while.
        transportOptions: { server: wsServer, keepAliveInterval: KEEPALIVE_INTERVAL_SEC },
        logLevel: "warn",
      },
    });
  }

  async connect(creds = {}) {
    this._leases += 1;
    try {
      return await this._ensureConnected(creds);
    } catch (err) {
      // Never strand a lease on a phone that is not up, or the last provider to
      // unmount could not bring it down.
      this._releaseLease();
      throw err;
    }
  }

  async _ensureConnected({ wsServer, username, extension, password, domain } = {}) {
    // The registrar domain is authoritative when the server sends one — the WSS
    // host is only a fallback, since a proxy can front the socket on a
    // different hostname than the SIP domain the PBX expects.
    const host = String(domain || "").trim() || this._uriHost(wsServer);
    if (!wsServer || !username || !host) {
      const error = "Your softphone is not provisioned — ask a supervisor to set up your extension.";
      this._setState({ state: "error", error });
      throw new Error(error);
    }
    // Already up (or already booting) — never stack two transports. The lease
    // taken by connect() is honoured; only the transport work is skipped.
    if (this.user) {
      if (this._state.state !== "error") return;
      // A previous attempt failed but left its transport behind — clear it out
      // so a retry does not end up with two WebSockets fighting over one
      // extension.
      const stale = this.user;
      this.user = null;
      await this._teardownUsers([stale]);
    }

    this.cred = {
      host,
      username: String(username),
      password: String(password || ""),
      extension: extension || username,
    };
    this._wsServer = wsServer;
    this._setState({ state: "connecting", error: null, extension: this.cred.extension });
    this._armWatchdog();

    try {
      this.user = this._newSimpleUser();
      await this.user.connect();
      // register() resolves on send; onRegistered() flips state to `registered`.
      await this.user.register();
    } catch (err) {
      this._clearWatchdog();
      const error = this._sipError(err);
      this._setState({ state: "error", error });
      await this._teardownUsers([this.user]);
      this.user = null;
      throw new Error(error);
    }
  }

  /** Drop one lease. True when the phone has no owner left and must go down. */
  _releaseLease() {
    if (this._leases > 0) this._leases -= 1;
    return this._leases === 0;
  }


  async disconnect({ quiet = false } = {}) {
    // Another provider is still using this phone — leave it exactly as it is.
    if (!this._releaseLease()) return;

    this._clearWatchdog();
    this._stopRingback();
    this._cleanupRingback();

    const users = [this.user, this.conf].filter(Boolean);
    this.user = null;
    this.conf = null;
    await this._teardownUsers(users);
    this.cred = null;
    this._wsServer = null;

    this._detachAudio("main");
    this._detachAudio("conf");
    this.confAudio = null;
    if (this.remoteAudio?.parentNode) {
      try {
        this.remoteAudio.remove();
      } catch {
        // ignore
      }
    }
    this.remoteAudio = null;

    this._setState(
      {
        state: "idle",
        error: null,
        inCall: false,
        callState: "idle",
        outgoing: false,
        mediaSuspended: false,
        held: false,
        muted: false,
        confState: "idle",
        confParticipant: null,
        transferring: null,
        extension: null,
      },
      { silent: quiet }
    );
  }

  /** Hang up every leg and stop the transport, swallowing teardown noise. */
  async _teardownUsers(users) {
    await Promise.all(
      users.map(async (u) => {
        try {
          if (u.session) await u.hangup();
        } catch {
          // Dialog already gone — nothing to send a BYE to.
        }
        try {
          await u.unregister();
        } catch {
          // Transport already down.
        }
        try {
          await u.disconnect();
        } catch {
          // Transport already down.
        }
      })
    );
  }

  async dial(target) {
    const user = this.user;
    if (!user) throw new Error("The softphone is not connected yet.");
    if (this._state.inCall) throw new Error("A call is already live on this phone.");

    const destination = this._dialTarget(target);
    if (!destination) throw new Error("Enter a number to dial.");

    // Opened before any state change so the very first event of every call —
    // including the srcObject the PREVIOUS call left behind — is captured.
    this._diagBegin("outgoing", { destination });
    this._diag("dial", {
      destination,
      targetElementExists: Boolean(this.remoteAudio),
      ...this._diagAudio(this.remoteAudio, "dial:inherited-from-previous-call"),
    });
    this._setState({
      callState: "outgoing",
      outgoing: true,
      inCall: true,
      held: false,
      muted: false,
      error: null,
      transferring: null,
    });
    this._startRingback();

    try {
      await user.call(destination, undefined, {
        requestDelegate: {
          // 18x from the far end — it is genuinely ringing.
          onProgress: () => {
            if (this._state.callState === "outgoing") this._setState({ callState: "ringing" });
          },
          // A final non-2xx is the PBX refusing the call; report it as failed
          // rather than leaving it ringing until it times out.
          onReject: (res) => this._failCall(res),
          onRedirect: (res) => this._failCall(res),
        },
      });
    } catch (err) {
      const error = this._sipError(err);
      this._resetCallState("failed");
      this._setState({ error });
      throw new Error(error);
    }
  }

  _failCall(res) {
    if (this._state.callState === "ended" || this._state.callState === "idle") return;
    const status = res?.statusCode;
    const error =
      status === 603
        ? "The student declined the call."
        : status === 486
          ? "The student's line is busy."
          : status === 404
            ? "That number is not reachable."
            : status
              ? `The call was rejected by the phone server (SIP ${status}).`
              : "The call was rejected by the phone server.";
    this._resetCallState("failed");
    this._setState({ error });
  }


  async hangup() {
    this._stopRingback();
    await this._dropConference();

    const user = this.user;
    if (!user || !user.session) {
      // No SIP leg to tear down — just make sure the UI is not left live.
      if (this._state.inCall || this._state.callState !== "idle") this._resetCallState("ended");
      return;
    }
    try {
      await user.hangup();
    } catch (err) {
      console.warn("[browserPhone] BYE failed; the SIP leg will drop with the transport.", err);
      this._resetCallState("ended");
    }
  }

  async dtmf(tone) {
    const key = String(tone ?? "").trim();
    if (!DTMF_TONE.test(key)) return;
    try {
      if (!this.user?.session) return;
      await this.user.sendDTMF(key.toUpperCase());
    } catch {
      // Tone not delivered — the call itself is unaffected.
    }
  }

  async toggleHold() {
    if (!this.user?.session) throw new Error("There is no live call to hold.");
    if (this._state.held) await this.user.unhold();
    else await this.user.hold();
  }

  async toggleMute() {
    if (!this.user?.session) throw new Error("There is no live call to mute.");
    const next = !this._state.muted;
    if (next) await this.user.mute();
    else await this.user.unmute();
    this._setState({ muted: next });
  }


  async transfer(target) {
    const session = this.user?.session;
    if (!session) throw new Error("There is no live call to transfer.");

    const uri = this._sipUri(target);
    if (!uri) throw new Error("Enter a number or SIP address to transfer to.");

    this._setState({ transferring: String(target).trim() });
    try {
      await session.refer(uri);
    } catch (err) {
      this._setState({ transferring: null });
      throw new Error(this._sipError(err));
    }
    // The REFER transferred the call away — this leg's job is done. The PBX
    // sends the BYE, but do not wait on it to leave the CRM in a sane state.
    this._resetCallState("ended");
  }

  async conferenceAdd(target) {
    if (!this.user || !this.cred) throw new Error("The softphone is not connected yet.");
    if (!this._state.inCall) throw new Error("There is no live call to add anyone to.");
    if (this.conf) throw new Error("A participant is already on the call.");

    const uri = this._sipUri(target);
    if (!uri) throw new Error("Enter a number to add to the call.");

    const label = String(target).trim();
    let participant = null;
    const confDelegate = {
      onCallAnswered: () => {
        this._attachAudio("conf", participant?.remoteMediaStream);
        this._setState({ confState: "active" });
      },
      onCallHangup: () => this._setState({ confState: "idle", confParticipant: null }),
    };
    participant = this._newSimpleUser({ delegate: confDelegate, audioSlot: "conf" });

    this.conf = participant;
    this._setState({ confState: "dialing", confParticipant: label });

    try {
      await participant.connect();
      // A STRING, not the URI object: SimpleUser.call re-parses its target with
      // UserAgent.makeURI, and the URI grammar parser only accepts strings —
      // handed a URI it returns undefined and the INVITE never goes out.
      await participant.call(uri.toString());
    } catch (err) {
      await this._dropConference();
      throw new Error(this._sipError(err));
    }
  }

  /** Hang up the conference leg, if there is one. Never throws. */
  async _dropConference() {
    const participant = this.conf;
    if (!participant) return;
    this.conf = null;
    this._setState({ confState: "idle", confParticipant: null });
    this._detachAudio("conf");
    try {
      if (participant.session) await participant.hangup();
    } catch {
      // Dialog already gone.
    }
    try {
      await participant.disconnect();
    } catch {
      // Transport already down.
    }
  }

  async conferenceDrop() {
    await this._dropConference();
  }
}

export const browserPhone = new BrowserPhone();
