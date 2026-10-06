import client from './client.js';

/**
 * Student ↔ University shortlist API (Phase 3).
 * Backend routes live under /api/leads/:id/shortlist.
 */

export const fetchShortlist = (leadId) =>
  client.get(`/leads/${leadId}/shortlist`).then(({ data }) => data.data?.entries ?? []);

export const addToShortlist = (leadId, universityId) =>
  client
    .post(`/leads/${leadId}/shortlist/${universityId}`)
    .then(({ data }) => data.data ?? {});

export const updateShortlistEntry = (leadId, universityId, payload) =>
  client
    .patch(`/leads/${leadId}/shortlist/${universityId}`, payload)
    .then(({ data }) => data.data ?? {});

export const removeFromShortlist = (leadId, universityId) =>
  client
    .delete(`/leads/${leadId}/shortlist/${universityId}`)
    .then(({ data }) => data.data ?? {});

export const confirmShortlist = (leadId) =>
  client.post(`/leads/${leadId}/shortlist/confirm`).then(({ data }) => data.data ?? {});
