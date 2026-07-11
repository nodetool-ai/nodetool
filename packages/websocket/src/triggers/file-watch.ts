/**
 * File-watch adapter (Task 12) + downtime catch-up (Task 13).
 *
 * A single coarse reconcile timer keeps a set of `fs.watch` watchers in sync
 * with the enabled `file_watch` registrations — one watcher (tree) per
 * registration. Each reconcile:
 *   - starts a watcher for a newly-enabled registration,
 *   - closes the watcher for a disabled/removed registration,
 *   - restarts a watcher whose config snapshot changed (same canonical-config
 *     comparison `registration-sync.ts` uses).
 *
 * On a matching filesystem event the adapter delivers a durable `trigger_input`
 * (payload = the node's `FileWatchTrigger` output shape) and pokes the
 * dispatcher. The input id is deterministic
 * (`${reg.id}:${event}:${path}:${mtime-or-time-bucket}`) so the double `rename`
 * events `fs.watch` emits for one create collapse to a single input even beyond
 * the debounce window.
 *
 * Downtime catch-up (opt-in, `config_json.catch_up === true`): a `{relativePath
 * → mtimeMs}` snapshot is persisted into `registration.cursor`. On start, the
 * live directory is diffed against the stored snapshot and the differences are
 * synthesized as `created`/`modified`/`deleted` inputs *before* live watching
 * begins; the snapshot is then refreshed. The snapshot is capped at
 * {@link SNAPSHOT_CAP} entries — over the cap nothing is stored and a
 * `last_error` note is written once.
 *
 * The reconcile timer is `unref`'d and watchers use `persistent: false`, so the
 * adapter never keeps the process alive on its own — shutdown leaves no open
 * handles.
 *
 * Platform note: `fs.watch({ recursive })` is used when a registration asks for
 * recursive watching; if the platform rejects it, the adapter falls back to a
 * watcher per existing subdirectory captured at start time (subdirectories
 * created later are not picked up in the fallback path — a known limitation
 * called out here rather than papered over).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "@nodetool-ai/config";
import { TriggerRegistration } from "@nodetool-ai/models";
import {
  shouldProcessFile,
  EventDebouncer
} from "@nodetool-ai/nodes-utils";
import { getTriggerWakeupService, notifyDispatcher } from "./dispatcher.js";

const log = createLogger("nodetool.websocket.triggers.file-watch");

const DEFAULT_RESYNC_MS = 10_000;
const DEFAULT_DEBOUNCE_SECONDS = 0.5;
const DEFAULT_EVENTS = ["created", "modified", "deleted", "moved"];
const SNAPSHOT_CAP = 10_000;

interface FileWatchConfig {
  path: string;
  recursive: boolean;
  patterns: string[];
  ignorePatterns: string[];
  events: string[];
  debounceMs: number;
  catchUp: boolean;
}

interface WatcherEntry {
  regId: string;
  canonical: string;
  config: FileWatchConfig;
  watchPath: string;
  watchers: fs.FSWatcher[];
  close: () => void;
}

// ── Config parsing ───────────────────────────────────────────────────────────

function stringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  return fallback;
}

function parseConfig(reg: TriggerRegistration): FileWatchConfig {
  const c = (reg.config_json as Record<string, unknown> | null) ?? {};
  const debounceSeconds =
    typeof c.debounce_seconds === "number" && Number.isFinite(c.debounce_seconds)
      ? c.debounce_seconds
      : DEFAULT_DEBOUNCE_SECONDS;
  return {
    path: typeof c.path === "string" && c.path.length > 0 ? c.path : ".",
    recursive: c.recursive === true,
    patterns: stringArray(c.patterns, ["*"]),
    ignorePatterns: stringArray(c.ignore_patterns, []),
    events: stringArray(c.events, DEFAULT_EVENTS),
    debounceMs: Math.max(0, debounceSeconds) * 1000,
    catchUp: c.catch_up === true
  };
}

/** Deterministic JSON with sorted keys, for structural config comparison. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

// ── Filesystem helpers ───────────────────────────────────────────────────────

function statSafe(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/**
 * Scan `root` for files passing the config's include/ignore filters and return
 * a `{relativePath → mtimeMs}` map. `overCap` is set (and the walk stopped)
 * once the map would exceed {@link SNAPSHOT_CAP}.
 */
function scanFiles(
  root: string,
  config: FileWatchConfig
): { files: Map<string, number>; overCap: boolean } {
  const files = new Map<string, number>();
  let overCap = false;

  const rootStat = statSafe(root);
  if (rootStat?.isFile()) {
    if (shouldProcessFile(root, config.patterns, config.ignorePatterns)) {
      files.set(path.basename(root), Math.round(rootStat.mtimeMs));
    }
    return { files, overCap };
  }

  const walk = (dir: string): void => {
    if (overCap) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (overCap) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (config.recursive) walk(full);
        continue;
      }
      if (!shouldProcessFile(full, config.patterns, config.ignorePatterns)) {
        continue;
      }
      const st = statSafe(full);
      if (!st) continue;
      files.set(path.relative(root, full), Math.round(st.mtimeMs));
      if (files.size > SNAPSHOT_CAP) {
        overCap = true;
        return;
      }
    }
  };
  walk(root);
  return { files, overCap };
}

/** Existing directories under `root` (inclusive), for the recursive fallback. */
function listDirs(root: string, recursive: boolean): string[] {
  const dirs = [root];
  if (!recursive) return dirs;
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const full = path.join(dir, ent.name);
        dirs.push(full);
        walk(full);
      }
    }
  };
  walk(root);
  return dirs;
}

// ── Delivery ─────────────────────────────────────────────────────────────────

async function deliver(
  reg: TriggerRegistration,
  inputId: string,
  event: string,
  fullPath: string,
  isDirectory: boolean
): Promise<void> {
  const created = await getTriggerWakeupService().deliverTriggerInput({
    runId: reg.workflow_id,
    nodeId: reg.node_id,
    inputId,
    payload: {
      event,
      path: fullPath,
      dest_path: "",
      is_directory: isDirectory,
      timestamp: new Date().toISOString()
    }
  });
  if (created) void notifyDispatcher().catch(() => undefined);
}

/** Deliver a live watcher event, deduped by a deterministic mtime/time bucket. */
async function deliverLive(
  reg: TriggerRegistration,
  event: string,
  fullPath: string,
  isDirectory: boolean
): Promise<void> {
  const st = statSafe(fullPath);
  // mtime for existing files makes the id stable across fs.watch double-fires;
  // for a delete (no file) fall back to a coarse 1s time bucket.
  const bucket =
    st != null ? String(Math.round(st.mtimeMs)) : String(Math.floor(Date.now() / 1000));
  const inputId = `${reg.id}:${event}:${fullPath}:${bucket}`;
  await deliver(reg, inputId, event, fullPath, isDirectory);
}

// ── Snapshot persistence (catch-up) ──────────────────────────────────────────

function parseSnapshot(cursor: string | null): Record<string, number> | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(cursor) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // Corrupt cursor — treat as no snapshot.
  }
  return null;
}

/**
 * Persist a fresh `{relativePath → mtimeMs}` snapshot into `cursor`. Re-fetches
 * the registration so this write never clobbers a concurrent `last_fired_at`
 * update from the dispatcher. Over the cap: store nothing and note it once.
 */
async function persistSnapshot(
  regId: string,
  files: Map<string, number>,
  overCap: boolean
): Promise<void> {
  const reg = (await TriggerRegistration.get(regId)) as TriggerRegistration | null;
  if (!reg) return;
  if (overCap) {
    const note = `file-watch snapshot exceeds ${SNAPSHOT_CAP} entries — catch-up disabled`;
    reg.cursor = null;
    if (reg.last_error !== note) reg.last_error = note;
  } else {
    reg.cursor = JSON.stringify(Object.fromEntries(files));
  }
  try {
    await reg.save();
  } catch {
    // Snapshot is a best-effort optimization; a failed write just means the
    // next start re-scans from the previous snapshot.
  }
}

/**
 * Drain the downtime delta for a catch-up registration: diff the live directory
 * against the stored snapshot and synthesize created/modified/deleted inputs.
 * Input ids are deterministic in `(reg.id, path, oldMtime, newMtime)` so a crash
 * mid-drain cannot double-deliver on the next start. Returns the fresh scan so
 * the caller can persist it as the new baseline.
 */
async function drainCatchUp(
  reg: TriggerRegistration,
  config: FileWatchConfig,
  watchPath: string
): Promise<{ files: Map<string, number>; overCap: boolean }> {
  const scan = scanFiles(watchPath, config);
  const snapshot = parseSnapshot(reg.cursor);
  if (!snapshot) return scan;

  const synth = async (
    event: string,
    rel: string,
    oldMtime: number | undefined,
    newMtime: number | undefined
  ): Promise<void> => {
    if (!config.events.includes(event)) return;
    const fullPath = path.join(watchPath, rel);
    if (!shouldProcessFile(fullPath, config.patterns, config.ignorePatterns)) {
      return;
    }
    const inputId = `${reg.id}:catchup:${event}:${fullPath}:${oldMtime ?? ""}:${
      newMtime ?? ""
    }`;
    await deliver(reg, inputId, event, fullPath, false);
  };

  for (const [rel, mtime] of scan.files) {
    const old = snapshot[rel];
    if (old === undefined) {
      await synth("created", rel, undefined, mtime);
    } else if (old !== mtime) {
      await synth("modified", rel, old, mtime);
    }
  }
  for (const rel of Object.keys(snapshot)) {
    if (!scan.files.has(rel)) {
      await synth("deleted", rel, snapshot[rel], undefined);
    }
  }
  return scan;
}

// ── Watcher lifecycle ────────────────────────────────────────────────────────

function makeListener(
  reg: TriggerRegistration,
  config: FileWatchConfig,
  debouncer: EventDebouncer,
  dir: string
): fs.WatchListener<string> {
  return (rawEvent, filename) => {
    if (!filename) return;
    const fullPath = path.join(dir, String(filename));

    const emit = (event: string, isDir: boolean): void => {
      if (!config.events.includes(event)) return;
      if (!shouldProcessFile(fullPath, config.patterns, config.ignorePatterns)) {
        return;
      }
      if (debouncer.shouldSkip(fullPath)) return;
      void deliverLive(reg, event, fullPath, isDir).catch((err) => {
        log.warn(
          `file-watch delivery failed for ${reg.workflow_id}/${reg.node_id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });
    };

    // fs.watch emits 'rename' for create/delete and 'change' for modify.
    if (rawEvent === "rename") {
      const st = statSafe(fullPath);
      if (st) emit("created", st.isDirectory());
      else emit("deleted", false);
    } else if (rawEvent === "change") {
      const st = statSafe(fullPath);
      emit("modified", st?.isDirectory() ?? false);
    }
  };
}

function createWatchers(
  reg: TriggerRegistration,
  config: FileWatchConfig,
  watchPath: string
): fs.FSWatcher[] {
  const debouncer = new EventDebouncer(config.debounceMs);
  const watchers: fs.FSWatcher[] = [];
  try {
    watchers.push(
      fs.watch(
        watchPath,
        { recursive: config.recursive, persistent: false },
        makeListener(reg, config, debouncer, watchPath)
      )
    );
  } catch {
    // recursive watch unsupported on this platform — fall back to a watcher per
    // existing directory (subdirectories created later are not picked up).
    for (const dir of listDirs(watchPath, config.recursive)) {
      try {
        watchers.push(
          fs.watch(
            dir,
            { persistent: false },
            makeListener(reg, config, debouncer, dir)
          )
        );
      } catch {
        // Skip a directory we cannot watch; others may still succeed.
      }
    }
  }
  return watchers;
}

/**
 * Start (or fail to start) a watcher for one registration. Returns the entry, or
 * `null` when the path is missing (recorded as `last_error`, retried next
 * reconcile) or no watcher could be created. Runs catch-up before live watching.
 */
async function startWatcher(
  reg: TriggerRegistration,
  config: FileWatchConfig,
  canonicalConfig: string
): Promise<WatcherEntry | null> {
  const watchPath = path.resolve(config.path);

  if (!fs.existsSync(watchPath)) {
    const note = `file-watch path does not exist: ${watchPath}`;
    if (reg.last_error !== note) {
      reg.last_error = note;
      try {
        await reg.save();
      } catch {
        // best-effort diagnostic
      }
    }
    return null;
  }

  // Downtime catch-up drains before the live watcher so an event that happened
  // while stopped is delivered exactly once, then the baseline is refreshed.
  if (config.catchUp) {
    const scan = await drainCatchUp(reg, config, watchPath);
    await persistSnapshot(reg.id, scan.files, scan.overCap);
  }

  const watchers = createWatchers(reg, config, watchPath);
  if (watchers.length === 0) {
    const note = `file-watch failed to watch path: ${watchPath}`;
    if (reg.last_error !== note) {
      reg.last_error = note;
      try {
        await reg.save();
      } catch {
        // best-effort diagnostic
      }
    }
    return null;
  }

  // Watching now — clear a stale error from a previous missing-path reconcile.
  if (reg.last_error) {
    reg.last_error = null;
    try {
      await reg.save();
    } catch {
      // best-effort
    }
  }

  return {
    regId: reg.id,
    canonical: canonicalConfig,
    config,
    watchPath,
    watchers,
    close: () => {
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // already closed
        }
      }
    }
  };
}

// ── Reconcile ────────────────────────────────────────────────────────────────

/**
 * One reconcile pass: align live watchers with the enabled `file_watch`
 * registrations. Exported for deterministic testing;
 * {@link startFileWatchAdapter} calls it on a timer.
 */
export async function reconcileFileWatchers(
  watchers: Map<string, WatcherEntry>
): Promise<void> {
  const regs = await TriggerRegistration.findEnabledByKind("file_watch");
  const enabledIds = new Set(regs.map((r) => r.id));

  // Close watchers whose registration is gone or disabled.
  for (const [id, entry] of watchers) {
    if (!enabledIds.has(id)) {
      entry.close();
      watchers.delete(id);
    }
  }

  for (const reg of regs) {
    const config = parseConfig(reg);
    const canonicalConfig = canonical(config);
    const entry = watchers.get(reg.id);

    if (entry && entry.canonical === canonicalConfig) {
      // Already watching. For catch-up registrations, refresh the snapshot so a
      // change made while watching is captured before the next stop.
      if (config.catchUp) {
        const scan = scanFiles(entry.watchPath, config);
        await persistSnapshot(reg.id, scan.files, scan.overCap);
      }
      continue;
    }

    // New or changed config — (re)start the watcher.
    if (entry) {
      entry.close();
      watchers.delete(reg.id);
    }
    const started = await startWatcher(reg, config, canonicalConfig);
    if (started) watchers.set(reg.id, started);
  }
}

export interface StartFileWatchAdapterOptions {
  /** Reconcile period in ms. Default 10000. */
  resyncMs?: number;
}

/**
 * Start the file-watch adapter: a coarse reconcile timer plus an immediate first
 * reconcile. Returns a stop function that clears the timer, closes every
 * watcher, and persists a final snapshot for each catch-up registration.
 */
export function startFileWatchAdapter(
  opts: StartFileWatchAdapterOptions = {}
): () => void {
  const resyncMs = opts.resyncMs ?? DEFAULT_RESYNC_MS;
  const watchers = new Map<string, WatcherEntry>();
  let reconciling = false;
  let stopped = false;

  const runReconcile = (): void => {
    if (reconciling || stopped) return;
    reconciling = true;
    void reconcileFileWatchers(watchers)
      .catch((error) => {
        log.error(
          `file-watch reconcile failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      })
      .finally(() => {
        reconciling = false;
      });
  };

  // Immediate first reconcile so watchers arm without waiting a full period.
  runReconcile();

  const timer = setInterval(runReconcile, resyncMs);
  if (typeof timer.unref === "function") timer.unref();

  return () => {
    stopped = true;
    clearInterval(timer);
    const entries = [...watchers.values()];
    watchers.clear();
    for (const entry of entries) entry.close();
    // Persist a final snapshot for catch-up registrations (fire-and-forget; the
    // deterministic ids make a re-scan on next start harmless if this is lost).
    void persistSnapshotsOnStop(entries).catch(() => undefined);
  };
}

async function persistSnapshotsOnStop(entries: WatcherEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!entry.config.catchUp) continue;
    const scan = scanFiles(entry.watchPath, entry.config);
    await persistSnapshot(entry.regId, scan.files, scan.overCap);
  }
}
