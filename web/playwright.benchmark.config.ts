import { defineConfig, devices } from "@playwright/test";
import { platform } from "node:os";

/** Opt-in browser performance suites. They are excluded from functional CI. */
export default defineConfig({
  testDir: "./tests/benchmarks",
  testMatch: /(?:realtime-perf|chat-history-scroll|timeline-preview-perf)\.spec\.ts$/,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  globalSetup: "./tests/globalSetup.ts",
  reporter: process.env.CI
    ? [
        ["github"],
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }]
      ]
    : "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: process.env.TIMELINE_PERF_HEADLESS === "1",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: platform() === "darwin"
            ? ["--enable-unsafe-webgpu", "--enable-webgpu-developer-features"]
            : [
                "--enable-features=Vulkan,UseSkiaRenderer",
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-webgpu",
                "--enable-webgpu-developer-features"
              ]
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
