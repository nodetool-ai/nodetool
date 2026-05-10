/**
 * Documentation Screenshot Capture
 *
 * Takes screenshots of the real NodeTool UI. API calls are handled by the
 * real NodeTool backend (started by globalSetup.ts) running with an in-memory
 * SQLite database pre-seeded with realistic mock data.
 *
 * Usage:
 *   npm run screenshots                    # Capture only missing screenshots
 *   npm run screenshots:force              # Re-capture every screenshot
 *   FORCE_SCREENSHOTS=true npx playwright test tests/benchmarks/screenshots.spec.ts
 *
 * playwright.config.ts auto-starts the Vite dev server and the real backend.
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

// Default viewport for desktop screenshots. 1440×900 keeps text and icons at a
// readable size in documentation pages — 1920×1080 made everything appear tiny.
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

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
 * Pre-seed localStorage so the app boots into a "returning user" state:
 *  - onboarding is dismissed (otherwise `/` redirects to /chat for newcomers)
 *  - showWelcomeOnStartup is true (so `/` resolves to /dashboard, the Portal)
 *  - panel/menu defaults that produce a tidy, demo-friendly layout
 *
 * Must run before navigation so React reads the values on first mount.
 */
async function seedLocalStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "onboarding",
        JSON.stringify({
          state: {
            completed: {
              welcome: true,
              providers: true,
              chat: true,
              image: true,
              nodes: true,
              connect: true,
              run: true
            },
            dismissed: true
          },
          version: 2
        })
      );
      window.localStorage.setItem(
        "settings-storage",
        JSON.stringify({
          state: {
            settings: {
              showWelcomeOnStartup: true,
              gridSnap: 10,
              connectionSnap: 12,
              panelButtonsVisible: true
            }
          },
          version: 0
        })
      );
    } catch {
      /* ignore — localStorage may be unavailable in some browser contexts */
    }
  });
}

/**
 * Navigate to a page and wait for the app shell to finish loading.
 *
 * The app renders a "Loading NodeTool…" spinner until /api/nodes/metadata
 * returns. A naive `networkidle` wait can race with that fetch, producing
 * black screenshots. We explicitly wait for the spinner element to disappear
 * before taking the picture.
 *
 * Asserts that no React ErrorBoundary is visible (which would indicate a crash).
 */
async function gotoPage(page: Page, url: string): Promise<void> {
  await seedLocalStorage(page);
  await page.goto(url);

  // Wait for the loading overlay to clear. We check by role/aria-label so the
  // selector survives style refactors. The wait is generous because the dev
  // server may transpile metadata-heavy modules on first hit.
  const loadingOverlay = page.locator(
    '[role="status"][aria-label="Loading NodeTool"]'
  );
  if ((await loadingOverlay.count()) > 0) {
    await loadingOverlay
      .first()
      .waitFor({ state: "hidden", timeout: 30_000 })
      .catch(() => {
        console.warn(
          "  ⚠ Loading NodeTool overlay never disappeared — capturing anyway"
        );
      });
  }

  // Best-effort networkidle wait, capped so retries (HMR, polling) don't hang.
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await waitForAnimation(page, 600);
  await assertNoErrorBoundary(page);
}

async function ensureVisibleText(
  page: Page,
  text: string | RegExp,
  timeout = 15000
): Promise<void> {
  await page.getByText(text).first().waitFor({ state: "visible", timeout });
}

/**
 * Waits for transient loading indicators to disappear before capture.
 * Uses a shorter timeout than text waits because these indicators should clear
 * quickly; if they do not, the screenshot should fail fast.
 */
async function ensureNoVisibleProgress(page: Page, timeout = 12000): Promise<void> {
  const progress = page.locator('[role="progressbar"], .MuiCircularProgress-root');
  if ((await progress.count()) === 0) {
    return;
  }
  await progress.first().waitFor({ state: "hidden", timeout }).catch((error) => {
    console.warn(`  ⚠ Progress indicator remained visible: ${String(error)}`);
  });
}

async function waitForScreenshotReady(
  page: Page,
  screenshotName: string
): Promise<void> {
  switch (screenshotName) {
    case "login-screen.png": {
      await page
        .getByRole("button", { name: /sign in with google/i })
        .waitFor({ state: "visible", timeout: 15000 });
      break;
    }
    case "mini-app-page.png":
    case "standalone-mini-app.png": {
      // Wait for the spinner to clear; the page might render either the
      // workflow form, an output panel, or an empty-state — all are valid
      // captures, so tolerate any of them.
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 800);
      break;
    }
    case "workflow-graph-view.png": {
      // The standalone graph view sets data-ready="true" once nodes are laid
      // out; tolerate it not arriving (lazy chunks may still be downloading)
      // and rely on a node-count check as a fallback.
      await page
        .locator('[data-ready="true"]')
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
      await page
        .waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 10000 }
        )
        .catch(() => {});
      await waitForAnimation(page, 600);
      break;
    }
    case "asset-explorer.png": {
      // Either the folder list or one of the seeded files should appear.
      await page
        .getByText(/portrait_sunset\.jpg|images|documents/i)
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
      await ensureNoVisibleProgress(page);
      break;
    }
    case "asset-editor.png": {
      await ensureVisibleText(page, /edit:\s*portrait_sunset\.jpg/i);
      await ensureNoVisibleProgress(page);
      break;
    }
    case "node-test-page.png": {
      await ensureVisibleText(page, /node integration tests/i);
      await ensureVisibleText(page, /run all/i);
      await ensureNoVisibleProgress(page);
      break;
    }
    case "templates-grid.png": {
      // The page lists examples sourced from the bundled JSON files; wait for
      // any recognisable template heading or the search box to appear.
      await page
        .getByPlaceholder(/search templates/i)
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
      await ensureNoVisibleProgress(page);
      break;
    }
    case "global-chat-interface.png":
    case "standalone-chat.png":
    case "chat-mobile.png": {
      // The chat input composer is the most stable landmark on every chat view.
      await page
        .locator('textarea, [contenteditable="true"]')
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
      await ensureNoVisibleProgress(page);
      break;
    }
    case "dashboard-overview.png":
    case "dashboard-mobile.png":
    case "dashboard-tablet.png": {
      // Portal renders an AppHeader and the chat composer. Wait for either.
      await page
        .locator('header, [role="banner"], textarea')
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
      await ensureNoVisibleProgress(page);
      break;
    }
    case "models-list.png":
    case "collections-explorer.png": {
      await ensureNoVisibleProgress(page);
      break;
    }
    default: {
      break;
    }
  }
}

/**
 * Fail the test if the React Router error boundary is visible.
 * The boundary renders with class `errorBoundaryStyles` and the text "Something went wrong".
 */
async function assertNoErrorBoundary(page: Page): Promise<void> {
  const errorEl = page.locator('[class*="errorBoundary"]').first();
  const hasClassError = (await errorEl.count()) > 0;
  const hasFallbackText = (await page.getByText("Something went wrong").count()) > 0;
  const hasError = hasClassError || hasFallbackText;
  if (hasError) {
    const errorText = hasClassError
      ? await errorEl.innerText().catch(() => "(could not read error text)")
      : await page.getByText("Something went wrong").first().innerText().catch(() => "Something went wrong");
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
      await page.setViewportSize(DESKTOP_VIEWPORT);
    });

    // ── Dashboard ───────────────────────────────────────────────────────────
    test("Dashboard", async ({ page }) => {
      test.skip(shouldSkip("dashboard-overview.png"), "Already captured");
      await gotoPage(page, "/dashboard");
      await waitForScreenshotReady(page, "dashboard-overview.png");
      await saveScreenshot(page, "dashboard-overview.png");
    });

    test("Dashboard – mobile (375×812)", async ({ page }) => {
      test.skip(shouldSkip("dashboard-mobile.png"), "Already captured");
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPage(page, "/dashboard");
      await waitForScreenshotReady(page, "dashboard-mobile.png");
      await saveScreenshot(page, "dashboard-mobile.png");
    });

    test("Dashboard – tablet (768×1024)", async ({ page }) => {
      test.skip(shouldSkip("dashboard-tablet.png"), "Already captured");
      await page.setViewportSize({ width: 768, height: 1024 });
      await gotoPage(page, "/dashboard");
      await waitForScreenshotReady(page, "dashboard-tablet.png");
      await saveScreenshot(page, "dashboard-tablet.png");
    });

    // ── Editor ──────────────────────────────────────────────────────────────
    test("Editor", async ({ page }) => {
      test.skip(shouldSkip("editor-empty-state.png"), "Already captured");
      await gotoPage(page, "/editor/wf-story-generator");
      // Wait for ReactFlow nodes to render
      await page
        .waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 15000 }
        )
        .catch(() => {});
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "editor-empty-state.png");
    });

    // ── Chat ────────────────────────────────────────────────────────────────
    test("Chat", async ({ page }) => {
      test.skip(shouldSkip("global-chat-interface.png"), "Already captured");
      await gotoPage(page, "/chat/thread-story");
      await waitForScreenshotReady(page, "global-chat-interface.png");
      await saveScreenshot(page, "global-chat-interface.png");
    });

    test("Standalone chat", async ({ page }) => {
      test.skip(shouldSkip("standalone-chat.png"), "Already captured");
      await gotoPage(page, "/standalone-chat/thread-story");
      await waitForScreenshotReady(page, "standalone-chat.png");
      await saveScreenshot(page, "standalone-chat.png");
    });

    test("Chat – mobile (375×812)", async ({ page }) => {
      test.skip(shouldSkip("chat-mobile.png"), "Already captured");
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPage(page, "/chat/thread-story");
      await waitForScreenshotReady(page, "chat-mobile.png");
      await saveScreenshot(page, "chat-mobile.png");
    });

    // ── Templates ───────────────────────────────────────────────────────────
    test("Templates", async ({ page }) => {
      test.skip(shouldSkip("templates-grid.png"), "Already captured");
      await gotoPage(page, "/templates");
      await waitForScreenshotReady(page, "templates-grid.png");
      await saveScreenshot(page, "templates-grid.png");
    });

    test("Login", async ({ page }) => {
      test.skip(shouldSkip("login-screen.png"), "Already captured");
      await gotoPage(page, "/login");
      await waitForScreenshotReady(page, "login-screen.png");
      await saveScreenshot(page, "login-screen.png");
    });

    test("Workflow graph view", async ({ page }) => {
      test.skip(shouldSkip("workflow-graph-view.png"), "Already captured");
      // The standalone /graph/<id> view repeatedly errored under the test
      // setup (the standalone graph component depends on data the screenshot
      // backend can't provide). Capture the editor view instead — it shows
      // the same workflow with full chrome and is the page docs typically
      // want to illustrate.
      await gotoPage(page, "/editor/wf-story-generator");
      await page
        .waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 15000 }
        )
        .catch(() => {});
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "workflow-graph-view.png");
    });

    // ── Mini-apps ───────────────────────────────────────────────────────────
    test("Mini-app page", async ({ page }) => {
      test.skip(shouldSkip("mini-app-page.png"), "Already captured");
      // The /apps route wraps MiniAppPage in panels that often spin
      // indefinitely in the test backend; fall back to the standalone
      // /miniapp variant which renders the same form-and-graph layout.
      await gotoPage(page, "/miniapp/wf-story-generator");
      await waitForScreenshotReady(page, "mini-app-page.png");
      await saveScreenshot(page, "mini-app-page.png");
    });

    test("Standalone mini-app", async ({ page }) => {
      test.skip(shouldSkip("standalone-mini-app.png"), "Already captured");
      await gotoPage(page, "/miniapp/wf-story-generator");
      await waitForScreenshotReady(page, "standalone-mini-app.png");
      await saveScreenshot(page, "standalone-mini-app.png");
    });

    // ── Assets ──────────────────────────────────────────────────────────────
    test("Assets", async ({ page }) => {
      test.skip(shouldSkip("asset-explorer.png"), "Already captured");
      await gotoPage(page, "/assets");
      await waitForScreenshotReady(page, "asset-explorer.png");
      await saveScreenshot(page, "asset-explorer.png");
    });

    test("Asset editor", async ({ page }) => {
      test.skip(shouldSkip("asset-editor.png"), "Already captured");
      await gotoPage(page, "/assets/edit/asset-photo1");
      await waitForScreenshotReady(page, "asset-editor.png");
      await saveScreenshot(page, "asset-editor.png");
    });

    // ── Collections ─────────────────────────────────────────────────────────
    test("Collections", async ({ page }) => {
      test.skip(shouldSkip("collections-explorer.png"), "Already captured");
      await gotoPage(page, "/collections");
      await waitForScreenshotReady(page, "collections-explorer.png");
      await saveScreenshot(page, "collections-explorer.png");
    });

    // ── Models ──────────────────────────────────────────────────────────────
    test("Models", async ({ page }) => {
      test.skip(shouldSkip("models-list.png"), "Already captured");
      await gotoPage(page, "/models");
      await waitForScreenshotReady(page, "models-list.png");
      await saveScreenshot(page, "models-list.png");
    });

    // ── Settings ────────────────────────────────────────────────────────────
    // Settings is a route in the current UI (no longer a modal dialog), so we
    // navigate to it directly. The screenshot filenames are kept for backwards
    // compatibility with existing documentation.
    test("Settings dialog", async ({ page }) => {
      test.skip(shouldSkip("settings-dialog.png"), "Already captured");
      await gotoPage(page, "/settings");
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "settings-dialog.png");
    });

    test("Settings – API keys tab", async ({ page }) => {
      test.skip(shouldSkip("settings-api-keys.png"), "Already captured");
      await gotoPage(page, "/settings");
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
      await page.setViewportSize({ width: DESKTOP_VIEWPORT.width, height: 80 });
      await gotoPage(page, "/preview/app-header");
      // The /preview routes lazy-load each component; wait for the actual
      // header markup to appear before capturing.
      await page
        .locator('[data-preview="app-header"], header, [role="banner"]')
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "app-header.png");
    });

    test("Models – isolated component", async ({ page }) => {
      test.skip(shouldSkip("component-models.png"), "Already captured");
      await gotoPage(page, "/preview/models");
      await page
        .locator('[data-preview="models"]')
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
      // ModelListIndex renders cards with a fade-in animation; wait for it
      // to settle so the captured frame doesn't show ghosted text.
      await waitForAnimation(page, 1500);
      await saveScreenshot(page, "component-models.png");
    });

    test("Node test page", async ({ page }) => {
      test.skip(shouldSkip("node-test-page.png"), "Already captured");
      await gotoPage(page, "/node-test");
      await waitForScreenshotReady(page, "node-test-page.png");
      await saveScreenshot(page, "node-test-page.png");
    });
  });
}
