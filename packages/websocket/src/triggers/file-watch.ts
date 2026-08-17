/**
 * File-watch adapter — the host-owned ingestion adapter for `file_watch`
 * registrations (compiled from `FileWatchTriggerNode`s, see
 * `registration-sync.ts`).
 *
 * File events arrive live through `fs.watch`, unlike the scheduler's poll
 * sweep — so the sweep timer here only reconciles *which* registrations are
 * watched: it opens a watcher for every enabled `file_watch` registration
 * that isn't already watched with the current config (skipping — and
 * recording `last_error` for — paths that don't exist), and closes the
 * watcher for any registration that is no longer enabled, no longer exists,
 * or whose watched path/recursion setting changed. Pattern/ignore-pattern
 * matching and debounce reuse `FileWatchTriggerNode`'s own logic via the
 * shared `@nodetool-ai/automation-nodes` helper, so the adapter and the
 * in-editor live-test path can never drift apart.
 *
 * Follows `scheduler.ts`'s shape: a pure-ish sweep function callers can drive
 * directly in tests, a thin `setInterval` wrapper for production, and a stop
 * handle. The one difference is unavoidable statefulness — `fs.watch` handles
 * must persist across sweeps — so the sweep function takes an explicit state
 * map instead of being fully pure.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "@nodetool-ai/config";
import { TriggerRegistration } from "@nodetool-ai/models";
import type { TriggerWakeupService } from "@nodetool-ai/kernel";
import {
  FileWatchDebouncer,
  shouldEmitFileWatchEvent,
  shouldProcessFileWatchPath,
  isWatchedFileEvent,
  type FileWatchFilter
} from "@nodetool-ai/automation-nodes";
import {
  isFunctionValue,
  isString
} from "../lib/wire-values.js";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.websocket.triggers.file-watch");

const DEFAULT_SWEEP_INTERVAL_MS = 5_000;

/**
 * Downtime catch-up (`config_json.catch_up: true`). `fs.watch` has no
 * history, so the only way to notice a change made while the adapter wasn't
 * running is to compare a snapshot taken before stopping against a fresh
 * scan on the next start. Capped so a huge tree can't make shutdown/startup
 * hang or bloat the `cursor` column — `last_error` records when the cap was
 * hit so the truncation is visible, not silent.
 */
const CATCH_UP_SNAPSHOT_CAP = 10_000;

/** `{path -> mtimeMs}` snapshot persisted into a registration's `cursor`. */
interface FileWatchSnapshot {
  entries: Record<string, number>;
}

type CatchUpEventType = "created" | "modified" | "deleted";

interface CatchUpChange {
  event: CatchUpEventType;
  path: string;
  mtimeMs: number;
}

/** Fired once per registration each time a watcher delivers a new event. */
interface FileWatchNotifyEvent {
  registrationId: string;
  inputId: string;
}

interface RunFileWatchSweepOptions {
  wakeupService: TriggerWakeupService;
  /** Same-process dispatch hint — called after a new event is delivered. */
  notify?: (event: FileWatchNotifyEvent) => void;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface StartFileWatchOptions extends RunFileWatchSweepOptions {
  /** Reconciliation sweep period — how often new/disabled/changed
   * registrations are picked up. Defaults to 5s; live events do not wait for
   * this timer, only registration churn does. */
  intervalMs?: number;
}

/** Cancels a running `startFileWatch` timer and closes every open watcher,
 * persisting catch-up snapshots along the way — see `stopFileWatch`. */
export type FileWatchHandle = () => Promise<void>;

interface WatchedRegistration {
  watcher: fs.FSWatcher;
  /** Identifies the watched path + recursion setting; a change here forces a
   * watcher restart on the next sweep. */
  configSnapshot: string;
  /** Kept so `stopFileWatch` can capture a catch-up snapshot without a DB
   * round trip and without re-deriving path/recursion/filter from config. */
  registration: TriggerRegistration;
  watchPath: string;
  recursive: boolean;
  filter: FileWatchFilter;
  catchUp: boolean;
}

/** One `startFileWatch`/`runFileWatchSweepOnce` instance's set of currently
 * open watchers, keyed by registration id. Exported so tests can drive
 * `runFileWatchSweepOnce` deterministically without a real timer. */
export type FileWatchState = Map<string, WatchedRegistration>;

export function createFileWatchState(): FileWatchState {
  return new Map();
}

function readString(
  config: Record<string, unknown> | null,
  key: string,
  fallback: string
): string {
  const raw = config?.[key];
  return isString(raw) ? raw : fallback;
}

function readBool(
  config: Record<string, unknown> | null,
  key: string,
  fallback: boolean
): boolean {
  const raw = config?.[key];
  return raw === undefined || raw === null ? fallback : Boolean(raw);
}

function readNumber(
  config: Record<string, unknown> | null,
  key: string,
  fallback: number
): number {
  const raw = config?.[key];
  if (raw === undefined || raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readStringArray(
  config: Record<string, unknown> | null,
  key: string,
  fallback: string[]
): string[] {
  const raw = config?.[key];
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : fallback;
}

/** The same property names `FileWatchTriggerNode` snapshots into the
 * registration on sync (`registration-sync.ts`). */
function resolveWatchPath(config: Record<string, unknown> | null): string {
  return path.resolve(readString(config, "path", "."));
}

function configFilter(config: Record<string, unknown> | null): FileWatchFilter {
  return {
    patterns: readStringArray(config, "patterns", ["*"]),
    ignorePatterns: readStringArray(config, "ignore_patterns", []),
    events: readStringArray(config, "events", [
      "created",
      "modified",
      "deleted",
      "moved"
    ])
  };
}

function configSnapshotKey(config: Record<string, unknown> | null): string {
  return JSON.stringify({
    path: resolveWatchPath(config),
    recursive: readBool(config, "recursive", false)
  });
}

async function deliverFileWatchEvent(
  registration: TriggerRegistration,
  eventType: string,
  filePath: string,
  isDirectory: boolean,
  opts: RunFileWatchSweepOptions,
  inputId: string
): Promise<void> {
  const nowMs = (opts.now ?? Date.now)();
  const payload = {
    event: eventType,
    path: filePath,
    dest_path: "",
    is_directory: isDirectory,
    timestamp: new Date(nowMs).toISOString()
  };

  try {
    await opts.wakeupService.deliverTriggerInput({
      runId: registration.workflow_id,
      nodeId: registration.node_id,
      inputId,
      payload
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    registration.last_error = error.message;
    await registration.save();
    log.warn(
      `File-watch registration ${registration.id} failed to deliver trigger input`,
      error
    );
    return;
  }

  registration.last_fired_at = new Date(nowMs).toISOString();
  registration.last_error = null;
  await registration.save();

  opts.notify?.({ registrationId: registration.id, inputId });
}

/**
 * Attach an `fs.watch` handle for one registration. Mirrors
 * `FileWatchTriggerNode.genProcess()`'s `watchDir`: `fs.watch` emits
 * `"rename"` for create/delete and `"change"` for modify.
 */
function attachWatcher(
  registration: TriggerRegistration,
  watchPath: string,
  recursive: boolean,
  filter: FileWatchFilter,
  debouncer: FileWatchDebouncer,
  opts: RunFileWatchSweepOptions
): fs.FSWatcher {
  const eventCounter = { count: 0 };

  const handleEvent = (
    eventType: "created" | "modified" | "deleted",
    filePath: string,
    isDirectory: boolean
  ): void => {
    if (!shouldEmitFileWatchEvent(eventType, filePath, filter, debouncer)) {
      return;
    }
    eventCounter.count += 1;
    const nowMs = (opts.now ?? Date.now)();
    const inputId = `${registration.id}:${nowMs}:${eventCounter.count}`;
    void deliverFileWatchEvent(
      registration,
      eventType,
      filePath,
      isDirectory,
      opts,
      inputId
    );
  };

  return fs.watch(
    watchPath,
    { recursive, persistent: true },
    (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(watchPath, filename.toString());
      const exists = fs.existsSync(fullPath);
      const isDirectory = exists && fs.statSync(fullPath).isDirectory();

      if (eventType === "rename") {
        if (exists) {
          handleEvent("created", fullPath, isDirectory);
        } else {
          handleEvent("deleted", fullPath, false);
        }
      } else if (eventType === "change") {
        handleEvent("modified", fullPath, isDirectory);
      }
    }
  );
}

/**
 * Scan `watchPath` for the files a watcher for `filter` would care about
 * (directories are never diffed — only file mtimes), capped at
 * `CATCH_UP_SNAPSHOT_CAP` entries. BFS order so a capped scan takes a
 * deterministic, roughly breadth-first prefix of the tree rather than an
 * arbitrary one that depends on `readdirSync` ordering across directories.
 */
function scanDirectorySnapshot(
  watchPath: string,
  recursive: boolean,
  filter: FileWatchFilter
) {
  const entries: Record<string, number> = {};
  let truncated = false;
  const dirs: string[] = [watchPath];

  while (dirs.length > 0 && !truncated) {
    const dir = dirs.shift() as string;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // Directory vanished mid-scan (e.g. concurrent delete) — skip it.
      continue;
    }

    for (const dirent of dirents) {
      const fullPath = path.join(dir, dirent.name);

      if (dirent.isDirectory()) {
        if (recursive) dirs.push(fullPath);
        continue;
      }
      if (!dirent.isFile()) continue;
      if (!shouldProcessFileWatchPath(fullPath, filter)) continue;

      if (Object.keys(entries).length >= CATCH_UP_SNAPSHOT_CAP) {
        truncated = true;
        break;
      }

      try {
        entries[fullPath] = fs.statSync(fullPath).mtimeMs;
      } catch {
        // File vanished between readdir and stat — skip it.
      }
    }
  }

  return { snapshot: { entries }, truncated };
}

/**
 * Diff a stored snapshot against a fresh scan: files whose mtime changed are
 * `modified`, files absent from the old snapshot are `created`, files absent
 * from the new scan are `deleted`.
 */
function diffSnapshots(
  previous: FileWatchSnapshot,
  current: FileWatchSnapshot
): CatchUpChange[] {
  const changes: CatchUpChange[] = [];

  for (const [filePath, mtimeMs] of Object.entries(current.entries)) {
    const previousMtime = previous.entries[filePath];
    if (previousMtime === undefined) {
      changes.push({ event: "created", path: filePath, mtimeMs });
    } else if (previousMtime !== mtimeMs) {
      changes.push({ event: "modified", path: filePath, mtimeMs });
    }
  }

  for (const filePath of Object.keys(previous.entries)) {
    if (!(filePath in current.entries)) {
      changes.push({ event: "deleted", path: filePath, mtimeMs: 0 });
    }
  }

  return changes;
}

/**
 * Replay changes that happened while the adapter wasn't running, using the
 * `{path -> mtime}` snapshot `stopFileWatch` persisted into `cursor`. Runs
 * before `attachWatcher` so catch-up events are delivered ahead of anything
 * the live watcher itself observes.
 *
 * `inputId` is deterministic — `<registrationId>:catchup:<event>:<path>:
 * <mtimeMs>` — instead of timestamp-based like the live-event ids. If the
 * server crashes twice in a row before a clean `stopFileWatch` ever runs
 * again (so `cursor` still holds the same stale snapshot both times), both
 * restarts diff against the identical baseline and recompute the identical
 * change list, which produces the identical inputIds. `deliverTriggerInput`
 * is idempotent by inputId — durably so, once wired to the DB-backed store
 * (Task 3/11) whose `trigger_inputs.input_id` is uniquely indexed — so the
 * replay from the second restart is rejected as a duplicate instead of
 * dispatching the same catch-up event twice. A counter or wall-clock id
 * would not have that property: it would mint a fresh id each replay and
 * double-fire on the second crash-restart.
 */
async function runCatchUpEvents(
  registration: TriggerRegistration,
  watchPath: string,
  recursive: boolean,
  filter: FileWatchFilter,
  opts: RunFileWatchSweepOptions
): Promise<void> {
  const cursorRaw = registration.cursor;
  if (!cursorRaw) return;

  let previous: FileWatchSnapshot;
  try {
    const parsed = JSON.parse(cursorRaw) as Partial<FileWatchSnapshot>;
    previous = { entries: parsed.entries ?? {} };
  } catch {
    // Cursor predates this format (or is corrupt) — nothing to replay.
    return;
  }

  const { snapshot: current } = scanDirectorySnapshot(
    watchPath,
    recursive,
    filter
  );
  const changes = diffSnapshots(previous, current);

  for (const change of changes) {
    if (!isWatchedFileEvent(change.event, filter.events)) continue;
    const inputId = `${registration.id}:catchup:${change.event}:${change.path}:${change.mtimeMs}`;
    await deliverFileWatchEvent(
      registration,
      change.event,
      change.path,
      false,
      opts,
      inputId
    );
  }

  // Consume the cursor: the live watcher takes over from here, and leaving
  // the stale snapshot in place would replay the same diff on every future
  // restart until the next clean stop overwrites it.
  registration.cursor = null;
  await registration.save();
}

/**
 * Run one reconciliation sweep against the current set of enabled
 * `file_watch` registrations: closes watchers for registrations that are no
 * longer enabled/present/unchanged, and opens watchers for the rest. Skips —
 * and records `last_error` for — a registration whose path does not exist.
 */
export async function runFileWatchSweepOnce(
  state: FileWatchState,
  opts: RunFileWatchSweepOptions
): Promise<void> {
  const registrations = await TriggerRegistration.findEnabledByKind(
    "file_watch"
  );
  const enabledIds = new Set(registrations.map((r) => r.id));

  for (const [id, entry] of [...state.entries()]) {
    if (!enabledIds.has(id)) {
      entry.watcher.close();
      state.delete(id);
    }
  }

  for (const registration of registrations) {
    const snapshot = configSnapshotKey(registration.config_json);
    const existing = state.get(registration.id);
    if (existing && existing.configSnapshot === snapshot) continue;

    if (existing) {
      existing.watcher.close();
      state.delete(registration.id);
    }

    const config = registration.config_json;
    const watchPath = resolveWatchPath(config);

    if (!fs.existsSync(watchPath)) {
      registration.last_error = `Watch path does not exist: ${watchPath}`;
      await registration.save();
      continue;
    }

    const recursive = readBool(config, "recursive", false);
    const debounceMs = readNumber(config, "debounce_seconds", 0.5) * 1000;
    const filter = configFilter(config);
    const debouncer = new FileWatchDebouncer(debounceMs, opts.now);
    const catchUp = readBool(config, "catch_up", false);

    if (catchUp) {
      await runCatchUpEvents(registration, watchPath, recursive, filter, opts);
    }

    let watcher: fs.FSWatcher;
    try {
      watcher = attachWatcher(
        registration,
        watchPath,
        recursive,
        filter,
        debouncer,
        opts
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      registration.last_error = `Failed to watch path: ${watchPath} (${error.message})`;
      await registration.save();
      log.warn(
        `File-watch registration ${registration.id} failed to attach a watcher`,
        error
      );
      continue;
    }

    if (registration.last_error) {
      registration.last_error = null;
      await registration.save();
    }

    state.set(registration.id, {
      watcher,
      configSnapshot: snapshot,
      registration,
      watchPath,
      recursive,
      filter,
      catchUp
    });
  }
}

/**
 * Capture a `{path -> mtime}` snapshot for a catch-up-enabled registration
 * and persist it into `cursor` so the next start can diff against it. Caps
 * at `CATCH_UP_SNAPSHOT_CAP` entries and notes the truncation in
 * `last_error` — a capped snapshot means changes to the excluded files while
 * stopped may be missed, which is worth surfacing even though it doesn't
 * block anything.
 */
async function captureCatchUpSnapshot(
  entry: WatchedRegistration
): Promise<void> {
  if (!entry.catchUp) return;

  const { snapshot, truncated } = scanDirectorySnapshot(
    entry.watchPath,
    entry.recursive,
    entry.filter
  );

  entry.registration.cursor = JSON.stringify(snapshot);
  if (truncated) {
    entry.registration.last_error = `File-watch catch-up snapshot capped at ${CATCH_UP_SNAPSHOT_CAP} entries; changes to excluded files while stopped may be missed.`;
  }

  try {
    await entry.registration.save();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.warn(
      `File-watch registration ${entry.registration.id} failed to persist catch-up snapshot`,
      error
    );
  }
}

/** Close every watcher tracked by `state`, persisting a catch-up snapshot
 * for each catch-up-enabled registration, and clear the state. */
export async function stopFileWatch(state: FileWatchState): Promise<void> {
  for (const entry of state.values()) {
    entry.watcher.close();
    await captureCatchUpSnapshot(entry);
  }
  state.clear();
}

/**
 * Start the file-watch adapter: an immediate sweep plus a periodic
 * reconciliation timer (`startReaper`/`startScheduler` shape). File events
 * themselves are not polled — they arrive live through each registration's
 * `fs.watch` handle; only registration churn (new/disabled/changed) waits for
 * the sweep.
 */
export function startFileWatch(opts: StartFileWatchOptions): FileWatchHandle {
  const intervalMs = opts.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const state = createFileWatchState();

  let stopped = false;

  const sweep = (): void => {
    void runFileWatchSweepOnce(state, opts)
      .catch((err) => {
        log.warn(
          "File-watch sweep failed",
          err instanceof Error ? err : new Error(String(err))
        );
      })
      .finally(() => {
        // A sweep still in flight when the handle was called would otherwise
        // attach its watchers into an already-emptied state map and leak them
        // past shutdown, delivering events into the next process life.
        if (stopped) void stopFileWatch(state);
      });
  };

  sweep();
  const timer = setInterval(sweep, intervalMs);
  if (isFunctionValue(timer.unref)) {
    timer.unref();
  }

  return async () => {
    stopped = true;
    clearInterval(timer);
    await stopFileWatch(state);
  };
}
