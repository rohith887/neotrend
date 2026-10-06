import client from './client.js';

export const startClickToCall = (leadId, manualNumber) =>
  client.post('/calls/start', { leadId, ...(manualNumber ? { manualNumber } : {}) }).then((res) => res.data.data);

export const fetchCallStatus = (callId) =>
  client.get(`/calls/${callId}`).then((res) => res.data.data);

// Lifecycle reported by the agent's own softphone for a browser-originated call.
// The server accepts it only for calls this browser placed.
export const reportCallStatus = (callId, status) =>
  client.post(`/calls/${callId}/status`, { status }).then((res) => res.data.data);

export const endClickToCall = (callId) =>
  client.post(`/calls/${callId}/end`).then((res) => res.data.data);

export const fetchActiveCall = () =>
  client.get('/calls/active').then((res) => res.data.data);

export const endActiveCall = () =>
  client.post('/calls/end-active').then((res) => res.data.data);

export const fetchTelephonyConfig = () =>
  client.get('/calls/config').then((res) => res.data.data);

