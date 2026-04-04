import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for NodeTool documentation screenshots.
 *
 * How it works:
 * 1. globalSetup starts a mock HTTP server on port 4444 that handles all
 *    /api/* requests with realistic fake data.
 * 2. The Vite dev server is started with PROXY_API_TARGET=http://localhost:4444
 *    so its proxy routes API calls to the mock server instead of localhost:7777.
 * 3. Tests navigate to real app routes and take screenshots of actual components.
 *
 * Run screenshots:
 *   npm run screenshots            # only missing screenshots
 *   npm run screenshots:force      # re-capture every screenshot
 *   npx playwright test tests/benchmarks/screenshots.spec.ts --project=chromium
 *
 * The webServer entry below auto-starts Vite so you don't need to run it manually.
 * If Vite is already running without the mock API target, stop it first and re-run.
 */
export default defineConfig({
  testDir: "./tests",

  /* Maximum time one test can run */
  timeout: 60_000,

  /* Global assertion timeout */
  expect: { timeout: 10_000 },

  /* Fail the build on CI if test.only is accidentally left in */
  forbidOnly: !!process.env.CI,

  /* No retries — screenshot tests should be deterministic */
  retries: 0,

  /* Sequential execution to avoid races when writing screenshot files */
  workers: 1,

  reporter: process.env.CI ? "github" : "list",

  /**
   * Start the mock API server before any tests run, and tear it down after.
   * The server listens on port 4444 and handles all /api/* requests.
   */
  globalSetup: "./tests/globalSetup.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 }
      }
    }
  ],

  /**
   * Auto-start Vite with the mock API as its backend.
   * PROXY_API_TARGET overrides the default localhost:7777 in vite.config.ts.
   * Set reuseExistingServer: false so Vite always picks up the right env var.
   */
  webServer: {
    command: "PROXY_API_TARGET=http://localhost:4444 npm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
