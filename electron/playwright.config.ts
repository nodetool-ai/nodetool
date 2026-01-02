import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Electron e2e tests.
 * 
 * This configuration sets up tests to run against the Electron app,
 * testing the desktop application integration, IPC handlers, and
 * native features like file explorer bridges.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Electron tests should run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Run tests serially for Electron
  reporter: 'html',
  
  // Test timeout settings
  timeout: 60000, // 60 seconds per test
  
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
