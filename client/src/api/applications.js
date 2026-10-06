import client from './client.js';

export const fetchApplications = (leadId, params = {}) =>
  client.get(`/leads/${leadId}/applications`, { params }).then(({ data }) => data.data ?? {});

export const createApplication = (leadId, shortlistId) =>
  client
    .post(`/leads/${leadId}/applications`, { shortlistId })
    .then(({ data }) => data.data ?? {});

export const fetchApplication = (applicationId) =>
  client.get(`/applications/${applicationId}`).then(({ data }) => data.data?.application ?? null);

export const updateApplicationStatus = (applicationId, payload) =>
  client.patch(`/applications/${applicationId}`, payload).then(({ data }) => data.data ?? {});

export const submitApplication = (applicationId) =>
  client.post(`/applications/${applicationId}/submit`).then(({ data }) => data.data ?? {});

export const withdrawApplication = (applicationId, reason = '') =>
  client
    .post(`/applications/${applicationId}/withdraw`, { reason })
    .then(({ data }) => data.data ?? {});

export const fetchApplicationTimeline = (applicationId) =>
  client.get(`/applications/${applicationId}/timeline`).then(({ data }) => data.data ?? {});

// Supervisor operational overview (read-only; server enforces role).
export const fetchApplicationsOverview = (params = {}) =>
  client.get('/applications', { params }).then(({ data }) => data.data ?? {});
