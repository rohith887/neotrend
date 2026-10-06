import client from './client.js';

// Template catalog (no secrets) — GET /api/whatsapp/templates
export const fetchWhatsappTemplates = () =>
  client.get('/whatsapp/templates').then(({ data }) => data.data ?? []);

// Resolve + validate variables against a lead, WITHOUT sending.
// payload: { leadId, templateKey, overrides? }
export const previewWhatsappTemplate = (payload) =>
  client.post('/whatsapp/preview', payload).then(({ data }) => data.data ?? null);

// Resolve + validate + send an approved template to a lead.
// payload: { leadId, template, overrides? } (the API key/org/URL stay server-side)
export const sendWhatsappTemplate = (payload) =>
  client
    .post('/whatsapp/send-template', {
      leadId: payload.leadId,
      template: payload.template ?? payload.templateKey,
      overrides: payload.overrides,
    })
    .then(({ data }) => data.data ?? null);
