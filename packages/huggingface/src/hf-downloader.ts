/**
 * Thin wrapper around `@huggingface/hub` for downloading files into the
 * standard HuggingFace cache layout (blobs + snapshots with symlinks).
 *
 * Adds NodeTool-specific niceties on top of the upstream library:
 *  - tilde expansion in `HF_HUB_CACHE` / `HF_HOME`
 *  - progress and abort support via a wrapped `fetch` function
 */

import {
  downloadFileToCacheDir,
  getHFHubCachePath,
  getRepoFolderName
} from "@huggingface/hub";
import type { RepoType } from "@huggingface/hub";

import * as os from "node:os";
import * as path from "node:path";

import { resolveHfToken } from "./hf-auth.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HF_ENDPOINT = "https://huggingface.co";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AsyncHfDownloadOptions {
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

function expandTilde(p: string): string {
  return p.startsWith("~") ? p.replace("~", os.homedir()) : p;
}

/**
 * Resolve the HuggingFace hub cache root directory.
 *
 * Wraps {@link getHFHubCachePath} from `@huggingface/hub`, additionally
 * expanding a leading `~` (which the upstream library does not do).
 */
export function hfCacheRoot(): string {
  return expandTilde(getHFHubCachePath());
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
function wrapFetch(
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

    // Skip JSON metadata responses to avoid double-counting paths-info hits.
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return resp;

    const cb = options.onProgress;
    const lenHeader =
      resp.headers.get("content-length") ??
      resp.headers.get("x-linked-size");
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

  return await downloadFileToCacheDir({
    repo: { name: repoId, type: repoType },
    path: filename,
    revision,
    cacheDir: cacheDir ?? hfCacheRoot(),
    ...(tokenStr ? { accessToken: tokenStr } : {}),
    ...(wrappedFetch ? { fetch: wrappedFetch } : {})
  });
}
