import client from './client.js';

export const fetchPayments = (params = {}) =>
  client.get('/payments', { params }).then(({ data }) => data.data ?? {});

export const fetchPaymentSummary = () =>
  client.get('/payments/summary').then(({ data }) => data.data ?? {});

export const fetchPayment = (id) =>
  client.get(`/payments/${id}`).then(({ data }) => data.data?.payment ?? null);

export const createPayment = (payload) =>
  client.post('/payments', payload).then(({ data }) => data.data?.payment ?? null);

export const updatePayment = (id, payload) =>
  client.patch(`/payments/${id}`, payload).then(({ data }) => data.data?.payment ?? null);

export const deletePayment = (id) =>
  client.delete(`/payments/${id}`).then(({ data }) => data.data);
