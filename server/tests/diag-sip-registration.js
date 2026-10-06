/**
 * READ-ONLY diagnosis. Prints NO secrets: password presence/length only.
 * 1) which agent users have a provisioned SIP endpoint (and from where)
 * 2) what GET /api/calls/sip-config actually returns over HTTP
 */
const path = require('path');
const SERVER = path.resolve(__dirname, '..');
process.chdir(SERVER);
const config = require(path.join(SERVER, 'src/config'));
const mongoose = require(path.join(SERVER, 'node_modules/mongoose'));
const User = require(path.join(SERVER, 'src/models/User'));

const safe = (u) => ({
  email: u.email,
  role: u.role?.name || u.role || '-',
  sipProvisionStatus: u.sipProvisionStatus,
  sipExtension: u.sipExtension,
  sipUsername: u.sipUsername,
  sipDomain: u.sipDomain,
  sipWssUrl: u.sipWssUrl,
  passwordPresent: typeof u.sipPassword === 'string' && u.sipPassword.length > 0,
  passwordLength: typeof u.sipPassword === 'string' ? u.sipPassword.length : 0,
});

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const users = await User.find({}).select('+sipPassword email role sipProvisionStatus sipExtension sipUsername sipDomain sipWssUrl');
  const withSip = users.filter((u) => u.sipProvisionStatus || u.sipExtension || u.sipWssUrl);
  console.log('--- users carrying SIP data ---');
  console.log(JSON.stringify(withSip.map(safe), null, 2));

  const target = withSip.find((u) => u.sipProvisionStatus === 'provisioned' && u.sipPassword);
  if (!target) {
    console.log('NO provisioned user with a password — sip-config would return enabled:false');
    await mongoose.disconnect();
    return;
  }

  // Dev-OTP login for the provisioned agent (dev-only fixed code, never printed).
  const email = target.email;
  const base = `http://127.0.0.1:${config.port}/api`;
  const post = async (p, b) => {
    const r = await fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    return { status: r.status, body: await r.json() };
  };
  const req = await post('/auth/otp/request', { email });
  console.log('--- otp/request ---', req.status, JSON.stringify(req.body?.message || req.body));
  const code = config.devOtp.code;
  const ver = await post('/auth/otp/verify', { email, otp: code });
  console.log('--- otp/verify ---', ver.status, ver.body?.success ? 'token issued' : JSON.stringify(ver.body));
  if (!ver.body?.token) { await mongoose.disconnect(); return; }

  const res = await fetch(`${base}/calls/sip-config`, {
    headers: { Authorization: `Bearer ${ver.body.token}` },
  });
  const payload = await res.json();
  const d = payload.data || {};
  console.log('--- GET /api/calls/sip-config ---', res.status);
  console.log(JSON.stringify({
    enabled: d.enabled,
    username: d.username,
    extension: d.extension,
    domain: d.domain,
    wss_url: d.wss_url,
    origination: d.origination,
    channelTech: d.channelTech,
    passwordPresent: typeof d.password === 'string' && d.password.length > 0,
    passwordLength: typeof d.password === 'string' ? d.password.length : 0,
    cacheControl: res.headers.get('cache-control'),
  }, null, 2));

  const cfgRes = await fetch(`${base}/calls/config`, { headers: { Authorization: `Bearer ${ver.body.token}` } });
  const cfg = (await cfgRes.json()).data || {};
  console.log('--- GET /calls/config ---', cfgRes.status);
  console.log(JSON.stringify({ origination: cfg.origination, amiRequired: cfg.amiRequired, configured: cfg.configured, integrationStatus: cfg.integrationStatus }, null, 2));

  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
