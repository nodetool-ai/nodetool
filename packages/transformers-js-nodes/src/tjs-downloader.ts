/**
 * Download a Transformers.js model into the TJS flat cache layout.
 *
 * Transformers.js itself decides which files (and which quantization variant)
 * a given task needs. We piggy-back on its loader: loading the model once
 * writes every required file to `env.cacheDir` in the flat
 * `{cacheDir}/{org}/{repo}/...` layout, after which subsequent inference runs
 * can load the model offline. Kokoro repos load through kokoro-js and
 * MusicGen repos through their own loader, as a run loads them.
 *
 * Progress is the loader's `progress_callback` events for this repo.
 */

import { getPipeline } from "./transformers-base.js";
import { getKokoro, isKokoroRepo } from "./tts-shared.js";
import { getMusicgen, isMusicgenRepo } from "./music-shared.js";
import { getJanus, isJanusRepo } from "./janus-shared.js";
import { watchModelLoadEvents } from "./model-load-progress.js";

/** Map a `tjs.<task>` model type to the Transformers.js pipeline task name. */
export function tjsTypeToPipelineTask(modelType: string): string | null {
  if (!modelType.startsWith("tjs.")) return null;
  const rest = modelType.slice(4);
  if (!rest) return null;
  // Transformers.js has no ranking pipeline. A cross-encoder loads the same
  // files as a text classifier.
  if (rest === "text_ranking") return "text-classification";
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
  const unwatch = onProgress
    ? watchModelLoadEvents(repoId, (info) => {
        onProgress({
          status: typeof info.status === "string" ? info.status : "progress",
          file: typeof info.file === "string" ? info.file : undefined,
          loaded: typeof info.loaded === "number" ? info.loaded : undefined,
          total: typeof info.total === "number" ? info.total : undefined,
          progress: typeof info.progress === "number" ? info.progress : undefined
        });
      })
    : null;

  // The download goes through the same model cache as a run, under the key a
  // run with default options uses. A run already loading the model is joined
  // instead of fetching the same files a second time, and a model already in
  // memory is on disk, so the download resolves at once.
  const loadPromise = isKokoroRepo(repoId)
    ? getKokoro(repoId, opts.dtype, undefined)
    : isMusicgenRepo(repoId) || opts.modelType === "tjs.text_to_music"
      ? getMusicgen(repoId, opts.dtype, undefined)
      : isJanusRepo(repoId) || opts.modelType === "tjs.text_to_image"
        ? getJanus(repoId, opts.dtype, undefined)
        : getPipeline<object>({ task, model: repoId, dtype: opts.dtype });

  // Cooperate with cancellation: stop waiting. The shared load runs on, since
  // a run may be waiting on it too.
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

  try {
    if (abortPromise) {
      await Promise.race([loadPromise, abortPromise]);
    } else {
      await loadPromise;
    }
  } finally {
    unwatch?.();
  }
}

// Re-export to make `getPipeline` reachable for downstream code that might
// want to "warm" the cache by invoking it directly.
export { getPipeline };
