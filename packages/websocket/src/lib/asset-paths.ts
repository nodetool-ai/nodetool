/**
 * Asset filename + storage path helpers — shared between the REST handler
 * in `http-api.ts` and the tRPC `assets` router. Kept in a standalone module
 * so the tRPC router doesn't need to pull in the whole `http-api.ts` (which
 * imports `@nodetool-ai/dsl` → `base-nodes` → `kie-nodes` at module load).
 */

import { getDefaultAssetsPath } from "@nodetool-ai/config";
import {
  assetKeyCandidates,
  assetObjectKey,
  type StorageAdapter
} from "@nodetool-ai/storage";
import type { StorageHandlerOptions } from "../storage-api.js";

const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/html": "html",
  "application/json": "json",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/x-wav": "wav",
  "audio/x-flac": "flac",
  "audio/x-m4a": "m4a",
  "video/mp4": "mp4",
  "video/mpeg": "mpeg",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/webm": "webm",
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf"
};

const EXTENSION_TO_INFERRED_TYPE: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  svg: "image/svg+xml"
};

const GENERIC_CONTENT_TYPES = new Set(["", "application/octet-stream"]);

function getFileExtension(contentType: string): string {
  return CONTENT_TYPE_TO_EXTENSION[contentType] ?? "bin";
}

function fileExtensionOf(fileName: string | undefined): string | undefined {
  if (!fileName) {
    return undefined;
  }
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return undefined;
  }
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Fill in a missing or generic content type from the file name. Browsers
 * often send `application/octet-stream` (or nothing) for `.glb` / `.gltf`
 * / `.svg`.
 */
export function normalizeAssetContentType(
  contentType: string,
  fileName?: string
): string {
  if (CONTENT_TYPE_TO_EXTENSION[contentType]) {
    return contentType;
  }
  const ext = fileExtensionOf(fileName);
  const inferred = ext ? EXTENSION_TO_INFERRED_TYPE[ext] : undefined;
  if (inferred && GENERIC_CONTENT_TYPES.has(contentType)) {
    return inferred;
  }
  return contentType || "application/octet-stream";
}

/**
 * Names to try when reading an asset, newest first. 3D models used to be
 * stored as `.bin` because this map had no `model/*` entries.
 */
export function assetFileNameCandidates(
  assetId: string,
  contentType: string
): string[] {
  const canonical = getAssetFileName(assetId, contentType);
  if (canonical.endsWith(".glb") || canonical.endsWith(".gltf")) {
    return [canonical, `${assetId}.bin`];
  }
  return [canonical];
}

/**
 * The object's file name, with no owner prefix. This is the *legacy* key
 * shape and stays exported because stored `asset://` refs and already-written
 * objects use it; new writes go through `getAssetStorageKey`.
 */
export function getAssetFileName(
  assetId: string,
  contentType: string
): string {
  return `${assetId}.${getFileExtension(contentType)}`;
}

/**
 * Where an asset's bytes live: `<userId>/<assetId>.<ext>`. The owner is the
 * leading path segment so the tenant boundary is expressible outside this
 * process — a Supabase RLS policy or bucket policy can match on it, and a
 * signed upload URL scoped to such a key can only write into its own owner's
 * prefix.
 */
export function getAssetStorageKey(
  userId: string,
  assetId: string,
  contentType: string
): string {
  return assetObjectKey(userId, getAssetFileName(assetId, contentType));
}

/** Owner-prefixed thumbnail key for an asset. */
export function getAssetThumbnailKey(
  userId: string,
  assetId: string
): string {
  return assetObjectKey(userId, `${assetId}_thumb.jpg`);
}

/**
 * Resolve the key an asset's bytes actually live under, preferring the
 * owner-prefixed layout and falling back to the flat legacy key. Lets a
 * deployment roll forward before `nodetool storage migrate-keys` has moved
 * its existing objects. Returns null when neither exists.
 */
export async function resolveExistingAssetKey(
  adapter: StorageAdapter,
  userId: string,
  fileName: string
): Promise<string | null> {
  for (const candidate of assetKeyCandidates(userId, fileName)) {
    if (await adapter.exists(adapter.uriForKey(candidate))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Read an asset's bytes, trying the owner-prefixed key first and the legacy
 * flat key second. Callers have already established that `userId` owns
 * `assetId` (they loaded the row to get `contentType`).
 */
export async function retrieveAssetBytes(
  adapter: StorageAdapter,
  userId: string,
  assetId: string,
  contentType: string
): Promise<Uint8Array | null> {
  for (const fileName of assetFileNameCandidates(assetId, contentType)) {
    for (const candidate of assetKeyCandidates(userId, fileName)) {
      const bytes = await adapter.retrieve(adapter.uriForKey(candidate));
      if (bytes) return bytes;
    }
  }
  return null;
}

export function getAssetStoragePath(opts?: StorageHandlerOptions): string {
  return opts?.storagePath ?? getDefaultAssetsPath();
}
