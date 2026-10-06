import client from './client.js';

export const fetchReferrals = (params = {}) =>
  client.get('/referrals', { params }).then(({ data }) => ({
    referrals: data.data ?? [],
    meta: data.meta ?? { page: 1, limit: 10, total: 0, pages: 0 },
  }));

export const getReferralById = (id) =>
  client.get(`/referrals/${id}`).then(({ data }) => data.data ?? null);

export const getStudentReferral = (studentId) =>
  client.get(`/referrals/student/${studentId}`).then(({ data }) => data.data ?? null);

export const getStudentQRCode = (studentId) =>
  client.get(`/referrals/student/${studentId}/qr`).then(({ data }) => data.data ?? null);

export const getEmployeeQR = (userId) =>
  client.get(`/referrals/employee-qr/${userId}`).then(({ data }) => data.data ?? null);

export const getPublicQR = () =>
  client.get('/referrals/public-qr').then(({ data }) => data.data ?? null);

export const updateReferralStatus = (id, status) =>
  client.patch(`/referrals/${id}/status`, { status }).then(({ data }) => data.data ?? null);

export const updateRewardStatus = (id, rewardStatus) =>
  client.patch(`/referrals/${id}/reward-status`, { rewardStatus }).then(({ data }) => data.data ?? null);

export const updateReferral = (id, payload) =>
  client.patch(`/referrals/${id}`, payload).then(({ data }) => data.data ?? null);

export const setReferralActive = (id, isActive) =>
  client.patch(`/referrals/${id}/active`, { isActive }).then(({ data }) => data.data ?? null);

export const deleteReferral = (id) =>
  client.delete(`/referrals/${id}`).then(({ data }) => data.data ?? null);

export const fetchLeadsForReferrals = () =>
  client.get('/leads').then(({ data }) => data.data?.leads ?? []);
