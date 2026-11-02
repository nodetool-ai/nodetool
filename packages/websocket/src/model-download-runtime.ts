import { importPack } from "@nodetool-ai/node-catalog";
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
  const tjs = await importPack<typeof import("@nodetool-ai/transformers-js-nodes")>("transformers-js");
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

/** The model type prefix that routes a download to Wan2GP's own downloader. */
export const WAN2GP_DOWNLOAD_PREFIX = "wangp.";

/**
 * Download a Wan2GP model's files into the installed Wan2GP with its own
 * downloader, in the shape of the other download paths. Wan2GP does not
 * announce a total, so progress carries the bytes written and the files in
 * flight, with the write rate.
 */
export async function runWan2GPModelDownload(
  repoId: string,
  modelType: string,
  signal: AbortSignal,
  onProgress: ModelDownloadProgress
): Promise<void> {
  const { downloadWan2GPModel, findInstalledWan2GP } = await import("@nodetool-ai/runtime");
  const started = Date.now();
  const emit = (
    status: ModelDownloadUpdate["status"],
    extra: Partial<ModelDownloadUpdate> = {}
  ): void => {
    onProgress({
      status,
      repo_id: repoId,
      path: null,
      model_type: modelType,
      downloaded_bytes: 0,
      total_bytes: 0,
      downloaded_files: 0,
      current_files: [],
      total_files: 0,
      ...extra
    });
  };
  const model = modelType.slice(WAN2GP_DOWNLOAD_PREFIX.length);
  const install = await findInstalledWan2GP();
  if (!install) {
    emit("error", { error: "Wan2GP is not installed. Install it in the Package Manager first." });
    return;
  }
  emit("start", { message: `Preparing Wan2GP model ${model}` });
  let downloaded = 0;
  try {
    const status = await downloadWan2GPModel(install, model, {
      signal,
      onProgress: (progress) => {
        downloaded = progress.downloadedBytes;
        const elapsed = (Date.now() - started) / 1000;
        emit("progress", {
          downloaded_bytes: progress.downloadedBytes,
          current_files: progress.currentFiles,
          elapsed_seconds: elapsed,
          bytes_per_second: elapsed > 0 ? progress.downloadedBytes / elapsed : 0
        });
      }
    });
    if (status === "available") {
      emit("completed", { downloaded_bytes: downloaded, message: `Wan2GP model ${model} is ready` });
    } else {
      emit("error", {
        downloaded_bytes: downloaded,
        error: `Wan2GP still reports the files of ${model} as ${status} after the download.`
      });
    }
  } catch (error) {
    if (signal.aborted) {
      emit("cancelled", { downloaded_bytes: downloaded });
    } else {
      emit("error", { downloaded_bytes: downloaded, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
