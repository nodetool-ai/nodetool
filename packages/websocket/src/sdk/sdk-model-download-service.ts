import { createHash } from "node:crypto";
import {
  sdkV1ModelDownloadSnapshot,
  sdkV1ModelDownloadState,
  type SdkV1ModelDownloadQuery,
  type SdkV1ModelDownloadSnapshot,
  type SdkV1ModelDownloadStartRequest,
  type SdkV1ModelDownloadState
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import {
  getDownloadManager,
  getExistingDownloadManager,
  type DownloadStateSnapshot,
  type DownloadUpdate
} from "@nodetool-ai/huggingface";
import { runTransformersJsModelDownload } from "../model-download-runtime.js";

const ACTIVE_STATUSES = new Set(["start", "progress"]);
const MAX_RETAINED_DOWNLOADS = 200;

type DownloadRun = {
  generation: symbol;
  abortController: AbortController;
  state: SdkV1ModelDownloadState;
};

export interface SdkV1ModelDownloadService {
  start(args: {
    userId: string;
    request: SdkV1ModelDownloadStartRequest;
  }): SdkV1ModelDownloadState;
  list(args: {
    userId: string;
    query: SdkV1ModelDownloadQuery;
  }): SdkV1ModelDownloadSnapshot;
  cancel(args: {
    userId: string;
    operationId: string;
  }): SdkV1ModelDownloadState;
}

export interface CreateSdkV1ModelDownloadServiceOptions {
  now?: () => Date;
  startHuggingFaceDownload?: (
    userId: string,
    request: SdkV1ModelDownloadStartRequest,
    onProgress: (update: DownloadUpdate) => void
  ) => Promise<void>;
  cancelHuggingFaceDownload?: (
    userId: string,
    request: SdkV1ModelDownloadStartRequest
  ) => void;
  listHuggingFaceDownloads?: (
    userId: string
  ) => readonly DownloadStateSnapshot[];
  startTransformersJsDownload?: (
    request: SdkV1ModelDownloadStartRequest,
    signal: AbortSignal,
    onProgress: (update: DownloadUpdate) => void
  ) => Promise<void>;
  startWorkerDownload?: (
    request: SdkV1ModelDownloadStartRequest,
    operationId: string,
    onProgress: (update: DownloadUpdate) => void
  ) => Promise<void>;
  cancelWorkerDownload?: (operationId: string) => void;
}

function operationId(request: SdkV1ModelDownloadStartRequest): string {
  return `mdl_${createHash("sha256")
    .update(
      `${request.scope}\0${request.repo_id}\0${request.path ?? ""}\0${request.model_type}`
    )
    .digest("base64url")}`;
}

function managerId(request: SdkV1ModelDownloadStartRequest): string {
  return request.path ? `${request.repo_id}/${request.path}` : request.repo_id;
}

function copyState(state: SdkV1ModelDownloadState): SdkV1ModelDownloadState {
  return sdkV1ModelDownloadState.parse({
    ...state,
    current_files: [...state.current_files]
  });
}

function isActive(state: SdkV1ModelDownloadState): boolean {
  return ACTIVE_STATUSES.has(state.status);
}

function matchesSnapshot(
  state: SdkV1ModelDownloadState,
  snapshot: DownloadStateSnapshot
): boolean {
  const status = snapshot.status === "idle" ? "progress" : snapshot.status;
  return (
    state.status === status &&
    state.downloaded_bytes ===
      Math.max(0, Math.trunc(snapshot.downloadedBytes)) &&
    state.total_bytes === Math.max(0, Math.trunc(snapshot.totalBytes)) &&
    state.downloaded_files === snapshot.downloadedFiles.length &&
    state.total_files === Math.max(0, Math.trunc(snapshot.totalFiles)) &&
    state.error === snapshot.errorMessage &&
    state.current_files.length === snapshot.currentFiles.length &&
    state.current_files.every(
      (file, index) => file === snapshot.currentFiles[index]
    )
  );
}

/**
 * Additive SDK lifecycle adapter over NodeTool's existing local model
 * downloaders. It retains only operation metadata needed for reconnectable
 * snapshots; bytes, cache layout, credentials, and cancellation remain owned
 * by the existing Hugging Face and Transformers.js implementations.
 */
export function createSdkV1ModelDownloadService(
  options: CreateSdkV1ModelDownloadServiceOptions = {}
): SdkV1ModelDownloadService {
  if (
    Boolean(options.startWorkerDownload) !==
    Boolean(options.cancelWorkerDownload)
  ) {
    throw new TypeError(
      "Worker model download start and cancellation must be configured together."
    );
  }
  const now = options.now ?? (() => new Date());
  const byUser = new Map<string, Map<string, DownloadRun>>();
  const startHuggingFaceDownload =
    options.startHuggingFaceDownload ??
    ((userId, request, onProgress) =>
      getDownloadManager(userId).startDownload(request.repo_id, {
        path: request.path ?? null,
        allowPatterns: request.path
          ? [request.path]
          : (request.allow_patterns ?? null),
        ignorePatterns: request.path ? [] : (request.ignore_patterns ?? null),
        modelType: request.model_type,
        onProgress
      }));
  const cancelHuggingFaceDownload =
    options.cancelHuggingFaceDownload ??
    ((userId, request) =>
      getDownloadManager(userId).cancelDownload(managerId(request)));
  const startTransformersJsDownload =
    options.startTransformersJsDownload ??
    ((request, signal, onProgress) =>
      runTransformersJsModelDownload(
        request.repo_id,
        request.model_type,
        signal,
        onProgress
      ));
  const listHuggingFaceDownloads =
    options.listHuggingFaceDownloads ??
    ((userId) =>
      getExistingDownloadManager(userId)?.listDownloadStates(
        MAX_RETAINED_DOWNLOADS
      ) ?? []);
  const startWorkerDownload = options.startWorkerDownload;
  const cancelWorkerDownload = options.cancelWorkerDownload;

  const runsFor = (userId: string): Map<string, DownloadRun> => {
    let runs = byUser.get(userId);
    if (!runs) {
      runs = new Map();
      byUser.set(userId, runs);
    }
    return runs;
  };

  const trim = (runs: Map<string, DownloadRun>): void => {
    if (runs.size <= MAX_RETAINED_DOWNLOADS) return;
    const terminal = [...runs.entries()]
      .filter(([, run]) => !isActive(run.state))
      .sort((left, right) =>
        left[1].state.updated_at.localeCompare(right[1].state.updated_at)
      );
    for (const [id] of terminal) {
      if (runs.size <= MAX_RETAINED_DOWNLOADS) break;
      runs.delete(id);
    }
  };

  const service: SdkV1ModelDownloadService = {
    start: ({ userId, request }) => {
      if (request.scope === "worker" && !startWorkerDownload) {
        throw new SdkModelDownloadServiceError(
          501,
          "MODEL_SCOPE_UNAVAILABLE",
          "Worker model downloads are not available through this server."
        );
      }
      if (request.model_type === "llama_model") {
        throw new SdkModelDownloadServiceError(
          501,
          "MODEL_DOWNLOAD_UNAVAILABLE",
          "Ollama model downloads are not available through this server."
        );
      }

      const runs = runsFor(userId);
      const id = operationId(request);
      const existing = runs.get(id);
      if (existing && isActive(existing.state)) {
        return copyState(existing.state);
      }

      const timestamp = now().toISOString();
      const generation = Symbol(id);
      const run: DownloadRun = {
        generation,
        abortController: new AbortController(),
        state: sdkV1ModelDownloadState.parse({
          version: "1",
          operation_id: id,
          scope: request.scope,
          repo_id: request.repo_id,
          path: request.path ?? null,
          model_type: request.model_type,
          status: "start",
          downloaded_bytes: 0,
          total_bytes: 0,
          downloaded_files: 0,
          current_files: [],
          total_files: 0,
          error: null,
          started_at: timestamp,
          updated_at: timestamp
        })
      };
      runs.set(id, run);
      trim(runs);

      const update = (progress: DownloadUpdate): void => {
        if (runs.get(id)?.generation !== generation) return;
        run.state = sdkV1ModelDownloadState.parse({
          ...run.state,
          status: progress.status === "idle" ? "progress" : progress.status,
          downloaded_bytes: Math.max(0, Math.trunc(progress.downloaded_bytes)),
          total_bytes: Math.max(0, Math.trunc(progress.total_bytes)),
          downloaded_files: Math.max(0, Math.trunc(progress.downloaded_files)),
          current_files: [...progress.current_files],
          total_files: Math.max(0, Math.trunc(progress.total_files)),
          error: progress.error ?? null,
          updated_at: now().toISOString()
        });
      };

      const execute = async (): Promise<void> => {
        try {
          if (request.scope === "worker") {
            await startWorkerDownload!(request, id, update);
          } else if (request.model_type.startsWith("tjs.")) {
            await startTransformersJsDownload(
              request,
              run.abortController.signal,
              update
            );
          } else {
            await startHuggingFaceDownload(userId, request, update);
          }
        } catch (error) {
          const failure: Parameters<typeof update>[0] = {
            status: run.abortController.signal.aborted ? "cancelled" : "error",
            repo_id: request.repo_id,
            path: request.path ?? null,
            model_type: request.model_type,
            downloaded_bytes: run.state.downloaded_bytes,
            total_bytes: run.state.total_bytes,
            downloaded_files: run.state.downloaded_files,
            current_files: run.state.current_files,
            total_files: run.state.total_files
          };
          if (!run.abortController.signal.aborted) {
            failure.error =
              error instanceof Error ? error.message : String(error);
          }
          update(failure);
        }
      };
      void execute();
      return copyState(run.state);
    },

    list: ({ userId, query }) => {
      if (query.scope === "worker" && !startWorkerDownload) {
        throw new SdkModelDownloadServiceError(
          501,
          "MODEL_SCOPE_UNAVAILABLE",
          "Worker model downloads are not available through this server."
        );
      }
      const runs = runsFor(userId);
      for (const snapshot of query.scope === "local"
        ? listHuggingFaceDownloads(userId)
        : []) {
        if (!snapshot.modelType) continue;
        const request: SdkV1ModelDownloadStartRequest = {
          repo_id: snapshot.repoId,
          path: snapshot.path,
          model_type: snapshot.modelType,
          scope: "local"
        };
        const id = operationId(request);
        const existing = runs.get(id);
        const timestamp = now().toISOString();
        const startedAt = existing?.state.started_at ?? timestamp;
        const updatedAt =
          existing && matchesSnapshot(existing.state, snapshot)
            ? existing.state.updated_at
            : timestamp;
        runs.set(id, {
          generation: existing?.generation ?? Symbol(id),
          abortController: existing?.abortController ?? new AbortController(),
          state: sdkV1ModelDownloadState.parse({
            version: "1",
            operation_id: id,
            scope: "local",
            repo_id: snapshot.repoId,
            path: snapshot.path,
            model_type: snapshot.modelType,
            status: snapshot.status === "idle" ? "progress" : snapshot.status,
            downloaded_bytes: Math.max(0, Math.trunc(snapshot.downloadedBytes)),
            total_bytes: Math.max(0, Math.trunc(snapshot.totalBytes)),
            downloaded_files: snapshot.downloadedFiles.length,
            current_files: [...snapshot.currentFiles],
            total_files: Math.max(0, Math.trunc(snapshot.totalFiles)),
            error: snapshot.errorMessage,
            started_at: startedAt,
            updated_at: updatedAt
          })
        });
      }
      trim(runs);
      const downloads = [...(byUser.get(userId)?.values() ?? [])]
        .map((run) => copyState(run.state))
        .filter(
          (state) =>
            state.scope === query.scope &&
            (!query.operation_id || state.operation_id === query.operation_id)
        )
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
      return sdkV1ModelDownloadSnapshot.parse({
        version: "1",
        downloads
      });
    },

    cancel: ({ userId, operationId: id }) => {
      const run = byUser.get(userId)?.get(id);
      if (!run) {
        throw new SdkModelDownloadServiceError(
          404,
          "MODEL_DOWNLOAD_NOT_FOUND",
          "Model download operation was not found."
        );
      }
      if (!isActive(run.state)) return copyState(run.state);

      run.abortController.abort();
      if (run.state.scope === "worker") {
        if (!cancelWorkerDownload) {
          throw new SdkModelDownloadServiceError(
            501,
            "MODEL_SCOPE_UNAVAILABLE",
            "Worker model cancellation is not available through this server."
          );
        }
        cancelWorkerDownload(id);
      } else if (!run.state.model_type.startsWith("tjs.")) {
        cancelHuggingFaceDownload(userId, {
          repo_id: run.state.repo_id,
          path: run.state.path,
          model_type: run.state.model_type,
          scope: run.state.scope
        });
      }
      run.state = sdkV1ModelDownloadState.parse({
        ...run.state,
        status: "cancelled",
        error: null,
        updated_at: now().toISOString()
      });
      return copyState(run.state);
    }
  };

  return service;
}

export class SdkModelDownloadServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "SdkModelDownloadServiceError";
  }
}
