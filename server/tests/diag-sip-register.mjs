/**
 * READ-ONLY provider-side diagnosis of the REGISTER attempt.
 * Uses the SAME sip.js version + the same AOR/credentials the browser uses,
 * over the same WSS endpoint. The password is read from the DB and NEVER
 * printed. The registration is unregistered immediately afterwards.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SERVER = path.resolve(process.cwd());
const config = require(path.join(SERVER, 'src/config'));
const mongoose = require(path.join(SERVER, 'node_modules/mongoose'));
const User = require(path.join(SERVER, 'src/models/User'));
const { UserAgent, RegistererState } = await import(
  pathToFileURL(path.join(SERVER, '..', 'client', 'node_modules', 'sip.js', 'lib', 'index.js')).href
);

const user = await (async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  return User.findOne({ sipProvisionStatus: 'provisioned' }).select('+sipPassword sipUsername sipExtension sipDomain sipWssUrl');
})();
if (!user) { console.log('no provisioned user'); process.exit(1); }

const aor = `sip:${user.sipUsername}@${user.sipDomain}`;
const wss = user.sipWssUrl;
console.log('AOR        :', aor);
console.log('WSS        :', wss);
console.log('password   : <present, never printed>');

const ua = new UserAgent({
  uri: UserAgent.makeURI(aor),
  authorizationUsername: String(user.sipUsername),
  authorizationPassword: String(user.sipPassword),
  displayName: `TASA-diag-${user.sipUsername}`,
  transportOptions: { server: wss },
  logConfiguration: false,
  logBuiltinEnabled: false,
  logLevel: 'off',
});

ua.transport.stateChange.addListener((s) => console.log('transport state:', s));

const registerer = new (await import(pathToFileURL(path.join(SERVER, '..', 'client', 'node_modules', 'sip.js', 'lib', 'api', 'registerer.js')).href)).Registerer(ua);

const fail = (err) => {
  console.log('\nREGISTER FAILED');
  console.log('  name    :', err?.name);
  console.log('(' + String(err?.message || err).slice(0, 400) + ')');
  if (err?.response) {
    console.log('  status  :', err.response.statusCode, err.response.reasonPhrase);
    console.log('  headers :', String(err.response.headers || '').replace(/\r\n/g, ' | ').slice(0, 400));
    console.log('  body    :', String(err.response.body || '').slice(0, 300));
  }
  process.exit(0);
};

registerer.stateChange.addListener((state) => {
  console.log('registerer state:', state);
  if (state === RegistererState.Registered) {
    console.log('\nREGISTER ACCEPTED — provider returned 200 OK');
    registerer.unregister().catch(() => {});
    setTimeout(() => { console.log('unregistered'); process.exit(0); }, 500);
  }
});

registerer.register().then(() => {
  console.log('register() resolved');
}).catch(fail);

setTimeout(() => { console.log('\nTIMEOUT: no REGISTER response in 20s'); process.exit(0); }, 20000);
