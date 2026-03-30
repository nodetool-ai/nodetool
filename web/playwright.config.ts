import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for NodeTool web e2e and documentation screenshot tests.
 *
 * Running documentation screenshots (requires dev servers):
 *   npx playwright test tests/benchmarks/screenshots.spec.ts --project=chromium
 *
 * Force re-capture all screenshots (overwrite existing):
 *   FORCE_SCREENSHOTS=true npx playwright test tests/benchmarks/screenshots.spec.ts --project=chromium
 *
 * Run with visible browser:
 *   npm run test:e2e:headed
 *
 * Interactive UI mode:
 *   npm run test:e2e:ui
 *
 * Dev servers required:
 *   - Frontend: http://localhost:3000  (npm start)
 *   - Backend:  http://localhost:7777  (nodetool serve)
 */
export default defineConfig({
  testDir: "./tests",

  /* Maximum time one test can run for */
  timeout: 60_000,

  /* Global test expectations timeout */
  expect: { timeout: 10_000 },

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Sequential execution for screenshot tests (avoids race conditions on file writes) */
  workers: 1,

  /* Reporter to use */
  reporter: process.env.CI ? "github" : "list",

  use: {
    /* Base URL so tests can use relative paths like page.goto('/dashboard') */
    baseURL: "http://localhost:3000",

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Ignore HTTPS errors */
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
  ]

  /* The dev servers must be started manually before running e2e tests.
   *
   * To auto-start them, uncomment the webServer block:
   *
   * webServer: [
   *   {
   *     command: "npm start",
   *     url: "http://localhost:3000",
   *     reuseExistingServer: true,
   *     timeout: 120_000,
   *   },
   * ],
   */
});
