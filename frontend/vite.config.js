import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { version } = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    host: true, // Listen on all network interfaces to allow connections from other devices (like an iPad)
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/themes': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
