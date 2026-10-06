const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Meta Graph API version used for ALL WhatsApp Business Platform Graph calls
// (metadata retrieval + the direct template-message send path). Configurable
// via WHATSAPP_GRAPH_API_VERSION; defaults to a supported, non-deprecated
// version rather than the historical v19.0 hardcode.
const WHATSAPP_GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';
const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;
const SIP_DOMAIN = (process.env.SIP_DOMAIN || 'sip.grcti.com').trim();
const SIP_WSS_URL = (process.env.SIP_WS_SERVER || 'wss://sip.grcti.com/ws').trim();
const FREEPBX_PROVISIONING_URL = (process.env.FREEPBX_PROVISIONING_URL || 'https://sip.grcti.com/provisioning').trim();
const FREEPBX_PROVISIONING_TOKEN = (process.env.FREEPBX_PROVISIONING_TOKEN || '').trim();
// Shared OTP sign-in code. Enabled in EVERY environment (production
// included) whenever a code is set — the sign-in screen is OTP-only, so
// gating this to NODE_ENV=development left production with no way to log in.
// OTP_CODE is the canonical name; DEV_OTP is kept as a legacy alias so
// existing deployments keep working. Clear/remove both to disable OTP.
const OTP_CODE = (process.env.OTP_CODE || process.env.DEV_OTP || '').trim();
const OTP_ENABLED = hasValue(OTP_CODE);

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tasa_crm',
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-super-secret-tasa-crm',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  sharedOtp: {
    enabled: OTP_ENABLED,
    code: OTP_ENABLED ? OTP_CODE : '',
  },
  referralBaseUrl: process.env.REFERRAL_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5173',
  // Canonical business timezone for all "today", daily aggregation and date
  // bucketing. Every report/KPI module must use this single value so that
  // User Management, Reports, Dashboard and Agent Workspace agree.
  // It is also the calendar day the RNR daily cap (services/rnr.service.js)
  // resets on — there is no hour-based RNR reappearance window.
  businessTimezone: process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata',
  // WhatsApp Business Platform (Meta Cloud API) — outbound foundation.
  // Empty by default; credentials live in server/.env and are never committed.
  // NOTE: no sending/webhooks are implemented yet — this is config scaffolding
  // for the existing company WhatsApp number's outbound messaging.
  whatsapp: {
    accessToken:   process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    appId:         process.env.WHATSAPP_APP_ID || '',
    // Company display WhatsApp business number (the "from" number, e.g. +91...).
    businessPhone: process.env.WHATSAPP_BUSINESS_PHONE || '',
    // Company/brand name used as the `company_name` template variable when no
    // Setting('company_name') exists. Overridable per-company at runtime.
    companyName:   process.env.WHATSAPP_COMPANY_NAME || 'TASA',
    // Meta Graph API version for all WABA Graph calls. v19.0 is fully retired
    // (removed May 21, 2026) — never hardcode it; set WHATSAPP_GRAPH_API_VERSION.
    graphApiVersion: WHATSAPP_GRAPH_API_VERSION,
    graphApiBaseUrl: `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}`,
    isConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
    ),
  },
  // GR Study Abroad WhatsApp Template API (external provider).
  // The API key is server-only (X-API-Key header) and is NEVER exposed to the
  // frontend; the browser only talks to the TASA /api/whatsapp/* endpoints.
  whatsappTemplate: {
    url:      process.env.WHATSAPP_TEMPLATE_API_URL || '',
    apiKey:   process.env.WHATSAPP_TEMPLATE_API_KEY || '',
    org:      process.env.WHATSAPP_TEMPLATE_ORG || 'gr_study',
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
    isConfigured: Boolean(
      process.env.WHATSAPP_TEMPLATE_API_URL && process.env.WHATSAPP_TEMPLATE_API_KEY
    ),
  },
  freepbx: {
    provisioningUrl: FREEPBX_PROVISIONING_URL,
    token: FREEPBX_PROVISIONING_TOKEN,
    domain: SIP_DOMAIN,
    wssUrl: SIP_WSS_URL,
    timeoutMs: parseInt(process.env.FREEPBX_PROVISIONING_TIMEOUT_MS, 10) || 10000,
    isConfigured: hasValue(FREEPBX_PROVISIONING_URL) && hasValue(FREEPBX_PROVISIONING_TOKEN),
  },
  // Telephony — browser WebRTC/PJSIP (WSS) origination, optional Asterisk AMI.
  //
  // Outbound calls are originated by the AGENT'S OWN BROWSER SOFTPHONE over
  // WSS: the browser REGISTERs its provisioned PJSIP extension, then dials the
  // student number as a SIP INVITE. The TASA Express backend only validates
  // and persists the Call record and stores the client-reported lifecycle —
  // it never needs to reach the PBX to place a call.
  //
  // `CALL_ORIGINATOR=ami` restores the legacy server-side flow (AMI
  // `Originate` rings PJSIP/<agent ext> and the `gr-cloud-calling` dialplan
  // dials the student). It needs AMI_HOST/AMI_USER/AMI_SECRET and a
  // TCP-reachable manager port; the default is 'browser'.
  //
  // The browser registers its extension over `sip.wsServer` (web
  // socket://<host>:<port>/ws). SIP passwords are PER-AGENT (User.sipPassword
  // served by GET /api/calls/sip-config to the owning agent only);
  // `sip.password` is the optional fallback for a single shared registration.
  telephony: {
    // 'browser' (default) = the agent's SIP.js softphone dials the student.
    // 'ami' = the server originates/hangs up over Asterisk AMI (legacy).
    originator: ['browser', 'ami'].includes(
      String(process.env.CALL_ORIGINATOR || '').trim().toLowerCase()
    )
      ? String(process.env.CALL_ORIGINATOR).trim().toLowerCase()
      : 'browser',
    // Dialed in front of the stored student number so the browser INVITE hits
    // the same PBX dialplan route the AMI flow used ('0' + digits). Set
    // BROWSER_DIAL_PREFIX= (empty) to dial the stored number as-is.
    browserDialPrefix: hasValue(process.env.BROWSER_DIAL_PREFIX)
      ? process.env.BROWSER_DIAL_PREFIX.trim()
      : '0',
    // Call.provider value written for browser-originated calls.
    browserProvider: 'browser-sip.js',
    sip: {
      server:   process.env.SIP_SERVER || SIP_DOMAIN,
      id:       process.env.SIP_ID || SIP_DOMAIN,
      // Browser WebSocket endpoint on the PBX (e.g. ws://172.16.10.19:8088/ws
      // or wss://host:8089/ws with a CA-signed cert).
      wsServer: SIP_WSS_URL,
      password: process.env.SIP_PASSWORD || '',
    },
    ami: {
      host:            process.env.AMI_HOST || '172.16.10.19',
      port:            parseInt(process.env.AMI_PORT, 10) || 5038,
      user:            process.env.AMI_USER || '',
      secret:          process.env.AMI_SECRET || '',
      agentExtension:  process.env.AMI_EXTENSION || '9999',
      context:         process.env.AMI_CONTEXT || 'gr-cloud-calling',
      // Channel technology for the agent leg. Asterisk 18 = PJSIP (WebRTC).
      // Override with SIP for legacy chan_sip PBXes.
      channelTech:     process.env.AMI_CHANNEL_TECH || 'PJSIP',
      // PBX dialplan knobs consumed by the gr-cloud-calling 's' context as
      // var3 (TRUNK) and var5 (ACCOUNT_PREFIX). Values are PBX-specific —
      // leave empty until configured for this PBX; never hardcode them here.
      trunk:           process.env.TRUNK || '',
      accountPrefix:   process.env.ACCOUNT_PREFIX || '',
      actionTimeoutMs: parseInt(process.env.AMI_TIMEOUT_MS, 10) || 4000,
      keepaliveMs:     parseInt(process.env.KEEPALIVE_MS, 10) || 10000,
      reconnectMs:     parseInt(process.env.RECONNECT_MS, 10) || 2000,
      // Cooldown after an AMI `Authentication failed` Login before the next
      // auth attempt (default 5 minutes — prevents a tight login-retry loop).
      authRetryMs:     parseInt(process.env.AMI_AUTH_RETRY_MS, 10) || 300000,
    },
    // Set ONLY by the AMI credentials — needed for origination ONLY when
    // CALL_ORIGINATOR=ami. Browser origination never reads it.
    isConfigured: Boolean(
      process.env.AMI_HOST &&
      process.env.AMI_USER &&
      process.env.AMI_SECRET
    ),
  },
};
