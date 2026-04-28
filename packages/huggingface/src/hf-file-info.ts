/**
 * HuggingFace file info fetcher.
 *
 * Uses native `fetch()` with HEAD requests to resolve file metadata
 * (primarily size) from the HuggingFace CDN without downloading content.
 *
 * Port of nodetool-core's `huggingface_file.py`.
 */

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
 * For each request a HEAD request is issued to
 * `https://huggingface.co/{repo_id}/resolve/main/{path}` and the
 * `Content-Length` header is read to determine the file size.
 *
 * @param requests  The files to query.
 * @param token     Optional HuggingFace bearer token for gated repos.
 * @returns         Metadata for each requested file, including its size in bytes.
 */
export async function getHuggingfaceFileInfos(
  requests: HFFileRequest[],
  token?: string
): Promise<HFFileInfo[]> {
  const headers: Record<string, string> = {
    // Ask for identity encoding so Content-Length reflects the true size.
    "Accept-Encoding": "identity"
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const results = await Promise.all(
    requests.map(async (req) => {
      const url = `https://huggingface.co/${req.repo_id}/resolve/main/${req.path.replace(/^\/+/, "")}`;

      const resp = await fetch(url, {
        method: "HEAD",
        headers,
        redirect: "follow"
      });

      if (!resp.ok) {
        throw new Error(
          `Failed to fetch file info for ${req.repo_id}/${req.path}: ` +
            `${resp.status} ${resp.statusText}`
        );
      }

      const contentLength = resp.headers.get("content-length");
      const size = contentLength != null ? parseInt(contentLength, 10) : 0;

      return {
        size,
        repo_id: req.repo_id,
        path: req.path
      } satisfies HFFileInfo;
    })
  );

  return results;
}
