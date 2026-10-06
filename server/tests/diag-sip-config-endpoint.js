/** READ-ONLY: exact payload shape of GET /api/calls/sip-config (no secrets). */
const path = require('path');
const SERVER = path.resolve(__dirname, '..');
const config = require(path.join(SERVER, 'src/config'));
const mongoose = require(path.join(SERVER, 'node_modules/mongoose'));
const User = require(path.join(SERVER, 'src/models/User'));

const redact = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (/password|token|secret/i.test(k)) {
      out[k] = v ? `<present len=${String(v).length}>` : '<empty>';
    } else {
      out[k] = v;
    }
  }
  return out;
};

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const target = await User.findOne({ sipProvisionStatus: 'provisioned' }).select('email');
  const email = target.email;
  const base = `http://localhost:${config.port}/api`;
  console.log('target user:', email, '| api:', base);

  const jpost = async (p, b) => {
    const r = await fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    return { status: r.status, body: await r.json() };
  };

  const reqRes = await jpost('/auth/otp/request', { email });
  const ver = await jpost('/auth/otp/verify', { email, otp: config.devOtp.code });
  // ApiResponse wraps the payload: { success, message, data: { token, user } }.
  const token = ver.body?.data?.token;
  console.log('otp/request →', reqRes.status, JSON.stringify(reqRes.body?.message || reqRes.body));
  console.log('otp/verify  →', ver.status, ver.status === 200 && token ? 'token issued' : JSON.stringify(redact(ver.body)));
  console.log('login ok:', Boolean(token), '| role:', ver.body?.data?.user?.role?.name);

  for (const p of ['/calls/sip-config', '/calls/config']) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(base + p, { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal });
      clearTimeout(timer);
      const text = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
      console.log(`\n=== GET ${p} → ${r.status} ===`);
      if (!parsed) { console.log('NON-JSON BODY:', text.slice(0, 300)); continue; }
      console.log(JSON.stringify(redact(parsed.data), null, 2));
      if (p === '/calls/sip-config') {
        const d = parsed.data || {};
        const ws = String(d.wss_url || '');
        let host = '', port = '', pathName = '', proto = '';
        try {
          const u = new URL(ws);
          proto = u.protocol; host = u.hostname; port = u.port || (u.protocol === 'wss:' ? '443' : '80'); pathName = u.pathname;
        } catch (e) { console.log('wss_url is NOT a valid URL:', e.message); }
        console.log('wss parsed:', JSON.stringify({ proto, host, port, pathName }));
        console.log('aor SIP.js would build: sip:' + d.username + '@' + host);
      }
    } catch (e) {
      console.log(`\n=== GET ${p} FAILED: ${e.name}: ${e.message}`);
    }
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.name, e.message); process.exit(1); });
