import { Box, CircularProgress } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function PrivateRoute({ children, roles }) {
  const { user, role, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <CircularProgress size={34} thickness={4} />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(role)) {
    const home = role === 'counselor' ? '/counselor/workspace' : role === 'agent' ? '/agent/dashboard' : '/dashboard';
    return <Navigate to={home} replace />;
  }

  return children;
}
