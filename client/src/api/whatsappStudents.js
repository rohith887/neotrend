import client from './client.js';

export const submitWhatsAppStudent = (payload) =>
  client.post('/whatsapp-students', payload).then(({ data }) => data.data ?? null);