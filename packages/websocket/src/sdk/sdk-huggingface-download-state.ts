import type {
  DownloadManager,
  DownloadStateSnapshot
} from "@nodetool-ai/huggingface";

type ModelDownloadStatus = "downloading" | "not_downloading" | "unknown";

interface CreateNodeToolSdkV1HuggingFaceDownloadStateOptions {
  /** Explicit provider ids backed by this Hugging Face cache. */
  providerIds: readonly string[];
  getDownloadManager: (userId: string) => Pick<
    DownloadManager,
    "getRepositoryDownloadState"
  > | null;
}

function isActive(snapshot: DownloadStateSnapshot): boolean {
  return (
    snapshot.status === "idle" ||
    snapshot.status === "start" ||
    snapshot.status === "progress"
  );
}

/**
 * Maps an existing Hugging Face download manager to the generic SDK model
 * status callback. Provider ownership is explicit; no provider-name guessing
 * or download operation occurs.
 */
export function createNodeToolSdkV1HuggingFaceDownloadStateReader(
  options: CreateNodeToolSdkV1HuggingFaceDownloadStateOptions
): (
  userId: string,
  providerId: string,
  modelId: string
) => ModelDownloadStatus {
  const providerIds = new Set(options.providerIds);
  return (userId, providerId, modelId) => {
    if (!providerIds.has(providerId)) return "unknown";
    const manager = options.getDownloadManager(userId);
    if (!manager) return "not_downloading";
    const snapshot = manager.getRepositoryDownloadState(modelId);
    return snapshot && isActive(snapshot)
      ? "downloading"
      : "not_downloading";
  };
}
