// Recover from stale-deploy chunk-load failures.
//
// Vite fires `vite:preloadError` when a dynamically imported JS/CSS chunk fails
// to load — almost always because a new deploy replaced the content-hashed
// assets this already-open tab still references, so the old chunk URL now 404s
// (NodeTool ships web/dist wholesale per deploy, so every hash changes at once).
// The failed import throws and wedges whatever lazy route/component triggered
// it. Reloading picks up the fresh index.html and its new asset hashes.
//
// Guarded so a genuinely broken chunk (not just a stale one) can't loop: if we
// reloaded within the last window and it fired again, let the error surface.

const RELOAD_GUARD_KEY = "nodetool:preload-error-reload";
const RELOAD_WINDOW_MS = 10_000;

window.addEventListener("vite:preloadError", (event) => {
  // Suppress Vite's default rethrow so the reload is the only outcome.
  event.preventDefault();

  const now = Date.now();
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? "0");
  if (now - last < RELOAD_WINDOW_MS) {
    // Already reloaded moments ago — another reload won't help. Let it through.
    return;
  }

  sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  window.location.reload();
});

export {};
