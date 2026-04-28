/**
 * Async HuggingFace file downloader with resume support.
 *
 * Downloads files from HuggingFace Hub into a cache layout compatible with
 * the official `huggingface_hub` library (blobs + snapshots with symlinks).
 *
 * Uses only native `fetch()` for HTTP and `node:fs` / `node:fs/promises` for
 * disk I/O.  No external dependencies.
 *
 * Port of nodetool-core's `async_downloader.py`.
 */

import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { resolveHfToken } from "./hf-auth.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HF_ENDPOINT = "https://huggingface.co";

const HF_HEADER_X_REPO_COMMIT = "x-repo-commit";
const HF_HEADER_X_LINKED_ETAG = "x-linked-etag";
const HF_HEADER_X_LINKED_SIZE = "x-linked-size";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HfFileMeta {
  /** Final download URL (possibly CDN). */
  url: string;
  /** Normalized ETag without quotes. */
  etag: string;
  /** File size in bytes, or `null` if unknown. */
  size: number | null;
  /** Resolved commit hash, or `null` if not provided. */
  commitHash: string | null;
  /** Whether the server supports HTTP Range requests. */
  acceptRanges: boolean;
  /** The original /resolve URL on huggingface.co. */
  originalUrl: string;
}

export interface DownloadWithResumeOptions {
  token?: string | null;
  expectedSize?: number | null;
  acceptRanges?: boolean;
  chunkSize?: number;
  maxRetries?: number;
  progressCallback?: (deltaBytes: number, totalBytes: number | null) => void;
  cancelSignal?: AbortSignal;
}

export interface AsyncHfDownloadOptions {
  revision?: string;
  repoType?: string;
  token?: string | boolean | null;
  cacheDir?: string | null;
  chunkSize?: number;
  progressCallback?: (deltaBytes: number, totalBytes: number | null) => void;
  cancelSignal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Cache root helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the HuggingFace hub cache root directory.
 *
 * Resolution order (mirrors `huggingface_hub`):
 *  1. `$HF_HUB_CACHE`
 *  2. `$HUGGINGFACE_HUB_CACHE` (deprecated)
 *  3. `$HF_HOME/hub`
 *  4. `$XDG_CACHE_HOME/huggingface/hub`
 *  5. `~/.cache/huggingface/hub`
 */
export function hfCacheRoot(): string {
  const cache =
    process.env["HF_HUB_CACHE"] || process.env["HUGGINGFACE_HUB_CACHE"];
  if (cache) {
    return cache.startsWith("~") ? cache.replace("~", os.homedir()) : cache;
  }

  const hfHome = process.env["HF_HOME"];
  if (hfHome) {
    const resolved = hfHome.startsWith("~")
      ? hfHome.replace("~", os.homedir())
      : hfHome;
    return path.join(resolved, "hub");
  }

  const xdg = process.env["XDG_CACHE_HOME"];
  if (xdg) {
    return path.join(xdg, "huggingface", "hub");
  }

  return path.join(os.homedir(), ".cache", "huggingface", "hub");
}

/**
 * Return the per-repo cache directory.
 *
 * Layout: `<cacheDir>/<repoType>s--namespace--name`
 */
export function hfRepoCacheDir(
  repoId: string,
  repoType: string = "model",
  cacheDir?: string | null
): string {
  const root = cacheDir ?? hfCacheRoot();
  const parts = [`${repoType}s`, ...repoId.split("/")];
  const folder = parts.join("--");
  return path.join(root, folder);
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

/**
 * Build a `/resolve` URL on the Hub for a given file.
 *
 * - model:   `https://huggingface.co/{repoId}/resolve/{rev}/{filename}`
 * - dataset: `https://huggingface.co/datasets/{repoId}/resolve/{rev}/{filename}`
 * - space:   `https://huggingface.co/spaces/{repoId}/resolve/{rev}/{filename}`
 */
export function hfHubFileUrl(
  repoId: string,
  filename: string,
  revision: string = "main",
  repoType: string = "model",
  endpoint: string = HF_ENDPOINT
): string {
  let prefix: string;
  if (repoType === "model" || repoType == null) {
    prefix = "";
  } else if (repoType === "dataset") {
    prefix = "datasets/";
  } else if (repoType === "space") {
    prefix = "spaces/";
  } else {
    throw new Error(`Unsupported repoType "${repoType}"`);
  }
  const cleanFilename = filename.replace(/^\/+/, "");
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/${prefix}${repoId}/resolve/${revision}/${cleanFilename}`;
}

// ---------------------------------------------------------------------------
// HEAD metadata
// ---------------------------------------------------------------------------

/**
 * Issue a HEAD request to the `/resolve` URL and extract HuggingFace-specific
 * metadata headers (ETag, commit hash, linked size, etc.).
 *
 * The request is made **without** following redirects so that the HF-specific
 * headers on the 3xx response are preserved.
 */
export async function hfHeadMetadata(
  url: string,
  token?: string | null,
  timeout: number = 10_000
): Promise<HfFileMeta> {
  const headers: Record<string, string> = {
    "Accept-Encoding": "identity",
    "User-Agent": "nodetool-hf-downloader"
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "HEAD",
      headers,
      redirect: "manual", // don't follow -- we want the 3xx headers
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  // Accept 2xx and 3xx (redirect is expected for LFS/CDN)
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(
      `Unauthorized to access ${url}. Status: ${resp.status}. ` +
        `Check your Hugging Face token and permissions. Token present: ${!!token}`
    );
  }
  if (resp.status >= 400) {
    throw new Error(`HEAD ${url} failed with status ${resp.status}`);
  }

  // ETag
  let etag =
    resp.headers.get(HF_HEADER_X_LINKED_ETAG) || resp.headers.get("etag");
  if (etag == null) {
    throw new Error(`No ETag received from Hugging Face for url=${url}`);
  }
  if (etag.startsWith('"') && etag.endsWith('"')) {
    etag = etag.slice(1, -1);
  }

  // Size
  let sizeHeader = resp.headers.get(HF_HEADER_X_LINKED_SIZE);
  if (sizeHeader == null && resp.status >= 200 && resp.status < 300) {
    sizeHeader = resp.headers.get("content-length");
  }
  const size = sizeHeader != null ? parseInt(sizeHeader, 10) : null;

  // Location (redirect target or original URL)
  let location = resp.headers.get("location") || url;
  if (
    location &&
    !location.startsWith("http://") &&
    !location.startsWith("https://")
  ) {
    location = new URL(location, url).href;
  }

  const commitHash = resp.headers.get(HF_HEADER_X_REPO_COMMIT) || null;
  const acceptRanges =
    (resp.headers.get("accept-ranges") || "").toLowerCase() === "bytes";

  return {
    url: location,
    etag,
    size,
    commitHash,
    acceptRanges,
    originalUrl: url
  };
}

// ---------------------------------------------------------------------------
// Streaming download with resume
// ---------------------------------------------------------------------------

/**
 * Stream a file to disk with HTTP Range resume support.
 *
 * - Writes to `dest + ".incomplete"` while downloading.
 * - Renames to `dest` on completion.
 * - On transient network errors, retries and resumes from the last byte.
 */
export async function downloadWithResume(
  url: string,
  dest: string,
  opts: DownloadWithResumeOptions = {}
): Promise<void> {
  const {
    token = null,
    expectedSize = null,
    acceptRanges = false,
    chunkSize: _chunkSize = 1024 * 1024,
    maxRetries = 5,
    progressCallback,
    cancelSignal
  } = opts;

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + ".incomplete";

  // Final file already complete?
  try {
    const stat = await fsp.stat(dest);
    if (expectedSize != null && stat.size === expectedSize) {
      progressCallback?.(expectedSize, expectedSize);
      return;
    }
  } catch {
    // dest doesn't exist yet -- continue
  }

  // Incomplete file already fully downloaded (e.g. crash after download)?
  try {
    const stat = await fsp.stat(tmp);
    if (expectedSize != null && stat.size === expectedSize) {
      await fsp.rename(tmp, dest);
      progressCallback?.(expectedSize, expectedSize);
      return;
    }
  } catch {
    // tmp doesn't exist -- continue
  }

  for (let attempt = 1; ; attempt++) {
    let resumeFrom = 0;
    try {
      const stat = await fsp.stat(tmp);
      resumeFrom = stat.size;
    } catch {
      // file doesn't exist
    }

    if (expectedSize != null) {
      if (resumeFrom === expectedSize) {
        await fsp.rename(tmp, dest);
        return;
      }
      if (resumeFrom > expectedSize) {
        await fsp.unlink(tmp);
        resumeFrom = 0;
      }
    }

    const headers: Record<string, string> = {
      "Accept-Encoding": "identity"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (acceptRanges && resumeFrom > 0) {
      headers["Range"] = `bytes=${resumeFrom}-`;
    }

    try {
      const resp = await fetch(url, {
        method: "GET",
        headers,
        redirect: "follow",
        signal: cancelSignal
      });

      // Server ignored Range -- start over
      if (resumeFrom > 0 && resp.status === 200 && acceptRanges) {
        try {
          await fsp.unlink(tmp);
        } catch {
          // ignore
        }
        resumeFrom = 0;
      }

      // 416 Range Not Satisfiable
      if (resp.status === 416) {
        try {
          await fsp.unlink(tmp);
        } catch {
          // ignore
        }
        continue;
      }

      if (!resp.ok && resp.status !== 206) {
        throw new Error(
          `HTTP ${resp.status} ${resp.statusText} fetching ${url}`
        );
      }

      if (!resp.body) {
        throw new Error(`No response body for ${url}`);
      }

      const flags = resumeFrom > 0 ? "a" : "w";
      const fd = await fsp.open(tmp, flags);
      const writable = fd.createWriteStream();

      try {
        const reader = resp.body.getReader();
        for (;;) {
          if (cancelSignal?.aborted) {
            reader.cancel();
            throw new Error("Download cancelled");
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;

          await new Promise<void>((resolve, reject) => {
            writable.write(value, (err) => (err ? reject(err) : resolve()));
          });
          progressCallback?.(value.length, expectedSize);
        }
      } finally {
        await new Promise<void>((resolve) => writable.end(resolve));
        await fd.close();
      }

      // Verify size
      if (expectedSize != null) {
        const actualSize = (await fsp.stat(tmp)).size;
        if (actualSize !== expectedSize) {
          throw new Error(
            `Size mismatch for ${url}: expected ${expectedSize}, got ${actualSize}`
          );
        }
      }

      await fsp.rename(tmp, dest);
      return;
    } catch (err) {
      if (cancelSignal?.aborted) throw err;
      // On the last retry, propagate
      if (attempt >= maxRetries) {
        throw new Error(
          `Download failed after ${attempt} attempts: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      // Otherwise loop and resume
    }
  }
}

// ---------------------------------------------------------------------------
// Main download function
// ---------------------------------------------------------------------------

/**
 * Download a single file from HuggingFace Hub into the local cache.
 *
 * Uses the same blob + snapshot symlink layout as the official
 * `huggingface_hub` Python library so files cached by either implementation
 * are interoperable.
 *
 * @returns The path to the snapshot symlink (or copy) of the downloaded file.
 */
export async function asyncHfDownload(
  repoId: string,
  filename: string,
  opts: AsyncHfDownloadOptions = {}
): Promise<string> {
  const {
    revision = "main",
    repoType = "model",
    token: rawToken,
    cacheDir: rawCacheDir,
    chunkSize = 1024 * 1024,
    progressCallback,
    cancelSignal
  } = opts;

  const tokenStr = await resolveHfToken(rawToken);

  // 1. Build /resolve URL
  const resolveUrl = hfHubFileUrl(repoId, filename, revision, repoType);

  // 2. HEAD to get metadata
  const meta = await hfHeadMetadata(resolveUrl, tokenStr);

  // 3. Compute cache paths
  const cacheRoot = rawCacheDir ?? hfCacheRoot();
  const repoCache = hfRepoCacheDir(repoId, repoType, cacheRoot);
  const blobsDir = path.join(repoCache, "blobs");
  const commitOrRev = meta.commitHash ?? revision;
  const snapshotPath = path.join(repoCache, "snapshots", commitOrRev, filename);
  const blobPath = path.join(blobsDir, meta.etag);

  // Blob already cached and looks complete?
  try {
    const stat = await fsp.stat(blobPath);
    if (meta.size == null || stat.size === meta.size) {
      await fsp.mkdir(path.dirname(snapshotPath), { recursive: true });
      const rel = path.relative(path.dirname(snapshotPath), blobPath);
      try {
        try {
          await fsp.unlink(snapshotPath);
        } catch {
          // doesn't exist
        }
        await fsp.symlink(rel, snapshotPath);
      } catch {
        await fsp.copyFile(blobPath, snapshotPath);
      }
      if (progressCallback && meta.size) {
        progressCallback(meta.size, meta.size);
      }
      return snapshotPath;
    }
  } catch {
    // blob doesn't exist yet
  }

  await fsp.mkdir(blobsDir, { recursive: true });

  // 4. Only send auth token if the download host matches the original HF host
  const origHost = new URL(meta.originalUrl).host;
  const targetHost = new URL(meta.url).host;
  const tokenForData = origHost === targetHost ? tokenStr : null;

  // 5. Download to blob path (with resume)
  await downloadWithResume(meta.url, blobPath, {
    token: tokenForData,
    expectedSize: meta.size,
    acceptRanges: meta.acceptRanges,
    chunkSize,
    progressCallback,
    cancelSignal
  });

  // 6. Expose snapshot path as symlink (or copy on unsupported FS)
  await fsp.mkdir(path.dirname(snapshotPath), { recursive: true });
  const rel = path.relative(path.dirname(snapshotPath), blobPath);
  try {
    try {
      await fsp.unlink(snapshotPath);
    } catch {
      // doesn't exist
    }
    await fsp.symlink(rel, snapshotPath);
  } catch {
    await fsp.copyFile(blobPath, snapshotPath);
  }

  return snapshotPath;
}
