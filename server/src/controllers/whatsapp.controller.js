const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const Lead = require('../models/Lead');
const whatsappService = require('../services/whatsapp.service');
const whatsappTemplateService = require('../services/whatsappTemplate.service');
const whatsappTemplateMetaService = require('../services/whatsappTemplateMeta.service');
const { logEvent } = require('../services/systemLog.service');

// Send a WhatsApp template message through the company WhatsApp Business number.
// Raw variant — accepts an already-resolved parameter array and template name.
// Body: {
//   to: string,                      // recipient phone — normalized automatically
//   templateName: string,            // name of an approved template in Meta
//   languageCode?: string,           // default 'en_US'
//   parameters?: Array<string|number|{type,text}>  // body variables, positional
//   headerParameters?: Array<{...}>  // optional header parameters
// }
const sendTemplate = asyncHandler(async (req, res) => {
  const { to, templateName, languageCode, parameters, headerParameters } = req.body || {};

  if (!templateName) {
    throw new ApiError(400, 'templateName is required');
  }

  const result = await whatsappService.sendTemplate({
    to,
    templateName,
    languageCode,
    parameters,
    headerParameters,
  });

  return success(res, result, 'WhatsApp template message sent', 200);
});

// List the template catalog for the UI (no secrets, no lead data). Enriches
// each catalogue entry with REAL Meta template metadata when available. Meta
// failures are non-fatal: the catalogue still loads with meta: null.
const listTemplates = asyncHandler(async (req, res) => {
  const templates = await whatsappTemplateService.listTemplates();

  let metaByName = new Map();
  try {
    const metas = await whatsappTemplateMetaService.listTemplateMetadata();
    for (const meta of metas) {
      if (meta && meta.name) metaByName.set(meta.name, meta);
    }
  } catch (err) {
    // Metadata is optional — never block the catalogue or sending on it.
    console.warn(`[whatsapp] Meta template metadata unavailable: ${err.message}`);
  }

  const enriched = templates.map((t) => {
    const meta = metaByName.get(t.metaName) || null;
    return {
      ...t,
      meta,
      metaAvailable: meta !== null,
      metaPlaceholders: whatsappTemplateMetaService.derivePlaceholders(meta, t.variables),
    };
  });

  return success(res, enriched, 'WhatsApp templates fetched');
});

// Real Meta template metadata for every template on this WhatsApp Business
// Account. Read-only; Meta is only used to enrich/verify template info.
const listTemplateMetadata = asyncHandler(async (req, res) => {
  const templates = await whatsappTemplateMetaService.listTemplateMetadata();
  return success(res, templates, 'WhatsApp template metadata fetched');
});

// Real Meta template metadata for a single template (by numeric template ID
// or by Meta template name).
const getTemplateMetadata = asyncHandler(async (req, res) => {
  const { nameOrId } = req.params || {};
  const template = await whatsappTemplateMetaService.getTemplateMetadata(nameOrId);
  if (!template) {
    throw new ApiError(404, `WhatsApp template metadata not found: ${nameOrId}`);
  }
  return success(res, template, 'WhatsApp template metadata fetched');
});

// Resolve + validate variables for a template against a lead WITHOUT sending.
// Body: { leadId, templateKey, overrides? }
const previewTemplate = asyncHandler(async (req, res) => {
  const { leadId, templateKey, overrides } = req.body || {};
  if (!leadId) throw new ApiError(400, 'leadId is required');
  if (!templateKey) throw new ApiError(400, 'templateKey is required');

  const preview = await whatsappTemplateService.previewTemplate({ templateKey, leadId, overrides }, req.user);
  return success(res, preview, 'WhatsApp template preview ready');
});

// Resolve + validate variables, then send via the company WhatsApp number.
// Body: { leadId, templateKey, overrides?, parameters? }
const sendLeadTemplate = asyncHandler(async (req, res) => {
  const { leadId, templateKey, overrides, parameters } = req.body || {};
  if (!leadId) throw new ApiError(400, 'leadId is required');
  if (!templateKey) throw new ApiError(400, 'templateKey is required');

  const result = await whatsappTemplateService.sendTemplateToLead(
    { templateKey, leadId, overrides, parameters },
    req.user
  );

  // Audit trail — WhatsApp message sent to a lead. The recipient number is
  // already resolveable from the lead id and is NOT stored in the log.
  Lead.findById(leadId).select('studentName').lean()
    .then((l) => {
      logEvent({
        module: 'workflow',
        action: 'WHATSAPP_SENT',
        username: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email,
        userId: String(req.user._id),
        role: String(req.role.name || '').toUpperCase(),
        leadId: String(leadId),
        leadName: String(l?.studentName || '').trim(),
        message: `WhatsApp template sent to ${String(l?.studentName || 'student')}`,
        apiPath: '/api/whatsapp/send',
        statusCode: 200,
        ipAddress: req.ip,
        requestId: String(req._tasaRequestId || ''),
        metadata: { templateKey: String(templateKey || '') },
      });
    })
    .catch(() => { /* logging must never break the send */ });

  return success(res, result, 'WhatsApp template message sent');
});

// Send an approved WhatsApp template to a lead via the GR Study Abroad
// WhatsApp Template API.
// Body: { leadId, template, overrides?, parameters? } — `template` is the
// approved template name (catalogue key); the student number always comes
// from the lead, never from the frontend.
const sendTemplateMessage = asyncHandler(async (req, res) => {
  const { leadId, template, overrides, parameters } = req.body || {};
  if (!leadId) throw new ApiError(400, 'leadId is required');
  if (!template) throw new ApiError(400, 'template is required');

  const result = await whatsappTemplateService.sendTemplateToLead(
    { templateKey: template, leadId, overrides, parameters },
    req.user
  );

  Lead.findById(leadId).select('studentName').lean()
    .then((l) => {
      logEvent({
        module: 'workflow',
        action: 'WHATSAPP_SENT',
        username: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() || req.user.email,
        userId: String(req.user._id),
        role: String(req.role.name || '').toUpperCase(),
        leadId: String(leadId),
        leadName: String(l?.studentName || '').trim(),
        message: `WhatsApp template sent to ${String(l?.studentName || 'student')}`,
        apiPath: '/api/whatsapp/send-template',
        statusCode: 200,
        ipAddress: req.ip,
        requestId: String(req._tasaRequestId || ''),
        metadata: {
          template: String(template || ''),
          messageId: String(result?.messageId || ''),
          contactId: String(result?.contactId || ''),
        },
      });
    })
    .catch(() => { /* logging must never break the send */ });

  return success(res, result, 'WhatsApp template message sent');
});

module.exports = {
  sendTemplate,
  listTemplates,
  listTemplateMetadata,
  getTemplateMetadata,
  previewTemplate,
  sendLeadTemplate,
  sendTemplateMessage,
};
