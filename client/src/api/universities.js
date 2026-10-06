import client from './client.js';

/**
 * University Management API — CRUD + paginated list + bulk import.
 * Backend: /api/universities
 *
 * List response shape:
 *   { universities: [...], total, page, pages, limit }
 *
 * Item response shape:
 *   { _id, institutionName, country: { _id, name, code }, city, stateRegion, ownership, owner, isActive, createdAt, updatedAt }
 */

export const fetchUniversities = (params = {}, config = {}) =>
  client.get('/universities', { ...config, params }).then(({ data }) => data.data);

export const fetchUniversity = (id) =>
  client.get(`/universities/${id}`).then(({ data }) => data.data);

export const createUniversity = (payload) =>
  client.post('/universities', payload).then(({ data }) => data.data);

export const updateUniversity = (id, payload) =>
  client.patch(`/universities/${id}`, payload).then(({ data }) => data.data);

export const deleteUniversity = (id) =>
  client.delete(`/universities/${id}`).then(({ data }) => data.data);

export const downloadUniversityTemplate = () =>
  client.get('/universities/import/template', { responseType: 'blob' }).then(({ data }) => data);

export const previewUniversityImport = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post('/universities/import/preview', formData, { headers: { 'Content-Type': undefined } }).then(({ data }) => data.data);
};

export const importUniversities = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post('/universities/import', formData, { headers: { 'Content-Type': undefined } }).then(({ data }) => data.data);
};
