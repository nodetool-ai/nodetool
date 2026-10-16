/**
 * Reports a Transformers.js model load on the runtime's model load bus, so a
 * first run that downloads the model says so instead of looking frozen.
 *
 * Transformers.js sends the same `download` and `progress` events when it
 * reads a file from its disk cache as when it fetches one, so the events alone
 * cannot tell the two apart. The tracker checks each file on its `download`
 * event: a file missing from the cache is being fetched, and the load reports
 * `downloading` from then on. A partly downloaded model is caught the same way.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  publishModelLoad,
  type ModelLoadPhase,
  type ModelLoadUpdate
} from "@nodetool-ai/runtime";
import { getTransformersJsCacheDir } from "./transformers-base.js";

/** One Transformers.js `progress_callback` event, as the library sends it. */
export type TjsProgressInfo = Record<string, unknown>;

export type TjsProgressCallback = (info: TjsProgressInfo) => void;

/** At most one `progress` update per load in this many milliseconds. */
const PUBLISH_INTERVAL_MS = 250;

const RUNTIME = "transformers-js";

const fileWatchers = new Map<string, Set<TjsProgressCallback>>();

/**
 * Receive the raw Transformers.js events of every load of `repoId` from now
 * on. The model manager's download uses it to keep its per-file progress while
 * joining a load a run already started. Returns the unsubscribe function.
 */
export function watchModelLoadEvents(
  repoId: string,
  listener: TjsProgressCallback
): () => void {
  let watchers = fileWatchers.get(repoId);
  if (!watchers) {
    watchers = new Set();
    fileWatchers.set(repoId, watchers);
  }
  watchers.add(listener);
  return () => {
    watchers.delete(listener);
    if (watchers.size === 0 && fileWatchers.get(repoId) === watchers) {
      fileWatchers.delete(repoId);
    }
  };
}

/**
 * Run `load` with a progress callback and publish its phase and bytes. `load`
 * must pass the callback to Transformers.js as `progress_callback`.
 */
export async function trackModelLoad<T>(
  repoId: string,
  load: (progress: TjsProgressCallback) => Promise<T>,
  now: () => number = Date.now
): Promise<T> {
  const cacheDir = getTransformersJsCacheDir();
  const files = new Map<string, { loaded: number; total: number }>();
  let phase: ModelLoadPhase = "loading";
  let lastPublished = 0;

  const publish = (next: ModelLoadPhase, error?: string): void => {
    let loaded = 0;
    let total = 0;
    for (const file of files.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    lastPublished = now();
    const update: ModelLoadUpdate = {
      repo_id: repoId,
      runtime: RUNTIME,
      phase: next,
      loaded_bytes: loaded,
      total_bytes: total
    };
    if (error !== undefined) {
      update.error = error;
    }
    publishModelLoad(update);
  };

  const onProgress: TjsProgressCallback = (info) => {
    for (const watcher of fileWatchers.get(repoId) ?? []) {
      watcher(info);
    }
    const file = typeof info.file === "string" ? info.file : null;
    if (!file) {
      return;
    }
    if (
      info.status === "download" &&
      phase === "loading" &&
      !existsSync(join(cacheDir, repoId, file))
    ) {
      phase = "downloading";
      publish(phase);
      return;
    }
    if (info.status !== "progress") {
      return;
    }
    const entry = files.get(file) ?? { loaded: 0, total: 0 };
    if (typeof info.loaded === "number") {
      entry.loaded = info.loaded;
    }
    if (typeof info.total === "number") {
      entry.total = info.total;
    }
    files.set(file, entry);
    if (now() - lastPublished >= PUBLISH_INTERVAL_MS) {
      publish(phase);
    }
  };

  publish(phase);
  try {
    const result = await load(onProgress);
    publish("ready");
    return result;
  } catch (error) {
    publish("error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
