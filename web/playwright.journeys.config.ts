import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);

/**
 * Playwright configuration for the user-journey suite.
 *
 * The suite (`tests/journeys/`) drives the app the way a person does — build a
 * graph and run it, send a chat message, run a mini app, browse the library and
 * assets — and asserts on the result the user would see. It is the layer above
 * the smoke suite (does a page mount) and the visual suite (does a page look
 * right): those catch a broken page, this catches a page that renders perfectly
 * and does nothing.
 *
 * Determinism: `tests/journeys/globalSetup.ts` starts the seeded backend in
 * hermetic mode (`NODETOOL_FAKE_PROVIDERS=1`), so every provider and external
 * node is a deterministic fake — no API keys, no network, no wall-clock
 * dependence — while structural and pure-compute nodes run for real.
 *
 * Run:
 *   npm run test:journeys
 *   npx playwright test -c playwright.journeys.config.ts --headed
 */
export default defineConfig({
  testDir: "./tests/journeys",
  testMatch: /.*\.spec\.ts$/,

  /* Journeys run whole workflows end to end, so they need more headroom than a
     page-load check. */
  timeout: 120_000,
  expect: { timeout: 20_000 },

  forbidOnly: !!process.env.CI,
  /* One retry in CI absorbs a cold-start blip; a real regression fails both
     attempts. */
  retries: process.env.CI ? 1 : 0,
  /* Sequential: the suite shares one seeded in-memory backend, and journeys
     mutate it (adding nodes, sending messages). Parallel workers would race on
     that shared state. */
  workers: 1,

  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : "list",

  globalSetup: "./tests/journeys/globalSetup.ts",

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    /* Journeys are long; a trace turns "it failed at step 9" into a replay. */
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true
  },

  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        /* Wide enough that the editor canvas is not covered by the side panels
           — several journeys click node fields near the left rail. */
        viewport: { width: 1600, height: 1000 },
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
            : {}),
          args: [
            "--enable-features=Vulkan,UseSkiaRenderer",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-webgpu-developer-features"
          ]
        }
      }
    }
  ],

  /**
   * Auto-start Vite. It proxies /api/* and /ws to the backend on :7777 started
   * by globalSetup. Reuse an already-running server locally so `npm run dev`
   * and `npm run test:journeys` don't fight over port 3000.
   */
  webServer: {
    command: `npm run dev -- --port ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
