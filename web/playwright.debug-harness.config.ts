import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the workflow debug harness (`nodetool debug --browser`).
 *
 * Reuses the E2E runner's hermetic backend (packages/websocket/src/e2e-server.ts,
 * spawned by the shared globalSetup) so any workflow runs without API keys, and
 * the standard Vite dev server. The single spec reads the target graph from
 * NODETOOL_DEBUG_GRAPH, drives `window.__E2E__.runGraph(...)`, and writes the
 * record / screenshot / console errors into NODETOOL_DEBUG_OUT.
 */
export default defineConfig({
  testDir: "./tests/debug-harness",
  testMatch: "**/debug.spec.ts",

  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",

  globalSetup: "./tests/e2e-runner/globalSetup.ts",

  use: {
    baseURL: "http://localhost:3000",
    ignoreHTTPSErrors: true,
    screenshot: "off",
    trace: "retain-on-failure"
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
    reuseExistingServer: true,
    timeout: 120_000
  }
});
