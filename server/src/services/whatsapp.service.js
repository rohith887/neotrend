const config = require('../config');
const ApiError = require('../utils/ApiError');

// Strip everything that is not a digit.
const stripPhone = (phone) => String(phone || '').replace(/[^\d]/g, '');

// Normalize any input (10-digit core, with/without +91, 0 prefix, spaces,
// dashes) into the E.164 format WhatsApp requires: country code + national
// number, no leading + (e.g. "9198XXXXXXXX").
const normalizeToWhatsApp = (phone) => {
  let digits = stripPhone(phone);
  if (!digits) throw new ApiError(400, 'Recipient phone number is required');

  // Strip a leading 0 (national trunk prefix).
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  // If not already prefixed, assume the config default country code (91 — India).
  // A 10-digit national number becomes 91 + number.
  if (digits.length === 10) digits = `91${digits}`;

  if (!/^91\d{10}$/.test(digits)) {
    throw new ApiError(400, 'Invalid recipient phone number');
  }

  return digits;
};

const ensureConfigured = () => {
  if (!config.whatsapp.isConfigured) {
    throw new ApiError(503, 'WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }
};

// Refactor Meta API error responses into a readable Error.
const parseMetaError = async (res, body, fallback) => {
  const metaMessage = body?.error?.message
    || (body?.error && JSON.stringify(body.error))
    || fallback;
  return new ApiError(502, `WhatsApp API error: ${metaMessage}`);
};

// Send a WhatsApp template message through the company WhatsApp Business number.
// params: [{ name: 'student_name', value: 'Rohit' }, ...] — positional order is
// preserved as declared.
const sendTemplate = async ({ to, templateName, languageCode = 'en_US', parameters = [], headerParameters = [] }) => {
  ensureConfigured();

  const recipient = normalizeToWhatsApp(to);
  const template = {
    name: templateName,
    language: { code: languageCode },
  };

  // Template components. An optional header (e.g. image/document) is sent first,
  // then the body with the free-text variables.
  const components = [];
  if (Array.isArray(headerParameters) && headerParameters.length) {
    components.push({ type: 'header', parameters: headerParameters });
  }
  if (Array.isArray(parameters) && parameters.length) {
    components.push({
      type: 'body',
      parameters: parameters.map((param) =>
        typeof param === 'string' || typeof param === 'number'
          ? { type: 'text', text: String(param) }
          : param
      ),
    });
  }
  if (components.length) template.components = components;

  const url = `${config.whatsapp.graphApiBaseUrl}/${config.whatsapp.phoneNumberId}/messages`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template,
      }),
    });
  } catch (err) {
    throw new ApiError(502, `WhatsApp API unreachable: ${err.message}`);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw await parseMetaError(res, body, `Unexpected error (HTTP ${res.status})`);
  }

  const messageId = body?.messages?.[0]?.id || null;
  return {
    recipient,
    messageId,
    status: 'sent',
  };
};

module.exports = {
  normalizeToWhatsApp,
  sendTemplate,
};
