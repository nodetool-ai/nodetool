// Detect that a newer deploy replaced this tab's assets.
//
// NodeTool ships web/dist wholesale per deploy, so every content-hashed asset
// changes at once. An open tab keeps running the old bundle and its lazy
// chunks 404. Kept free of side effects so error reporting can import it
// without registering the listeners in staleDeployPrompt.

/** Pathname of the content-hashed entry script this tab is running. */
function runningEntryPath(): string | null {
  const script = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]'
  );
  if (!script?.src) {
    return null;
  }
  try {
    return new URL(script.src, window.location.href).pathname;
  } catch {
    return null;
  }
}

/**
 * True when the server now serves an index.html that no longer references
 * this tab's entry script, so a new deploy replaced the assets and a reload
 * will recover.
 */
export async function deployIsStale(): Promise<boolean> {
  const entry = runningEntryPath();
  if (!entry) {
    return false;
  }
  try {
    const res = await fetch("/", {
      cache: "no-store",
      headers: { Accept: "text/html" }
    });
    if (!res.ok) {
      return false;
    }
    return !(await res.text()).includes(entry);
  } catch {
    // Server unreachable: a reload would not help.
    return false;
  }
}

// Browsers word a failed dynamic import differently: Chromium, Safari,
// Firefox, and the SPA fallback that answers a missing chunk with index.html.
const CHUNK_LOAD_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "is not a valid JavaScript MIME type"
];

/** True when `error` is a lazy chunk that failed to load. */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}
