import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Box from '@mui/material/Box';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext.jsx';
import { createAppTheme } from '../src/theme/muiTheme.js';
import { CacheProvider } from '../src/context/CacheContext.jsx';
import CounselorPayments from '../src/components/counselor/CounselorPayments.jsx';

function MuiThemeBridge({ children }) {
  const { isDark } = useTheme();
  const muiTheme = React.useMemo(() => createAppTheme(isDark ? 'dark' : 'light'), [isDark]);
  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}

function Preview() {
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.5 }}>
        <CounselorPayments />
      </Box>
    </Box>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <MuiThemeBridge>
        <CacheProvider>
          <MemoryRouter>
            <Preview />
          </MemoryRouter>
        </CacheProvider>
      </MuiThemeBridge>
    </ThemeProvider>
  </React.StrictMode>
);