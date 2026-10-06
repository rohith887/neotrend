const config = require('../config');
const ApiError = require('../utils/ApiError');

const request = async (payload) => {
  if (!config.freepbx.isConfigured) {
    throw new ApiError(503, 'SIP provisioning is not configured; set FREEPBX_PROVISIONING_TOKEN on the CRM server');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.freepbx.timeoutMs);

  let response;
  try {
    response = await fetch(config.freepbx.provisioningUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.freepbx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(504, 'SIP provisioning request timed out');
    }
    throw new ApiError(502, 'SIP provisioning service is unreachable');
  } finally {
    clearTimeout(timeout);
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 400) {
      throw new ApiError(502, 'SIP provisioning rejected the request');
    }
    if (response.status === 401) {
      throw new ApiError(502, 'SIP provisioning authentication failed; check FREEPBX_PROVISIONING_TOKEN');
    }
    if (response.status === 403) {
      throw new ApiError(502, "SIP provisioning was rejected by the provider's source-IP allowlist");
    }
    if (response.status === 404) {
      throw new ApiError(404, 'SIP extension not found');
    }
    if (response.status === 409) {
      throw new ApiError(409, 'SIP extension already exists');
    }
    throw new ApiError(502, 'SIP provisioning request failed');
  }

  return data;
};

const providerValue = (source, key) => {
  const value = source?.[key];
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim();
};

const createExtension = async ({ name, email, extension }) => {
  const data = await request({
    action: 'create',
    name: String(name || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    ...(extension ? { extension: Number(extension) } : {}),
  });

  const sip = data?.sip && typeof data.sip === 'object' ? data.sip : {};
  const assignedExtension = providerValue(data, 'extension') || providerValue(sip, 'extension');
  const username = providerValue(sip, 'username') || providerValue(data, 'username');
  const password = providerValue(sip, 'password') || providerValue(data, 'password');
  const domain = providerValue(sip, 'domain') || providerValue(data, 'domain');
  const wssUrl =
    providerValue(sip, 'wss_url') ||
    providerValue(sip, 'wssUrl') ||
    providerValue(data, 'wss_url') ||
    providerValue(data, 'wssUrl');

  if (!assignedExtension || !username || !password || !domain || !wssUrl) {
    throw new ApiError(502, 'SIP provisioning returned an incomplete response');
  }

  try {
    const parsedWssUrl = new URL(wssUrl);
    if (!['ws:', 'wss:'].includes(parsedWssUrl.protocol)) throw new Error('Unsupported SIP WebSocket protocol');
  } catch {
    throw new ApiError(502, 'SIP provisioning returned an invalid WSS URL');
  }

  const extensionNumber = Number(assignedExtension);
  if (
    !Number.isSafeInteger(extensionNumber) ||
    extensionNumber < 1000 ||
    extensionNumber > 1999
  ) {
    throw new ApiError(502, 'SIP provisioning returned an extension outside the supported range');
  }

  return {
    extension: extensionNumber,
    username,
    password,
    domain,
    wssUrl,
  };
};

const deleteExtension = async (extension) => {
  try {
    return await request({ action: 'delete', extension: Number(extension) });
  } catch (err) {
    if (err.statusCode === 404) return { status: 'ok', extension: String(extension), missing: true };
    throw err;
  }
};

const getExtensionStatus = async (extension) =>
  request({ action: 'status', extension: Number(extension) });

module.exports = { createExtension, deleteExtension, getExtensionStatus };
