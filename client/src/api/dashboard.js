import client from './client.js';

export const fetchSummary = () =>
  client.get('/agent/dashboard/summary').then(({ data }) => data.data ?? null);

export const fetchWorkQueueCounts = () =>
  client.get('/agent/dashboard/work-queue').then(({ data }) => data.data ?? null);

export const fetchCallbacks = () =>
  client.get('/agent/dashboard/callbacks').then(({ data }) => data.data ?? null);

export const fetchReadyToCall = ({ limit = 20 } = {}) =>
  client
    .get('/agent/dashboard/ready-to-call', { params: { limit } })
    .then(({ data }) => data.data ?? []);

export const fetchNextAction = () =>
  client.get('/agent/dashboard/next-action').then(({ data }) => data.data ?? null);

export const fetchMyLeads = ({ limit = 8, group } = {}) =>
  client
    .get('/agent/dashboard/my-leads', { params: { limit, group: group || undefined } })
    .then(({ data }) => data.data ?? []);

export const fetchAssignedLeads = (params = {}) =>
  client
    .get('/agent/dashboard/assigned-leads', { params })
    .then(({ data }) => data.data ?? null);

export const fetchAgentLeads = () =>
  client.get('/agent/dashboard/leads').then(({ data }) => data.data ?? []);

export const fetchActivity = () =>
  client.get('/agent/dashboard/activity').then(({ data }) => data.data ?? []);

export const fetchReport = () =>
  client.get('/agent/dashboard/report').then(({ data }) => data.data ?? null);

export const fetchReportDrilldown = (period, metric) =>
  client.get('/agent/dashboard/report/drilldown', { params: { period, metric } }).then(({ data }) => data.data ?? []);
