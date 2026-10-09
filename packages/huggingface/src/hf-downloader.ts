/**
 * Thin wrapper around `@huggingface/hub` for downloading files into the
 * standard HuggingFace cache layout (blobs + snapshots with symlinks).
 *
 * Adds NodeTool-specific niceties on top of the upstream library:
 *  - one cache root shared with every other reader (`getHfHubCacheDir`)
 *  - progress and abort support via a wrapped `fetch` function
 *  - no duplicate blob when Windows cannot create the snapshot symlink
 */

import {
  downloadFileToCacheDir,
  getRepoFolderName,
  pathsInfo
} from "@huggingface/hub";
import type { RepoType } from "@huggingface/hub";

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { getHfHubCacheDir } from "@nodetool-ai/config";

import { resolveHfToken } from "./hf-auth.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HF_ENDPOINT = "https://huggingface.co";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AsyncHfDownloadOptions {
  revision?: string;
  repoType?: RepoType;
  token?: string | boolean | null;
  cacheDir?: string | null;
  /** Unused — kept for API compatibility. */
  chunkSize?: number;
  progressCallback?: (deltaBytes: number, totalBytes: number | null) => void;
  cancelSignal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Cache root helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the HuggingFace hub cache root directory. Delegates to
 * `getHfHubCacheDir` in `@nodetool-ai/config`, which follows Python
 * `huggingface_hub`'s variable order and expands a leading `~`.
 */
export function hfCacheRoot(): string {
  return getHfHubCacheDir();
}

/**
 * Return the per-repo cache directory.
 *
 * Layout: `<cacheDir>/<repoType>s--namespace--name`
 */
export function hfRepoCacheDir(
  repoId: string,
  repoType: RepoType = "model",
  cacheDir?: string | null
): string {
  const root = cacheDir ?? hfCacheRoot();
  return path.join(root, getRepoFolderName({ name: repoId, type: repoType }));
}

// ---------------------------------------------------------------------------
// URL builder (kept for callers that want a /resolve URL without downloading)
// ---------------------------------------------------------------------------

/**
 * Build a `/resolve` URL on the Hub for a given file.
 */
export function hfHubFileUrl(
  repoId: string,
  filename: string,
  revision: string = "main",
  repoType: RepoType = "model",
  endpoint: string = HF_ENDPOINT
): string {
  let prefix: string;
  if (repoType === "model") {
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
// Fetch wrapping for progress + abort
// ---------------------------------------------------------------------------

/**
 * Wrap a `fetch` so that streamed response bodies emit progress callbacks
 * and so that an external `AbortSignal` is honored.
 */
export function wrapFetch(
  base: typeof fetch,
  options: {
    signal?: AbortSignal;
    onProgress?: (delta: number, total: number | null) => void;
  }
): typeof fetch {
  return async (input, init) => {
    const finalInit: RequestInit = { ...(init ?? {}) };
    if (options.signal) {
      const signals = [options.signal, init?.signal].filter(
        (s): s is AbortSignal => s != null
      );
      finalInit.signal =
        signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    }
    const resp = await base(input, finalInit);

    if (!resp.body || !options.onProgress) return resp;

    // The Hub client uses this same fetch for its POST /paths-info metadata
    // request and for the actual file GET. Skip only the metadata endpoint.
    // Repository files may legitimately be JSON (Supertonic voice styles are
    // a concrete example), so filtering by Content-Type under-counts them and
    // leaves a successful download looking permanently incomplete.
    const requestUrl =
      input instanceof Request ? input.url : input.toString();
    if (requestUrl.includes("/paths-info")) return resp;

    const cb = options.onProgress;
    const lenHeader =
      resp.headers.get("content-length") ?? resp.headers.get("x-linked-size");
    const total = lenHeader ? parseInt(lenHeader, 10) : null;

    const stream = resp.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          cb(chunk.byteLength, total);
          controller.enqueue(chunk);
        }
      })
    );
    const wrappedResponse = new Response(stream, {
      headers: resp.headers,
      status: resp.status,
      statusText: resp.statusText
    });
    Object.defineProperties(wrappedResponse, {
      url: { configurable: true, value: resp.url },
      redirected: { configurable: true, value: resp.redirected },
      type: { configurable: true, value: resp.type }
    });
    return wrappedResponse;
  };
}

// ---------------------------------------------------------------------------
// Main download function
// ---------------------------------------------------------------------------

/**
 * Download a single file from HuggingFace Hub into the local cache.
 *
 * Uses {@link downloadFileToCacheDir} from `@huggingface/hub` so the resulting
 * blobs + snapshot symlink layout is interoperable with the official Python
 * `huggingface_hub` library.
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
    cacheDir,
    progressCallback,
    cancelSignal
  } = opts;

  const tokenStr = await resolveHfToken(rawToken);

  const wrappedFetch =
    progressCallback || cancelSignal
      ? wrapFetch(fetch, {
          signal: cancelSignal,
          onProgress: progressCallback
        })
      : undefined;

  const args: Parameters<typeof downloadFileToCacheDir>[0] = {
    repo: { name: repoId, type: repoType },
    path: filename,
    revision,
    cacheDir: cacheDir ?? hfCacheRoot()
  };
  if (tokenStr) {
    args.accessToken = tokenStr;
  }
  if (wrappedFetch) {
    args.fetch = wrappedFetch;
  }
  const pointerPath = await downloadFileToCacheDir(args);
  if (process.platform === "win32") {
    await dropBlobCopiedToSnapshot(args, pointerPath);
  }
  return pointerPath;
}

/**
 * Remove the blob that a symlink-less download duplicated into the snapshot.
 *
 * `@huggingface/hub` links `snapshots/<rev>/<file>` to `blobs/<etag>`. When
 * `fs.symlink` fails, which it does on Windows without Developer Mode or admin
 * rights, it copies the blob instead and keeps both, so the file occupies
 * twice its size. Python `huggingface_hub` moves the blob in that case. This
 * matches it: when the snapshot entry is a regular file of the blob's size,
 * the blob goes. Readers only use the snapshot path, and the library returns
 * an existing snapshot entry without looking at `blobs/`.
 */
export async function dropBlobCopiedToSnapshot(
  args: Parameters<typeof downloadFileToCacheDir>[0],
  pointerPath: string
): Promise<void> {
  try {
    const pointer = await fs.lstat(pointerPath);
    if (pointer.isSymbolicLink() || !pointer.isFile()) {
      return;
    }
    const [info] = await pathsInfo({
      repo: args.repo,
      paths: [args.path],
      revision: args.revision,
      expand: true,
      accessToken: args.accessToken,
      fetch: args.fetch
    });
    const etag = info?.lfs?.oid ?? info?.xetHash ?? info?.oid;
    if (!etag) {
      return;
    }
    // asyncHfDownload always passes a `{ name, type }` repo.
    if (typeof args.repo === "string") {
      return;
    }
    const blobPath = path.join(
      args.cacheDir ?? hfCacheRoot(),
      getRepoFolderName(args.repo),
      "blobs",
      etag
    );
    const blob = await fs.stat(blobPath).catch(() => null);
    if (blob && blob.size === pointer.size) {
      await fs.rm(blobPath, { force: true });
    }
  } catch {
    // Best effort: the download succeeded, a leftover blob only costs space.
  }
}
