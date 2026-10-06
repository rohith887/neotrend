const net = require('net');
const { EventEmitter } = require('events');

/* ──────────────────────────────────────────────────────────────────────
   AMI (Asterisk Manager Interface) TCP client — dependency-free.
   ----------------------------------------------------------------------
   Talks to Asterisk Manager over a raw TCP socket (port 5038):
     - frames are `Key: Value` blocks separated by a blank line
     - every `Action` we send carries a unique ActionID and the matching
       response / OriginateResponse event resolves the pending promise
     - unsolicited `Event:` frames are re-emitted so the telephony facade
       can drive the real call lifecycle

   The client owns ONLY the wire protocol. Call correlation (Uniqueid /
   channel / Linkedid / TASA_CALLID) lives in telephony.service.
   ────────────────────────────────────────────────────────────────────── */

const CRLF = '\r\n';
const MAX_RECONNECT_DELAY_MS = 30000;

class AmiClient extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = {
      host: '172.16.10.19',
      port: 5038,
      user: '',
      secret: '',
      actionTimeoutMs: 4000,
      keepaliveMs: 10000,
      reconnectMs: 2000,
      authRetryMs: 300000,
      ...opts,
    };

    this.socket = null;
    this.buffer = '';
    this.connected = false;
    this.authenticated = false;
    this.stopping = false;
    this.seq = 0;
    this.retry = 0;
    this.everReady = false;

    // Readiness cause tracking. `lastFailure` remembers WHY the client is not
    // ready so callers can tell a TCP failure apart from a rejected Login:
    //   { kind: 'connect', message }  → TCP connection could not be made
    //   { kind: 'auth',    message }  → TCP ok, but AMI Login was rejected
    //   null                          → no known failure (still connecting /
    //                                   reconnecting / idle)
    // Cleared on the next successful Login, so the state self-heals.
    this.lastFailure = null;
    this.lastError = null; // last raw internal error message (server logging)
    this.connecting = false;

    // Auth cooldown: after an `Authentication failed` Login rejection we back
    // off authRetryMs (default 5 min, configurable via AMI_AUTH_RETRY_MS)
    // instead of running the normal reconnect backoff — so a wrong credential
    // can never produce a tight login-retry loop. `authCooldownUntil` is a
    // wall-clock timestamp; `authTimer` fires the single retry attempt when
    // it expires.
    this.authCooldownUntil = 0;
    this.authTimer = null;

    // ActionID → { resolve, reject, timer }
    this.pending = new Map();
    this.keepaliveTimer = null;
    this.reconnectTimer = null;
    this.lastActivityAt = 0;

    // AUTH/ERROR HARDENING: EventEmitter THROWS when an `error` event has no
    // listener — which would crash the whole Node/Express process on a bad
    // AMI login. This bare fallback listener guarantees the socket teardown +
    // reconnect loop keeps running no matter who consumes this client; the
    // real (logging) listener lives in the telephony facade.
    this.on('error', function noopAmiErrorGuard() {});
  }

  get isReady() {
    return this.connected && this.authenticated;
  }

  /**
   * Four-state readiness used verbatim by the API error messages:
   *   AMI_READY        authenticated + connected → Originate/Hangup work
   *   AMI_AUTH_FAILED  TCP ok, Login rejected     → check AMI_USER/AMI_SECRET
   *   AMI_DISCONNECTED TCP could not be established
   *   AMI_NOT_READY    reconnect/auth still in progress
   * An `auth` failure is remembered until a login finally succeeds, so
   * repeated reconnects report the true cause instead of "offline".
   */
  get readiness() {
    if (this.connected && this.authenticated) {
      return { state: 'AMI_READY', message: 'Authenticated and ready.' };
    }
    if (this.lastFailure && this.lastFailure.kind === 'auth') {
      return {
        state: 'AMI_AUTH_FAILED',
        message: 'Asterisk AMI authentication failed. Check AMI_USER and AMI_SECRET.',
      };
    }
    if (this.lastFailure && this.lastFailure.kind === 'connect') {
      return { state: 'AMI_DISCONNECTED', message: 'Unable to connect to Asterisk AMI.' };
    }
    return { state: 'AMI_NOT_READY', message: 'Asterisk AMI is not ready.' };
  }

  getStatus() {
    const r = this.readiness;
    return {
      configured: Boolean(this.opts.host && this.opts.user && this.opts.secret),
      connected: this.connected,
      authenticated: this.authenticated,
      readiness: r.state,
      retries: this.retry,
      lastError: this.lastError || null,
      host: this.opts.host,
      port: this.opts.port,
    };
  }

  /** Begin the connect → login → keepalive loop (auto-reconnects forever). */
  start() {
    this.stopping = false;
    this.retry = 0;
    // A fresh start always attempts immediately — clears any prior cooldown.
    this.authCooldownUntil = 0;
    clearTimeout(this.authTimer);
    this.authTimer = null;
    clearTimeout(this.reconnectTimer);
    this._connect();
    return this;
  }

  /** Graceful shutdown: Logoff + close socket + reject in-flight actions. */
  stop() {
    this.stopping = true;
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    clearTimeout(this.authTimer);
    this.authTimer = null;
    this.authCooldownUntil = 0;

    if (this.socket) {
      try {
        this.socket.write(
          `Action: Logoff${CRLF}ActionID: tasa-logoff-${Date.now()}${CRLF}${CRLF}`,
          'utf8'
        );
      } catch { /* socket already dead */ }
      try { this.socket.destroy(); } catch { /* already destroyed */ }
    }
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this._rejectAll(new Error('AMI client stopped'));
    this.emit('stopped');
    return this;
  }

  /* ── Wire primitives ─────────────────────────────────────────────── */

  /**
   * Send an AMI action and resolve with the matching response.
   * Resolves on a plain `Response:` frame OR an `OriginateResponse` event
   * carrying the same ActionID (older Asterisk versions answer an async
   * Originate with the event directly).
   */
  action(name, params = {}) {
    return new Promise((resolve, reject) => {
      const sock = this.socket;
      if (!sock || sock.destroyed) {
        reject(new Error('AMI not connected'));
        return;
      }
      // Allow callers to pin the ActionID (Hathway C2C uses the correlation ID
      // as the ActionID so Asterisk can echo it back on OriginateResponse).
      const { ActionID: explicitActionId, ...restParams } = params || {};
      const actionId = explicitActionId || `tasa-${name.toLowerCase()}-${process.pid}-${++this.seq}`;
      const lines = [`Action: ${name}`, `ActionID: ${actionId}`];
      for (const [key, value] of Object.entries(restParams)) {
        lines.push(`${key}: ${String(value).replace(/[\r\n]/g, ' ')}`);
      }
      const payload = lines.join(CRLF) + CRLF + CRLF;

      const timer = setTimeout(() => {
        this.pending.delete(actionId);
        reject(new Error(`AMI action "${name}" timed out after ${this.opts.actionTimeoutMs}ms`));
      }, this.opts.actionTimeoutMs);

      this.pending.set(actionId, { resolve, reject, timer, name });

      try {
        sock.write(payload, 'utf8');
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(actionId);
        reject(err);
      }
    });
  }

  /* ── Connection lifecycle ────────────────────────────────────────── */

  _connect() {
    if (this.stopping) return;
    // Never open a fresh socket while the post-auth-failure cooldown is still
    // running — only the cooldown timer may initiate a connect again.
    if (this.authCooldownUntil > Date.now()) return;

    this.connecting = true;
    const sock = net.createConnection({ host: this.opts.host, port: this.opts.port });
    this.socket = sock;
    this.buffer = '';
    this.connected = false;
    this.authenticated = false;
    sock.setNoDelay(true);
    sock.setKeepAlive(true);

    sock.on('connect', () => {
      this.connecting = false;
      this.connected = true;
      this._login();
    });

    sock.on('data', (chunk) => this._onData(chunk));
    sock.on('error', (err) => {
      // A connect-phase error (ECONNREFUSED / EHOSTUNREACH / ETIMEDOUT…)
      // means the TCP socket itself could not be established → AMI_DISCONNECTED.
      // Record the cause + log it server-side; the ensuing 'close' drives the
      // reconnect loop, so the Express process stays up.
      if (this.connecting) {
        const message = String(err && err.message ? err.message : 'connection error');
        this.lastFailure = { kind: 'connect', message };
        this.lastError = message;
        this.emit('error', new Error(`AMI connection failed: ${message}`));
      }
    });
    sock.on('close', () => this._onClose());
    sock.on('timeout', () => {
      try { sock.destroy(); } catch { /* ignore */ }
    });
  }

  _login() {
    this.action('Login', {
      Username: this.opts.user,
      Secret: this.opts.secret,
      Events: 'on',
    }).then((resp) => {
      const ok =
        resp &&
        resp.Response === 'Success' &&
        String(resp.Message || '').toLowerCase().includes('authentication accepted');
      if (!ok) {
        const msg = resp && resp.Message ? String(resp.Message) : 'authentication rejected';
        // TCP connected but Login was refused → AMI_AUTH_FAILED (not "offline")
        // and, crucially, enter the auth cooldown so we do NOT hammer the
        // manager with a new Login every few seconds.
        this._enterAuthCooldown(msg);
        return;
      }
      this.authenticated = true;
      // A successful login self-heals the readiness state and lifts cooldown.
      this.lastFailure = null;
      this.lastError = null;
      this.retry = 0;
      this.authCooldownUntil = 0;
      clearTimeout(this.authTimer);
      this.authTimer = null;
      this.lastActivityAt = Date.now();
      this._startKeepalive();

      if (!this.everReady) {
        this.everReady = true;
        this.emit('ready');
      } else {
        this.emit('reconnect');
      }
      this.emit('login');
    }).catch((err) => {
      // Login action timed out / socket died mid-action — the cause machine
      // stays untouched (still NOT_READY/prior cause); just log + retry.
      this.lastError = String(err && err.message ? err.message : err);
      this.emit('error', err);
      if (this.socket) { try { this.socket.destroy(); } catch { /* ignore */ } }
    });
  }

/**
 * Auth failure → cooldown. Called only when TCP connected but AMI Login was
 * rejected (`Authentication failed`). Record the cause, emit the single
 * human-readable error (the facade prefixes it with `[ami]`), tear the socket
 * down, and arm a timer that retries auth exactly once after authRetryMs.
 * During the cooldown isReady stays false and readiness reports
 * AMI_AUTH_FAILED, so Start Call keeps returning its clean 503.
 */
_enterAuthCooldown(msg) {
  this.authenticated = false;
  this.lastFailure = { kind: 'auth', message: msg };
  this.lastError = `AMI login rejected: ${msg}`;
  this.retry = 0;

  const ms = Math.max(Number(this.opts.authRetryMs) || 300000, 1000);
  this.authCooldownUntil = Date.now() + ms;
  this.emit('error', Object.assign(new Error(this.cooldownMessage(ms)), {
    code: 'AMI_AUTH_FAILURE',
    authRetryMs: ms,
  }));

  if (this.socket) { try { this.socket.destroy(); } catch { /* ignore */ } }
}

/** "AMI authentication failed; retrying in 5 minutes" (sample output). */
cooldownMessage(ms) {
  if (ms % 60000 === 0) {
    const mins = Math.round(ms / 60000);
    return `AMI authentication failed; retrying in ${mins} minute${mins === 1 ? '' : 's'}`;
  }
  const secs = Math.ceil(ms / 1000);
  return `AMI authentication failed; retrying in ${secs} second${secs === 1 ? '' : 's'}`;
}

_onClose() {
  const justConnected = this.connected;
  this.connected = false;
  this.authenticated = false;
  this.connecting = false;
  this.socket = null;
  clearInterval(this.keepaliveTimer);
  this.keepaliveTimer = null;
  this._rejectAll(new Error('AMI connection closed'));
  this.emit('closed', { reconnecting: justConnected });

  if (!this.stopping) {
    // In the auth cooldown window the ONLY legitimate next step is the single
    // cooldown-timer retry — never the normal reconnect backoff, which would
    // immediately re-login and spool the auth-failure loop again.
    const now = Date.now();
    if (this.authCooldownUntil > now) {
      clearTimeout(this.authTimer);
      this.authTimer = setTimeout(() => this._connect(), this.authCooldownUntil - now);
      return;
    }
    const delay = Math.min(this.opts.reconnectMs * Math.pow(2, this.retry), MAX_RECONNECT_DELAY_MS);
    this.retry += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
    this.emit('retry', { delay, attempt: this.retry });
  }
}

  _startKeepalive() {
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = setInterval(() => {
      if (!this.isReady) return;
      if (Date.now() - this.lastActivityAt > this.opts.keepaliveMs * 3) {
        // Scripted QuickFail for a silent/zombie session — force reconnect.
        try { this.socket.destroy(); } catch { /* ignore */ }
        return;
      }
      this.action('Ping', {}).catch(() => { /* close handler reconnects */ });
    }, this.opts.keepaliveMs);
  }

  _rejectAll(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  /* ── Frame parsing ───────────────────────────────────────────────── */

  _onData(chunk) {
    this.lastActivityAt = Date.now();
    this.buffer += chunk.toString('utf8');

    let end = this._findFrameEnd();
    while (end !== -1) {
      const frame = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end);
      const msg = this._parseFrame(frame);
      if (msg) this._dispatch(msg);
      end = this._findFrameEnd();
    }
  }

  /** Index just past the first frame terminator (\r\n\r\n or \n\n). */
  _findFrameEnd() {
    const cr = this.buffer.indexOf(CRLF + CRLF);
    const lf = this.buffer.indexOf('\n\n');
    if (cr === -1 && lf === -1) return -1;
    if (cr === -1) return lf + 2;
    if (lf === -1) return cr + 4;
    return cr < lf ? cr + 4 : lf + 2;
  }

  /**
   * Parse an AMI frame into an object. Repeated keys (e.g. `Variable:`)
   * become arrays; continuation lines (leading space) append to the
   * previous key's value.
   */
  _parseFrame(frame) {
    const msg = {};
    let lastKey = null;
    const lines = frame.split(/\r\n|\n/);
    for (const line of lines) {
      if (!line || line.length === 0) continue;
      if (line.startsWith(' ') && lastKey) {
        const prev = msg[lastKey];
        msg[lastKey] = Array.isArray(prev) ? prev : `${prev}\n${line.slice(1)}`;
        continue;
      }
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      lastKey = key;
      if (Object.prototype.hasOwnProperty.call(msg, key)) {
        if (Array.isArray(msg[key])) msg[key].push(value);
        else msg[key] = [msg[key], value];
      } else {
        msg[key] = value;
      }
    }
    return msg;
  }

  _dispatch(msg) {
    // Emit every event first — the facade subscribes to the stream.
    if (msg.Event) {
      this.emit('event', msg);
      this.emit(msg.Event.toLowerCase(), msg);
    }

    // Resolve pending actions: plain responses + OriginateResponse.
    const actionId = msg.ActionID;
    if (actionId && this.pending.has(actionId)) {
      const isResponse = Object.prototype.hasOwnProperty.call(msg, 'Response');
      const isOriginateResp = msg.Event === 'OriginateResponse';
      if (isResponse || isOriginateResp) {
        const p = this.pending.get(actionId);
        this.pending.delete(actionId);
        clearTimeout(p.timer);
        p.resolve(msg);
      }
    }
  }
}

/** Convenience factory wired from the TASA config. */
function buildClientFromConfig(config) {
  const amiCfg = config.telephony.ami;
  return new AmiClient({
    host: amiCfg.host,
    port: amiCfg.port,
    user: amiCfg.user,
    secret: amiCfg.secret,
    actionTimeoutMs: amiCfg.actionTimeoutMs,
    keepaliveMs: amiCfg.keepaliveMs,
    reconnectMs: amiCfg.reconnectMs,
    authRetryMs: amiCfg.authRetryMs,
  });
}

module.exports = { AmiClient, buildClientFromConfig };