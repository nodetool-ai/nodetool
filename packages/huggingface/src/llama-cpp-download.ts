/**
 * Download utilities for llama.cpp models.
 *
 * Downloads GGUF files from HuggingFace to the llama.cpp native cache
 * directory using llama.cpp's flat file naming convention:
 *  - `{org}_{repo}_{filename}.gguf`
 *  - `{org}_{repo}_{filename}.gguf.etag`
 *  - `manifest={org}={repo}={tag}.json`
 *
 * Cache directories by platform:
 *  - macOS:   `~/Library/Caches/llama.cpp/`
 *  - Linux:   `~/.cache/llama.cpp/`
 *  - Windows: `%LOCALAPPDATA%/llama.cpp/` (fallback `~/.cache/llama.cpp/`)
 *
 * Uses native `fetch()` for all HTTP and `node:fs/promises` for file I/O.
 *
 * Port of nodetool-core's `llama_cpp_download.py`.
 */

import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Cache directory helpers
// ---------------------------------------------------------------------------

/**
 * Return the platform-specific llama.cpp cache directory.
 */
export function getLlamaCppCacheDir(): string {
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "llama.cpp");
  }
  if (platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData) {
      return path.join(localAppData, "llama.cpp");
    }
    return path.join(os.homedir(), ".cache", "llama.cpp");
  }
  // Linux and other unix
  return path.join(os.homedir(), ".cache", "llama.cpp");
}

/**
 * Compute the flat cache filename for a model.
 *
 * llama.cpp uses flat naming: `{org}_{repo}_{filename}`
 *
 * @example
 * getLlamaCppModelFilename("ggml-org/gemma-3-1b-it-GGUF", "gemma-3-1b-it-Q4_K_M.gguf")
 * // => "ggml-org_gemma-3-1b-it-GGUF_gemma-3-1b-it-Q4_K_M.gguf"
 */
export function getLlamaCppModelFilename(
  repoId: string,
  filename: string
): string {
  return `${repoId.replace("/", "_")}_${filename}`;
}

/**
 * Full path to the expected location of a model in the llama.cpp cache.
 */
export function getLlamaCppModelPath(repoId: string, filename: string): string {
  const cacheDir = getLlamaCppCacheDir();
  const flatFilename = getLlamaCppModelFilename(repoId, filename);
  return path.join(cacheDir, flatFilename);
}

/**
 * Check if a GGUF model exists in the llama.cpp cache.
 */
export async function isLlamaCppModelCached(
  repoId: string,
  filename: string
): Promise<boolean> {
  const modelPath = getLlamaCppModelPath(repoId, filename);
  try {
    await fsp.access(modelPath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Download options
// ---------------------------------------------------------------------------

export interface DownloadLlamaCppModelOptions {
  token?: string | null;
  progressCallback?: (deltaBytes: number, totalBytes: number | null) => void;
  cancelSignal?: AbortSignal;
  tag?: string;
}

// ---------------------------------------------------------------------------
// Main download function
// ---------------------------------------------------------------------------

/**
 * Download a GGUF model to the llama.cpp cache directory.
 *
 * Downloads directly to the llama.cpp native cache using their flat
 * filename convention. Also creates:
 *  - `{flatFilename}.etag` for cache validation
 *  - `manifest={org}={repo}={tag}.json` for llama.cpp compatibility
 *
 * @returns Path to the downloaded model file.
 */
export async function downloadLlamaCppModel(
  repoId: string,
  filename: string,
  opts: DownloadLlamaCppModelOptions = {}
): Promise<string> {
  const { token = null, progressCallback, cancelSignal, tag = "latest" } = opts;

  const cacheDir = getLlamaCppCacheDir();
  await fsp.mkdir(cacheDir, { recursive: true });

  const flatFilename = getLlamaCppModelFilename(repoId, filename);
  const outputPath = path.join(cacheDir, flatFilename);
  const etagPath = path.join(cacheDir, `${flatFilename}.etag`);

  // Manifest path: manifest={org}={repo}={tag}.json
  const slashIdx = repoId.indexOf("/");
  const org = slashIdx >= 0 ? repoId.slice(0, slashIdx) : "";
  const repo = slashIdx >= 0 ? repoId.slice(slashIdx + 1) : repoId;
  const manifestPath = path.join(
    cacheDir,
    `manifest=${org}=${repo}=${tag}.json`
  );

  // Build HuggingFace URL
  const hfUrl = `https://huggingface.co/${repoId}/resolve/main/${filename.replace(/^\/+/, "")}`;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Get file metadata via HEAD
  const headResp = await fetch(hfUrl, {
    method: "HEAD",
    headers,
    redirect: "follow"
  });
  if (!headResp.ok) {
    throw new Error(
      `HEAD ${hfUrl} failed: ${headResp.status} ${headResp.statusText}`
    );
  }

  const contentLengthHeader = headResp.headers.get("content-length");
  const totalSize =
    contentLengthHeader != null ? parseInt(contentLengthHeader, 10) : null;
  const etagRaw = headResp.headers.get("etag") || "";
  const etagStripped = etagRaw.replace(/^"|"$/g, "");

  // Check if already cached with same etag
  try {
    await fsp.access(outputPath);
    const cachedEtag = (await fsp.readFile(etagPath, "utf-8"))
      .trim()
      .replace(/^"|"$/g, "");
    if (cachedEtag === etagStripped) {
      if (progressCallback && totalSize) {
        progressCallback(totalSize, totalSize);
      }
      return outputPath;
    }
  } catch {
    // Not cached or etag file missing -- proceed with download
  }

  // Download the file
  const tempPath = outputPath + ".tmp";

  const resp = await fetch(hfUrl, {
    method: "GET",
    headers,
    redirect: "follow",
    signal: cancelSignal
  });
  if (!resp.ok) {
    throw new Error(`GET ${hfUrl} failed: ${resp.status} ${resp.statusText}`);
  }
  if (!resp.body) {
    throw new Error(`No response body for ${hfUrl}`);
  }

  let downloaded = 0;
  const fd = await fsp.open(tempPath, "w");
  const writable = fd.createWriteStream();

  try {
    const reader = resp.body.getReader();
    for (;;) {
      if (cancelSignal?.aborted) {
        reader.cancel();
        try {
          await fsp.unlink(tempPath);
        } catch {
          // ignore
        }
        throw new Error("Download cancelled");
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      await new Promise<void>((resolve, reject) => {
        writable.write(value, (err) => (err ? reject(err) : resolve()));
      });

      downloaded += value.length;
      progressCallback?.(value.length, totalSize);
    }
  } finally {
    await new Promise<void>((resolve) => writable.end(resolve));
    await fd.close();
  }

  // Rename temp file to final location
  await fsp.rename(tempPath, outputPath);

  // Write etag file (keep quotes for llama-server compatibility)
  if (etagRaw) {
    await fsp.writeFile(etagPath, etagRaw, "utf-8");
  }

  // Create manifest file for llama.cpp compatibility
  const manifest = {
    name: repo,
    version: tag,
    ggufFile: {
      rfilename: filename,
      size: totalSize ?? downloaded
    },
    metadata: {
      author: org,
      repo_id: repoId
    }
  };
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return outputPath;
}
