import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Electron e2e tests.
 * 
 * This configuration sets up tests to run against the Electron app,
 * testing the desktop application integration, IPC handlers, and
 * native features like file explorer bridges.
 * 
 * Tests are now optimized to run in parallel with proper isolation.
 * Each test manages its own Electron app instance and cleans up
 * any shared resources (like PID files) to prevent conflicts.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Enable parallel execution - tests are isolated
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Increase workers for better parallelization
  workers: process.env.CI ? 2 : undefined,
  reporter: 'html',
  
  // Test timeout settings - slightly increased for Electron startup
  timeout: 45000, // 45 seconds per test (Electron can be slower to launch)
  
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
