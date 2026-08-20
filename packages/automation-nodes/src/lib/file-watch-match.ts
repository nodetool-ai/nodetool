/**
 * Shared file-watch matching/debounce logic.
 *
 * Used by both `FileWatchTriggerNode` (`../nodes/triggers.ts`, the in-editor
 * live-test path that runs inside a job) and the host file-watch adapter
 * (`packages/websocket/src/triggers/file-watch.ts`, the production ingestion
 * path that runs in the backend server process). One implementation means a
 * pattern or debounce fix lands in both call sites at once instead of
 * drifting apart.
 */

import * as path from "path";

/** The filter a watcher applies before turning a raw fs event into an event. */
export interface FileWatchFilter {
  /** Glob-ish include patterns (e.g. "*.txt"); "*" matches everything. */
  patterns: string[];
  /** Glob-ish patterns to exclude, checked before include patterns. */
  ignorePatterns: string[];
  /** Event types to react to ("created" | "modified" | "deleted" | "moved" | ...). */
  events: string[];
}

/**
 * Minimal glob match against a filename: `*` matches any run of characters,
 * `?` matches any single character, everything else is literal. `pattern ===
 * "*"` is short-circuited since it is the common "match everything" case.
 */
export function matchesFileWatchPattern(
  filename: string,
  pattern: string
): boolean {
  if (pattern === "*") return true;
  // Escape every regex metacharacter first, then reinstate the two glob
  // wildcards from their escaped forms. Escaping only "." would leave the
  // rest live: "\d" would match any digit instead of a literal backslash,
  // and an unbalanced "(" would throw at watch time rather than simply
  // failing to match.
  const source = pattern
    .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    .replace(/\\\*/g, ".*")
    .replace(/\\\?/g, ".");
  // "s" because a bare "." skips the four JS line terminators, all of which
  // are legal in a POSIX filename; "u" because it otherwise counts one UTF-16
  // unit, so "?" ate half an emoji. Neither flag can make the compile throw:
  // the escape above already covers every character "u" is strict about.
  return new RegExp(`^${source}$`, "us").test(filename);
}

/**
 * True when a changed file's basename passes the ignore/include pattern
 * filter: ignore patterns are checked first (an ignored file is never
 * processed even if an include pattern also matches it), then include
 * patterns — no include pattern match means the file is skipped.
 */
export function shouldProcessFileWatchPath(
  filePath: string,
  filter: Pick<FileWatchFilter, "patterns" | "ignorePatterns">
): boolean {
  const filename = path.basename(filePath);

  for (const pattern of filter.ignorePatterns) {
    if (matchesFileWatchPattern(filename, pattern)) return false;
  }

  for (const pattern of filter.patterns) {
    if (matchesFileWatchPattern(filename, pattern)) return true;
  }

  return false;
}

/** True when an event type is one the watcher cares about. */
export function isWatchedFileEvent(
  eventType: string,
  events: string[]
): boolean {
  return events.includes(eventType);
}

/**
 * Per-path debounce: tracks the last time each path fired and suppresses a
 * repeat for the same path within `debounceMs`. One instance per watcher (a
 * node run, or one per registration in the host adapter) — state is scoped to
 * that watcher, not shared across paths or watchers.
 */
export class FileWatchDebouncer {
  private readonly lastFiredAt = new Map<string, number>();

  constructor(
    private readonly debounceMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** Returns true when the event for `filePath` should be suppressed. */
  shouldSuppress(filePath: string): boolean {
    const now = this.now();
    const last = this.lastFiredAt.get(filePath) ?? 0;
    if (now - last < this.debounceMs) return true;
    this.lastFiredAt.set(filePath, now);
    return false;
  }
}

/**
 * Combines the event-type, include/ignore-pattern, and debounce checks in the
 * same order `FileWatchTriggerNode.genProcess()`'s `emitEvent` always applied
 * them: event type first (cheapest), then patterns, then debounce (which has
 * a side effect — it records the fire time — so it must run last and only
 * once the event is otherwise known to matter).
 */
export function shouldEmitFileWatchEvent(
  eventType: string,
  filePath: string,
  filter: FileWatchFilter,
  debouncer: FileWatchDebouncer
): boolean {
  if (!isWatchedFileEvent(eventType, filter.events)) return false;
  if (!shouldProcessFileWatchPath(filePath, filter)) return false;
  if (debouncer.shouldSuppress(filePath)) return false;
  return true;
}
