import { defineConfig, devices } from "@playwright/test";

/** Opt-in realtime browser benchmark. It is excluded from functional CI. */
export default defineConfig({
  testDir: "./tests/benchmarks",
  testMatch: /realtime-perf\.spec\.ts$/,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
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
