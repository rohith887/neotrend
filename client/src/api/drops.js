import client from './client.js';

const unwrap = ({ data }) => data?.data ?? null;


export const reviveLead = (leadId, reason) =>
  client
    .post(`/leads/${leadId}/revive`, { reason })
    .then(unwrap);