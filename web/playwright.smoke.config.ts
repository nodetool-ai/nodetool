import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);

/**
 * Playwright configuration for the page-load smoke suite.
 *
 * The suite (`tests/smoke/page-load.spec.ts`) navigates to every top-level app
 * route and fails on uncaught exceptions, React error boundaries, `console.error`,
 * or failed requests during load. It is the cheap first line of defence against
 * a change that crashes a whole page.
 *
 * Determinism: reuses the same seeded real backend the visual/screenshot suites
 * use (`tests/globalSetup.ts` — in-memory SQLite pre-seeded with mock
 * workflows/threads/timelines/sketches, no network, no clock). Vite serves the
 * frontend and proxies /api + /ws to the backend on :7777.
 *
 * Run:
 *   npx playwright test -c playwright.smoke.config.ts
 *   npm run test:smoke
 */
export default defineConfig({
  testDir: "./tests/smoke",
  testMatch: /.*\.spec\.ts$/,

  /* Backend round-trips + canvas-heavy editor routes need headroom. */
  timeout: 60_000,
  expect: { timeout: 15_000 },

  forbidOnly: !!process.env.CI,
  /* One retry in CI absorbs a rare cold-start blip without hiding real
     crashes (a genuinely broken page fails both attempts). */
  retries: process.env.CI ? 1 : 0,
  /* Sequential: the single shared backend isn't built for concurrent browsers. */
  workers: 1,

  reporter: process.env.CI ? [["github"], ["list"]] : "list",

  /** Reuse the seeded real backend the visual/screenshot suites use. */
  globalSetup: "./tests/globalSetup.ts",

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
            : {}),
          args: [
            "--enable-features=Vulkan,UseSkiaRenderer",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-webgpu-developer-features",
          ],
        },
      },
    },
  ],

  /**
   * Auto-start Vite. It proxies /api/* and /ws to the backend on :7777 started
   * by globalSetup. Reuse an already-running server locally so `npm run dev` +
   * `npm run test:smoke` don't fight over port 3000.
   */
  webServer: {
    command: `npm run dev -- --port ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
