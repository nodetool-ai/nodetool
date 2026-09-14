import { defineConfig, devices } from "@playwright/test";

/** Opt-in browser performance suites. They are excluded from functional CI. */
export default defineConfig({
  testDir: "./tests/benchmarks",
  testMatch: /(?:realtime-perf|chat-history-scroll)\.spec\.ts$/,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["github"],
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }]
      ]
    : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"]
    }
  ],
  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
