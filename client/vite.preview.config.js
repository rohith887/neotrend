import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

export default defineConfig({
  root: 'preview',
  plugins: [react()],
  resolve: {
    alias: {
      '../context/AuthContext.jsx': fileURLToPath(
        new URL('./preview/auth-mock.jsx', import.meta.url)
      ),
      './context/AuthContext.jsx': fileURLToPath(
        new URL('./preview/auth-mock.jsx', import.meta.url)
      ),
      '../../api/payments.js': fileURLToPath(
        new URL('./preview/mock-payments-api.js', import.meta.url)
      ),
      '../api/payments.js': fileURLToPath(
        new URL('./preview/mock-payments-api.js', import.meta.url)
      ),
    },
  },
  server: {
    port: 5174,
    open: false,
  },
});
