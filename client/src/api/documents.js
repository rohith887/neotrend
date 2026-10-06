import client from './client.js';

export const fetchLeadDocuments = async (leadId) => {
  const { data } = await client.get(`/documents/lead/${leadId}`);
  return data.data.documents;
};

export const fetchDocumentSummary = async (leadId) => {
  const { data } = await client.get(`/documents/lead/${leadId}/summary`);
  return data.data;
};

export const createDocument = async (payload) => {
  const { data } = await client.post('/documents', payload);
  return data.data.document;
};

export const updateDocument = async (docId, payload) => {
  const { data } = await client.patch(`/documents/${docId}`, payload);
  return data.data.document;
};

export const deleteDocument = async (docId) => {
  await client.delete(`/documents/${docId}`);
};

export const bulkCreateDocuments = async (leadId, documents) => {
  const { data } = await client.post('/documents/bulk', { leadId, documents });
  return data.data;
};

export const fetchDocumentQueue = async (params = {}) => {
  const { data } = await client.get('/documents/counselor/queue', { params });
  return data.data;
};
