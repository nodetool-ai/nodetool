/**
 * Helpers for the page-load smoke suite.
 *
 * The suite navigates to every top-level app route against the seeded real
 * backend (`tests/globalSetup.ts`) and fails the moment a page boots into a
 * broken state:
 *   - an uncaught exception (`pageerror`),
 *   - a visible React error boundary,
 *   - a `console.error`, or
 *   - a 4xx/5xx on a critical resource (document / script / stylesheet).
 * It complements the visual-regression suite: that one guards how pages look,
 * this one guards that they mount at all.
 *
 * Environment noise expected on GPU-less CI runners (WebGPU adapter probing,
 * favicon 404s, aborted in-flight fetches on unmount, the transient agent
 * WebSocket) is filtered by `IGNORED_CONSOLE_PATTERNS`. Data-level 404s
 * (images, api, fonts) are tolerated too — only broken document/script/style
 * loads white-screen a page, so only those fail the check.
 */

import { Page, type ConsoleMessage } from "@playwright/test";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

/** A single problem observed while a page loaded. */
export type PageLoadError = {
  kind:
    | "pageerror"
    | "console"
    | "errorboundary"
    | "requestfailed"
    | "badresponse";
  text: string;
};

/**
 * Resource types whose 4xx/5xx responses actually break page load: a missing
 * HTML document, JS chunk, or stylesheet white-screens the app. A 404 for an
 * image, font, api call, or xhr is data-level — data availability depends on
 * the seeded fixture and is not what this suite guards.
 */
const CRITICAL_RESOURCE_TYPES = new Set(["document", "script", "stylesheet"]);

/**
 * Console / request noise that is expected in the headless CI environment and
 * is NOT an app regression. Keep this list tight — every entry is a hole in the
 * check. Match on stable substrings, never on volatile ids or timestamps.
 */
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  // WebGPU/WebGL adapter probing on GPU-less runners (swiftshader/lavapipe).
  /WebGPU/i,
  /GPUAdapter/i,
  /Failed to (create|acquire).*(WebGPU|GPU) adapter/i,
  /Automatic fallback to software WebGL/i,
  /THREE\.WebGLRenderer/i,
  // Browsers log a bare 404 line for a missing favicon.
  /favicon\.ico/i,
  // Fetches aborted when a component unmounts mid-flight during fast navigation.
  /The user aborted a request/i,
  /AbortError/i,
  /net::ERR_ABORTED/i,
  // WebSocket connectivity is transient by design — the client retries. The
  // seeded screenshot backend serves /ws but not the Pi agent bridge
  // (/ws/agent), so Global Chat's connect attempt fails on every route while
  // the page still mounts. A dropped/failed socket is not a page-mount error.
  /WebSocket connection to .* failed/i,
  /WebSocket is closed before the connection is established/i,
  // React DevTools nudge printed in dev builds.
  /Download the React DevTools/i,
  // The browser mirrors every HTTP 4xx/5xx as this URL-less console line.
  // Broken *critical* loads (document/script/stylesheet) are caught precisely
  // by the `response` listener below; data/asset/api 404s are fixture-level
  // and not a page-mount failure, so the generic line is dropped here.
  /Failed to load resource/i,
  // Seeded-backend capability gaps surfaced as tRPC query errors — the
  // screenshot backend runs no worker manager and no runtime /api/config, so
  // panels that poll them log errors while the page itself mounts fine. The
  // tRPC error logger renders with %c/%O directives, so match the query name
  // (a plain-string arg that survives in `msg.text()`) rather than the object
  // body.
  /worker\.(apiKeyStatus|profiles\.list|instances\.list)/i,
  /Worker manager is not configured/i,
  /Runtime config unavailable/i,
  /GET \/api\/config failed/i,
];

/** True when a console/request message is expected environment noise. */
export function isIgnoredMessage(text: string): boolean {
  return IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text));
}

/**
 * Attach listeners that record every page-load failure. Returns the mutable
 * array they push into — read it after navigation settles.
 *
 * Call this BEFORE `page.goto` so nothing that fires during the initial paint
 * is missed.
 */
export function collectPageLoadErrors(page: Page): PageLoadError[] {
  const errors: PageLoadError[] = [];

  page.on("pageerror", (err) => {
    const text = err.stack || String(err);
    if (!isIgnoredMessage(text)) {
      errors.push({ kind: "pageerror", text });
    }
  });

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isIgnoredMessage(text)) {
      errors.push({ kind: "console", text });
    }
  });

  page.on("requestfailed", (request) => {
    // Only a failed document/script/stylesheet load white-screens a page. A
    // failed xhr/fetch/websocket (e.g. the transient /ws/agent socket) is
    // data-level and handled elsewhere, so scope this to the same critical
    // resource types as the `response` listener. Once scoped, always record:
    // the console allowlist is for noisy non-critical logs, and applying it
    // here could mask a real script/document failure (e.g. net::ERR_ABORTED
    // on a JS chunk).
    if (!CRITICAL_RESOURCE_TYPES.has(request.resourceType())) return;
    const failure = request.failure();
    errors.push({
      kind: "requestfailed",
      text: `${request.method()} ${request.url()} — ${
        failure?.errorText ?? "failed"
      }`,
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    if (!CRITICAL_RESOURCE_TYPES.has(response.request().resourceType())) return;
    // Scoped to critical resources — a 4xx/5xx here is always actionable, so
    // don't run it through the console allowlist.
    errors.push({
      kind: "badresponse",
      text: `${status} ${response.request().resourceType()} ${response.url()}`,
    });
  });

  return errors;
}

/**
 * Wait for the "Loading NodeTool…" overlay (shown until /api/nodes/metadata
 * resolves) to disappear, then a short network-idle + animation settle so
 * late-firing async errors are captured before we assert.
 *
 * Throws if the overlay never hides: a route stuck on the boot spinner is a
 * page-load failure, and swallowing the timeout would let it pass with an
 * empty error list.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  const loadingOverlay = page.locator(
    '[role="status"][aria-label="Loading NodeTool"]'
  );
  if ((await loadingOverlay.count()) > 0) {
    const hidden = await loadingOverlay
      .first()
      .waitFor({ state: "hidden", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!hidden) {
      throw new Error(
        `Route stuck on the "Loading NodeTool…" overlay after 30s — the app never finished booting.\nURL: ${page.url()}`
      );
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await waitForAnimation(page, 500);
}

/**
 * Detect the app's error-boundary fallback (`src/ErrorBoundary.tsx`). A crashed
 * route renders it instead of the page. The fallback is Emotion-styled with no
 * stable class name, so detect via its "Reload page" button — that label is
 * unique to the boundary, whereas the "Something went wrong" heading is also
 * an `EmptyState` error-variant title and would false-positive on empty lists.
 * Surface the error message (behind the collapsed "Show details" toggle, when
 * present) so the failure is actionable.
 */
export async function readErrorBoundary(page: Page): Promise<string | null> {
  const hasReloadButton =
    (await page.getByRole("button", { name: /reload page/i }).count()) > 0;
  if (!hasReloadButton) return null;

  const summary = page.locator(".error-summary").first();
  const detail =
    (await summary.count()) > 0
      ? (await summary.innerText().catch(() => "")).trim()
      : "";
  return `Something went wrong${detail ? ` — ${detail.slice(0, 300)}` : ""}`;
}

/**
 * Seed localStorage so the app boots as a returning user — the onboarding flow
 * is dismissed, so `/` and `/chat` resolve to real pages instead of the welcome
 * wizard. Mirrors the seeding used by the visual suite.
 */
export async function seedReturningUser(page: Page): Promise<void> {
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
              run: true,
            },
            dismissed: true,
          },
          version: 2,
        })
      );
      // Boot in dark mode deterministically (MUI reads this key on first paint).
      window.localStorage.setItem("mode", "dark");
    } catch {
      /* localStorage unavailable */
    }
  });
}
