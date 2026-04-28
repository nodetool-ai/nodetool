/**
 * HuggingFace file info fetcher.
 *
 * Wraps `fileDownloadInfo` from `@huggingface/hub` to resolve file size for
 * a list of `repo_id`/`path` pairs without downloading the content.
 */

import { fileDownloadInfo } from "@huggingface/hub";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HFFileInfo {
  size: number;
  repo_id: string;
  path: string;
}

export interface HFFileRequest {
  repo_id: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Fetch file metadata for a list of `repo_id`/`path` pairs.
 *
 * @param requests  The files to query.
 * @param token     Optional HuggingFace bearer token for gated repos.
 * @returns         Metadata for each requested file, including its size in bytes.
 */
export async function getHuggingfaceFileInfos(
  requests: HFFileRequest[],
  token?: string
): Promise<HFFileInfo[]> {
  return Promise.all(
    requests.map(async (req) => {
      const info = await fileDownloadInfo({
        repo: { name: req.repo_id, type: "model" },
        path: req.path.replace(/^\/+/, ""),
        ...(token ? { accessToken: token } : {})
      });

      if (!info) {
        throw new Error(
          `Failed to fetch file info for ${req.repo_id}/${req.path}: not found`
        );
      }

      return {
        size: info.size,
        repo_id: req.repo_id,
        path: req.path
      } satisfies HFFileInfo;
    })
  );
}
