import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Playwright config for the workflow-runner browser harness.
 *
 * Boots a Vite dev server that bundles `@nodetool-ai/workflow-runner` +
 * the browser-tagged subset of `@nodetool-ai/base-nodes`, loads the
 * harness page in a headless Chromium, and verifies that workflows
 * actually execute in a real browser environment.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5179",
    headless: true
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "vite --config vite.config.ts",
    cwd: HERE,
    url: "http://127.0.0.1:5179",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
