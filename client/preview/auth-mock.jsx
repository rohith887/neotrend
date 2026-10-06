import { createContext, useContext } from 'react';

const PreviewAuthContext = createContext(null);

const TEST_USER = {
  firstName: 'Rohith',
  lastName: 'Sharma',
  role: { code: 'supervisor' },
};

export const useAuth = () =>
  useContext(PreviewAuthContext) ?? {
    user: TEST_USER,
    role: 'supervisor',
    initializing: false,
    loggingIn: false,
    login: async () => TEST_USER,
    logout: () => {},
  };

export const getRoleCode = (user) => {
  if (!user) return null;
  const role = user.role;
  if (!role) return null;
  return typeof role === 'string' ? role : role.code || null;
};
