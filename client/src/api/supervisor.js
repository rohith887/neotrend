import client from './client.js';

export const fetchSupervisorUsers = (params) =>
  client.get('/supervisor/users', { params }).then(({ data }) => data.data ?? []);

export const createSupervisorUser = (payload) =>
  client.post('/users', payload).then(({ data }) => data.data);

export const updateSupervisorUser = (userId, payload) =>
  client.patch(`/users/${userId}`, payload).then(({ data }) => data.data);

export const provisionSupervisorUserSip = (userId) =>
  client.post(`/users/${userId}/provision-sip`).then(({ data }) => data.data);

export const setSupervisorUserStatus = (userId, status) =>
  client.patch(`/users/${userId}/status`, { status }).then(({ data }) => data.data);

export const resetSupervisorUserPassword = (userId, password) =>
  client.post(`/users/${userId}/reset-password`, { password }).then(({ data }) => data.data);

export const deleteSupervisorUser = (userId) =>
  client.delete(`/users/${userId}`).then(({ data }) => data.data);

export const fetchSupervisorQueues = () =>
  client.get('/supervisor/queues').then(({ data }) => data.data ?? []);

export const fetchSupervisorReports = (range) =>
  client.get('/supervisor/reports', { params: range ? { range } : {} }).then(({ data }) => data.data ?? {});

export const fetchSupervisorDashboardSummary = () =>
  client.get('/supervisor/dashboard/summary').then(({ data }) => data.data ?? {});

export const fetchLifecyclePipeline = () =>
  client.get('/supervisor/lifecycle').then(({ data }) => data.data ?? {});

// Phase 6: operational attention snapshot (overdue / SLA / unassigned /
// stalled / waiting-on / workload). Empty collections yield zeros.
export const fetchSupervisorAttention = () =>
  client.get('/supervisor/attention').then(({ data }) => data.data ?? {});

// Phase 1: Call Assist feedback analytics — totals + agree % per category.
export const fetchCallAssistFeedbackSummary = () =>
  client.get('/supervisor/call-assist-feedback/summary').then(({ data }) => data.data ?? null);
