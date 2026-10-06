const config = require('../config');
const ApiError = require('../utils/ApiError');

// ── Meta Graph API — WhatsApp template metadata retrieval ─────────────────
// The GR Study Abroad provider stays the ONLY sender (send_template.php).
// Meta is used HERE only to read/verify real template metadata:
//   listTemplateMetadata()  → GET /{WABA}/message_templates
//   getTemplateMetadata()   → GET /{message_template_id}  (by ID)
//                           → GET /{WABA}/message_templates?name=…  (by name)
// The access token lives only in config (server env) and is never rendered,
// logged, or returned to the frontend.

// Fields actually supported by Meta on the Message Template node / the
// message_templates edge. Nothing fabricated — Meta only returns these.
const META_FIELDS = [
  'id',
  'name',
  'status',
  'category',
  'language',
  'components',
  'quality_score',
  'message_send_ttl_seconds',
  'previous_category',
].join(',');

// ── Simple in-memory TTL cache (no Redis dependency) ─────────────────────
// The UI loads the catalogue when a dialog opens; without a cache that would
// hit Meta on every open. A short TTL is the safest server-side approach here.
const METADATA_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map();

const cacheGet = (key) => {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
};

const cacheSet = (key, value, ttlMs = METADATA_TTL_MS) => {
  cache.set(key, { value, expires: Date.now() + ttlMs });
};

// Guard — metadata is optional infrastructure; callers decide how to degrade.
const ensureMetaConfigured = () => {
  if (!config.whatsapp.accessToken) {
    throw new ApiError(
      503,
      'Meta WhatsApp metadata is not configured. Set WHATSAPP_ACCESS_TOKEN.'
    );
  }
  if (!config.whatsapp.businessAccountId) {
    throw new ApiError(
      503,
      'Meta WhatsApp metadata is not configured. Set WHATSAPP_BUSINESS_ACCOUNT_ID.'
    );
  }
};

// GET any Graph node/edge with the configured version + Bearer token. The
// access token is used only in the Authorization header — never surfaced.
const graphGet = async ({ path, params = {} }) => {
  ensureMetaConfigured();
  const url = new URL(`${config.whatsapp.graphApiBaseUrl}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  let res;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
      },
    });
  } catch (err) {
    throw new ApiError(502, `Meta Graph API unreachable: ${err.message}`);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const detail = body?.error?.message
      || (body?.error && JSON.stringify(body.error))
      || `Meta Graph API error (HTTP ${res.status})`;
    const status =
      res.status === 401 || res.status === 403 ? 401 : res.status === 404 ? 404 : 502;
    throw new ApiError(status, `Meta Graph API error: ${detail}`);
  }

  return body || {};
};

// List every template on the WhatsApp Business Account.
const listTemplateMetadata = async () => {
  const cached = cacheGet('meta:list');
  if (cached !== undefined) return cached;

  const body = await graphGet({
    path: `${config.whatsapp.businessAccountId}/message_templates`,
    params: { fields: META_FIELDS, limit: 100 },
  });

  const templates = Array.isArray(body.data) ? body.data : [];
  cacheSet('meta:list', templates);
  return templates;
};

// Get one template by its numeric Meta template ID or by its Meta name.
// Returns the real Meta node, or null when there is no match.
const getTemplateMetadata = async (nameOrId) => {
  const value = String(nameOrId || '').trim();
  if (!value) return null;

  const cacheKey = `meta:tpl:${value}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  // Numeric → Meta Message Template node: GET /{message_template_id}
  if (/^\d+$/.test(value)) {
    try {
      const data = await graphGet({
        path: value,
        params: { fields: META_FIELDS },
      });
      const template = data && data.id ? data : null;
      cacheSet(cacheKey, template);
      return template;
    } catch (err) {
      // A clean 404 is a valid "not found" — cache it so we don't hammer Meta.
      if (err instanceof ApiError && err.statusCode === 404) {
        cacheSet(cacheKey, null);
        return null;
      }
      throw err;
    }
  }

  // Otherwise treat it as a template NAME via the message_templates edge.
  const body = await graphGet({
    path: `${config.whatsapp.businessAccountId}/message_templates`,
    params: { fields: META_FIELDS, name: value },
  });

  const matches = Array.isArray(body.data) ? body.data.filter((t) => t.name === value) : [];
  const template = matches[0] || null;
  cacheSet(cacheKey, template);
  return template;
};

// Derive how Meta's positional/named placeholders line up with TASA's
// semantic variables, purely from real Meta component/example data. Never
// fabricates — it only (a) matches {{n}} positions to catalogue variables by
// order, and (b) surfaces any real named parameters Meta returns.
const derivePlaceholders = (meta, catalogVariables) => {
  if (!meta || !Array.isArray(meta.components)) return [];
  const variables = Array.isArray(catalogVariables) ? catalogVariables : [];
  const placeholders = [];

  for (const component of meta.components) {
    if (typeof component !== 'object' || component === null) continue;

    // Named parameters (parameter_format=NAMED) carry real param_name values.
    const examples = component.example || {};
    const namedBody = Array.isArray(examples.body_text_named_params) ? examples.body_text_named_params : [];

    for (const np of namedBody) {
      const idx = placeholders.length;
      placeholders.push({
        position: null,
        variable: variables[idx] || null,
        paramName: np?.param_name || null,
        example: np?.example ?? null,
        componentType: component.type || null,
      });
    }

    // Positional placeholders — body_text is an array of example strings per
    // variable, header_text likewise. Map order 1..n onto the catalogue vars.
    const positional =
      (component.type === 'BODY' && examples.body_text && examples.body_text[0])
        ? examples.body_text[0]
        : (component.type === 'HEADER' && Array.isArray(examples.header_text))
          ? examples.header_text
          : null;

    if (Array.isArray(positional)) {
      positional.forEach((example, i) => {
        placeholders.push({
          position: i + 1,
          variable: variables[i] || null,
          paramName: null,
          example: example ?? null,
          componentType: component.type || null,
        });
      });
    }
  }

  return placeholders;
};

module.exports = {
  derivePlaceholders,
  getTemplateMetadata,
  listTemplateMetadata,
};