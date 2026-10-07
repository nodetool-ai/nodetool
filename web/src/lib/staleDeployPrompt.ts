// Ask before reloading a tab that a new deploy left behind.
//
// NodeTool ships web/dist wholesale per deploy, so every content-hashed asset
// changes at once and an open tab keeps running the old bundle. Its lazy
// chunks then 404 and Vite fires `vite:preloadError`. Reloading picks up the
// fresh index.html, but doing it unasked drops the user out of what they were
// doing. So the tab never reloads on its own:
//
// - When the tab becomes visible again, check for a newer deploy and, if one
//   is live, open the StaleDeployDialog. "Later" keeps these checks quiet for
//   the rest of the tab's life.
// - When a chunk fails to load and the deploy is stale, open the dialog even
//   after "Later": that part of the app cannot load without a reload.
//
// `vite:preloadError` also fires for failures a reload cannot fix (a blocked
// CSS subresource, a flaky network, a broken chunk). Re-fetching index.html
// and checking whether it still references this tab's entry script separates
// those from a stale deploy.

import { useStaleDeployStore } from "../stores/StaleDeployStore";
import type { StaleDeployReason } from "../stores/StaleDeployStore";

const RELOAD_GUARD_KEY = "nodetool:preload-error-reload";
const RELOAD_WINDOW_MS = 10_000;
const VISIBILITY_CHECK_INTERVAL_MS = 60_000;

/** Pathname of the content-hashed entry script this tab is running. */
function runningEntryPath(): string | null {
  const script = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]'
  );
  if (!script?.src) return null;
  try {
    return new URL(script.src, window.location.href).pathname;
  } catch {
    return null;
  }
}

/**
 * True when the server now serves an index.html that no longer references
 * this tab's entry script — i.e. a new deploy replaced the assets and a
 * reload will recover.
 */
async function deployIsStale(): Promise<boolean> {
  const entry = runningEntryPath();
  if (!entry) return false;
  try {
    const res = await fetch("/", {
      cache: "no-store",
      headers: { Accept: "text/html" }
    });
    if (!res.ok) return false;
    return !(await res.text()).includes(entry);
  } catch {
    // Server unreachable — a reload wouldn't help.
    return false;
  }
}

/** Reload into the new deploy. Unsaved work still gets the beforeunload prompt. */
export function reloadIntoNewDeploy(): void {
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
}

function reloadedMomentsAgo(): boolean {
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? "0");
  // The new tab is still stale (e.g. a cached index.html); asking again
  // would loop.
  return Date.now() - last < RELOAD_WINDOW_MS;
}

let staleCheckInFlight = false;

function checkAndPrompt(reason: StaleDeployReason): void {
  if (staleCheckInFlight || reloadedMomentsAgo()) return;
  staleCheckInFlight = true;
  void deployIsStale()
    .then((stale) => {
      if (stale) useStaleDeployStore.getState().show(reason);
    })
    .finally(() => {
      staleCheckInFlight = false;
    });
}

/** Vite rejects a failed CSS preload with this message prefix. */
function isCssPreloadError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.startsWith("Unable to preload CSS")
  );
}

window.addEventListener("vite:preloadError", (event) => {
  // Suppress Vite's rethrow only for a failed CSS preload, which then degrades
  // to a missing stylesheet instead of a wedged route. A failed JS chunk must
  // still reject: suppressing it makes the `import()` resolve `undefined`, and
  // React.lazy crashes on `undefined.default` instead of reporting the failure.
  const { payload } = event as Event & { payload?: unknown };
  if (isCssPreloadError(payload)) {
    event.preventDefault();
  }
  checkAndPrompt("chunk-error");
});

let lastVisibilityCheck = 0;

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const { open, dismissed } = useStaleDeployStore.getState();
  if (open || dismissed) return;
  const now = Date.now();
  if (now - lastVisibilityCheck < VISIBILITY_CHECK_INTERVAL_MS) return;
  lastVisibilityCheck = now;
  checkAndPrompt("update");
});
