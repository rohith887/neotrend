import client from './client.js';

export const fetchMyStudents = async (params = {}) => {
  const { data } = await client.get('/counselor/my-students', { params });
  return data.data;
};

export const fetchCounselorDashboard = async () => {
  const { data } = await client.get('/counselor/dashboard');
  return data.data;
};

export const fetchRegistrationDetail = async (leadId) => {
  const { data } = await client.get(`/counselor/registration/${leadId}`);
  return data.data;
};

export const updateRegistration = async (leadId, payload) => {
  const { data } = await client.patch(`/counselor/registration/${leadId}`, payload);
  return data.data;
};

export const completeCounseling = async (leadId) => {
  const { data } = await client.post(`/counselor/counseling/${leadId}/complete`);
  return data.data;
};

export const fetchRegistrationQueue = async (params = {}) => {
  const { data } = await client.get('/counselor/registration/queue', { params });
  return data.data;
};
