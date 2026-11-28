import { defineConfig, devices } from "@playwright/test";
import {
  PUBLIC_APP_BACKEND_PORT,
  PUBLIC_APP_WEB_PORT
} from "./tests/public-app/constants";

/**
 * Playwright configuration for the public app link suite.
 *
 * `tests/public-app/globalSetup.ts` starts the real API server in production
 * mode with auth enforced and deploys a fixture app to a public link. The
 * spec then opens that link in a browser with no session, runs the app, and
 * checks that the link's session reaches nothing else.
 *
 * It needs its own backend and web ports because the journey suite's backend
 * has no auth at all. Vite proxies to this suite's backend through
 * `PROXY_API_TARGET`.
 *
 * Run:
 *   npm run test:public-app
 */
export default defineConfig({
  testDir: "./tests/public-app",
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"]],
  globalSetup: "./tests/public-app/globalSetup.ts",
  use: {
    baseURL: `http://localhost:${PUBLIC_APP_WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {}
      }
    }
  ],
  webServer: {
    command: `npm run dev -- --port ${PUBLIC_APP_WEB_PORT} --strictPort`,
    url: `http://localhost:${PUBLIC_APP_WEB_PORT}`,
    env: { PROXY_API_TARGET: `http://127.0.0.1:${PUBLIC_APP_BACKEND_PORT}` },
    // Never reuse: a server already on the port would proxy to another backend.
    reuseExistingServer: false,
    timeout: 120_000
  }
});
