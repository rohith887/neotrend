/**
 * READ-ONLY: does the credential the API hands the browser actually match the
 * one the PBX accepted? Prints booleans only — no secret values.
 */
const path = require('path');
const SERVER = path.resolve(__dirname, '..');
const config = require(path.join(SERVER, 'src/config'));
const mongoose = require(path.join(SERVER, 'node_modules/mongoose'));
const User = require(path.join(SERVER, 'src/models/User'));

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const user = await User.findOne({ sipProvisionStatus: 'provisioned' })
    .select('+sipPassword sipUsername sipExtension sipDomain sipWssUrl email');
  const base = `http://localhost:${config.port}/api`;

  const jpost = async (p, b) => {
    const r = await fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    return r.json();
  };
  await jpost('/auth/otp/request', { email: user.email });
  const ver = await jpost('/auth/otp/verify', { email: user.email, otp: config.devOtp.code });
  const token = ver?.data?.token;
  if (!token) { console.log('login failed:', JSON.stringify(ver).slice(0, 200)); process.exit(1); }

  const r = await fetch(base + '/calls/sip-config', { headers: { Authorization: `Bearer ${token}` } });
  const cfg = (await r.json())?.data || {};

  const eq = (a, b) => typeof a === 'string' && a === String(b);
  console.log('http status              :', r.status);
  console.log('cfg.enabled              :', cfg.enabled);
  console.log('username === db username :', eq(cfg.username, user.sipUsername));
  console.log('extension === db ext     :', eq(cfg.extension, user.sipExtension));
  console.log('domain === db domain     :', eq(cfg.domain, user.sipDomain));
  console.log('wss_url === db wssUrl    :', eq(cfg.wss_url, user.sipWssUrl));
  console.log('password === db password :', eq(cfg.password, user.sipPassword));
  console.log('password non-empty       :', Boolean(cfg.password));
  console.log('password type            :', typeof cfg.password);
  console.log('password matches w/ space:', typeof cfg.password === 'string' && cfg.password.trim() === String(user.sipPassword).trim());
  console.log('cfg keys                 :', Object.keys(cfg).join(','));
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.name, e.message); process.exit(1); });
