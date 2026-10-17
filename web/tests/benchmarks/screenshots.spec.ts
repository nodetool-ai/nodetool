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

import { test, expect, type Page } from "@playwright/test";
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
  await assertNoErrorBoundary(page);
  await ensureNoVisibleProgress(page);
  await page.waitForFunction(
    () =>
      Array.from(document.images)
        .filter((image) => {
          const style = getComputedStyle(image);
          if (style.visibility === "hidden" || style.display === "none") {
            return false;
          }
          // A lazy image below the fold or in a hidden tab never loads, and
          // it is not in the picture either.
          const rect = image.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
          );
        })
        .every((image) => image.complete && image.naturalWidth > 0),
    undefined,
    { timeout: 15_000 }
  );
  await expect(page.locator("body")).toBeVisible();
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
): Promise<void> {
  await assertNoErrorBoundary(page);
  await ensureNoVisibleProgress(page);
  await waitForImages(page, timeout);
  const element = page.locator(selector).first();
  await expect(element, `required screenshot landmark: ${selector}`).toBeVisible({ timeout });
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await element.screenshot({ path: filepath, timeout });
  console.log(`  📸 ${filename} (${selector})`);
}

/**
 * Open the chat composer's control-chip popovers by index. The chat-mode
 * footer renders its chips in a stable order inside `.media-chip-main`:
 *   0 → add to message (+)
 *   1 → mode (Chat / Generate Images / …)
 *   2 → language model
 * The permission mode (Plan / Default / Auto) has its own trigger class.
 * Throws if the requested chip never appears because the composer is required
 * for these interaction captures.
 */
async function openComposerChip(
  page: Page,
  which: "mode" | "model" | "permission"
): Promise<void> {
  const selector =
    which === "permission"
      ? ".permission-selector-trigger"
      : ".media-chip-main .media-control-chip";
  const index = which === "mode" ? 1 : which === "model" ? 2 : 0;
  const chip = page.locator(selector).nth(index);
  await chip.waitFor({ state: "visible", timeout: 15000 });
  await chip.click();
  await waitForAnimation(page, 500);
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
/**
 * Optional pre-set panel visibility, applied via localStorage before the page
 * mounts. Each editor panel is hidden by default — pass `true` for the panels
 * you want visible in the screenshot.
 */
// Mirror the per-store union types so the seeded values match the runtime
// stores. The persist version below must also match each store's `version`
// or zustand discards the seeded state on rehydrate (the left/right panel
// stores moved to version 3, the bottom panel to version 2).
type LeftPanelView =
  | "workflows"
  | "sketches"
  | "timelines"
  | "settings"
  | "history"
  | "favorites"
  | "assets"
  | "apps"
  | "nodes";
type RightPanelView = "inspector";
type BottomPanelView =
  | "logs"
  | "queue"
  | "sandboxes"
  | "workers"
  | "versions"
  | "workspace"
  | "trace";

type PanelOverrides = {
  left?: { visible?: boolean; activeView?: LeftPanelView };
  right?: { visible?: boolean; activeView?: RightPanelView };
  bottom?: { visible?: boolean; activeView?: BottomPanelView };
};

async function seedLocalStorage(
  page: Page,
  panels?: PanelOverrides
): Promise<void> {
  const panelsArg = panels ?? {};
  await page.addInitScript((panelsInBrowser: PanelOverrides) => {
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

      const writePanel = (
        key: string,
        size: number,
        defaultView: string,
        version: number,
        opts: { visible?: boolean; activeView?: string } | undefined
      ) => {
        if (!opts) return;
        window.localStorage.setItem(
          key,
          JSON.stringify({
            state: {
              panel: {
                panelSize: size,
                isVisible: opts.visible ?? false,
                activeView: opts.activeView ?? defaultView
              }
            },
            // Persist version must match the matching store's `version`
            // (left=3, right=3, bottom=2). Mismatch → zustand discards
            // the seeded state on rehydrate.
            version
          })
        );
      };

      writePanel(
        "left-panel-storage",
        360,
        "workflows",
        3,
        panelsInBrowser.left
      );
      writePanel(
        "right-panel-storage",
        380,
        "inspector",
        3,
        panelsInBrowser.right
      );
      writePanel(
        "bottom-panel-storage",
        320,
        "logs",
        2,
        panelsInBrowser.bottom
      );
    } catch {
      /* ignore — localStorage may be unavailable in some browser contexts */
    }
  }, panelsArg);
}

type SeededTab = {
  type: string;
  ref: string;
  title: string;
  /** Tabs sharing a project render as one group in the tab bar. */
  projectId?: string;
};

/**
 * Pre-open workspace tabs (the tabbed-document shell at /workspace) by seeding
 * the WorkspaceTabsStore persist slot. `active` must be one of the seeded
 * tabs' ids (`${type}:${ref}`). Must run before navigation.
 */
async function seedWorkspaceTabs(
  page: Page,
  tabs: SeededTab[],
  active: string,
  activeProjectId: string | null = null
): Promise<void> {
  await page.addInitScript(
    (args: {
      tabs: SeededTab[];
      active: string;
      activeProjectId: string | null;
    }) => {
      try {
        window.localStorage.setItem(
          "workspace-tabs-storage",
          JSON.stringify({
            state: {
              tabs: args.tabs.map((t) => {
                const tab: Record<string, string> = {
                  id: `${t.type}:${t.ref}`,
                  type: t.type,
                  ref: t.ref,
                  mode: "edit",
                  title: t.title
                };
                // A tab with no project is loose, and the store reads that as
                // the key being absent rather than empty.
                if (t.projectId) {
                  tab.projectId = t.projectId;
                }
                return tab;
              }),
              activeTabId: args.active,
              activeProjectId: args.activeProjectId
            },
            // Must match WorkspaceTabsStore's persist `version` or zustand
            // discards the seeded state on rehydrate.
            version: 1
          })
        );
      } catch {
        /* ignore — localStorage may be unavailable */
      }
    },
    { tabs, active, activeProjectId }
  );
}

/**
 * Pre-select the chat model. A composer with none reads "Pick a language model
 * to send" — true of a fresh install, and not what a conversation looks like.
 */
async function seedChatModel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "global-chat-storage",
        JSON.stringify({
          state: {
            threads: {},
            selectedModel: {
              type: "language_model",
              id: "claude-sonnet-5",
              name: "Claude Sonnet 5",
              provider: "anthropic"
            }
          },
          // Must match GlobalChatStore's persist `version`.
          version: 1
        })
      );
    } catch {
      /* ignore — localStorage may be unavailable */
    }
  });
}

/**
 * The opposite of {@link seedFirstRunOnboarding}: onboarding dismissed, under
 * the key the current store persists to. The new-project surface renders the
 * getting-started checklist until this is set.
 */
async function seedFinishedOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "nodetool-onboarding",
        JSON.stringify({
          state: { completedSteps: [], dismissed: true },
          version: 1
        })
      );
    } catch {
      /* ignore — localStorage may be unavailable */
    }
  });
}

/**
 * Seed the onboarding store as a first-run user: nothing completed, nothing
 * dismissed. `seedLocalStorage` writes the opposite state under the legacy
 * `onboarding` key; the current store persists to `nodetool-onboarding`
 * (version 1 — a mismatch makes zustand drop the seeded state), and
 * `isOnboardingFinished` reads it to decide whether the dashboard hero and the
 * getting-started checklist render at all.
 */
async function seedFirstRunOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "nodetool-onboarding",
        JSON.stringify({
          state: { completedSteps: [], dismissed: false },
          version: 1
        })
      );
    } catch {
      /* ignore — localStorage may be unavailable */
    }
  });
}

const REPO_ROOT = path.join(CURRENT_DIR, "../../..");

/**
 * The Hugging Face logo the model lists render, drawn locally. The real one
 * is hot-linked from huggingface.co, which a sandboxed or offline capture
 * cannot reach, and a broken-image glyph in its place fails the image wait.
 */
const HF_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<circle cx="16" cy="16" r="14" fill="#FFD21E"/>' +
  '<circle cx="11" cy="13" r="2" fill="#3A3B45"/>' +
  '<circle cx="21" cy="13" r="2" fill="#3A3B45"/>' +
  '<path d="M10 19c2 3.5 10 3.5 12 0" stroke="#3A3B45" stroke-width="2" ' +
  'fill="none" stroke-linecap="round"/></svg>';

/**
 * Hot-linked sample photos (the image-compare preview's Before/After pair),
 * mapped to stills the repository ships: the same coffee shot before and
 * after a solarize, so the slider shows an edit rather than two unrelated
 * pictures.
 */
const EXTERNAL_IMAGE_STAND_INS: ReadonlyArray<{
  match: RegExp;
  file: string;
}> = [
  {
    match: /images\.unsplash\.com\/photo-1503023345310/,
    file: "marketing/public/templates/samples/coffee.jpg"
  },
  {
    match: /images\.unsplash\.com\/photo-1469474968028/,
    file: "marketing/public/templates/samples/solarize-a-still.webp"
  }
];

/**
 * Answer the UI's hot-linked images locally, so a capture does not depend on
 * the network and never shows a broken-image glyph for a third-party logo.
 * Other external requests pass through untouched.
 */
async function stubExternalImages(page: Page): Promise<void> {
  await page.route(
    "https://huggingface.co/front/assets/**",
    async (route) => {
      await route.fulfill({ contentType: "image/svg+xml", body: HF_LOGO_SVG });
    }
  );
  await page.route("https://images.unsplash.com/**", async (route) => {
    const standIn = EXTERNAL_IMAGE_STAND_INS.find(({ match }) =>
      match.test(route.request().url())
    );
    if (!standIn) {
      await route.continue();
      return;
    }
    await route.fulfill({ path: path.join(REPO_ROOT, standIn.file) });
  });
}

/**
 * Paint a preview's wrapper with the active color scheme's background. Some
 * preview wrappers take `theme.palette.background.*`, which is the light
 * palette's value even while the dark scheme's CSS variables color the text,
 * so the capture comes out as pale text on white.
 */
async function paintSchemeBackground(
  page: Page,
  rules: ReadonlyArray<{ selector: string; token: "default" | "paper" }>
): Promise<void> {
  await page.addStyleTag({
    content: rules
      .map(
        ({ selector, token }) =>
          `${selector} { background-color: var(--palette-background-${token}) !important; border-color: var(--palette-divider) !important; }`
      )
      .join("\n")
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
async function gotoPage(
  page: Page,
  url: string,
  panels?: PanelOverrides
): Promise<void> {
  await seedLocalStorage(page, panels);
  await stubExternalImages(page);
  await page.goto(url);

  // Wait for the loading overlay to clear. We check by role/aria-label so the
  // selector survives style refactors. The wait is generous because the dev
  // server may transpile metadata-heavy modules on first hit.
  const loadingOverlay = page.locator(
    '[role="status"][aria-label="Loading NodeTool"]'
  );
  if ((await loadingOverlay.count()) > 0) {
    await loadingOverlay.first().waitFor({ state: "hidden", timeout: 30_000 });
  }

  // Best-effort networkidle wait, capped so retries (HMR, polling) don't hang.
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await waitForAnimation(page, 600);
  await assertNoErrorBoundary(page);
}

/**
 * Block until every <img> on the page has decoded. A card captured while its
 * still is still loading shows the broken-image glyph, which is exactly what
 * the seeded frames exist to avoid.
 */
async function waitForImages(page: Page, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    () =>
      Array.from(document.images)
        .filter((image) => {
          // Only images in the viewport: a lazy one off screen never loads.
          const rect = image.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
          );
        })
        .every((image) => image.complete && image.naturalWidth > 0),
    undefined,
    { timeout }
  );
}

/**
 * Waits for transient loading indicators to disappear before capture.
 * Uses a shorter timeout than text waits because these indicators should clear
 * quickly; if they do not, the screenshot should fail fast.
 */
async function ensureNoVisibleProgress(page: Page, timeout = 12000): Promise<void> {
  const progress = page.locator(
    '[role="progressbar"]:visible, .MuiCircularProgress-root:visible'
  );
  await expect(progress).toHaveCount(0, { timeout });
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
      // A screenshot of the app shell is only useful when the seeded app is
      // actually mounted. The runtime is scoped because the Design layer stays
      // mounted in the workspace while Run is active.
      const runtime = page
        .getByTestId("application-run-layer")
        .locator('.appbuilder-runtime[data-focus-id="app-runtime"]');
      await expect(runtime, "mini-app runtime must be mounted").toBeVisible({
        timeout: 15_000
      });
      await expect(runtime.getByRole("textbox").first()).toBeVisible({
        timeout: 15_000
      });
      await expect(
        runtime.getByRole("button", { name: /^run echo$/i }).first()
      ).toBeVisible({ timeout: 15_000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 800);
      break;
    }
    case "workflow-graph-view.png": {
      // The standalone graph view sets data-ready="true" once nodes are laid
      // out. A screenshot without the graph is an invalid fixture.
      await page.locator('[data-ready="true"]').first().waitFor({ state: "visible", timeout: 15000 });
      await page.waitForFunction(
        () => document.querySelectorAll(".react-flow__node").length > 0,
        undefined,
        { timeout: 10000 }
      );
      await waitForAnimation(page, 600);
      break;
    }
    case "asset-explorer.png": {
      // Either the folder list or one of the seeded files should appear.
      await page.getByText(/portrait_sunset\.jpg|images|documents/i).first().waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      break;
    }
    case "global-chat-interface.png":
    case "chat-mobile.png": {
      // The chat input composer is the most stable landmark on every chat view.
      await page.locator('textarea, [contenteditable="true"]').first().waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      break;
    }
    case "dashboard-overview.png":
    case "dashboard-mobile.png":
    case "dashboard-tablet.png": {
      // Portal renders an AppHeader and the chat composer. Wait for either.
      await page.locator('header, [role="banner"], textarea').first().waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      break;
    }
    case "models-list.png":
    case "collections-explorer.png": {
      await ensureNoVisibleProgress(page);
      if (screenshotName === "models-list.png") {
        // The manager opens on its Installed tab, which lists the local
        // models the server knows of (the whisper.cpp files, none downloaded
        // yet). Assert on a listed model instead of accepting a blank shell.
        await page
          .getByText("ggml-small.bin", { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 15_000 });
        await expect(
          page.getByText("Model categories", { exact: false }).first()
        ).toBeVisible();
      } else {
        // screenshot-docs-seed.ts seeds three collections. Waiting on one
        // catches a request that never resolves or a route that renders only
        // chrome.
        await page
          .getByText("brand-guidelines", { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 15_000 });
      }
      break;
    }
    case "sketch-editor.png": {
      // The standalone Image Editor mounts a toolbar, canvas, and a right-hand
      // panel with Color / Layers / Canvas sections. Wait for the editor shell
      // and the Layers section to appear; the WebGL canvas may not paint in
      // headless mode but the editor chrome is the documentation surface.
      await page.locator(".sketch-editor, .sketch-editor__body").first().waitFor({ state: "visible", timeout: 15000 });
      await page.getByText(/layers/i).first().waitFor({ state: "visible", timeout: 8000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 800);
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
    const failPath = test.info().outputPath(`error-${Date.now()}.png`);
    await page.screenshot({ path: failPath });
    await test.info().attach("error-boundary-screenshot", {
      path: failPath,
      contentType: "image/png"
    });
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

    // ── Onboarding ──────────────────────────────────────────────────────────
    //
    // First launch routes `/` to /dashboard until onboarding is finished. These
    // captures pin that first-run state explicitly (seedFirstRunOnboarding) so
    // the welcome surface and the checklist render regardless of what the
    // legacy `onboarding` key says.

    // The first-run welcome is the editor home ("What do you want to make?")
    // with the getting-started checklist above the prompt.
    test("Onboarding – welcome flow", async ({ page }) => {
      test.skip(shouldSkip("onboarding-welcome.png"), "Already captured");
      await seedFirstRunOnboarding(page);
      await gotoPage(page, "/dashboard");
      await page
        .getByText("What do you want to make?")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await page
        .locator('[aria-label="Getting started checklist"]')
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForImages(page);
      await waitForAnimation(page, 1200);
      await saveScreenshot(page, "onboarding-welcome.png");
    });

    test("Onboarding – getting-started checklist", async ({ page }) => {
      test.skip(shouldSkip("onboarding-checklist.png"), "Already captured");
      await seedFirstRunOnboarding(page);
      await gotoPage(page, "/dashboard");
      const checklist = '[aria-label="Getting started checklist"]';
      await page
        .locator(checklist)
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 800);
      await saveElementScreenshot(
        page,
        checklist,
        "onboarding-checklist.png",
        8000
      );
    });

    test("Onboarding – empty workspace", async ({ page }) => {
      test.skip(
        shouldSkip("onboarding-empty-workspace.png"),
        "Already captured"
      );
      // A returning user's empty workspace: the welcome capture above already
      // shows the first-run checklist, so this one is the plain surface.
      await seedFinishedOnboarding(page);
      // No open tabs → WorkspaceShell renders the editor home in
      // `.workspace-empty`.
      await seedWorkspaceTabs(page, [], "");
      await gotoPage(page, "/workspace");
      const empty = page.locator(".workspace-empty").first();
      await empty.waitFor({ state: "visible", timeout: 15000 });
      await empty
        .getByText("What do you want to make?")
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      await ensureNoVisibleProgress(page);
      await waitForImages(page);
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "onboarding-empty-workspace.png");
    });

    // The dialog every blocked-on-a-provider path opens. The preview route
    // mounts it pre-opened, which is steadier than driving a UI trigger whose
    // button is disabled once the seeded backend reports a configured key.
    test("Onboarding – provider dialog", async ({ page }) => {
      test.skip(
        shouldSkip("provider-onboarding-dialog.png"),
        "Already captured"
      );
      await gotoPage(page, "/preview/provider-onboarding");
      await page
        .getByText(/connect an ai provider/i)
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "provider-onboarding-dialog.png");
    });

    // Settings → Models & Providers (tab index 1), where each connected
    // provider card carries a Test button that verifies the stored key.
    test("Settings – Models & Providers", async ({ page }) => {
      test.skip(shouldSkip("settings-providers-test.png"), "Already captured");
      await gotoPage(page, "/settings?tab=1");
      await page
        .getByRole("button", { name: /^test$/i })
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "settings-providers-test.png");
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
        );
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

    test("Chat – mobile (375×812)", async ({ page }) => {
      test.skip(shouldSkip("chat-mobile.png"), "Already captured");
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPage(page, "/chat/thread-story");
      await waitForScreenshotReady(page, "chat-mobile.png");
      await saveScreenshot(page, "chat-mobile.png");
    });

    // The model picker opened from the composer's model chip.
    test("Chat – model selector", async ({ page }) => {
      test.skip(shouldSkip("chat-model-selector.png"), "Already captured");
      await seedChatModel(page);
      await gotoPage(page, "/chat/thread-story");
      await waitForScreenshotReady(page, "global-chat-interface.png");
      await openComposerChip(page, "model");
      // The picker's "Select Language Model" title is for assistive tech
      // only; its search field is the visible landmark.
      await page
        .getByPlaceholder("Search language models...")
        .first()
        .waitFor({ state: "visible", timeout: 8000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "chat-model-selector.png");
    });

    // The composer mode menu — chat, image, video, and speech generation all
    // run from the same box.
    test("Chat – composer modes", async ({ page }) => {
      test.skip(shouldSkip("chat-composer-modes.png"), "Already captured");
      await gotoPage(page, "/chat/thread-story");
      await waitForScreenshotReady(page, "global-chat-interface.png");
      await openComposerChip(page, "mode");
      await page.getByRole("menu", { name: /generation mode/i }).first().waitFor({ state: "visible", timeout: 8000 });
      await saveScreenshot(page, "chat-composer-modes.png");
    });

    // The permission menu — Plan / Default / Auto controls how much the agent
    // may do on its own.
    test("Chat – permission modes", async ({ page }) => {
      test.skip(shouldSkip("chat-permission-modes.png"), "Already captured");
      await gotoPage(page, "/chat/thread-story");
      await waitForScreenshotReady(page, "global-chat-interface.png");
      await openComposerChip(page, "permission");
      await page.getByRole("menu", { name: /permission mode/i }).first().waitFor({ state: "visible", timeout: 8000 });
      await saveScreenshot(page, "chat-permission-modes.png");
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
        );
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "workflow-graph-view.png");
    });

    // ── Mini-apps ───────────────────────────────────────────────────────────
    test("Mini-app page", async ({ page }) => {
      test.skip(shouldSkip("mini-app-page.png"), "Already captured");
      // Open the seeded application resource. The legacy workflow URL now
      // redirects only when an app is actually bound to that workflow.
      await openMiniApp(page);
      const runMode = page
        .getByRole("button", { name: "Run", exact: true })
        .first();
      await runMode.click();
      await waitForScreenshotReady(page, "mini-app-page.png");
      await saveScreenshot(page, "mini-app-page.png");
    });

    test("Standalone mini-app", async ({ page }) => {
      test.skip(shouldSkip("standalone-mini-app.png"), "Already captured");
      await openMiniApp(page);
      const runMode = page
        .getByRole("button", { name: "Run", exact: true })
        .first();
      await runMode.click();
      await waitForScreenshotReady(page, "standalone-mini-app.png");
      await saveScreenshot(page, "standalone-mini-app.png");
    });

    // ── Assets ──────────────────────────────────────────────────────────────
    /**
     * The Assets page opened on its Images folder, where the seeded stills
     * live. The root holds only the flat placeholder files.
     */
    async function openImagesFolder(page: Page): Promise<void> {
      await seedWorkspaceTabs(
        page,
        [{ type: "page", ref: "assets", title: "Assets" }],
        "page:assets"
      );
      await gotoPage(page, "/workspace");
      await page.getByText(/^images$/i).first().click();
      await page
        .getByText(/scrapheart_convoy/)
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForImages(page);
      await waitForAnimation(page, 800);
    }

    test("Assets", async ({ page }) => {
      test.skip(shouldSkip("asset-explorer.png"), "Already captured");
      await openImagesFolder(page);
      await saveScreenshot(page, "asset-explorer.png");
    });

    test("Assets – viewer", async ({ page }) => {
      test.skip(shouldSkip("asset-viewer.png"), "Already captured");
      await openImagesFolder(page);
      await page.getByText(/scrapheart_convoy/).first().dblclick();
      // The viewer's close button is the one control it always shows.
      await page
        .getByRole("button", { name: /close/i })
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await waitForImages(page);
      await waitForAnimation(page, 1500);
      await saveScreenshot(page, "asset-viewer.png");
    });

    // ── Collections ─────────────────────────────────────────────────────────
    test("Collections", async ({ page }) => {
      test.skip(shouldSkip("collections-explorer.png"), "Already captured");
      await gotoPage(page, "/collections");
      await waitForScreenshotReady(page, "collections-explorer.png");
      await saveScreenshot(page, "collections-explorer.png");
    });

    test("Collections – create form", async ({ page }) => {
      test.skip(shouldSkip("collections-create.png"), "Already captured");
      await gotoPage(page, "/collections");
      await page
        .getByRole("button", { name: "Create collection" })
        .first()
        .click();
      const name = page.getByLabel(/Collection Name/i).first();
      await name.waitFor({ state: "visible", timeout: 15000 });
      await name.fill("product-manuals");
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "collections-create.png");
    });

    // ── Models ──────────────────────────────────────────────────────────────
    test("Models", async ({ page }) => {
      test.skip(shouldSkip("models-list.png"), "Already captured");
      await gotoPage(page, "/models");
      await waitForScreenshotReady(page, "models-list.png");
      await saveScreenshot(page, "models-list.png");
    });

    // ── Packages ────────────────────────────────────────────────────────────
    test("Package manager", async ({ page }) => {
      test.skip(shouldSkip("packages-manager.png"), "Already captured");
      await gotoPage(page, "/packages");
      await page
        .getByText("Included packs")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "packages-manager.png");
    });

    // ── Workspaces ──────────────────────────────────────────────────────────
    test("Workspaces page", async ({ page }) => {
      test.skip(shouldSkip("workspaces-page.png"), "Already captured");
      await gotoPage(page, "/workspaces");
      await waitForScreenshotReady(page, "workspaces-page.png");
      await saveScreenshot(page, "workspaces-page.png");
    });

    // ── Mini app surfaces ───────────────────────────────────────────────────
    // An app is its own resource opened as a workspace tab. "app-mini-app" is
    // the seeded application; Design is where it is built, Run is what the
    // person using it sees.
    async function openMiniApp(page: Page): Promise<void> {
      await seedWorkspaceTabs(
        page,
        [
          {
            type: "application",
            ref: "app-mini-app",
            title: "Echo Mini App"
          }
        ],
        "application:app-mini-app"
      );
      await gotoPage(page, "/workspace");
      await ensureNoVisibleProgress(page);
    }

    test("Mini app – design surface", async ({ page }) => {
      test.skip(shouldSkip("mini-app-design.png"), "Already captured");
      await openMiniApp(page);
      await page
        .getByRole("button", { name: "Design", exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "mini-app-design.png");
    });

    test("Mini app – run surface", async ({ page }) => {
      test.skip(shouldSkip("mini-app-run.png"), "Already captured");
      await openMiniApp(page);
      const runMode = page
        .getByRole("button", { name: "Run", exact: true })
        .first();
      await runMode.waitFor({ state: "visible", timeout: 20000 });
      await runMode.click();
      await page
        .getByRole("button", { name: /^run echo$/i })
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "mini-app-run.png");
    });

    /**
     * Select a widget on the Design canvas by the text it renders, so the
     * right-hand inspector shows that widget's fields. Puck's own class names
     * are content-hashed, so the canvas is addressed by text and the inspector
     * by the stable `_Sidebar--right` prefix. The editor starts with both Puck
     * sidebars closed, so the inspector is opened from Puck's header toggle.
     */
    async function selectWidget(page: Page, text: string): Promise<void> {
      await openMiniApp(page);
      await page
        .getByRole("button", { name: "Design", exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
      await waitForAnimation(page, 2000);
      if (!(await page.locator(RIGHT_SIDEBAR).first().isVisible())) {
        await page.locator('button[title="Toggle right sidebar"]').first().click();
      }
      await page
        .getByText(text, { exact: true })
        .first()
        .click({ force: true });
      await page
        .locator(RIGHT_SIDEBAR)
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      await waitForAnimation(page, 1000);
    }

    const RIGHT_SIDEBAR = '[class*="_Sidebar--right"]';

    // The binding picker, open. It lists what the bound workflow actually
    // offers — its Input nodes, the settings of each node, its Output nodes —
    // which is the step people get stuck on when wiring their first app.
    test("Mini app – binding picker", async ({ page }) => {
      test.skip(shouldSkip("mini-app-binding-picker.png"), "Already captured");
      await selectWidget(page, "Prompt");
      await page
        .locator(RIGHT_SIDEBAR)
        .first()
        .getByRole("combobox")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await page
        .locator(RIGHT_SIDEBAR)
        .first()
        .getByRole("combobox")
        .first()
        .click({ force: true });
      await waitForAnimation(page, 800);
      await expect(page.getByRole("listbox").first()).toBeVisible();
      await saveScreenshot(page, "mini-app-binding-picker.png");
    });

    // A Button's On click event expanded to its Run workflow action.
    test("Mini app – button action", async ({ page }) => {
      test.skip(shouldSkip("mini-app-button-action.png"), "Already captured");
      await selectWidget(page, "Run echo");
      await page
        .locator(RIGHT_SIDEBAR)
        .first()
        .getByText("run", { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await page
        .locator(RIGHT_SIDEBAR)
        .first()
        .getByText("run", { exact: true })
        .first()
        .click({ force: true });
      await waitForAnimation(page, 1000);
      // The expanded event shows its Action select set to Run workflow. It is
      // a native <select> whose options carry their text in `label`, so the
      // check reads that attribute. It sits at the foot of a long inspector,
      // so scroll it into the picture.
      const action = page
        .locator(RIGHT_SIDEBAR)
        .first()
        .getByRole("combobox", { name: "Action" })
        .first();
      await expect(action.locator("option:checked")).toHaveAttribute(
        "label",
        "Run workflow"
      );
      await action.scrollIntoViewIfNeeded();
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "mini-app-button-action.png");
    });

    // ── Sketch / Image editor ─────────────────────────────────────────────────
    // Backed by the seeded ImageDocument "sk-demo-portrait" (screenshot-server).
    test("Sketch editor", async ({ page }) => {
      test.skip(shouldSkip("sketch-editor.png"), "Already captured");
      await gotoPage(page, "/sketch/sk-demo-portrait");
      await waitForScreenshotReady(page, "sketch-editor.png");
      await saveScreenshot(page, "sketch-editor.png");
    });

    // ── Timeline editor ────────────────────────────────────────────────────────
    // Backed by the seeded TimelineSequence "tl-demo-promo" (screenshot-server).
    // The /timeline/:id route now opens the sequence read-only, so the editor
    // (tracks, clips, inspector) is opened as a workspace tab in edit mode.
    test("Timeline editor", async ({ page }) => {
      test.skip(shouldSkip("timeline-editor.png"), "Already captured");
      await captureTab(
        page,
        { type: "timeline", ref: "tl-demo-promo", title: "Product Promo" },
        "Intro Shot"
      );
      // Park the playhead inside the first clip so the viewer shows a frame.
      await page
        .getByTestId("time-ruler")
        .first()
        .click({ position: { x: 250, y: 8 } });
      await waitForAnimation(page, 2000);
      await saveScreenshot(page, "timeline-editor.png");
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

    // API keys live on the Models & Providers tab (APIKeysTab). The tab itself
    // is captured as settings-providers-test.png, so this one opens a
    // connected provider's Manage dialog, where a key is entered or replaced.
    test("Settings – API keys tab", async ({ page }) => {
      test.skip(shouldSkip("settings-api-keys.png"), "Already captured");
      await gotoPage(page, "/settings?tab=1");
      const manage = page.getByRole("button", { name: "Manage", exact: true });
      await manage.nth(1).waitFor({ state: "visible", timeout: 15000 });
      // The second card is Anthropic: a plain API key, where OpenAI's dialog
      // leads with its sign-in option.
      await manage.nth(1).click();
      await page
        .getByRole("dialog")
        .getByText(/update anthropic/i)
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "settings-api-keys.png");
    });

    // ── Isolated components ─────────────────────────────────────────────────
    test("Models – isolated component", async ({ page }) => {
      test.skip(shouldSkip("component-models.png"), "Already captured");
      await gotoPage(page, "/preview/models");
      await page
        .locator('[data-preview="models"]')
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      // ModelListIndex renders cards with a fade-in animation; wait for it
      // to settle so the captured frame doesn't show ghosted text.
      await waitForAnimation(page, 1500);
      await saveScreenshot(page, "component-models.png");
    });

    // ── Editor surfaces (panels, toolbars, modals) ─────────────────────────
    //
    // These captures all use /editor/wf-story-generator (a seeded workflow
    // with nodes), then either pre-open a panel via localStorage seeding or
    // trigger a UI surface with a keyboard shortcut.

    async function openEditorWithNodes(
      page: Page,
      panels?: PanelOverrides
    ): Promise<void> {
      await gotoPage(page, "/editor/wf-story-generator", panels);
      await page
        .waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 15000 }
        );
      await waitForAnimation(page, 800);
    }

    test("Editor – left panel open", async ({ page }) => {
      test.skip(shouldSkip("editor-left-panel.png"), "Already captured");
      await openEditorWithNodes(page, {
        left: { visible: true, activeView: "workflows" }
      });
      await saveScreenshot(page, "editor-left-panel.png");
    });

    // Per-view captures for the left panel — every activeView in
    // LeftPanelView gets its own screenshot so docs/editor-panels.md can
    // illustrate each tab. Skips the generic "workflows" view because the
    // "Editor – left panel open" capture above already covers it.
    const LEFT_PANEL_VIEWS: ReadonlyArray<{
      view: LeftPanelView;
      filename: string;
    }> = [
      { view: "nodes", filename: "editor-left-panel-nodes.png" },
      { view: "sketches", filename: "editor-left-panel-sketches.png" },
      { view: "timelines", filename: "editor-left-panel-timelines.png" },
      { view: "settings", filename: "editor-left-panel-settings.png" },
      { view: "history", filename: "editor-left-panel-history.png" },
      { view: "favorites", filename: "editor-left-panel-favorites.png" },
      { view: "assets", filename: "editor-left-panel-assets.png" },
      { view: "apps", filename: "editor-left-panel-apps.png" }
    ];

    for (const { view, filename } of LEFT_PANEL_VIEWS) {
      test(`Editor – left panel (${view})`, async ({ page }) => {
        test.skip(shouldSkip(filename), "Already captured");
        await openEditorWithNodes(page, {
          left: { visible: true, activeView: view }
        });
        await saveScreenshot(page, filename);
      });
    }

    test("Editor – right panel (Inspector)", async ({ page }) => {
      test.skip(shouldSkip("editor-right-panel.png"), "Already captured");
      await openEditorWithNodes(page, {
        right: { visible: true }
      });
      await saveScreenshot(page, "editor-right-panel.png");
    });

    test("Editor – bottom panel", async ({ page }) => {
      test.skip(shouldSkip("editor-bottom-panel.png"), "Already captured");
      await openEditorWithNodes(page, {
        bottom: { visible: true }
      });
      await saveScreenshot(page, "editor-bottom-panel.png");
    });

    // Per-view captures for the bottom panel. docs/editor-panels.md uses one
    // image per tab to illustrate the Run / Workflow / Debug groups.
    const BOTTOM_PANEL_VIEWS: ReadonlyArray<{
      view: BottomPanelView;
      filename: string;
    }> = [
      { view: "logs", filename: "editor-bottom-panel-logs.png" },
      { view: "queue", filename: "editor-bottom-panel-queue.png" },
      { view: "sandboxes", filename: "editor-bottom-panel-sandboxes.png" },
      { view: "versions", filename: "editor-bottom-panel-versions.png" },
      { view: "trace", filename: "editor-bottom-panel-trace.png" }
    ];

    for (const { view, filename } of BOTTOM_PANEL_VIEWS) {
      test(`Editor – bottom panel (${view})`, async ({ page }) => {
        test.skip(shouldSkip(filename), "Already captured");
        await openEditorWithNodes(page, {
          bottom: { visible: true, activeView: view }
        });
        await saveScreenshot(page, filename);
      });
    }

    test("Editor – node canvas", async ({ page }) => {
      test.skip(shouldSkip("editor-node-canvas.png"), "Already captured");
      await openEditorWithNodes(page);
      // Element-screenshot the ReactFlow viewport for a clean canvas-only
      // image, which is what the docs page wants.
      await saveElementScreenshot(
        page,
        ".react-flow",
        "editor-node-canvas.png",
        8000
      );
    });

    test("Editor – floating toolbar", async ({ page }) => {
      test.skip(shouldSkip("editor-floating-toolbar.png"), "Already captured");
      await openEditorWithNodes(page);
      await page
        .locator(".floating-toolbar")
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      await saveElementScreenshot(
        page,
        ".floating-toolbar",
        "editor-floating-toolbar.png",
        8000
      );
    });

    test("Editor – tabs bar", async ({ page }) => {
      test.skip(shouldSkip("editor-tabs-bar.png"), "Already captured");
      // Documents of several kinds share the one tab bar, which is what
      // docs/user-interface.md says under the picture.
      await seedWorkspaceTabs(
        page,
        [
          { type: "workflow", ref: "wf-story-generator", title: "Creative Story Generator" },
          { type: "storyboard", ref: "sb-demo-noir", title: "Harbor Noir" },
          { type: "timeline", ref: "tl-demo-promo", title: "Product Promo" },
          { type: "sketch", ref: "sk-demo-portrait", title: "Character Concept" },
          { type: "chat", ref: "thread-story", title: "Creative story about space explorers" },
          { type: "page", ref: "settings", title: "Settings" }
        ],
        "workflow:wf-story-generator"
      );
      await gotoPage(page, "/workspace");
      await page
        .waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 15000 }
        );
      await expect(
        page.locator(".workspace-tabbar").getByRole("tab")
      ).toHaveCount(6, { timeout: 10000 });
      await waitForAnimation(page, 800);
      // Only the bar is in the picture, so only the bar must be settled: the
      // inactive tabs stay mounted and may still be loading behind it.
      await assertNoErrorBoundary(page);
      const tabBar = page.locator(".workspace-tabbar").first();
      await expect(
        tabBar.locator('[role="progressbar"], .MuiCircularProgress-root')
      ).toHaveCount(0);
      await tabBar.screenshot({
        path: path.join(SCREENSHOT_DIR, "editor-tabs-bar.png")
      });
      console.log("  📸 editor-tabs-bar.png (.workspace-tabbar)");
    });

    test("Editor – command menu (Cmd/Ctrl+K)", async ({ page }) => {
      test.skip(shouldSkip("editor-command-menu.png"), "Already captured");
      await openEditorWithNodes(page);
      // Trigger the global Command Menu shortcut. Using both modifiers covers
      // Mac (Meta) and Linux/Windows (Control) so the test works regardless
      // of how Playwright reports the platform.
      await page.keyboard.press("Control+K");
      const dialog = page.locator(".command-menu-dialog");
      const opened = await dialog
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!opened) {
        await page.keyboard.press("Meta+K");
        await dialog.waitFor({ state: "visible", timeout: 5000 });
      }
      await waitForAnimation(page, 400);
      await saveScreenshot(page, "editor-command-menu.png");
    });

    // There is no quick-add-node dialog any more: Ctrl/Cmd+Shift+A is unbound
    // and Shift+A aligns nodes. Shift+P/G/V/L drop a node at the cursor with
    // no dialog, and searching for a node is the node menu (Space), captured
    // as editor-node-menu.png.

    // ── Mobile viewport captures ────────────────────────────────────────────

    test("Mobile – mini-app runner", async ({ page }) => {
      test.skip(shouldSkip("mobile-mini-app-runner.png"), "Already captured");
      await page.setViewportSize({ width: 375, height: 812 });
      // A legacy /miniapp/<workflowId> link opens the app bound to that
      // workflow; the seeded app binds wf-mini-app.
      await gotoPage(page, "/miniapp/wf-mini-app");
      await page
        .getByRole("button", { name: /^run echo$/i })
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "mobile-mini-app-runner.png");
    });

    test("Mobile – settings", async ({ page }) => {
      test.skip(shouldSkip("mobile-settings.png"), "Already captured");
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPage(page, "/settings");
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "mobile-settings.png");
    });

    test("Mobile – language model selection", async ({ page }) => {
      test.skip(
        shouldSkip("mobile-language-model-selection.png"),
        "Already captured"
      );
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPage(page, "/settings");
      await waitForAnimation(page, 600);
      // Try to find a tab/section that mentions models/providers and open it.
      const target = page
        .getByRole("tab")
        .filter({ hasText: /model|provider/i })
        .first();
      await target.waitFor({ state: "visible", timeout: 10000 });
      await target.click();
      await waitForAnimation(page, 400);
      await saveScreenshot(page, "mobile-language-model-selection.png");
    });

    // Mobile mini-apps list is a mobile-app-only feature: there is no separate
    // mini-apps list page in the web app (the mobile dashboard /dashboard is
    // already captured as dashboard-mobile.png). The placeholder stays in the
    // docs until the mobile React Native screenshots are wired up.

    // ── Editor surfaces triggered by interaction ───────────────────────────
    //
    // These captures need a UI trigger (keyboard shortcut or right-click) to
    // reveal the surface. They share the editor scaffold from the captures
    // above but invoke the trigger and wait for the dialog to mount.

    test("Editor – node menu (Space)", async ({ page }) => {
      test.skip(shouldSkip("editor-node-menu.png"), "Already captured");
      await openEditorWithNodes(page);
      // Move pointer onto the canvas first; the Space shortcut anchors the
      // menu at the cursor.
      const canvas = page.locator(".react-flow").first();
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Editor canvas has no geometry");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.press(" ");
      // The menu opens with its search field focused.
      await page
        .getByRole("searchbox", { name: "Search for nodes..." })
        .first()
        .waitFor({ state: "visible", timeout: 5000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 500);
      await saveScreenshot(page, "editor-node-menu.png");
    });

    // ── docs/first-workflow.md ──────────────────────────────────────────────
    //
    // One picture per step of the first-workflow tutorial, on the graph the
    // page builds: wf-first-empty is the canvas of step 1, wf-first-workflow
    // the finished String Input → Agent → Text To Image → Preview graph.

    /**
     * Answer the Anthropic model list with the model the seeded graph picks.
     * The real list comes from Anthropic's API, which the capture cannot
     * reach, and a model missing from the list shows its raw id.
     */
    async function stubAnthropicModels(page: Page): Promise<void> {
      const models = [
        {
          type: "language_model",
          id: "claude-sonnet-5",
          name: "Claude Sonnet 5",
          provider: "anthropic"
        }
      ];
      await page.route(/\/trpc\/[^?]*models\.llmByProvider/, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const procedures = url.pathname.split("/trpc/")[1].split(",");
        const batched = url.searchParams.get("batch") === "1";
        const input = JSON.parse(request.postData() ?? "{}") as Record<
          string,
          { provider?: string }
        >;
        const response = await route.fetch();
        const body = (await response.json()) as unknown;
        const items = batched ? (body as unknown[]) : [body];
        const patched = items.map((item, index) => {
          const args = batched ? input[String(index)] : input;
          return procedures[index] === "models.llmByProvider" &&
            args?.provider === "anthropic"
            ? { result: { data: models } }
            : item;
        });
        await route.fulfill({
          response,
          json: batched ? patched : patched[0]
        });
      });
    }

    /** The canvas point at a fraction of the editor's width and height. */
    async function canvasPoint(
      page: Page,
      fx: number,
      fy: number
    ): Promise<{ x: number; y: number }> {
      const box = await page.locator(".react-flow").first().boundingBox();
      if (!box) throw new Error("Editor canvas has no geometry");
      return { x: box.x + box.width * fx, y: box.y + box.height * fy };
    }

    async function openFirstWorkflow(page: Page): Promise<void> {
      await seedChatModel(page);
      await stubAnthropicModels(page);
      await gotoPage(page, "/editor/wf-first-workflow");
      await expect(page.locator(".react-flow__node")).toHaveCount(4, {
        timeout: 15000
      });
      await expect(
        page.locator('.react-flow__node[data-id="fw-agent"]')
      ).toContainText("Claude Sonnet 5", { timeout: 15000 });
      await waitForAnimation(page, 800);
    }

    async function selectNode(page: Page, nodeId: string): Promise<void> {
      await page
        .locator(`.react-flow__node[data-id="${nodeId}"]`)
        .click({ position: { x: 80, y: 14 } });
    }

    /**
     * Play a run of wf-first-workflow into the editor. The frames go through
     * the same routing a server run's frames take, so the canvas renders them
     * as it renders a real run. `phase` "start" streams half the Agent's text
     * and stops; "finish" completes the run; "fail" fails Text To Image.
     */
    async function playFirstWorkflowRun(
      page: Page,
      phase: "start" | "finish" | "fail"
    ): Promise<void> {
      await page.evaluate(async (phaseInPage) => {
        // Vite serves the app's own module instance at its source path.
        const managerPath = "/src/lib/websocket/GlobalWebSocketManager.ts";
        const { globalWebSocketManager } = (await import(
          /* @vite-ignore */ managerPath
        )) as {
          globalWebSocketManager: {
            deliverLocal: (message: Record<string, unknown>) => void;
          };
        };
        const workflow_id = "wf-first-workflow";
        const job_id = "job-first-workflow";
        const send = (message: Record<string, unknown>): void =>
          globalWebSocketManager.deliverLocal({
            workflow_id,
            job_id,
            ...message
          });
        const wait = (ms: number): Promise<void> =>
          new Promise((resolve) => setTimeout(resolve, ms));
        const node = (
          node_id: string,
          node_name: string,
          status: string,
          extra: Record<string, unknown> = {}
        ): void =>
          send({ type: "node_update", node_id, node_name, status, ...extra });
        const image = {
          type: "image",
          uri: "asset://asset-first-workflow-image",
          asset_id: "asset-first-workflow-image"
        };
        const prompt =
          "A white stone lighthouse on a rugged sea cliff at dusk, its lamp " +
          "just lit. Storm clouds break over the horizon and leave a band of " +
          "amber light above dark, foaming water. Wet rocks and wind-bent " +
          "grass in the foreground. Cinematic photograph, wide angle, cool " +
          "blue shadows against a warm sunset glow.";
        const words = prompt.split(/(?<= )/);
        const half = Math.floor(words.length / 2);
        const stream = async (from: number, to: number): Promise<void> => {
          for (const word of words.slice(from, to)) {
            send({ type: "chunk", node_id: "fw-agent", content: word });
            await wait(30);
          }
        };

        if (phaseInPage === "start") {
          send({ type: "job_update", status: "running" });
          node("fw-idea", "String Input", "running");
          await wait(40);
          node("fw-idea", "String Input", "completed", {
            result: { output: "a lighthouse on a cliff at dusk" }
          });
          node("fw-agent", "Agent", "running");
          await stream(0, half);
          return;
        }
        await stream(half, words.length);
        node("fw-agent", "Agent", "completed", { result: { text: prompt } });
        node("fw-image", "Text To Image", "running");
        await wait(2600);
        if (phaseInPage === "fail") {
          const error = "Missing required secret: FAL_API_KEY";
          node("fw-image", "Text To Image", "error", { error });
          send({ type: "job_update", status: "failed", error });
          return;
        }
        node("fw-image", "Text To Image", "completed", {
          result: { output: image }
        });
        node("fw-preview", "Preview", "running");
        await wait(30);
        node("fw-preview", "Preview", "completed", {
          result: { output: image }
        });
        send({ type: "job_update", status: "completed" });
      }, phase);
    }

    test("First workflow – empty canvas", async ({ page }) => {
      test.skip(shouldSkip("first-workflow-empty.png"), "Already captured");
      await seedChatModel(page);
      await gotoPage(page, "/editor/wf-first-empty");
      await page
        .locator(".react-flow")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await expect(page.locator(".react-flow__node")).toHaveCount(0);
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "first-workflow-empty.png");
    });

    test("First workflow – node menu search", async ({ page }) => {
      test.skip(shouldSkip("first-workflow-node-menu.png"), "Already captured");
      await seedChatModel(page);
      await gotoPage(page, "/editor/wf-first-empty");
      const point = await canvasPoint(page, 0.3, 0.3);
      await page.mouse.move(point.x, point.y);
      await page.keyboard.press(" ");
      const search = page
        .getByRole("searchbox", { name: "Search for nodes..." })
        .first();
      await search.waitFor({ state: "visible", timeout: 5000 });
      await search.fill("string input");
      await page
        .getByText("String Input", { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "first-workflow-node-menu.png");
    });

    // Step 3: the Agent selected, its Params tab in the Inspector.
    test("First workflow – Agent in the Inspector", async ({ page }) => {
      test.skip(shouldSkip("first-workflow-inspector.png"), "Already captured");
      await openFirstWorkflow(page);
      await selectNode(page, "fw-agent");
      await page
        .getByRole("tab", { name: /^Params/ })
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "first-workflow-inspector.png");
    });

    // Step 6: release a drag from Text To Image's output on empty canvas.
    test("First workflow – connection menu", async ({ page }) => {
      test.skip(
        shouldSkip("first-workflow-connection-menu.png"),
        "Already captured"
      );
      await openFirstWorkflow(page);
      // The finished graph already has its Preview. Remove it to show the
      // step that adds it, then close the Inspector the selection opened.
      await selectNode(page, "fw-preview");
      await page.keyboard.press("Delete");
      await expect(page.locator(".react-flow__node")).toHaveCount(3);
      await page.getByRole("button", { name: "Close inspector" }).click();
      await waitForAnimation(page, 400);
      const handle = page
        .locator(
          '.react-flow__node[data-id="fw-image"] .react-flow__handle.source'
        )
        .first();
      const box = await handle.boundingBox();
      if (!box) throw new Error("Text To Image output handle has no geometry");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const drop = { x: box.x + 90, y: box.y + 40 };
      await page.mouse.move(drop.x, drop.y, { steps: 12 });
      await page.mouse.up();
      await page
        .getByRole("menuitem", { name: /Preview/ })
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "first-workflow-connection-menu.png");
    });

    // Step 7: the run, captured while the Agent writes and when it is done.
    test("First workflow – run", async ({ page }) => {
      test.skip(
        shouldSkip("first-workflow-running.png") &&
          shouldSkip("first-workflow-result.png"),
        "Already captured"
      );
      await openFirstWorkflow(page);
      await playFirstWorkflowRun(page, "start");
      await waitForAnimation(page, 300);
      // The working node shows a spinner, which saveScreenshot refuses.
      await assertNoErrorBoundary(page);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "first-workflow-running.png")
      });
      console.log("  📸 first-workflow-running.png");
      await playFirstWorkflowRun(page, "finish");
      await waitForAnimation(page, 1500);
      await saveScreenshot(page, "first-workflow-result.png");
    });

    // Step 7, when a node fails: the error shows on the node.
    test("First workflow – failed node", async ({ page }) => {
      test.skip(shouldSkip("first-workflow-error.png"), "Already captured");
      await openFirstWorkflow(page);
      await playFirstWorkflowRun(page, "start");
      await playFirstWorkflowRun(page, "fail");
      const away = await canvasPoint(page, 0.5, 0.6);
      await page.mouse.move(away.x, away.y);
      await waitForAnimation(page, 1200);
      await saveScreenshot(page, "first-workflow-error.png");
    });

    test("Editor – optional node packs", async ({ page }) => {
      test.skip(shouldSkip("node-menu-optional-packs.png"), "Already captured");
      await openEditorWithNodes(page);
      // Anchor the node menu at the canvas centre.
      const canvas = page.locator(".react-flow").first();
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Editor canvas has no geometry");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.press(" ");
      const trigger = page.locator(".optional-packs-trigger").first();
      await trigger.waitFor({ state: "visible", timeout: 8000 });
      // Open the Optional packs popover (Categories + Providers).
      await trigger.click();
      await page.getByText("Optional node packs").first().waitFor({ state: "visible", timeout: 5000 });
      await waitForAnimation(page, 500);
      await saveScreenshot(page, "node-menu-optional-packs.png");
    });

    test("Editor – find in workflow (Ctrl/Cmd+F)", async ({ page }) => {
      test.skip(
        shouldSkip("editor-find-in-workflow.png"),
        "Already captured"
      );
      await openEditorWithNodes(page);
      // Click the canvas so the editor has focus before sending the shortcut.
      await page.locator(".react-flow").first().click();
      await page.keyboard.press("Control+F");
      const findField = page.getByRole("textbox", { name: "Find nodes" }).first();
      const opened = await findField
        .waitFor({ state: "visible", timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      if (!opened) {
        await page.keyboard.press("Meta+F");
        await findField.waitFor({ state: "visible", timeout: 4000 });
      }
      // A query shows the bar doing its job: the match count and the
      // highlighted node, not the empty "Type to search nodes" hint.
      await findField.fill("agent");
      await page
        .getByText(/\d+ of \d+ nodes? found/)
        .first()
        .waitFor({ state: "visible", timeout: 4000 });
      await waitForAnimation(page, 400);
      await saveScreenshot(page, "editor-find-in-workflow.png");
    });

    test("Editor – context menu (right-click)", async ({ page }) => {
      test.skip(shouldSkip("editor-context-menu.png"), "Already captured");
      await openEditorWithNodes(page);
      const node = page.locator(".react-flow__node").first();
      await node.waitFor({ state: "visible", timeout: 8000 });
      await node.click({ button: "right" });
      const menu = page
        .locator('.MuiMenu-paper, [role="menu"], [class*="ContextMenu"]')
        .first();
      await menu.waitFor({ state: "visible", timeout: 4000 });
      await waitForAnimation(page, 300);
      await saveScreenshot(page, "editor-context-menu.png");
    });

    // ── Entities (ingredients library) ─────────────────────────────────────
    //
    // Entities are image assets tagged as characters / locations / styles /
    // props (seeded in screenshot-server.ts). They surface in three places,
    // each with its own capture: the Entities library page, the `@`-mention
    // picker's Entities row, and the storyboard's Entities field.

    test("Entities – library page", async ({ page }) => {
      test.skip(shouldSkip("entity-library.png"), "Already captured");
      await seedWorkspaceTabs(
        page,
        [{ type: "page", ref: "entities", title: "Entities" }],
        "page:entities"
      );
      await gotoPage(page, "/workspace");
      // The seeded entity cards carry these names.
      await page
        .getByText("Marta")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "entity-library.png");
    });

    test("Chat – entity mentions (@)", async ({ page }) => {
      test.skip(shouldSkip("chat-mention-entities.png"), "Already captured");
      await gotoPage(page, "/chat/thread-story");
      await waitForScreenshotReady(page, "global-chat-interface.png");
      const composer = page
        .locator('textarea, [contenteditable="true"]')
        .first();
      await composer.click();
      await composer.type("A rainy chase scene with @", { delay: 30 });
      // The shared mention menu opens with the Entities row on top.
      await page
        .locator(".asset-mention-menu")
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      await page
        .locator(".mention-entity-tile")
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      await waitForAnimation(page, 500);
      await saveScreenshot(page, "chat-mention-entities.png");
    });

    // ── Storyboard ─────────────────────────────────────────────────────────
    // Backed by the seeded Storyboard "sb-demo-noir" (screenshot-server),
    // whose board carries the four seeded entities and shots that mention
    // them by name.
    //
    // The board is a toolbar over a shot grid, and the Entities field the docs
    // point at lives behind "Board settings" — open it. The per-shot entity
    // chips are in the inspector, which docks below the grid and does not fit
    // under an open settings panel at 1440×900, so no shot is selected here.
    test("Storyboard – board with entities", async ({ page }) => {
      test.skip(shouldSkip("storyboard-board.png"), "Already captured");
      await seedWorkspaceTabs(
        page,
        [{ type: "storyboard", ref: "sb-demo-noir", title: "Harbor Noir" }],
        "storyboard:sb-demo-noir"
      );
      await gotoPage(page, "/workspace");
      const shotCards = page.locator(".shot-card");
      await shotCards
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
      const settings = page.getByRole("button", { name: /board settings/i });
      if ((await settings.getAttribute("aria-expanded")) === "false") {
        await settings.click();
      }
      await page
        .getByText("Neon Noir")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "storyboard-board.png");
    });

    // ── Projects ───────────────────────────────────────────────────────────
    //
    // A project is a name over the documents carrying its id, so these three
    // surfaces are only worth a picture when something is filed under one.
    // `screenshot-projects.ts` seeds three: SCRAPHEART (a trailer with a
    // board, a script, a cut and the conversation that built them), The Silent
    // Abyss (a second trailer, stills rendered, nothing animated yet), and
    // SINGULARITY (key art and not much else). Their stills are the frames the
    // repo already ships, copied into the asset store, so the cards render
    // what a real render would have left behind.

    test("Projects – list", async ({ page }) => {
      test.skip(shouldSkip("project-list.png"), "Already captured");
      await seedWorkspaceTabs(
        page,
        [{ type: "project-list", ref: "projects", title: "Projects" }],
        "project-list:projects"
      );
      await gotoPage(page, "/workspace");
      await page
        .getByText("SCRAPHEART — Trailer")
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
      await ensureNoVisibleProgress(page);
      await waitForImages(page);
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "project-list.png");
    });

    test("Projects – new project", async ({ page }) => {
      test.skip(shouldSkip("project-new.png"), "Already captured");
      // A veteran's view: the getting-started checklist otherwise sits between
      // the prompt and the blank-document strip and is documented elsewhere.
      await seedFinishedOnboarding(page);
      await seedWorkspaceTabs(
        page,
        [{ type: "project-new", ref: "new", title: "New project" }],
        "project-new:new"
      );
      await gotoPage(page, "/workspace");
      await page
        .getByText("What do you want to make?")
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
      // A project starts from a skill: a `/name` in the prompt lights that
      // skill's pill (folded ones included) and shows its description under
      // the row. The spend estimate ("from N past projects") is read off past
      // projects whose kind equals the skill's name, and the two fixture
      // trailers are kind "trailer-template".
      await page
        .getByPlaceholder(/30-second launch spot/)
        .fill(
          "/trailer-template A 60-second teaser for a desert convoy chase, rust and dust, no dialogue"
        );
      await expect(
        page.locator('[aria-pressed="true"]').filter({ hasText: /trailer template/i })
      ).toHaveCount(1);
      await page
        .getByText(/from 2 past projects/i)
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      await ensureNoVisibleProgress(page);
      await waitForImages(page);
      await waitForAnimation(page, 600);
      await saveScreenshot(page, "project-new.png");
    });

    // A project tab no longer has an overview of its own (old persisted
    // project tabs land on the editor home). The project's agent and its
    // documents now share the chat surface: the thread that built SCRAPHEART
    // on the left, the active project's documents in the right column.
    test("Projects – overview (agent + documents)", async ({ page }) => {
      test.skip(shouldSkip("project-overview.png"), "Already captured");
      await seedChatModel(page);
      // The project's own tabs, so the bar shows the group the thread heads.
      await seedWorkspaceTabs(
        page,
        [
          {
            type: "chat",
            ref: "thread-project-scrapheart",
            title: "SCRAPHEART — Trailer",
            projectId: "proj-scrapheart"
          },
          {
            type: "storyboard",
            ref: "sb-scrapheart",
            title: "SCRAPHEART — shot board",
            projectId: "proj-scrapheart"
          },
          {
            type: "script",
            ref: "script-scrapheart",
            title: "SCRAPHEART — voiceover",
            projectId: "proj-scrapheart"
          },
          {
            type: "timeline",
            ref: "tl-scrapheart",
            title: "SCRAPHEART — cut v3",
            projectId: "proj-scrapheart"
          }
        ],
        "chat:thread-project-scrapheart",
        "proj-scrapheart"
      );
      await gotoPage(page, "/workspace");
      await page
        .getByText(/six shots, all on long lenses/i)
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
      // The right column lists the project's documents.
      await page
        .getByText(/SCRAPHEART — shot bo/)
        .nth(1)
        .waitFor({ state: "visible", timeout: 20000 });
      await ensureNoVisibleProgress(page);
      await waitForImages(page);
      await waitForAnimation(page, 1000);
      await saveScreenshot(page, "project-overview.png");
    });

    // ── Editors the docs pages describe ────────────────────────────────────
    //
    // One capture per document editor that had no picture. The fixtures come
    // from `screenshot-projects.ts` (SCRAPHEART board, script and cut) and
    // `screenshot-docs-seed.ts` (3D set, trailer score, JS script, skills,
    // memories).

    /** Open one workspace tab, wait for `anchor`, settle, and capture. */
    async function captureTab(
      page: Page,
      tab: SeededTab,
      anchor: string | RegExp,
      settleMs = 800
    ): Promise<void> {
      await seedFinishedOnboarding(page);
      await seedChatModel(page);
      await seedWorkspaceTabs(
        page,
        [tab],
        `${tab.type}:${tab.ref}`,
        tab.projectId ?? null
      );
      await gotoPage(page, "/workspace");
      await page
        .getByText(anchor)
        .first()
        .waitFor({ state: "visible", timeout: 30000 });
      await ensureNoVisibleProgress(page);
      await waitForImages(page);
      await waitForAnimation(page, settleMs);
    }

    test("3D editor", async ({ page }) => {
      test.skip(shouldSkip("3d-editor.png"), "Already captured");
      await captureTab(
        page,
        { type: "model3d", ref: "model3d-product-shot", title: "product_shot_set.gltf" },
        "Plinth",
        2000
      );
      // A selected object fills the inspector with its transform and material.
      await page.getByText("Product", { exact: true }).first().click();
      await waitForAnimation(page, 1200);
      await saveScreenshot(page, "3d-editor.png");
    });

    test("Audio editor", async ({ page }) => {
      test.skip(shouldSkip("audio-editor.png"), "Already captured");
      await captureTab(
        page,
        { type: "audio", ref: "audio-trailer-score", title: "trailer_score.mp3" },
        "Save to audio"
      );
      // The waveform is decoded after the toolbar mounts; the duration
      // readout switches from 0:00.000 once the file has been read.
      await page
        .getByText(/\/ 0:24/)
        .first()
        .waitFor({ state: "visible", timeout: 60000 });
      await waitForAnimation(page, 1500);
      await saveScreenshot(page, "audio-editor.png");
    });

    test("Script editor", async ({ page }) => {
      test.skip(shouldSkip("script-editor.png"), "Already captured");
      await captureTab(
        page,
        {
          type: "script",
          ref: "script-scrapheart",
          title: "SCRAPHEART — voiceover",
          projectId: "proj-scrapheart"
        },
        "They said the convoy could not be caught."
      );
      await saveScreenshot(page, "script-editor.png");
    });

    test("Storyboard – shots with stills and clips", async ({ page }) => {
      test.skip(shouldSkip("storyboard-shots.png"), "Already captured");
      await captureTab(
        page,
        {
          type: "storyboard",
          ref: "sb-scrapheart",
          title: "SCRAPHEART — shot board",
          projectId: "proj-scrapheart"
        },
        "Convoy",
        1500
      );
      await saveScreenshot(page, "storyboard-shots.png");
    });

    test("Video editor – cut with clips", async ({ page }) => {
      test.skip(shouldSkip("video-editor-timeline.png"), "Already captured");
      await captureTab(
        page,
        {
          type: "timeline",
          ref: "tl-scrapheart",
          title: "SCRAPHEART — cut v3",
          projectId: "proj-scrapheart"
        },
        "The chain"
      );
      // Park the playhead inside the first clip so the viewer shows a frame.
      await page
        .getByTestId("time-ruler")
        .first()
        .click({ position: { x: 250, y: 8 } });
      await waitForAnimation(page, 3000);
      await saveScreenshot(page, "video-editor-timeline.png");
    });

    test("Timeline – motion design", async ({ page }) => {
      test.skip(shouldSkip("timeline-motion-design.png"), "Already captured");
      await captureTab(
        page,
        { type: "timeline", ref: "tl-motion-demo", title: "Motion demo" },
        "Motion Title"
      );
      // At 0:00 the title has not faded in yet.
      await page
        .getByTestId("time-ruler")
        .first()
        .click({ position: { x: 160, y: 8 } });
      await waitForAnimation(page, 2500);
      await saveScreenshot(page, "timeline-motion-design.png");
    });

    test("JS script editor", async ({ page }) => {
      test.skip(shouldSkip("js-script-editor.png"), "Already captured");
      await captureTab(
        page,
        { type: "jsscript", ref: "js-headline-variants", title: "Headline variants" },
        "Show in node menu"
      );
      await page
        .locator(".monaco-editor .view-lines")
        .first()
        .waitFor({ state: "visible", timeout: 30000 });
      await waitForAnimation(page, 1000);
      await saveScreenshot(page, "js-script-editor.png");
    });

    test("Skill editor", async ({ page }) => {
      test.skip(shouldSkip("skill-editor.png"), "Already captured");
      await captureTab(
        page,
        { type: "skill", ref: "skill-brand-voice", title: "brand-voice" },
        "Matched against the agent objective"
      );
      await page
        .locator(".monaco-editor .view-lines")
        .first()
        .waitFor({ state: "visible", timeout: 30000 });
      await waitForAnimation(page, 1000);
      await saveScreenshot(page, "skill-editor.png");
    });

    test("Memory page", async ({ page }) => {
      test.skip(shouldSkip("memory-page.png"), "Already captured");
      await captureTab(
        page,
        { type: "page", ref: "memory", title: "Memory" },
        "Aurora palette"
      );
      await saveScreenshot(page, "memory-page.png");
    });

    test("Examples page", async ({ page }) => {
      test.skip(shouldSkip("examples-page.png"), "Already captured");
      await captureTab(
        page,
        { type: "page", ref: "examples", title: "Examples" },
        "Start from an app",
        1500
      );
      await saveScreenshot(page, "examples-page.png");
    });

    test("Guided flow – new image", async ({ page }) => {
      test.skip(shouldSkip("guided-flow.png"), "Already captured");
      await captureTab(
        page,
        { type: "project-new", ref: "new", title: "New project" },
        "What do you want to make?"
      );
      await page.getByText("Image", { exact: true }).first().click();
      const example = page.getByText(
        "A ceramic pour-over coffee dripper on a sunlit kitchen counter"
      );
      await example.first().waitFor({ state: "visible", timeout: 15000 });
      await example.first().click();
      await waitForAnimation(page, 800);
      await saveScreenshot(page, "guided-flow.png");
    });

    test("Game editor", async ({ page }) => {
      test.skip(shouldSkip("game-editor.png"), "Already captured");
      // The renderer picks WebGPU when the browser offers it, and headless
      // Chromium's software adapter draws nothing. Without it the editor
      // falls back to WebGL, which SwiftShader renders.
      await page.addInitScript(() => {
        try {
          delete (Object.getPrototypeOf(navigator) as { gpu?: unknown }).gpu;
        } catch {
          /* ignore */
        }
      });
      const response = await page.request.post(
        "http://localhost:7777/trpc/games.installExample",
        { data: { slug: "kindle", projectId: "proj-scrapheart" } }
      );
      expect(response.ok()).toBe(true);
      const body = (await response.json()) as {
        result: { data: { game: { id: string } } };
      };
      await captureTab(
        page,
        {
          type: "game",
          ref: body.result.data.game.id,
          title: "Kindle",
          projectId: "proj-scrapheart"
        },
        "Scene tree",
        4000
      );
      // Select the player so the inspector shows a sprite, not the scene.
      await page.getByPlaceholder("Search entities").first().fill("hero");
      await page.getByText("hero", { exact: true }).first().click();
      await waitForAnimation(page, 1500);
      await saveScreenshot(page, "game-editor.png");
    });

    // ── Component-preview captures ─────────────────────────────────────────
    //
    // Each preview route renders a single dialog/modal pre-opened so we can
    // capture it without driving a complex UI trigger.

    type PreviewSpec = {
      preview: string;
      filename: string;
      ready?: (page: Page) => Promise<void>;
      viewport?: { width: number; height: number };
    };

    const previewSpecs: PreviewSpec[] = [
      {
        preview: "confirm-dialog",
        filename: "confirm-dialog.png",
        ready: async (p) => {
          await p
            .getByRole("button", { name: /delete|confirm/i })
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
        }
      },
      {
        preview: "color-picker",
        filename: "color-picker.png",
        ready: async (p) => {
          await p
            .getByText(/swatches|harmony|gradient/i)
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
        }
      },
      {
        preview: "text-editor",
        filename: "text-code-editor.png",
        ready: async (p) => {
          // Monaco editor mounts asynchronously; wait for the textarea or its
          // scroll container before capturing.
          await p
            .locator(".monaco-editor, .view-lines, textarea")
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          await waitForAnimation(p, 600);
        }
      },
      {
        preview: "dataframe-editor",
        filename: "dataframe-editor.png",
        ready: async (p) => {
          await p
            .getByText(/Wireless Headphones|Yoga Mat|Hooded Sweatshirt/i)
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
        }
      },
      {
        preview: "image-compare",
        filename: "image-compare.png",
        ready: async (p) => {
          // Both sides, so a pair where only one loaded fails here rather
          // than as a broken image in the picture.
          await expect(
            p.locator('img[alt="Before"], img[alt="After"]')
          ).toHaveCount(2, { timeout: 12000 });
          await waitForImages(p, 12000);
          await waitForAnimation(p, 400);
        }
      },
      {
        preview: "recommended-models",
        filename: "recommended-models.png",
        ready: async (p) => {
          // The list shows repo ids, not display names.
          await p
            .getByText(/stable-diffusion-xl-base-1\.0|FLUX\.1-schnell/i)
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
          await paintSchemeBackground(p, [
            { selector: '[data-preview="recommended-models"]', token: "paper" }
          ]);
        }
      },
      {
        preview: "delete-model",
        filename: "model-delete-confirm.png",
        ready: async (p) => {
          await p
            .getByText(/Confirm Deletion|Delete .*stable-diffusion/i)
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
        }
      },
      {
        preview: "download-manager",
        filename: "download-manager.png",
        ready: async (p) => {
          await p
            .getByText(/Downloads|Recommended Models/i)
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
        }
      },
      {
        preview: "node-readme",
        filename: "node-readme.png",
        ready: async (p) => {
          // Wait for node title or description block to render.
          await p
            .locator('[data-preview="node-readme"]')
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
          await paintSchemeBackground(p, [
            { selector: '[data-preview="node-readme"]', token: "default" },
            { selector: '[data-preview="node-readme"] > div', token: "paper" }
          ]);
          await waitForAnimation(p, 400);
        }
      },
      {
        preview: "workflow-form",
        filename: "workflow-form.png",
        ready: async (p) => {
          await p
            .getByLabel(/name|description/i)
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
        }
      },
      {
        preview: "workflow-delete",
        filename: "workflow-delete.png",
        ready: async (p) => {
          await p
            .getByRole("button", { name: /delete|confirm/i })
            .first()
            .waitFor({ state: "visible", timeout: 8000 });
        }
      }
    ];

    for (const spec of previewSpecs) {
      test(`Preview – ${spec.preview}`, async ({ page }) => {
        test.skip(shouldSkip(spec.filename), "Already captured");
        if (spec.viewport) {
          await page.setViewportSize(spec.viewport);
        }
        await gotoPage(page, `/preview/${spec.preview}`);
        if (spec.ready) {
          await spec.ready(page);
        }
        await waitForAnimation(page, 600);
        await saveScreenshot(page, spec.filename);
      });
    }
  });
}
