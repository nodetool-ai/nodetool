import type { ModelDownloadUpdate } from "@nodetool-ai/runtime";

export type ModelDownloadProgress = (update: ModelDownloadUpdate) => void;

/**
 * Run the existing Transformers.js model download and normalize its per-file
 * progress to the same shape as the Hugging Face and worker download paths.
 * Transport adapters own the AbortController and decide how updates are sent.
 */
export async function runTransformersJsModelDownload(
  repoId: string,
  modelType: string,
  signal: AbortSignal,
  onProgress: ModelDownloadProgress
): Promise<void> {
  const tjs = await import("@nodetool-ai/transformers-js-nodes");
  const fileTotals = new Map<string, { loaded: number; total: number }>();
  const completedFiles = new Set<string>();

  const emit = (status: ModelDownloadUpdate["status"], error?: string) => {
    let downloadedBytes = 0;
    let totalBytes = 0;
    for (const value of fileTotals.values()) {
      downloadedBytes += value.loaded;
      totalBytes += value.total;
    }
    const update: Parameters<typeof onProgress>[0] = {
      status,
      repo_id: repoId,
      path: null,
      model_type: modelType,
      downloaded_bytes: downloadedBytes,
      total_bytes: totalBytes,
      downloaded_files: completedFiles.size,
      current_files: Array.from(fileTotals.keys()).filter(
        (file) => !completedFiles.has(file)
      ),
      total_files: fileTotals.size
    };
    if (error) {
      update.error = error;
    }
    onProgress(update);
  };

  emit("start");
  try {
    await tjs.downloadTransformersJsModel(repoId, {
      modelType,
      signal,
      onProgress: (info) => {
        if (!info.file) return;
        if (info.status === "initiate" || info.status === "download") {
          if (!fileTotals.has(info.file)) {
            fileTotals.set(info.file, {
              loaded: 0,
              total: info.total ?? 0
            });
          }
        } else if (info.status === "progress") {
          const entry = fileTotals.get(info.file) ?? { loaded: 0, total: 0 };
          entry.loaded = info.loaded ?? entry.loaded;
          entry.total = info.total ?? entry.total;
          fileTotals.set(info.file, entry);
        } else if (info.status === "done") {
          const entry = fileTotals.get(info.file) ?? { loaded: 0, total: 0 };
          if (entry.total > 0 && entry.loaded < entry.total) {
            entry.loaded = entry.total;
          }
          fileTotals.set(info.file, entry);
          completedFiles.add(info.file);
        }
        emit("progress");
      }
    });
    emit("completed");
  } catch (error) {
    if (signal.aborted) {
      emit("cancelled");
    } else {
      emit("error", error instanceof Error ? error.message : String(error));
    }
  }
}
