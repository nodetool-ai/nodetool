/**
 * File-watch matching helpers shared by the `FileWatchTrigger` node and the
 * host-owned file-watch ingestion adapter (`packages/websocket`).
 *
 * Kept dependency-free (no `node:fs` / `node:path` at module scope) so the
 * `@nodetool-ai/nodes-utils` barrel stays importable in the browser bundle. The
 * only filesystem concept used here is a basename split, done with plain string
 * ops that handle both `/` and `\` separators.
 */

/** Basename of a path, separator-agnostic (`/` and `\`). */
function baseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/**
 * Match a filename against a simple glob. `*` matches any run of characters,
 * `?` matches a single character; `*` alone matches everything. Mirrors the
 * matcher that shipped inline in `FileWatchTriggerNode`.
 */
export function matchesGlob(filename: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const regex = new RegExp(
    "^" +
      pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") +
      "$"
  );
  return regex.test(filename);
}

/**
 * Whether a path passes the include/ignore glob filters. Ignore patterns win:
 * a filename matching any ignore pattern is rejected even if it also matches an
 * include pattern. With no matching include pattern the path is rejected.
 */
export function shouldProcessFile(
  filePath: string,
  patterns: string[],
  ignorePatterns: string[]
): boolean {
  const filename = baseName(filePath);
  for (const p of ignorePatterns) {
    if (matchesGlob(filename, p)) return false;
  }
  for (const p of patterns) {
    if (matchesGlob(filename, p)) return true;
  }
  return false;
}

/**
 * Per-key time-window debouncer. `shouldSkip(key)` returns `true` while a
 * previous accepted event for that key is still inside the debounce window, and
 * `false` (recording the new timestamp) otherwise. Collapses the rapid
 * duplicate events `fs.watch` emits for a single logical change.
 */
export class EventDebouncer {
  private readonly _last = new Map<string, number>();

  constructor(
    private readonly _windowMs: number,
    private readonly _now: () => number = Date.now
  ) {}

  shouldSkip(key: string): boolean {
    const now = this._now();
    const last = this._last.get(key) ?? 0;
    if (now - last < this._windowMs) return true;
    this._last.set(key, now);
    return false;
  }
}
