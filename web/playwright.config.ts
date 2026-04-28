import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for NodeTool documentation screenshots.
 *
 * How it works:
 * 1. globalSetup spawns the real NodeTool backend (packages/websocket/src/
 *    screenshot-server.ts) via tsx with an in-memory SQLite database pre-seeded
 *    with mock workflows, assets, threads, messages and secrets.
 * 2. The Vite dev server is started normally — it proxies /api/* and /ws to
 *    http://localhost:7777 (the real backend) by default.
 * 3. Tests navigate to real app routes and take screenshots of actual components
 *    backed by a fully functional API instead of a simplified stub.
 *
 * Prerequisites:
 *   The @nodetool-ai/* workspace packages should be built before running:
 *     npm run build:packages   (from the repo root)
 *   If packages are not built, tsx will fall back to the development export
 *   condition and transpile TypeScript source on the fly (slower but works).
 *
 * Run screenshots:
 *   npm run screenshots            # only missing screenshots
 *   npm run screenshots:force      # re-capture every screenshot
 *   npx playwright test tests/benchmarks/screenshots.spec.ts --project=chromium
 *
 * The webServer entry below auto-starts Vite so you don't need to run it manually.
 * If Vite is already running, set reuseExistingServer: true to reuse it.
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
   * Start the real backend server before any tests run, and tear it down after.
   * The server listens on port 7777 and provides the full NodeTool API.
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
   * Auto-start Vite dev server.
   * Vite's proxy routes /api/* and /ws to http://localhost:7777 (the real
   * backend started by globalSetup) by default — no PROXY_API_TARGET needed.
   * Set reuseExistingServer: false so Vite always starts fresh.
   */
  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
