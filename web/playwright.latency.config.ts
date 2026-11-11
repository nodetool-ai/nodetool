import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);

/**
 * Playwright configuration for the latency suite (`tests/latency/`).
 *
 * Each test times a user interaction from the input event to the painted
 * result and fails above the 400 ms Doherty threshold. It shares the hermetic
 * seeded backend and the reset fixture with the journey suite.
 *
 * The suite measures the Vite production preview by default, because the dev
 * server's on-demand transforms and React development checks add hundreds of
 * milliseconds that no user sees. Set `LATENCY_DEV_SERVER=1` to profile
 * against `npm run dev` instead.
 *
 * Run:
 *   npm run test:latency
 */
const useDevServer = process.env.LATENCY_DEV_SERVER === "1";

export default defineConfig({
  testDir: "./tests/latency",
  testMatch: /.*\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  globalSetup: "./tests/journeys/globalSetup.ts",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // Tracing snapshots the DOM around every action on the page's main
    // thread, which adds tens of milliseconds to the samples it records.
    trace: "off",
    ignoreHTTPSErrors: true
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 },
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
            : {})
        }
      }
    }
  ],
  webServer: {
    command: useDevServer
      ? `npm run dev -- --port ${WEB_PORT}`
      : `npm run build && npx vite preview --port ${WEB_PORT} --strictPort`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000
  }
});
