/**
 * The watch loop `nodetool debug --watch` and `nodetool app build --watch`
 * share: re-run on save, diff the new run against the last one, print only what
 * moved.
 *
 * The loop owns the awkward parts — debouncing an editor's write burst, never
 * running two passes at once, surviving a run that throws — and nothing else.
 * What a run means is the caller's: it supplies `run` and a projection into
 * {@link RunSnapshot}, which is what the differ compares. The watcher and the
 * stop signal are injectable so the loop is testable without touching the file
 * system or the process.
 */
import { watch } from "node:fs";
import { diffRuns, formatDiff, type RunSnapshot } from "./diff.js";

/** Minimal shape of `fs.watch`, narrowed to what the loop uses. */
export type FileWatcher = (
  path: string,
  onChange: () => void
) => { close: () => void };

export interface WatchLoopInit<T> {
  /** The file whose saves trigger a re-run. */
  file: string;
  /** The run already performed, so the first diff has something to compare to. */
  first: T;
  run: () => Promise<T>;
  snapshot: (result: T) => RunSnapshot;
  /** Label for the status transition line, e.g. `server` or `stage`. */
  statusLabel?: string;
  log: (line: string) => void;
  /** Resolves to stop watching. Defaults to the first SIGINT. */
  stop?: Promise<void>;
  debounceMs?: number;
  watchFile?: FileWatcher;
}

const defaultWatcher: FileWatcher = (path, onChange) => watch(path, onChange);

function sigintStop(log: (line: string) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      log("\nStopped watching.");
      resolve();
    });
  });
}

/** Watch `file`, re-running and diffing until the stop signal resolves. */
export async function runWatchLoop<T>(init: WatchLoopInit<T>): Promise<void> {
  const log = init.log;
  log(`\nWatching ${init.file} — edit to re-run, Ctrl-C to stop.`);

  let previous = init.snapshot(init.first);
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const rerun = async (): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const next = init.snapshot(await init.run());
      const diff = diffRuns(previous, next);
      previous = next;
      log(`\n── re-run @ ${new Date().toLocaleTimeString()} ──`);
      log(formatDiff(diff, init.statusLabel));
    } catch (e) {
      log(`Re-run failed: ${String(e)}`);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        await rerun();
      }
    }
  };

  const debounceMs = init.debounceMs ?? 200;
  const watcher = (init.watchFile ?? defaultWatcher)(init.file, () => {
    // Debounce editor write bursts (one save → several change events).
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void rerun(), debounceMs);
  });

  await (init.stop ?? sigintStop(log));
  if (timer) clearTimeout(timer);
  watcher.close();
}
