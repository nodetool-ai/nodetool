import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

/**
 * Smoke-test config for the marketing site (J3). The web server builds and
 * serves the production Next.js output so tests exercise the real SSR/prerender
 * pipeline, not the dev server.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // This budget covers a full production build, not just server startup. The
    // site prerenders 658 pages — one per template, mini-app, comparison and
    // use case — and that took past the old 180s ceiling, so every run failed
    // on the build rather than on anything a test asserted. Sized against a
    // ~3m30s local build with headroom for a slower CI runner; raise it again
    // if the page count grows rather than trimming what gets prerendered.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
  },
});
