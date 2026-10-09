import { defineConfig, devices } from "@playwright/test";

/**
 * Opt-in sketch editor benchmark (tests/benchmarks/sketch-perf.spec.ts).
 * Needs only the Vite dev server: the harness page mounts the editor on a
 * synthetic document without the backend. No GPU flags, so every run
 * measures the Canvas2D compositor.
 */
export default defineConfig({
  testDir: "./tests/benchmarks",
  testMatch: /sketch-perf\.spec\.ts$/,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.SKETCH_PERF_BASE_URL ?? "http://localhost:3000",
    headless: true
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 },
        launchOptions: process.env.SKETCH_PERF_CHROMIUM
          ? { executablePath: process.env.SKETCH_PERF_CHROMIUM }
          : {}
      }
    }
  ],
  webServer: process.env.SKETCH_PERF_BASE_URL ? undefined : {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
