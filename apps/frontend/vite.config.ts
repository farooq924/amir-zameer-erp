/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    react(),
    // Phase 9: installable offline app. The service worker keeps the app screens on the device;
    // business data is kept in IndexedDB (src/offline) and API calls are never cached here.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'TailoringERP By Brandistan',
        short_name: 'TailoringERP',
        description: 'TailoringERP By Brandistan - Tailoring & Fabric Management ERP',
        theme_color: '#101f3d',
        background_color: '#101f3d',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Offline Desk', url: '/offline', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Sync Center', url: '/sync', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
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
    chunkSizeWarningLimit: 2000,
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
