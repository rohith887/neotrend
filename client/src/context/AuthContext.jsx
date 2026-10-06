import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import client, { setUnauthorizedHandler } from '../api/client.js';
import { setToken, getToken, setUser, getUser, clearAuth } from '../api/storage.js';

const AuthContext = createContext(null);

export const getRoleCode = (user) => {
  if (!user) return null;
  const role = user.role;
  if (!role) return null;
  return typeof role === 'string' ? role : role.code || null;
};

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(getUser());
  const [initializing, setInitializing] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  // Give the axios 401 interceptor a real teardown so an expired session ends
  // in the same state an explicit sign-out does — React state included.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAuth();
      setUserState(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setUserState(null);
      clearAuth();
      setInitializing(false);
      return;
    }
    client
      .get('/auth/profile')
      .then(({ data }) => {
        if (cancelled) return;
        setUserState(data.data);
        setUser(data.data);
      })
      .catch(() => {
        if (cancelled) return;
        clearAuth();
        setUserState(null);
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = ({ token, user: profile }, remember) => {
    setToken(token, remember);
    setUser(profile);
    setUserState(profile);
    return profile;
  };

  const login = async ({ email, password, remember }) => {
    setLoggingIn(true);
    try {
      const { data } = await client.post('/auth/login', { email, password });
      return applySession(data.data, remember);
    } finally {
      setLoggingIn(false);
    }
  };

  const requestOtp = async (email) => {
    setLoggingIn(true);
    try {
      const { data } = await client.post('/auth/otp/request', { email });
      return data.data;
    } finally {
      setLoggingIn(false);
    }
  };

  const verifyOtp = async ({ email, otp, remember = true }) => {
    setLoggingIn(true);
    try {
      const { data } = await client.post('/auth/otp/verify', { email, otp });
      return applySession(data.data, remember);
    } finally {
      setLoggingIn(false);
    }
  };

  /* Signing out ends the session completely: stored credentials AND the React
     user. App.jsx swaps the whole route tree on `user === null`, which is what
     tears down AgentProvider and every agent-scoped useState. Cache and toast
     providers sit above App and react to this same user change themselves. */
  const logout = () => {
    clearAuth();
    setUserState(null);
  };

  const value = useMemo(
    () => ({ user, role: getRoleCode(user), initializing, loggingIn, login, requestOtp, verifyOtp, logout }),
    [user, initializing, loggingIn]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
