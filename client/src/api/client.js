import axios from 'axios';
import { getToken, clearAuth } from './storage.js';
import { getNavigate } from './navigation.js';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* A 401 must tear down the WHOLE session, not just the stored token. Clearing
   storage alone leaves AuthContext.user populated, so the router bounces off
   /signin straight back into a dashboard that can only 401 again. The session
   owner (AuthProvider) registers the real teardown here; this fallback covers
   the window before it has mounted. */
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        clearAuth();
        const navigate = getNavigate();
        if (navigate) {
          navigate('/signin', { replace: true });
        } else {
          window.location.href = '/signin';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;
