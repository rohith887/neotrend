import client from './client.js';

export const WORKQUEUE_EMPTY = {
  callbacksOverdue: [],
  callbacksToday: [],
  callbacksTomorrow: [],
  callbacksLater: [],
  priorityP1: [],
};

export const fetchWorkQueue = () =>
  client.get('/agent/workqueue').then(({ data }) => ({ ...WORKQUEUE_EMPTY, ...(data.data ?? {}) }));

export const rescheduleCallback = (payload) =>
  client
    .patch('/agent/workqueue/reschedule', payload)
    .then(({ data }) => data.data ?? null);

export const completeCallback = (payload) =>
  client
    .post('/agent/workqueue/complete', payload)
    .then(({ data }) => data.data ?? null);
