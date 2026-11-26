import { defineConfig } from '@playwright/test';

/** Browser smoke tests. Requires backend (port 4000) and frontend (port 5173) running with a seeded database. */
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173', trace: 'off' },
  reporter: 'list',
});
