/**
 * Download a Transformers.js model into the TJS flat cache layout.
 *
 * Transformers.js itself decides which files (and which quantization variant)
 * a given task needs. We piggy-back on its loader: instantiating the pipeline
 * once writes every required file to `env.cacheDir` in the flat
 * `{cacheDir}/{org}/{repo}/...` layout, after which subsequent inference runs
 * can load the model offline.
 *
 * Progress is forwarded via `@huggingface/transformers`'s `progress_callback`.
 */

import { getPipeline, loadTransformers } from "./transformers-base.js";

/** Map a `tjs.<task>` model type to the Transformers.js pipeline task name. */
export function tjsTypeToPipelineTask(modelType: string): string | null {
  if (!modelType.startsWith("tjs.")) return null;
  const rest = modelType.slice(4);
  if (!rest) return null;
  return rest.replace(/_/g, "-");
}

export interface TjsDownloadProgress {
  /** "initiate" | "download" | "progress" | "done" | "ready" — passed straight through from TJS. */
  status: string;
  file?: string;
  /** Cumulative bytes downloaded for `file`, when known. */
  loaded?: number;
  /** Total bytes for `file`, when known. */
  total?: number;
  /** Progress percent (0..100) for `file`, when known. */
  progress?: number;
}

export interface TjsDownloadOptions {
  /** Pipeline task hint. Required if `modelType` is not a `tjs.*` type. */
  task?: string;
  /** `tjs.<task>` model type. Used when `task` is not provided. */
  modelType?: string;
  /** Quantization preference forwarded to TJS (e.g. `"q4"`, `"fp16"`). */
  dtype?: string;
  onProgress?: (update: TjsDownloadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Materialize a Transformers.js model in the cache.
 *
 * Resolves once the underlying `pipeline()` call completes — which means every
 * file the runtime needed has been fetched and written to disk.
 */
export async function downloadTransformersJsModel(
  repoId: string,
  opts: TjsDownloadOptions = {}
): Promise<void> {
  if (!repoId) {
    throw new Error("repoId is required");
  }

  const task = opts.task ?? (opts.modelType ? tjsTypeToPipelineTask(opts.modelType) : null);
  if (!task) {
    throw new Error(
      `Cannot determine pipeline task for repoId="${repoId}" (modelType="${opts.modelType ?? ""}")`
    );
  }

  if (opts.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const onProgress = opts.onProgress;
  const wrappedProgress = onProgress
    ? (info: Record<string, unknown>) => {
        onProgress({
          status: typeof info.status === "string" ? info.status : "progress",
          file: typeof info.file === "string" ? info.file : undefined,
          loaded: typeof info.loaded === "number" ? info.loaded : undefined,
          total: typeof info.total === "number" ? info.total : undefined,
          progress: typeof info.progress === "number" ? info.progress : undefined
        });
      }
    : undefined;

  // We intentionally bypass `getPipeline`'s internal caching by instantiating
  // through the underlying transformers module directly — we want a fresh
  // load that exposes its progress_callback, even if a pipeline for the same
  // (task, model) already exists in the cache.
  const transformers = await loadTransformers();

  const pipelineOptions: Record<string, unknown> = {};
  if (opts.dtype) pipelineOptions.dtype = opts.dtype;
  if (wrappedProgress) pipelineOptions.progress_callback = wrappedProgress;

  // Cooperate with cancellation: poll the signal between awaits.
  const abortPromise = opts.signal
    ? new Promise<never>((_, reject) => {
        const onAbort = () =>
          reject(new DOMException("Aborted", "AbortError"));
        if (opts.signal!.aborted) {
          onAbort();
        } else {
          opts.signal!.addEventListener("abort", onAbort, { once: true });
        }
      })
    : null;

  const loadPromise = transformers.pipeline(task, repoId, pipelineOptions);

  if (abortPromise) {
    await Promise.race([loadPromise, abortPromise]);
  } else {
    await loadPromise;
  }
}

// Re-export to make `getPipeline` reachable for downstream code that might
// want to "warm" the cache by invoking it directly.
export { getPipeline };
