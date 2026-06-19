import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the E2E workflow runner.
 *
 * globalSetup (tests/e2e-runner/globalSetup.ts):
 *   - builds the suite into web/public/e2e-suite
 *   - spawns the real backend (packages/websocket/src/e2e-server.ts) on :7777
 *     with JSONL tracing enabled
 *
 * The single spec loads /e2e-runner.html, steps through every workflow, and
 * writes a self-contained HTML report + artifacts under test-results/e2e-runner.
 *
 * Run:
 *   npm run test:e2e-runner            (from web/)
 */
export default defineConfig({
  testDir: "./tests/e2e-runner",
  testMatch: /suite\.spec\.ts$/,
  timeout: 40 * 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["list"]]
    : [["list"]],
  outputDir: "./test-results/e2e-runner/playwright",
  globalSetup: "./tests/e2e-runner/globalSetup.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "off",
    ignoreHTTPSErrors: true,
    viewport: { width: 1600, height: 1000 }
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 },
        launchOptions: {
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

  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
