import { defineConfig, devices } from '@playwright/test';

const normalizeUrl = (url: string) => url.replace(/\/$/, '');

const FRONTEND_URL = normalizeUrl(
  process.env.E2E_FRONTEND_URL || 'http://localhost:3000'
);
const BACKEND_URL = normalizeUrl(
  process.env.E2E_BACKEND_URL || 'http://localhost:7777'
);
const BACKEND_HEALTH_URL = `${BACKEND_URL}/health`;

const shouldStartBackend = process.env.E2E_START_BACKEND
  ? process.env.E2E_START_BACKEND !== 'false'
  : !process.env.E2E_BACKEND_URL;

const shouldStartFrontend = process.env.E2E_START_FRONTEND !== 'false';

const webServers = process.env.CI ? {
  command: 'npm start',
  url: FRONTEND_URL,
  reuseExistingServer: false,
  timeout: 120 * 1000,
} : [
  ...(shouldStartBackend
    ? [{
        command: 'conda run -n nodetool nodetool serve --port 7777',
        url: BACKEND_HEALTH_URL,
        reuseExistingServer: true,
        timeout: 120 * 1000,
      }]
    : []),
  ...(shouldStartFrontend
    ? [{
        command: 'npm start',
        url: FRONTEND_URL,
        reuseExistingServer: true,
        timeout: 120 * 1000,
      }]
    : []),
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: Array.isArray(webServers) && webServers.length === 0
    ? undefined
    : webServers,
});
