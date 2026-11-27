/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
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

/** App version comes from the root package.json, so every release shows its own number in the side menu. */
const rootPackage = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as { version: string };
const buildDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Only one public address is needed: the browser calls /api on the same address and Vite forwards it.
const apiProxy = { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false } };

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
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
