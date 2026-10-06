import client from './client.js';

export const fetchLeads = (params) =>
  client.get('/leads', { params }).then(({ data }) => data.data?.leads ?? []);

export const fetchLeadsPaginated = (params) =>
  client.get('/leads', { params }).then(({ data }) => data.data ?? {});

export const fetchLeadById = (id) =>
  client.get(`/leads/${id}`).then(({ data }) => data.data?.lead ?? null);

// Call Assist — live-call context for the agent's call popup.
export const fetchCallAssistContext = (leadId) =>
  client.get(`/leads/${leadId}/call-assist`).then(({ data }) => data.data ?? null);

// Call Assist feedback — structured agent rating submitted after a call ends.
// callId is sent as null until a dialer exists.
export const submitCallAssistFeedback = (leadId, payload) =>
  client.post(`/leads/${leadId}/call-assist/feedback`, payload).then(({ data }) => data.data ?? null);

export const fetchLeadOptions = () =>
  client.get('/leads/options').then(({ data }) => data.data ?? []);

export const createLead = (payload) =>
  client.post('/leads', payload).then(({ data }) => data.data?.lead ?? null);

export const updateLead = (id, payload) =>
  client.patch(`/leads/${id}`, payload).then(({ data }) => data.data?.lead ?? null);

export const fetchInteractions = (leadId) =>
  client.get('/interactions', { params: { leadId } }).then(({ data }) => data.data ?? []);

const importForm = (file, duplicateMode, mode) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('mode', mode);
  fd.append('duplicateMode', duplicateMode);
  return fd;
};

// Validate an uploaded file — returns the parsed preview (no DB changes).
export const validateLeadImport = (file, duplicateMode) =>
  client
    .post('/leads/import', importForm(file, duplicateMode, 'validate'), { headers: { 'Content-Type': undefined } })
    .then(({ data }) => data.data);

// Run the import for real — returns the completion summary.
export const runLeadImport = (file, duplicateMode) =>
  client
    .post('/leads/import', importForm(file, duplicateMode, 'import'), { headers: { 'Content-Type': undefined } })
    .then(({ data }) => data.data);

export const createInteraction = (payload) =>
  client.post('/interactions', payload).then(({ data }) => data.data ?? null);

export const fetchImportTemplate = () =>
  client.get('/leads/import/template', { responseType: 'blob' }).then(({ data }) => data);

export const fetchImportErrorReport = (jobId) =>
  client.get(`/leads/import/errors/${jobId}`, { responseType: 'blob' }).then(({ data }) => data);

// Export the current Lead Management selection as a single XLSX workbook
// (Lead Management + Remarks sheets). Returns the raw blob for download.
export const exportLeadReport = (leadIds) =>
  client.post('/leads/export', { leadIds }, { responseType: 'blob' }).then(({ data }) => data);

// ── Counselor endpoints ──────────────────────────────────────────
export const updateCounselorStatus = (leadId, payload) =>
  client.patch(`/leads/${leadId}/counselor-status`, payload).then(({ data }) => data.data?.lead ?? null);

export const addCounselorNote = (leadId, payload) =>
  client.post(`/leads/${leadId}/counselor-notes`, payload).then(({ data }) => data.data?.note ?? null);

export const fetchCounselorNotes = (leadId) =>
  client.get(`/leads/${leadId}/counselor-notes`).then(({ data }) => data.data?.notes ?? []);

// ── Shared lead tags (Agent / Counselor / Supervisor) ──────────────
export const fetchLeadTags = (leadId) =>
  client.get(`/leads/${leadId}/tags`).then(({ data }) => data.data ?? null);

export const addLeadTag = (leadId, payload) =>
  client.post(`/leads/${leadId}/tags`, payload).then(({ data }) => data.data ?? null);

export const removeLeadTag = (leadId, tagId) =>
  client.delete(`/leads/${leadId}/tags/${tagId}`).then(({ data }) => data.data ?? null);
