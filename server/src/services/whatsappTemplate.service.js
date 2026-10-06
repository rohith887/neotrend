const Lead = require('../models/Lead');
const Setting = require('../models/Setting');
const Callback = require('../models/Callback');
const ApiError = require('../utils/ApiError');
const config = require('../config');
const { TEMPLATE_CATALOG, VARIABLE_DEFINITIONS } = require('../config/whatsappTemplates');

// ── Settings-backed lookups (created on demand, no code change needed to
//    point a logical template at a company's real approved template name). ──
const SETTING_KEYS = {
  COMPANY_NAME: 'company_name',
  TEMPLATE_NAME_PREFIX: 'whatsapp_template_name_',
};

const readSettings = async (keys) => {
  const docs = await Setting.find({ key: { $in: keys } }).lean();
  const map = {};
  for (const d of docs) map[d.key] = d.value;
  return map;
};

const findTemplate = (key) => {
  const t = TEMPLATE_CATALOG.find((x) => x.key === key);
  if (!t) throw new ApiError(404, `Unknown WhatsApp template: ${key}`);
  return t;
};

// Format a Date in the canonical business timezone for template text.
// Returns '' for missing/invalid values — never a fabricated time.
const formatBusinessDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('en-GB', {
      timeZone: config.businessTimezone || 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
};

// Resolve a single variable from the resolution context (lead + user + settings).
const resolveVariable = (varKey, ctx) => {
  const lead = ctx.lead || {};
  const user = ctx.user || {};
  const settings = ctx.settings || {};

  switch (varKey) {
    case 'student':
    case 'student_name':
      return String(lead.studentName || '').trim();

    case 'counsellor':
    case 'agent_name':
      return String(user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ')).trim() || '';

    case 'company_name':
      return String(settings[SETTING_KEYS.COMPANY_NAME] || config.whatsapp.companyName || 'TASA').trim();

    case 'requested_time': {
      // Real CRM field: the lead's earliest pending Callback.scheduledAt.
      // No pending callback → blank so the agent supplies it (never invented).
      const cb = ctx.pendingCallback;
      return cb && cb.scheduledAt ? formatBusinessDateTime(cb.scheduledAt) : '';
    }

    case 'document_list': {
      // Lead.DOCUMENT_STATUS = pending | gathering | submitted | verified.
      // "Still require from you" = pending/gathering only — submitted and
      // verified documents are already handed over and must not be listed.
      const STILL_REQUIRED = new Set(['pending', 'gathering']);
      const docs = Array.isArray(lead.documents) ? lead.documents : [];
      return docs
        .filter((d) => d && (d.type || d.name) && STILL_REQUIRED.has(String(d.status || 'pending')))
        .map((d) => String(d.name || d.type || '').trim())
        .filter(Boolean)
        .join(', ')
        .trim();
    }

    case 'course': {
      const appCourse = Array.isArray(lead.applications)
        ? (lead.applications.find((a) => a && a.course) || {}).course || ''
        : '';
      return String(appCourse || '').trim();
    }

    case 'university': {
      const pu = Array.isArray(lead.preferredUniversities) ? lead.preferredUniversities : [];
      const firstUni = pu[0]?.university;
      const uniName = firstUni ? (typeof firstUni === 'object' ? firstUni.institutionName || firstUni.name : firstUni) : '';
      const appUni = Array.isArray(lead.applications) && lead.applications[0]?.university;
      return String(uniName || appUni || '').trim();
    }

    case 'country': {
      const pc = Array.isArray(lead.preferredCountries) ? lead.preferredCountries : [];
      const firstCountry = pc[0]?.country;
      const countryName = firstCountry ? (typeof firstCountry === 'object' ? firstCountry.name || firstCountry.code : firstCountry) : '';
      const appCountry = Array.isArray(lead.applications) && lead.applications[0]?.country;
      return String(countryName || appCountry || '').trim();
    }

    case 'intake':
      return String(lead.intake || '').trim();

    case 'application_id':
      return String(lead.referenceId || '').trim();

    default:
      return '';
  }
};

// Resolve every variable a template references, in declared order.
// `overrides` (optional) lets the caller fix values before preview/send.
const resolveAllVariables = (template, ctx, overrides = {}) => {
  const variables = [];
  const resolved = {};
  for (const key of template.variables) {
    const def = VARIABLE_DEFINITIONS[key];
    const value = String(overrides[key] ?? resolveVariable(key, ctx)).trim();
    resolved[key] = value;
    variables.push({
      key,
      label: def?.label || key,
      hint: def?.hint || '',
      value,
      missing: !value,
    });
  }
  return { variables, resolved };
};

// Render the APPROVED template body (source PDF) with resolved CRM values
// substituted into the positional {{1}}, {{2}}, {{3}} placeholders. The
// approved wording is never altered — only placeholder tokens are replaced.
// Unresolved values render as [Label] so the agent sees exactly which gap
// blocks the send (the send path rejects them with a 422 regardless).
const buildTextPreview = (template, resolved) => {
  const params = template.variables.map((k) => String(resolved[k] ?? '').trim());
  if (!template.body) return params.join(', ');
  return String(template.body).replace(/\{\{(\d+)\}\}/g, (token, n) => {
    const idx = Number(n) - 1;
    const value = params[idx];
    if (value) return value;
    const varKey = template.variables[idx];
    const label = VARIABLE_DEFINITIONS[varKey]?.label || varKey || String(n);
    return `[${label}]`;
  });
};

// Preview — validate, resolve and build a sendable parameter array WITHOUT
// calling the Meta API. Safe to call from the UI repeatedly.
const previewTemplate = async ({ templateKey, leadId, overrides = {} }, user) => {
  const template = findTemplate(templateKey);

  const [lead, settings, pendingCallback] = await Promise.all([
    Lead.findById(leadId).populate('preferredCountries.country', 'name code').populate('preferredUniversities.university', 'institutionName'),
    readSettings([SETTING_KEYS.COMPANY_NAME]),
    Callback.findOne({ lead: leadId, status: 'pending' }).sort({ scheduledAt: 1 }),
  ]);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const ctx = { lead, user, settings, pendingCallback };
  const { variables, resolved } = resolveAllVariables(template, ctx, overrides);
  const missing = variables.filter((v) => v.missing);

  return {
    templateKey: template.key,
    title: template.title,
    description: template.description,
    body: template.body,
    metaName: template.metaName,
    languageCode: template.languageCode,
    recipient: lead.mobile || '',
    fromNumber: config.whatsapp.businessPhone || '',
    variables,
    resolved,
    parameters: template.variables.map((k) => resolved[k]),
    missing,
    ready: missing.length === 0,
    textPreview: buildTextPreview(template, resolved),
  };
};

// Authoritative template name used at send-time: Settings override > catalog.
const resolveMetaName = async (template) => {
  const settings = await readSettings([`${SETTING_KEYS.TEMPLATE_NAME_PREFIX}${template.key}`]);
  return settings[`${SETTING_KEYS.TEMPLATE_NAME_PREFIX}${template.key}`] || template.metaName;
};

// List the catalog for the UI (no secrets, no lead data).
const listTemplates = async () =>
  TEMPLATE_CATALOG.map(({ key, title, description, metaName, languageCode, variables, body }) => ({
    key,
    title,
    description,
    metaName,
    languageCode,
    variables,
    body,
  }));

// Send a template to a lead. Resolves variables, validates required ones,
// then POSTs to the GR Study Abroad WhatsApp Template API. The external API
// URL / API key / org credentials live ONLY in the server env — never exposed
// to the frontend.
const sendTemplateToLead = async ({ templateKey, leadId, overrides = {}, parameters: explicitParameters }, user) => {
  const template = findTemplate(templateKey);

  const [lead, settings, pendingCallback] = await Promise.all([
    Lead.findById(leadId).populate('preferredCountries.country', 'name code').populate('preferredUniversities.university', 'institutionName'),
    readSettings([SETTING_KEYS.COMPANY_NAME]),
    Callback.findOne({ lead: leadId, status: 'pending' }).sort({ scheduledAt: 1 }),
  ]);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!lead.mobile) throw new ApiError(400, 'Lead has no mobile number to message');

  const ctx = { lead, user, settings, pendingCallback };
  const { resolved, variables } = resolveAllVariables(template, ctx, overrides);
  const missing = variables.filter((v) => v.missing);
  if (missing.length) {
    throw new ApiError(
      422,
      `Missing required variables: ${missing.map((v) => v.label).join(', ')}`
    );
  }

  // Caller may pass an explicit ordered parameter array (already previewed);
  // otherwise derive it from the resolved variables in template order.
  // The API is strictly positional — the count MUST match exactly and no
  // value may be undefined/null/empty, or the message would render broken.
  const coerceParam = (p) => {
    if (p === null || p === undefined) return '';
    if (typeof p === 'string') return p.trim();
    if (typeof p === 'number') return String(p);
    if (typeof p === 'object' && typeof p.text === 'string') return p.text.trim();
    return '';
  };

  const raw = explicitParameters && explicitParameters.length
    ? explicitParameters
    : template.variables.map((k) => resolved[k]);

  const parameters = raw.map(coerceParam);

  if (parameters.length !== template.variables.length) {
    throw new ApiError(
      422,
      `Template ${template.key} expects exactly ${template.variables.length} parameters, got ${parameters.length}`
    );
  }

  const empties = [];
  parameters.forEach((value, i) => {
    if (!value) empties.push(VARIABLE_DEFINITIONS[template.variables[i]]?.label || template.variables[i]);
  });
  if (empties.length) {
    throw new ApiError(422, `Missing required variables: ${empties.join(', ')}`);
  }

  const metaName = await resolveMetaName(template);

  return sendTemplateExternal({
    to: lead.mobile,
    template: metaName,
    parameters,
  });
};

// ── GR Study Abroad WhatsApp Template API provider ──────────────────────
// POST https://wa.grssl.com/inikaapi/send_template.php
//   Headers: Content-Type: application/json, X-API-Key: <server env only>
//   Body:    { template, phone, params, org, language }
// Success is HTTP 2xx AND response.status === true.
const parseProviderMessage = (body) =>
  String(body?.message || body?.error || body?.statusMessage || '').trim();

const mapProviderError = (res, body) => {
  const detail = parseProviderMessage(body) || `Unexpected error (HTTP ${res.status})`;
  switch (res.status) {
    case 401:
    case 403:
      return new ApiError(401, `WhatsApp template API key/configuration problem: ${detail}`);
    case 404:
      return new ApiError(404, `WhatsApp template not found or not approved: ${detail}`);
    case 400:
      return new ApiError(400, `Invalid WhatsApp template request: ${detail}`);
    case 405:
      return new ApiError(405, 'WhatsApp template API does not accept this method');
    default:
      return new ApiError(502, `WhatsApp template API failure (HTTP ${res.status}): ${detail}`);
  }
};

// Send a template through the external provider. Never logs the API key and
// returns the provider's message_id / contact_id / to / template for logging.
const sendTemplateExternal = async ({ to, template, parameters = [] }) => {
  const cfg = config.whatsappTemplate;
  if (!cfg.url || !cfg.apiKey) {
    throw new ApiError(
      503,
      'WhatsApp Template API is not configured. Set WHATSAPP_TEMPLATE_API_URL and WHATSAPP_TEMPLATE_API_KEY.'
    );
  }

  let res;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.apiKey,
      },
      body: JSON.stringify({
        template,
        phone: to,
        params: parameters,
        org: cfg.org,
        language: cfg.language,
      }),
    });
  } catch (err) {
    throw new ApiError(502, `WhatsApp template API unreachable: ${err.message}`);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) throw mapProviderError(res, body);
  if (!body || body.status !== true) {
    throw new ApiError(
      502,
      parseProviderMessage(body) || 'WhatsApp template API rejected the send'
    );
  }

  return {
    status: 'sent',
    messageId: body.message_id ?? body.messageId ?? null,
    contactId: body.contact_id ?? body.contactId ?? null,
    to: body.to ?? to,
    template: body.template ?? template,
    raw: { ...body },
  };
};

module.exports = {
  listTemplates,
  previewTemplate,
  sendTemplateToLead,
  sendTemplateExternal,
  resolveVariable,
  resolveAllVariables,
  findTemplate,
};
