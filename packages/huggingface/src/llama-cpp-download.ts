/**
 * Download utilities for llama.cpp models.
 *
 * Downloads GGUF files from HuggingFace to the llama.cpp native cache
 * directory using llama.cpp's flat file naming convention:
 *  - `{org}_{repo}_{filename}.gguf`
 *  - `{org}_{repo}_{filename}.gguf.etag`
 *  - `manifest={org}={repo}={tag}.json`
 *
 * Cache directory (llama.cpp's own rules, see `getLlamaCppCacheDir` in
 * `@nodetool-ai/config`):
 *  - `$LLAMA_CACHE` when set
 *  - macOS:   `~/Library/Caches/llama.cpp/`
 *  - Linux:   `$XDG_CACHE_HOME/llama.cpp/` (fallback `~/.cache/llama.cpp/`)
 *  - Windows: `%LOCALAPPDATA%/llama.cpp/`
 *
 * Uses native `fetch()` for all HTTP and `node:fs/promises` for file I/O.
 *
 * Port of nodetool-core's `llama_cpp_download.py`.
 */

import * as fsp from "node:fs/promises";
import * as path from "node:path";

import { getLlamaCppCacheDir as getConfigLlamaCppCacheDir } from "@nodetool-ai/config";

// ---------------------------------------------------------------------------
// Cache directory helpers
// ---------------------------------------------------------------------------

/**
 * Return the llama.cpp cache directory. Delegates to `getLlamaCppCacheDir`
 * in `@nodetool-ai/config`, which honours `LLAMA_CACHE` and `XDG_CACHE_HOME`
 * the way llama.cpp does.
 */
export function getLlamaCppCacheDir(): string {
  return getConfigLlamaCppCacheDir();
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
  // The cache is flat: a file in a repo subdirectory (a sharded
  // `Q4_K_M/model-00001-of-00002.gguf`) is flattened too, so it neither needs
  // a missing subdirectory nor hides from a top-level scan.
  const flatFile = filename.replace(/^\/+/, "").replaceAll("/", "_");
  return `${repoId.replaceAll("/", "_")}_${flatFile}`;
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

interface DownloadLlamaCppModelOptions {
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

  // Download the file. The temp name is unique per call so two concurrent
  // downloads of the same file never write into one another.
  const tempPath = `${outputPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;

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
  let completed = false;
  const fd = await fsp.open(tempPath, "w");
  const writable = fd.createWriteStream();

  try {
    const reader = resp.body.getReader();
    for (;;) {
      if (cancelSignal?.aborted) {
        reader.cancel().catch(() => undefined);
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
    completed = true;
  } finally {
    await new Promise<void>((resolve) => writable.end(resolve));
    await fd.close().catch(() => undefined);
    // Any failure, including an abort that rejects a pending read, must not
    // leave a multi-GB partial file behind.
    if (!completed) {
      await fsp.unlink(tempPath).catch(() => undefined);
    }
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
