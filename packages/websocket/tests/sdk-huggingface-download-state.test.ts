import { describe, expect, it, vi } from "vitest";
import type { DownloadStateSnapshot } from "@nodetool-ai/huggingface";
import { createNodeToolSdkV1HuggingFaceDownloadStateReader } from "../src/sdk/sdk-huggingface-download-state.js";

function snapshot(
  status: DownloadStateSnapshot["status"]
): DownloadStateSnapshot {
  return {
    repoId: "org/model",
    path: null,
    modelType: "image_model",
    downloadedBytes: 1,
    totalBytes: 2,
    status,
    downloadedFiles: [],
    currentFiles: [],
    totalFiles: 1,
    errorMessage: null
  };
}

describe("NodeTool SDK v1 Hugging Face download-state reader", () => {
  it("reads active state only for explicitly-owned providers", () => {
    const getRepositoryDownloadState = vi.fn(() => snapshot("progress"));
    const getDownloadManager = vi.fn(() => ({ getRepositoryDownloadState }));
    const read = createNodeToolSdkV1HuggingFaceDownloadStateReader({
      providerIds: ["huggingface"],
      getDownloadManager
    });

    expect(read("alice", "huggingface", "org/model")).toBe("downloading");
    expect(getDownloadManager).toHaveBeenCalledExactlyOnceWith("alice");
    expect(getRepositoryDownloadState).toHaveBeenCalledExactlyOnceWith(
      "org/model"
    );

    expect(read("alice", "openai", "org/model")).toBe("unknown");
    expect(getDownloadManager).toHaveBeenCalledOnce();
  });

  it("does not treat completed or untracked downloads as active", () => {
    const completed = createNodeToolSdkV1HuggingFaceDownloadStateReader({
      providerIds: ["huggingface"],
      getDownloadManager: () => ({
        getRepositoryDownloadState: () => snapshot("completed")
      })
    });
    const untracked = createNodeToolSdkV1HuggingFaceDownloadStateReader({
      providerIds: ["huggingface"],
      getDownloadManager: () => ({ getRepositoryDownloadState: () => null })
    });
    const noManager = createNodeToolSdkV1HuggingFaceDownloadStateReader({
      providerIds: ["huggingface"],
      getDownloadManager: () => null
    });

    expect(completed("alice", "huggingface", "org/model")).toBe(
      "not_downloading"
    );
    expect(untracked("alice", "huggingface", "org/model")).toBe(
      "not_downloading"
    );
    expect(noManager("alice", "huggingface", "org/model")).toBe(
      "not_downloading"
    );
  });
});
