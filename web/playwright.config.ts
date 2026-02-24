import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

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

// Check for local venv created by prepare-env.sh
const venvPath = path.resolve(process.cwd(), '../e2e_venv/bin/nodetool');
const hasVenv = fs.existsSync(venvPath);

const backendCommand = hasVenv
  ? `${venvPath} serve --port 7777 --mock`
  : 'conda run -n nodetool nodetool serve --port 7777 --mock';

const webServers = process.env.CI ? {
  command: 'npm start',
  url: FRONTEND_URL,
  reuseExistingServer: false,
  timeout: 120 * 1000,
} : [
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
  workers: process.env.CI ? 4 : undefined,
  reporter: 'html',
  // Timeout must accommodate navigation + editor load + actions in CI
  timeout: 60000,
  // Global timeout to account for parallel workers and retries
  globalTimeout: process.env.CI ? 40 * 60_000 : 0,
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
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
