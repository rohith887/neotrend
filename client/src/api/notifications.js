import client from './client.js';

export const fetchNotifications = (params) =>
  client.get('/notifications', { params }).then(({ data }) => data.data ?? []);

export const fetchUnreadNotificationCount = () =>
  client.get('/notifications/unread').then(({ data }) => data.data?.count ?? 0);

export const markNotificationRead = (id) =>
  client.post(`/notifications/${id}/read`).then(({ data }) => data.data ?? null);

export const markAllNotificationsRead = () =>
  client.post('/notifications/read-all').then(({ data }) => data.data ?? null);

export const approveDropRequest = (id, reason) =>
  client.post(`/notifications/${id}/approve-drop`, { reason }).then(({ data }) => data.data ?? null);

export const denyDropRequest = (id, reason) =>
  client.post(`/notifications/${id}/deny-drop`, { reason }).then(({ data }) => data.data ?? null);
