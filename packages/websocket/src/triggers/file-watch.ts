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
  type FileWatchFilter
} from "@nodetool-ai/automation-nodes";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.websocket.triggers.file-watch");

const DEFAULT_SWEEP_INTERVAL_MS = 5_000;

/** Fired once per registration each time a watcher delivers a new event. */
export interface FileWatchNotifyEvent {
  registrationId: string;
  inputId: string;
}

export interface RunFileWatchSweepOptions {
  wakeupService: TriggerWakeupService;
  /** Same-process dispatch hint — called after a new event is delivered. */
  notify?: (event: FileWatchNotifyEvent) => void;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface StartFileWatchOptions extends RunFileWatchSweepOptions {
  /** Reconciliation sweep period — how often new/disabled/changed
   * registrations are picked up. Defaults to 5s; live events do not wait for
   * this timer, only registration churn does. */
  intervalMs?: number;
}

/** Cancels a running `startFileWatch` timer and closes every open watcher. */
export type FileWatchHandle = () => void;

interface WatchedRegistration {
  watcher: fs.FSWatcher;
  /** Identifies the watched path + recursion setting; a change here forces a
   * watcher restart on the next sweep. */
  configSnapshot: string;
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
  return typeof raw === "string" ? raw : fallback;
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
  eventCounter: { count: number }
): Promise<void> {
  const nowMs = (opts.now ?? Date.now)();
  eventCounter.count += 1;
  const inputId = `${registration.id}:${nowMs}:${eventCounter.count}`;
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
    void deliverFileWatchEvent(
      registration,
      eventType,
      filePath,
      isDirectory,
      opts,
      eventCounter
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

    state.set(registration.id, { watcher, configSnapshot: snapshot });
  }
}

/** Close every watcher tracked by `state` and clear it. */
export function stopFileWatch(state: FileWatchState): void {
  for (const entry of state.values()) {
    entry.watcher.close();
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

  const sweep = (): void => {
    void runFileWatchSweepOnce(state, opts).catch((err) => {
      log.warn(
        "File-watch sweep failed",
        err instanceof Error ? err : new Error(String(err))
      );
    });
  };

  sweep();
  const timer = setInterval(sweep, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return () => {
    clearInterval(timer);
    stopFileWatch(state);
  };
}
