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

const backendCommand = 'PORT=7777 HOST=127.0.0.1 node ../packages/websocket/dist/server.js';

const webServers = process.env.CI ? [
  ...(shouldStartBackend
    ? [{
        command: backendCommand,
        url: BACKEND_HEALTH_URL,
        reuseExistingServer: false,
        timeout: 120 * 1000,
      }]
    : []),
  {
    command: 'npm start',
    url: FRONTEND_URL,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
] : [
  ...(shouldStartBackend
    ? [{
        command: backendCommand,
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
  // Workers: balance parallelism with stability
  workers: process.env.CI ? 2 : undefined,
  reporter: 'html',
  // Timeout must accommodate navigation + editor load + actions in CI
  timeout: process.env.CI ? 30_000 : 20_000,
  // Global timeout to account for parallel workers and retries
  globalTimeout: process.env.CI ? 40 * 60_000 : 0,
  // Skip heavy tests on CI — these need real APIs, Python, or are for local profiling
  ...(process.env.CI ? {
    testIgnore: [
      /.*-real\.spec\.ts$/,
      /.*screenshots?\.spec\.ts$/,
      /.*profiling\.spec\.ts$/,
      /.*performance.*\.spec\.ts$/,
      /.*debug-.*\.spec\.ts$/,
      /.*global-chat-ollama\.spec\.ts$/,
    ],
  } : {}),
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    tsconfig: './tsconfig.e2e.json',
    // Reasonable navigation timeout to handle slow starts
    navigationTimeout: 30_000,
    // Reasonable action timeout for optimized waits
    actionTimeout: 15_000,
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
