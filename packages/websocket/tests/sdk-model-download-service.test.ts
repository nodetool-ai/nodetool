import { describe, expect, it, vi } from "vitest";
import type { DownloadUpdate } from "@nodetool-ai/huggingface";
import type { SdkV1ModelDownloadStartRequest } from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import {
  SdkModelDownloadServiceError,
  createSdkV1ModelDownloadService
} from "../src/sdk/sdk-model-download-service.js";

const request: SdkV1ModelDownloadStartRequest = {
  repo_id: "org/model",
  path: null,
  model_type: "hf.text_generation",
  scope: "local"
};

function progress(
  status: DownloadUpdate["status"],
  downloadedBytes = 0
): DownloadUpdate {
  return {
    status,
    repo_id: request.repo_id,
    path: request.path ?? null,
    model_type: request.model_type,
    downloaded_bytes: downloadedBytes,
    total_bytes: 100,
    downloaded_files: status === "completed" ? 1 : 0,
    current_files: status === "completed" ? [] : ["model.bin"],
    total_files: 1
  };
}

describe("SDK model download service", () => {
  it("starts once, records progress, and isolates snapshots by user", async () => {
    let emit: ((update: DownloadUpdate) => void) | undefined;
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const start = vi.fn(
      async (
        _userId: string,
        _request: SdkV1ModelDownloadStartRequest,
        onProgress: (update: DownloadUpdate) => void
      ) => {
        emit = onProgress;
        await pending;
      }
    );
    const service = createSdkV1ModelDownloadService({
      startHuggingFaceDownload: start
    });

    const started = service.start({ userId: "alice", request });
    const duplicate = service.start({ userId: "alice", request });
    emit?.(progress("progress", 40));

    expect(start).toHaveBeenCalledOnce();
    expect(duplicate.operation_id).toBe(started.operation_id);
    expect(
      service.list({ userId: "alice", query: { scope: "local" } }).downloads[0]
    ).toMatchObject({ status: "progress", downloaded_bytes: 40 });
    expect(
      service.list({ userId: "bob", query: { scope: "local" } }).downloads
    ).toEqual([]);
    finish?.();
  });

  it("cancels through the existing manager and supports retry after failure", async () => {
    let emit: ((update: DownloadUpdate) => void) | undefined;
    const start = vi.fn(
      async (
        _userId: string,
        _request: SdkV1ModelDownloadStartRequest,
        onProgress: (update: DownloadUpdate) => void
      ) => {
        emit = onProgress;
      }
    );
    const cancel = vi.fn();
    const service = createSdkV1ModelDownloadService({
      startHuggingFaceDownload: start,
      cancelHuggingFaceDownload: cancel
    });

    const first = service.start({ userId: "alice", request });
    const cancelled = service.cancel({
      userId: "alice",
      operationId: first.operation_id
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancel).toHaveBeenCalledExactlyOnceWith("alice", request);

    const retried = service.start({ userId: "alice", request });
    emit?.({ ...progress("error"), error: "network" });
    expect(retried.operation_id).toBe(first.operation_id);
    expect(start).toHaveBeenCalledTimes(2);
    expect(
      service.list({
        userId: "alice",
        query: { scope: "local", operation_id: first.operation_id }
      }).downloads[0]
    ).toMatchObject({ status: "error", error: "network" });
  });

  it("uses the shared Transformers.js runner", () => {
    const startTjs = vi.fn(async () => undefined);
    const service = createSdkV1ModelDownloadService({
      startTransformersJsDownload: startTjs
    });

    service.start({
      userId: "alice",
      request: { ...request, model_type: "tjs.text_generation" }
    });

    expect(startTjs).toHaveBeenCalledOnce();
  });

  it("keeps operation identity distinct across compatible model types", () => {
    const service = createSdkV1ModelDownloadService({
      startHuggingFaceDownload: vi.fn(async () => undefined)
    });

    const text = service.start({ userId: "alice", request });
    const embeddings = service.start({
      userId: "alice",
      request: { ...request, model_type: "hf.embeddings" }
    });

    expect(embeddings.operation_id).not.toBe(text.operation_id);
    expect(
      service.list({ userId: "alice", query: { scope: "local" } }).downloads
    ).toHaveLength(2);
  });

  it("projects downloads started through the existing web manager", () => {
    const service = createSdkV1ModelDownloadService({
      listHuggingFaceDownloads: () => [
        {
          repoId: "org/web-model",
          path: "model.bin",
          modelType: "llama_cpp_model",
          downloadedBytes: 50,
          totalBytes: 100,
          status: "progress",
          downloadedFiles: [],
          currentFiles: ["model.bin"],
          totalFiles: 1,
          errorMessage: null
        }
      ]
    });

    const snapshot = service.list({
      userId: "alice",
      query: { scope: "local" }
    });

    expect(snapshot.downloads[0]).toMatchObject({
      repo_id: "org/web-model",
      path: "model.bin",
      status: "progress",
      downloaded_bytes: 50
    });
  });

  it("reports unsupported worker and Ollama downloads explicitly", () => {
    const service = createSdkV1ModelDownloadService();

    expect(() =>
      service.start({
        userId: "alice",
        request: { ...request, scope: "worker" }
      })
    ).toThrowError(SdkModelDownloadServiceError);
    expect(() =>
      service.start({
        userId: "alice",
        request: { ...request, model_type: "llama_model" }
      })
    ).toThrowError("Ollama model downloads are not available");
  });

  it("relays worker progress and cancellation through configured bridge adapters", () => {
    const startWorker = vi.fn(
      async (
        _userId: string,
        _request: SdkV1ModelDownloadStartRequest,
        _operationId: string,
        onProgress: (update: DownloadUpdate) => void
      ) => {
        onProgress(progress("progress", 60));
      }
    );
    const cancelWorker = vi.fn();
    const service = createSdkV1ModelDownloadService({
      startWorkerDownload: startWorker,
      cancelWorkerDownload: cancelWorker
    });

    const started = service.start({
      userId: "alice",
      request: { ...request, scope: "worker" }
    });
    const snapshot = service.list({
      userId: "alice",
      query: { scope: "worker" }
    });
    service.cancel({ userId: "alice", operationId: started.operation_id });

    expect(snapshot.downloads[0]).toMatchObject({
      scope: "worker",
      status: "progress",
      downloaded_bytes: 60
    });
    expect(cancelWorker).toHaveBeenCalledExactlyOnceWith(started.operation_id);
    // The worker download needs the user, so the relay can resolve that user's
    // HuggingFace token for a gated repo.
    expect(startWorker.mock.calls[0]![0]).toBe("alice");
  });
});
