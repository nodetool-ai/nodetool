/**
 * Documentation Screenshot Capture
 *
 * Takes screenshots of the real NodeTool UI. API calls are handled by a mock
 * HTTP server (started in globalSetup.ts) so no real backend is needed.
 *
 * Usage:
 *   npm run screenshots                    # Capture only missing screenshots
 *   npm run screenshots:force              # Re-capture every screenshot
 *   FORCE_SCREENSHOTS=true npx playwright test tests/benchmarks/screenshots.spec.ts
 *
 * playwright.config.ts auto-starts the Vite dev server pointed at the mock API.
 */

import { test, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { waitForAnimation } from "./helpers/waitHelpers";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(
  CURRENT_DIR,
  "../../../docs/assets/screenshots"
);

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Save a full-viewport screenshot */
async function saveScreenshot(
  page: Page,
  filename: string,
  fullPage = false
): Promise<void> {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage });
  console.log(`  📸 ${filename}`);
}

/** Save a screenshot cropped to a specific element */
async function saveElementScreenshot(
  page: Page,
  selector: string,
  filename: string,
  timeout = 5000
): Promise<boolean> {
  const element = page.locator(selector).first();
  if ((await element.count()) === 0) {
    console.warn(`  ⚠ Element not found: ${selector}`);
    return false;
  }
  try {
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await element.screenshot({ path: filepath, timeout });
    console.log(`  📸 ${filename} (${selector})`);
    return true;
  } catch {
    console.warn(`  ⚠ Element screenshot failed for ${selector}`);
    return false;
  }
}

/** Skip a test if the screenshot already exists and FORCE_SCREENSHOTS is not set */
function shouldSkip(filename: string): boolean {
  if (process.env.FORCE_SCREENSHOTS === "true") return false;
  return fs.existsSync(path.join(SCREENSHOT_DIR, filename));
}

/**
 * Navigate to a page and wait for the app to finish loading.
 * Asserts that no React ErrorBoundary is visible (which would indicate a crash).
 * Uses a short network-idle timeout since some background retries (HMR, etc.)
 * may never fully settle.
 */
async function gotoPage(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // Wait for React to hydrate; cap networkidle so we don't hang on retries
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await waitForAnimation(page, 1000);
  // Fail fast if React Router caught an error and rendered the error boundary
  await assertNoErrorBoundary(page);
}

/**
 * Fail the test if the React Router error boundary is visible.
 * The boundary renders with class `errorBoundaryStyles` and the text "Something went wrong".
 */
async function assertNoErrorBoundary(page: Page): Promise<void> {
  const errorEl = page.locator('[class*="errorBoundary"]').first();
  const hasError = (await errorEl.count()) > 0;
  if (hasError) {
    const errorText = await errorEl.innerText().catch(() => "(could not read error text)");
    // Expand error details if present to get the actual error
    await page.locator('button', { hasText: /show details/i }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    const detailText = await page.locator('.details-section').innerText().catch(() => "");
    // Capture a failure screenshot for diagnostics
    const failPath = path.join(SCREENSHOT_DIR, "_error_" + Date.now() + ".png");
    await page.screenshot({ path: failPath }).catch(() => {});
    throw new Error(
      `React ErrorBoundary is visible — the page crashed.\nURL: ${page.url()}\nError: ${errorText.substring(0, 200)}\nDetails: ${detailText.substring(0, 600)}`
    );
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────
//
// Each test captures a UNIQUE page or interaction state. No two tests produce
// the same screenshot.

// Skip when executed by Jest (only Playwright runner)
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Documentation Screenshots", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    // ── Dashboard ───────────────────────────────────────────────────────────
    test("Dashboard", async ({ page }) => {
      test.skip(shouldSkip("dashboard-overview.png"), "Already captured");
      await gotoPage(page, "/");
      await saveScreenshot(page, "dashboard-overview.png");
    });

    test("Dashboard – mobile (375×812)", async ({ page }) => {
      test.skip(shouldSkip("dashboard-mobile.png"), "Already captured");
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPage(page, "/");
      await saveScreenshot(page, "dashboard-mobile.png");
    });

    test("Dashboard – tablet (768×1024)", async ({ page }) => {
      test.skip(shouldSkip("dashboard-tablet.png"), "Already captured");
      await page.setViewportSize({ width: 768, height: 1024 });
      await gotoPage(page, "/");
      await saveScreenshot(page, "dashboard-tablet.png");
    });

    // ── Editor ──────────────────────────────────────────────────────────────
    test("Editor", async ({ page }) => {
      test.skip(shouldSkip("editor-empty-state.png"), "Already captured");
      await gotoPage(page, "/editor/wf-story-generator");
      await saveScreenshot(page, "editor-empty-state.png");
    });

    // ── Chat ────────────────────────────────────────────────────────────────
    test("Chat", async ({ page }) => {
      test.skip(shouldSkip("global-chat-interface.png"), "Already captured");
      await gotoPage(page, "/chat");
      await saveScreenshot(page, "global-chat-interface.png");
    });

    test("Standalone chat", async ({ page }) => {
      test.skip(shouldSkip("standalone-chat.png"), "Already captured");
      await gotoPage(page, "/standalone-chat");
      await saveScreenshot(page, "standalone-chat.png");
    });

    test("Chat – mobile (375×812)", async ({ page }) => {
      test.skip(shouldSkip("chat-mobile.png"), "Already captured");
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPage(page, "/chat");
      await saveScreenshot(page, "chat-mobile.png");
    });

    // ── Templates ───────────────────────────────────────────────────────────
    test("Templates", async ({ page }) => {
      test.skip(shouldSkip("templates-grid.png"), "Already captured");
      await gotoPage(page, "/templates");
      await saveScreenshot(page, "templates-grid.png");
    });

    // ── Assets ──────────────────────────────────────────────────────────────
    // NOTE: /assets and /apps routes still crash due to deep Zustand object
    // selector issues in useMiniAppRunner and AssetGrid sub-components.
    // These need a broader refactor (178 remaining instances codebase-wide).

    // ── Collections ─────────────────────────────────────────────────────────
    test("Collections", async ({ page }) => {
      test.skip(shouldSkip("collections-explorer.png"), "Already captured");
      await gotoPage(page, "/collections");
      await saveScreenshot(page, "collections-explorer.png");
    });

    // ── Models ──────────────────────────────────────────────────────────────
    test("Models", async ({ page }) => {
      test.skip(shouldSkip("models-list.png"), "Already captured");
      await gotoPage(page, "/models");
      await saveScreenshot(page, "models-list.png");
    });

    // ── Settings ────────────────────────────────────────────────────────────
    test("Settings dialog", async ({ page }) => {
      test.skip(shouldSkip("settings-dialog.png"), "Already captured");
      await gotoPage(page, "/");
      await page.keyboard.press("Control+,");
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "settings-dialog.png");
    });

    test("Settings – API keys tab", async ({ page }) => {
      test.skip(shouldSkip("settings-api-keys.png"), "Already captured");
      await gotoPage(page, "/");
      await page.keyboard.press("Control+,");
      await waitForAnimation(page, 600);
      const apiKeysTab = page
        .getByRole("tab")
        .filter({ hasText: /api.*key|secret/i })
        .first();
      if ((await apiKeysTab.count()) > 0) {
        await apiKeysTab.click();
        await waitForAnimation(page, 400);
      }
      await saveScreenshot(page, "settings-api-keys.png");
    });

    // ── Isolated components ─────────────────────────────────────────────────
    test("App header strip", async ({ page }) => {
      test.skip(shouldSkip("app-header.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 80 });
      await gotoPage(page, "/preview/app-header");
      await saveScreenshot(page, "app-header.png");
    });

    test("Models – isolated component", async ({ page }) => {
      test.skip(shouldSkip("component-models.png"), "Already captured");
      await gotoPage(page, "/preview/models");
      await saveScreenshot(page, "component-models.png");
    });
  });
}
