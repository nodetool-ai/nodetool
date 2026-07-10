import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E visual regression tests.
 *
 * These tests assert against committed screenshot baselines via
 * `expect(page).toHaveScreenshot(...)` and fail on unexpected pixel diffs.
 * They complement the documentation screenshot suite
 * (tests/benchmarks/screenshots.spec.ts) which only writes PNGs for the docs.
 *
 * What it exercises (critical user flows):
 *   - Node Graph Editor: empty canvas, nodes+edges, inspector, timeline
 *   - Chat Interface: empty thread, message thread, media composer, menus
 *   - Settings: API Keys + Integrations tabs and provider cards
 *   - Design system: isolated component previews (component gallery)
 *
 * Determinism:
 *   - The real NodeTool backend is started once by `tests/globalSetup.ts` with
 *     an in-memory SQLite DB pre-seeded with fixed mock data (no clock, no
 *     network). Vite serves the frontend (auto-started below) and proxies
 *     /api + /ws to the backend on :7777.
 *   - Theme is pinned via localStorage; CSS transitions/animations are frozen
 *     via an init script (see tests/visual/visualHelpers.ts).
 *   - Single worker, no retries — visual diffs must be deterministic.
 *
 * Projects (browser × viewport):
 *   - desktop-chromium  (1440×900)  → runs every visual test
 *   - mobile-chromium   (375×812)   → @responsive tests only
 *   - tablet-chromium   (768×1024)  → @responsive tests only
 *   - firefox-desktop   (1440×900)  → @smoke tests only (cross-browser guard)
 *
 * Run:
 *   npx playwright test --config=playwright.visual.config.ts
 *   npx playwright test --config=playwright.visual.config.ts --update-snapshots
 *   npm run test:visual            # alias for the first command
 *   npm run test:visual:update     # regenerate baselines
 *
 * Baselines live next to each spec under `<spec>.spec.ts-snapshots/` and are
 * committed. See tests/visual/README.md for the full update workflow.
 */
export default defineConfig({
  testDir: "./tests/visual",
  testMatch: /.*\.spec\.ts$/,

  /* One test can take a while (backend round-trips + canvas layout). */
  timeout: 60_000,

  /* Visual assertions compare many pixels — give them room. */
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Sub-pixel font-hinting / anti-aliasing differs slightly between
      // Chromium and Firefox and across headless renderers. A 1% tolerance
      // absorbs that noise while still failing on real layout regressions.
      maxDiffPixelRatio: 0.01,
      threshold: 0.2
    }
  },

  forbidOnly: !!process.env.CI,
  /* No retries — a flaky visual diff should be fixed, not hidden. */
  retries: 0,
  /* Sequential execution: deterministic + the single shared backend is not
     designed for concurrent browsers hammering it at once. */
  workers: 1,

  reporter: process.env.CI ? "github" : "list",

  /** Reuse the same seeded real backend the screenshot suite uses. */
  globalSetup: "./tests/globalSetup.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true
  },

  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
            : {}),
          args: [
            "--enable-features=Vulkan,UseSkiaRenderer",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-webgpu-developer-features"
          ]
        }
      }
    },
    {
      name: "mobile-chromium",
      grep: /@responsive/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
            : {}),
          args: [
            "--enable-features=Vulkan,UseSkiaRenderer",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-webgpu-developer-features"
          ]
        }
      }
    },
    {
      name: "tablet-chromium",
      grep: /@responsive/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
            : {}),
          args: [
            "--enable-features=Vulkan,UseSkiaRenderer",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-webgpu-developer-features"
          ]
        }
      }
    },
    {
      name: "firefox-desktop",
      // Cross-browser smoke guard: a small, stable subset. Firefox does not
      // initialise the WebGPU canvases the same way Chromium does, so we keep
      // it to pages that don't depend on them.
      grep: /@smoke/,
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 900 }
      }
    }
  ],

  /**
   * Auto-start Vite. The dev server proxies /api/* and /ws to the backend on
   * :7777 started by globalSetup. Reuse an already-running server locally so
   * `npm run dev` + `npm run test:visual` don't fight over port 3000.
   */
  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
