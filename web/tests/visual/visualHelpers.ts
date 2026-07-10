/**
 * Shared helpers for E2E visual regression tests.
 *
 * These tests assert against committed screenshot baselines via Playwright's
 * `toHaveScreenshot`. To keep the baselines stable across runs the helpers pin
 * everything that can vary between captures:
 *
 *   - viewport      → fixed per Playwright project (mobile / tablet / desktop)
 *   - theme         → written to localStorage BEFORE first paint so the MUI
 *                     CssVarsProvider boots in a deterministic light/dark state
 *   - animations    → a global CSS init script zeroes every transition/animation
 *                     so fade-ins and slide-overs never freeze mid-flight
 *   - onboarding    → dismissed so `/` resolves to the dashboard instead of the
 *                     welcome flow
 *   - panels        → seeded via the same persisted-store shape the app reads on
 *                     mount, so the editor layout is reproducible
 *
 * The real NodeTool backend (started by `tests/globalSetup.ts` with an in-memory
 * SQLite DB pre-seeded with mock workflows/threads/assets) serves every API
 * call — no network, no real auth, no clock-dependent state.
 *
 * See `tests/visual/README.md` for the baseline update workflow.
 */

import { Page, type Locator } from "@playwright/test";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

export type Theme = "light" | "dark";

/** localStorage key MUI's CssVarsProvider / InitColorSchemeScript read to pick the
 *  initial color scheme. MUI's default `modeStorageKey` is the literal string
 *  `"mode"` (NOT "mui-color-scheme" — that is a common misconception). Verified
 *  against @mui/system's `InitColorSchemeScript` (DEFAULT_MODE_STORAGE_KEY). */
const MUI_COLOR_MODE_KEY = "mode";

// ─── Persisted panel store shapes ────────────────────────────────────────────
// These mirror the zustand persist shapes used by the app (see
// screenshots.spec.ts). The `version` must match each store or zustand discards
// the seeded state on rehydrate (left=3, right=3, bottom=2).

type LeftPanelView =
  | "workflows"
  | "sketches"
  | "timelines"
  | "settings"
  | "history"
  | "favorites"
  | "assets"
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

export type PanelOverrides = {
  left?: { visible?: boolean; activeView?: LeftPanelView };
  right?: { visible?: boolean; activeView?: RightPanelView };
  bottom?: { visible?: boolean; activeView?: BottomPanelView };
};

type GotoOptions = {
  theme?: Theme;
  panels?: PanelOverrides;
  /** Extra delay (ms) after the app shell settles — bump for heavy pages. */
  settleMs?: number;
};

/**
 * Pin the color scheme before the page mounts. Must run as an init script
 * (before any app code) so `InitColorSchemeScript` reads the value on first
 * paint instead of falling back to `defaultMode: "dark"`.
 */
export async function pinTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((mode: string) => {
    try {
      // MUI's CssVarsProvider + InitColorSchemeScript both read this key on
      // first paint to pick the initial light/dark scheme (the class added to
      // <html> selects the palette). Must run before any app script.
      window.localStorage.setItem(MUI_COLOR_MODE_KEY, mode);
    } catch {
      /* localStorage unavailable */
    }
  }, theme);
}

/**
 * Inject a global stylesheet that collapses every CSS transition/animation to
 * zero duration. Playwright's `animations: "disabled"` screenshot option only
 * freezes animations at capture time; this prevents mid-transition elements
 * (MUI Fade/Grow, panel slide-overs) from being captured part-way through their
 * entrance during the page-load window before the screenshot is taken.
 */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const css = `
      *, *::before, *::after {
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        scroll-behavior: auto !important;
        caret-color: transparent !important;
      }`;
    const style = document.createElement("style");
    style.setAttribute("data-visual-test-freeze", "true");
    style.textContent = css;
    document.documentElement.appendChild(style);
  });
}

/**
 * Pre-seed localStorage so the app boots into a "returning user" state with a
 * deterministic editor layout. Mirrors the seeding used by the documentation
 * screenshot suite so the two stay visually consistent.
 */
export async function seedLocalStorage(
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
            version
          })
        );
      };

      writePanel("left-panel-storage", 360, "workflows", 3, panelsInBrowser.left);
      writePanel("right-panel-storage", 380, "inspector", 3, panelsInBrowser.right);
      writePanel("bottom-panel-storage", 320, "logs", 2, panelsInBrowser.bottom);
    } catch {
      /* localStorage unavailable */
    }
  }, panelsArg);
}

/**
 * Fail fast if the React Router error boundary is visible — a crashed page
 * produces a misleading screenshot diff. Surface the error text so the failure
 * is actionable in CI logs instead of a cryptic pixel mismatch.
 */
export async function assertNoErrorBoundary(page: Page): Promise<void> {
  const errorEl = page.locator('[class*="errorBoundary"]').first();
  const hasClassError = (await errorEl.count()) > 0;
  const hasFallbackText =
    (await page.getByText("Something went wrong").count()) > 0;
  if (hasClassError || hasFallbackText) {
    const errorText = hasClassError
      ? await errorEl.innerText().catch(() => "(unreadable)")
      : "Something went wrong";
    throw new Error(
      `React ErrorBoundary visible — page crashed.\nURL: ${page.url()}\nError: ${errorText.slice(
        0,
        300
      )}`
    );
  }
}

/**
 * Wait for the "Loading NodeTool…" overlay (shown until /api/nodes/metadata
 * resolves) to disappear, then a short network-idle + animation settle.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  const loadingOverlay = page.locator(
    '[role="status"][aria-label="Loading NodeTool"]'
  );
  if ((await loadingOverlay.count()) > 0) {
    await loadingOverlay
      .first()
      .waitFor({ state: "hidden", timeout: 30_000 })
      .catch(() => {});
  }
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await waitForAnimation(page, 600);
  await assertNoErrorBoundary(page);
}

/**
 * Navigate to a page with deterministic theme, panels, and animations.
 * Seeds localStorage and pins theme BEFORE navigation so React reads the
 * values on first mount.
 */
export async function gotoPage(
  page: Page,
  url: string,
  opts: GotoOptions = {}
): Promise<void> {
  const { theme = "dark", panels, settleMs = 600 } = opts;
  await disableAnimations(page);
  await pinTheme(page, theme);
  await seedLocalStorage(page, panels);
  await page.goto(url);
  await waitForAppReady(page);
  await waitForAnimation(page, settleMs);
}

/**
 * Wait until no transient progress indicator is visible. Useful before
 * capturing pages that lazy-load data (chat threads, asset lists).
 */
export async function ensureNoVisibleProgress(
  page: Page,
  timeout = 12_000
): Promise<void> {
  const progress = page.locator(
    '[role="progressbar"], .MuiCircularProgress-root'
  );
  if ((await progress.count()) === 0) return;
  await progress.first().waitFor({ state: "hidden", timeout }).catch(() => {});
}

/**
 * Locators for page regions that are inherently non-deterministic (live
 * clocks, relative timestamps, avatars fetched from Gravatar, etc.). Pass
 * these to `toHaveScreenshot({ mask })` so they're grayed out of the diff.
 *
 * Returns a single combined locator (which may match zero or many elements);
 * Playwright masks every element a mask locator matches, so one entry is
 * enough. Wrap it in an array because `mask` expects `Locator[]`.
 */
export function volatileMask(page: Page): Locator[] {
  return [
    page.locator('time, [role="timer"], [data-testid*="timestamp" i]')
  ];
}

/**
 * Standard screenshot assertion options. `maxDiffPixelRatio` gives a small
 * tolerance for sub-pixel font-hinting / anti-aliasing differences across
 * Chromium/Firefox and headless renderers, while still failing on real
 * layout regressions. `animations: "disabled"` complements the init-script
 * freeze; `caret: "hide"` removes the blinking text cursor.
 */
export const VISUAL_SCREENSHOT_OPTIONS = {
  animations: "disabled" as const,
  caret: "hide" as const,
  threshold: 0.2,
  maxDiffPixelRatio: 0.01
};
