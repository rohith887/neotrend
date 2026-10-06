import client from './client.js';

/**
 * Lifecycle API — current workflow state + event history, and controlled
 * transitions for supervisors / assigned counselors.
 */

export const fetchLeadLifecycle = (leadId) =>
  client.get(`/leads/${leadId}/lifecycle`).then(({ data }) => data.data ?? {});

export const updateLeadLifecycle = (leadId, payload) =>
  client.patch(`/leads/${leadId}/lifecycle`, payload).then(({ data }) => data.data ?? {});
