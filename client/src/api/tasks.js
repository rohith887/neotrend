import client from './client.js';

/* Self-service task endpoints — any authenticated Agent/Counselor's own
   tasks, scoped server-side. No user:read permission required. */

export const fetchMyTasks = (params) =>
  client.get('/tasks/mine', { params }).then(({ data }) => data.data ?? []);

export const updateMyTaskStatus = (id, status) =>
  client.patch(`/tasks/mine/${id}/status`, { status }).then(({ data }) => data.data ?? null);
