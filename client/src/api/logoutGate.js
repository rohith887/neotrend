import client from './client.js';

export const checkLogout = () =>
  client.post('/logout/check').then(({ data }) => data.data ?? null);

export const approveLogoutOverride = (alertId, reason = '') =>
  client
    .post(`/logout/${alertId}/override`, { reason })
    .then(({ data }) => data.data ?? null);