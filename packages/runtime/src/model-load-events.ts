/**
 * Progress of local models that load inside a run: a workflow node, a provider
 * call, a voiced script line. A load that is not in the cache downloads first,
 * and the caller that started it has no channel of its own to say so. Loaders
 * publish here, and the server forwards each update to its clients.
 *
 * The bus is process-wide. It holds the latest update of every load in
 * progress, so a subscriber that arrives mid-download starts from the current
 * state instead of a blank one.
 */

/**
 * `downloading`: the model was not in the cache when the load started.
 * `loading`: the files were on disk and are being read.
 * `ready` and `error` end the load.
 */
export type ModelLoadPhase = "downloading" | "loading" | "ready" | "error";

export interface ModelLoadUpdate {
  /** The repo being loaded, such as `onnx-community/Kokoro-82M-v1.0-ONNX`. */
  repo_id: string;
  /** The runtime that loads it, such as `transformers-js`. */
  runtime: string;
  phase: ModelLoadPhase;
  /** Bytes read so far across the files that reported a size. */
  loaded_bytes: number;
  /** Total bytes of the files that reported a size. Grows as files start. */
  total_bytes: number;
  error?: string;
}

export type ModelLoadListener = (update: ModelLoadUpdate) => void;

const listeners = new Set<ModelLoadListener>();
const active = new Map<string, ModelLoadUpdate>();

const isTerminal = (phase: ModelLoadPhase): boolean =>
  phase === "ready" || phase === "error";

/** Record an update and hand it to every subscriber. */
export function publishModelLoad(update: ModelLoadUpdate): void {
  if (isTerminal(update.phase)) {
    active.delete(update.repo_id);
  } else {
    active.set(update.repo_id, update);
  }
  for (const listener of listeners) {
    try {
      listener(update);
    } catch {
      // A failing subscriber must not stop the load or the other subscribers.
    }
  }
}

/** Receive every update from now on. Returns the unsubscribe function. */
export function subscribeModelLoads(listener: ModelLoadListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The latest update of each load still in progress. */
export function activeModelLoads(): ModelLoadUpdate[] {
  return Array.from(active.values());
}

/** Forget every load and subscriber. Intended for tests. */
export function resetModelLoadsForTesting(): void {
  listeners.clear();
  active.clear();
}
