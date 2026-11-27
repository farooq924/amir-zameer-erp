/// <reference types="vitest/config" />
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * Hosts allowed to open the app besides localhost.
 * - Every *.trycloudflare.com address (Cloudflare Quick Tunnel, used by `pnpm share`).
 * - Extra hosts from ERP_ALLOWED_HOSTS (comma separated), e.g. erp.example.com for a named tunnel.
 *   Read from the environment or from apps/frontend/.env.local.
 */
function allowedHosts(mode: string): string[] {
  const fileEnv = loadEnv(mode, __dirname, 'ERP_');
  const extra = (process.env.ERP_ALLOWED_HOSTS ?? fileEnv.ERP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return ['.trycloudflare.com', ...extra];
}

// Only one public address is needed: the browser calls /api on the same address and Vite forwards it.
const apiProxy = { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false } };

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Shared module/permission definitions are consumed as TypeScript source.
      '@az/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    allowedHosts: allowedHosts(mode),
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    strictPort: true,
    allowedHosts: allowedHosts(mode),
    proxy: apiProxy,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    // No manualChunks: splitting React into its own chunk broke the production build at runtime
    // ("Cannot set properties of undefined (setting 'Children')"). Vite's default splitting is used instead.
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
