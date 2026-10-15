/**
 * Factory that returns a (key → signed URL) function for each storage backend.
 *
 * - file:     returns /api/storage/<key> — served by the local HTTP server,
 *             no signing needed for local dev.
 * - s3:       returns an AWS pre-signed GET URL valid for SIGNED_URL_TTL seconds.
 * - supabase: returns a Supabase signed URL valid for SIGNED_URL_TTL seconds.
 *             Keys requested in the same event-loop turn are signed together
 *             in one bulk request, so a page of assets costs one round trip
 *             instead of one or two per asset.
 *
 * A caller that passes a `version` (the asset row's `updated_at`) gets the
 * same URL back for that key and version until half the URL's lifetime has
 * passed. A stable URL lets the browser reuse the image it already
 * downloaded, and skips the signing work. A new version mints a new URL, so
 * replaced bytes are never served from a stale browser cache.
 */

import { S3Client, type S3ClientOptions } from "./s3/client.js";
import { SIGNED_URL_TTL } from "@nodetool-ai/config";
import {
  createSupabaseStorageClient,
  type SupabaseBucketApi
} from "./supabase-rest.js";
import type { StorageConfig } from "./factory.js";

/** Builds the URL a client fetches `key` from. */
export type AssetUrlBuilder = (key: string, version?: string) => Promise<string>;

/** Keys per bulk sign request. */
const SIGN_BATCH_SIZE = 500;
/** Signed URLs kept for reuse, per builder. */
const URL_CACHE_MAX_ENTRIES = 20_000;

interface CachedUrl {
  url: string;
  version: string;
  signedAt: number;
}

/**
 * Reuse URLs for keys signed with a version. Failures are not cached: a
 * thumbnail that does not exist yet may exist on the next listing.
 */
function withUrlCache(
  sign: (key: string) => Promise<string>,
  now: () => number = Date.now
): AssetUrlBuilder {
  // Map iteration order is insertion order, so the first key is the least
  // recently used once hits are re-inserted.
  const cache = new Map<string, CachedUrl>();
  // A cached URL is reused until half of its lifetime has passed. Read here,
  // not at module load, so importing this module never touches the config.
  const reuseMs = (SIGNED_URL_TTL * 1000) / 2;
  return async (key, version) => {
    if (version === undefined) return sign(key);
    const hit = cache.get(key);
    if (
      hit &&
      hit.version === version &&
      now() - hit.signedAt < reuseMs
    ) {
      cache.delete(key);
      cache.set(key, hit);
      return hit.url;
    }
    const signedAt = now();
    const url = await sign(key);
    cache.delete(key);
    cache.set(key, { url, version, signedAt });
    if (cache.size > URL_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    return url;
  };
}

interface Waiter {
  resolve: (url: string) => void;
  reject: (error: Error) => void;
}

function signFailure(key: string, message: string): Error {
  return new Error(`Failed to create signed URL for "${key}": ${message}`);
}

/**
 * Collect the keys requested during one event-loop turn and sign them with
 * one bulk request per {@link SIGN_BATCH_SIZE} keys. Each key settles on its
 * own: a missing object rejects only its own promise.
 */
function batchedSupabaseSigner(
  bucket: SupabaseBucketApi
): (key: string) => Promise<string> {
  let pending: Map<string, Waiter[]> | null = null;

  const signChunk = async (
    keys: string[],
    waiters: Map<string, Waiter[]>
  ): Promise<void> => {
    const settle = (key: string, url: string | null, error: string) => {
      for (const waiter of waiters.get(key) ?? []) {
        if (url) waiter.resolve(url);
        else waiter.reject(signFailure(key, error));
      }
    };
    try {
      const { data, error } = await bucket.createSignedUrls(
        keys,
        SIGNED_URL_TTL
      );
      if (error || !data) {
        for (const key of keys) settle(key, null, error?.message ?? "no data");
        return;
      }
      for (const entry of data) {
        settle(entry.key, entry.signedUrl, entry.error ?? "no data");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const key of keys) settle(key, null, message);
    }
  };

  const flush = (): void => {
    const batch = pending;
    pending = null;
    if (!batch) return;
    const keys = [...batch.keys()];
    for (let start = 0; start < keys.length; start += SIGN_BATCH_SIZE) {
      void signChunk(keys.slice(start, start + SIGN_BATCH_SIZE), batch);
    }
  };

  return (key) =>
    new Promise<string>((resolve, reject) => {
      if (!pending) {
        pending = new Map();
        setImmediate(flush);
      }
      const waiters = pending.get(key);
      if (waiters) waiters.push({ resolve, reject });
      else pending.set(key, [{ resolve, reject }]);
    });
}

export function createAssetUrlBuilder(config: StorageConfig): AssetUrlBuilder {
  switch (config.kind) {
    case "file": {
      return async (key: string) => `/api/storage/${key.replace(/^\/+/, "")}`;
    }

    case "s3": {
      const options: S3ClientOptions = {
        region: config.region ?? "us-east-1"
      };
      if (config.endpoint) {
        options.endpoint = config.endpoint;
        options.forcePathStyle = true;
      }
      const client = new S3Client(options);
      const bucket = config.bucket;
      return withUrlCache((key: string) =>
        client.presignGetObject({ bucket, key, expiresIn: SIGNED_URL_TTL })
      );
    }

    case "supabase": {
      const supabase = createSupabaseStorageClient(config.url, config.apiKey);
      return withUrlCache(
        batchedSupabaseSigner(supabase.storage.from(config.bucket))
      );
    }
  }
}
