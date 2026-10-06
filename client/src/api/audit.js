import client from './client.js';

export const auditEvent = (payload = {}) =>
  client.post('/audit/event', payload).catch(() => {});