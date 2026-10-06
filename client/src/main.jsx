import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CacheProvider } from './context/CacheContext.jsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { createAppTheme } from './theme/muiTheme.js';

/* MUI design foundation — keeps the Material UI theme in sync with the
   app's existing light/dark switch (custom ThemeContext below). Wrapping
   only provides theme context; no page is migrated to MUI yet. */
function MuiThemeBridge({ children }) {
  const { isDark } = useTheme();
  const muiTheme = useMemo(() => createAppTheme(isDark ? 'dark' : 'light'), [isDark]);
  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}

function Root() {
  return (
    <AuthProvider>
      <CacheProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </CacheProvider>
    </AuthProvider>
  );
}

const router = createBrowserRouter(
  [{ path: '*', element: <Root /> }],
  { future: { v7_relativeSplatPath: true } }
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <MuiThemeBridge>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </MuiThemeBridge>
    </ThemeProvider>
  </React.StrictMode>
);
