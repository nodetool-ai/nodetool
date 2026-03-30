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
 * Uses a short network-idle timeout since some background retries (HMR, etc.)
 * may never fully settle.
 */
async function gotoPage(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // Wait for React to hydrate; cap networkidle so we don't hang on retries
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await waitForAnimation(page, 1000);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

// Skip when executed by Jest (only Playwright runner)
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  // ===========================================================================
  // DASHBOARD / PORTAL
  // ===========================================================================
  test.describe("Dashboard", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test("Dashboard overview", async ({ page }) => {
      test.skip(shouldSkip("dashboard-overview.png"), "Already captured");
      await gotoPage(page, "/");
      await saveScreenshot(page, "dashboard-overview.png");
    });

    test("Dashboard – workflow list", async ({ page }) => {
      test.skip(shouldSkip("dashboard-workflows.png"), "Already captured");
      await gotoPage(page, "/");
      await saveScreenshot(page, "dashboard-workflows.png");
    });
  });

  // ===========================================================================
  // TEMPLATES
  // ===========================================================================
  test.describe("Templates", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test("Templates grid", async ({ page }) => {
      test.skip(shouldSkip("templates-grid.png"), "Already captured");
      await gotoPage(page, "/templates");
      await saveScreenshot(page, "templates-grid.png");
    });
  });

  // ===========================================================================
  // CHAT
  // ===========================================================================
  test.describe("Chat", () => {
    test("Global chat interface", async ({ page }) => {
      test.skip(shouldSkip("global-chat-interface.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/chat");
      await saveScreenshot(page, "global-chat-interface.png");
    });

    test("Standalone chat", async ({ page }) => {
      test.skip(shouldSkip("standalone-chat.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/standalone-chat");
      await saveScreenshot(page, "standalone-chat.png");
    });

    test("Chat – mobile viewport", async ({ page }) => {
      test.skip(shouldSkip("chat-mobile.png"), "Already captured");
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPage(page, "/chat");
      await saveScreenshot(page, "chat-mobile.png");
    });
  });

  // ===========================================================================
  // MINI-APPS
  // ===========================================================================
  test.describe("Mini-Apps", () => {
    test("Mini-apps gallery", async ({ page }) => {
      test.skip(shouldSkip("mini-apps-page.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/miniapps");
      await saveScreenshot(page, "mini-apps-page.png");
    });
  });

  // ===========================================================================
  // WORKFLOW EDITOR
  // ===========================================================================
  test.describe("Workflow Editor", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test("Editor – empty canvas", async ({ page }) => {
      test.skip(shouldSkip("editor-empty-state.png"), "Already captured");
      await gotoPage(page, "/editor/wf-story-generator");
      await saveScreenshot(page, "editor-empty-state.png");
    });

    test("Editor – workflow view (1280×720)", async ({ page }) => {
      test.skip(shouldSkip("editor-workflow-view.png"), "Already captured");
      await page.setViewportSize({ width: 1280, height: 720 });
      await gotoPage(page, "/editor/wf-story-generator");
      await saveScreenshot(page, "editor-workflow-view.png");
    });

    test("Canvas workflow", async ({ page }) => {
      test.skip(shouldSkip("canvas-workflow.png"), "Already captured");
      await gotoPage(page, "/editor/wf-story-generator");
      await saveScreenshot(page, "canvas-workflow.png");
    });
  });

  // ===========================================================================
  // ASSETS
  // ===========================================================================
  test.describe("Asset Explorer", () => {
    test("Asset explorer", async ({ page }) => {
      test.skip(shouldSkip("asset-explorer.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/assets");
      await saveScreenshot(page, "asset-explorer.png");
    });
  });

  // ===========================================================================
  // COLLECTIONS
  // ===========================================================================
  test.describe("Collections", () => {
    test("Collections explorer", async ({ page }) => {
      test.skip(shouldSkip("collections-explorer.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/collections");
      await saveScreenshot(page, "collections-explorer.png");
    });
  });

  // ===========================================================================
  // MODELS
  // ===========================================================================
  test.describe("Models", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test("Models list", async ({ page }) => {
      test.skip(shouldSkip("models-list.png"), "Already captured");
      await gotoPage(page, "/models");
      await saveScreenshot(page, "models-list.png");
    });

    test("Models manager – full view", async ({ page }) => {
      test.skip(shouldSkip("models-manager-full.png"), "Already captured");
      await gotoPage(page, "/models");
      await saveScreenshot(page, "models-manager-full.png");
    });
  });

  // ===========================================================================
  // ISOLATED COMPONENT PREVIEWS (via /preview routes, bypasses metadata gate)
  // ===========================================================================
  test.describe("Isolated Component Previews", () => {
    test("App Header – full width strip", async ({ page }) => {
      test.skip(shouldSkip("app-header.png"), "Already captured");
      // Use a narrow viewport height to get just the header
      await page.setViewportSize({ width: 1920, height: 80 });
      await gotoPage(page, "/preview/app-header");
      await saveScreenshot(page, "app-header.png");
    });

    test("Preview index page", async ({ page }) => {
      test.skip(shouldSkip("component-preview-index.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/preview");
      await saveScreenshot(page, "component-preview-index.png");
    });

    test("Dashboard – isolated preview", async ({ page }) => {
      test.skip(shouldSkip("component-dashboard.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/preview/dashboard");
      await saveScreenshot(page, "component-dashboard.png");
    });

    test("Models – isolated preview", async ({ page }) => {
      test.skip(shouldSkip("component-models.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/preview/models");
      await saveScreenshot(page, "component-models.png");
    });

    test("Assets – isolated preview", async ({ page }) => {
      test.skip(shouldSkip("component-assets.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/preview/assets");
      await saveScreenshot(page, "component-assets.png");
    });
  });

  // ===========================================================================
  // RESPONSIVE VIEWS
  // ===========================================================================
  test.describe("Responsive Viewports", () => {
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

    test("Editor – wide (2560×1440)", async ({ page }) => {
      test.skip(shouldSkip("editor-wide.png"), "Already captured");
      await page.setViewportSize({ width: 2560, height: 1440 });
      await gotoPage(page, "/editor/wf-story-generator");
      await saveScreenshot(page, "editor-wide.png");
    });
  });

  // ===========================================================================
  // SETTINGS
  // ===========================================================================
  test.describe("Settings", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test("Settings dialog", async ({ page }) => {
      test.skip(shouldSkip("settings-dialog.png"), "Already captured");
      await gotoPage(page, "/");
      // Open settings via keyboard shortcut
      await page.keyboard.press("Control+,");
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "settings-dialog.png");
    });

    test("Settings – general tab (1280×720)", async ({ page }) => {
      test.skip(shouldSkip("settings-general.png"), "Already captured");
      await page.setViewportSize({ width: 1280, height: 720 });
      await gotoPage(page, "/");
      await page.keyboard.press("Control+,");
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "settings-general.png");
    });

    test("Settings – API keys tab", async ({ page }) => {
      test.skip(shouldSkip("settings-api-keys.png"), "Already captured");
      await gotoPage(page, "/");
      await page.keyboard.press("Control+,");
      await waitForAnimation(page, 600);
      // Click the API Keys / Secrets tab if present
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
  });

  // ===========================================================================
  // CREATIVE STORY WORKFLOW
  // ===========================================================================
  test.describe("Workflow Thumbnails", () => {
    test("Creative story workflow", async ({ page }) => {
      test.skip(shouldSkip("creative-story-workflow.png"), "Already captured");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await gotoPage(page, "/editor/wf-story-generator");
      await saveScreenshot(page, "creative-story-workflow.png");
    });
  });
}
