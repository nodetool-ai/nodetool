import { defineConfig, devices } from "@playwright/test";

/** Opt-in browser budgets for the real workflow editor at large graph sizes. */
export default defineConfig({
  testDir: "./tests/benchmarks",
  testMatch: /workflow-editor-scale\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  globalSetup: "./tests/globalSetup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--enable-precise-memory-info"]
        }
      }
    }
  ],
  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
