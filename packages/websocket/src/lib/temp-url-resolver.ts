/**
 * Turns a stored temp-asset URI into a URL the *client* can fetch.
 *
 * `temp_url` asset output mode stores the bytes and hands the client back a
 * URL. Which URL depends on the backend: a local file is served by this
 * process at /api/storage/<key>, while a cloud object must be fetched from the
 * bucket directly — the /api/storage route only reads local disk.
 */

import { pathToFileURL } from "node:url";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { buildAssetUrl } from "@nodetool-ai/config";
import { isFunctionValue } from "./wire-values.js";

/**
 * Return a public HTTPS URL for a cloud URI if the adapter exposes a
 * `getPublicUrl(uri)` method (the Supabase adapter does). Duck-typed because
 * `getPublicUrl` is adapter-specific, not part of the `StorageAdapter`
 * interface. Returns null when the adapter has no such method or it declines.
 */
export function getAdapterPublicUrl(
  adapter: StorageAdapter,
  uri: string
): string | null {
  const fn = (adapter as { getPublicUrl?: (uri: string) => string | null })
    .getPublicUrl;
  if (!isFunctionValue(fn)) return null;
  try {
    return fn.call(adapter, uri) ?? null;
  } catch {
    return null;
  }
}

/**
 * Return a short-lived signed GET URL for a cloud URI when the adapter can
 * mint one (the Supabase and S3 adapters do). Returns null when the adapter
 * has no such method, declines the URI, or signing fails.
 */
export async function createAdapterDownloadUrl(
  adapter: StorageAdapter,
  uri: string
): Promise<string | null> {
  const fn = adapter.createDownloadUrl;
  if (!isFunctionValue(fn)) return null;
  try {
    return (await fn.call(adapter, uri)) ?? null;
  } catch {
    return null;
  }
}

/** Extract the object key from a cloud storage URI, or return null for file URIs. */
export function extractCloudKey(uri: string): string | null {
  for (const scheme of ["supabase://", "s3://"]) {
    if (uri.startsWith(scheme)) {
      const rest = uri.slice(scheme.length);
      const slash = rest.indexOf("/");
      return slash >= 0 ? rest.slice(slash + 1) : null;
    }
  }
  return null;
}

/**
 * Build the `tempUrlResolver` the runtime context calls for every `temp_url`
 * asset output.
 *
 * A cloud object resolves to a **signed** URL first. A signed URL works on a
 * private bucket; a public one does not — Supabase's /object/public/… route
 * resolves only buckets marked public and answers `NoSuchBucket` for all the
 * rest, so a public URL against a private temp bucket 404s in the client.
 */
export function createTempUrlResolver(
  tempAdapter: StorageAdapter,
  storagePath: string
): (uri: string) => Promise<string> {
  return async (uri: string) => {
    const cloudKey = extractCloudKey(uri);
    if (cloudKey !== null) {
      const signedUrl = await createAdapterDownloadUrl(tempAdapter, uri);
      if (signedUrl) return signedUrl;
      const publicUrl = getAdapterPublicUrl(tempAdapter, uri);
      if (publicUrl) return publicUrl;
      // Neither form available. /api/storage/<key> 404s on a cloud backend,
      // but keeps behaviour unchanged for the file backend.
      return buildAssetUrl(cloudKey);
    }
    // File: convert file:///path/to/storage/uuid.png → /api/storage/uuid.png
    const prefix = pathToFileURL(storagePath).toString();
    if (uri.startsWith(prefix)) {
      return buildAssetUrl(uri.slice(prefix.length + 1));
    }
    return uri;
  };
}
