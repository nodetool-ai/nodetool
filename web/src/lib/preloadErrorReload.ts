// Recover from stale-deploy chunk-load failures.
//
// Vite fires `vite:preloadError` when a dynamically imported JS/CSS chunk fails
// to load. The classic cause is a stale deploy: a new deploy replaced the
// content-hashed assets this already-open tab still references, so the old
// chunk URL now 404s (NodeTool ships web/dist wholesale per deploy, so every
// hash changes at once). Reloading picks up the fresh index.html and its new
// asset hashes.
//
// But the event also fires for failures a reload cannot fix — a CSS chunk
// whose external subresource was blocked, a flaky network, a genuinely broken
// chunk. Blindly reloading on those turns every affected action into a page
// reload (and hides the real error). So before reloading, confirm the deploy
// is actually stale: re-fetch index.html and check whether it still references
// the entry script this tab is running. Reload only when it doesn't.

const RELOAD_GUARD_KEY = "nodetool:preload-error-reload";
const RELOAD_WINDOW_MS = 10_000;

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

let staleCheckInFlight = false;

window.addEventListener("vite:preloadError", (event) => {
  // Suppress Vite's default rethrow. A failed CSS preload then degrades to a
  // missing stylesheet instead of a wedged route, and a stale deploy is
  // recovered by the reload below.
  event.preventDefault();

  if (staleCheckInFlight) return;

  const now = Date.now();
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? "0");
  if (now - last < RELOAD_WINDOW_MS) {
    // Already reloaded moments ago — another reload won't help.
    return;
  }

  staleCheckInFlight = true;
  void deployIsStale()
    .then((stale) => {
      if (!stale) return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      window.location.reload();
    })
    .finally(() => {
      staleCheckInFlight = false;
    });
});

export {};
