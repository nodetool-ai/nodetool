/**
 * Resolve asset IDs in message content to browser-accessible URLs.
 *
 * Media refs store an `asset_id` in the database. Before sending to a
 * client, this module resolves each to a full URL via `buildAssetUrl`.
 *
 * For LLM providers use `resolveContentForProvider` instead, which maps
 * asset_id directly to a file:// URI so no HTTP round-trip is needed.
 *
 * Pass the owning `userId` wherever it's known: asset bytes are written
 * owner-prefixed (`<userId>/<assetId>.<ext>`), and a key built without the
 * prefix resolves to a path that no longer exists.
 */

import { buildAssetUrl, getAssetFilePath } from "@nodetool-ai/config";
import { assetObjectKey } from "@nodetool-ai/storage";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  // `image/jpg` and `image/bmp` are accepted by the storage-side extension map
  // (IMAGE_MIME_TO_EXT); without them here, resolution fell through to `.bin`
  // and produced a dangling asset URL for a file written as `.jpg` / `.bmp`.
  "image/jpg": "jpg",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf"
};

function extFromMime(mime: string | undefined | null): string {
  if (!mime) return "bin";
  return MIME_TO_EXT[mime] ?? "bin";
}

// asset_id comes from client-supplied message content and is interpolated into
// a filesystem path. A value with path separators or `..` segments would let
// the resolved file:// URI escape the assets dir and expose arbitrary local
// files to the LLM. Restrict to a plain id token.
function isSafeAssetId(assetId: string): boolean {
  return (
    assetId.length > 0 &&
    !assetId.includes("/") &&
    !assetId.includes("\\") &&
    !assetId.includes("..") &&
    !assetId.includes("\0")
  );
}

/**
 * Bytes are written owner-prefixed (`<userId>/<assetId>.<ext>`) by
 * `storeAssetWithThumbnail`, and `/api/storage` only falls back
 * prefixed → flat, never the other way round — so a flat URL 404s for every
 * asset written under the current layout. Build the prefixed key whenever the
 * owner is known; without one, the flat legacy key is all there is.
 */
function assetKeyFor(
  assetId: string,
  mimeType: string | null | undefined,
  userId?: string
): string {
  const fileName = `${assetId}.${extFromMime(mimeType)}`;
  return userId ? assetObjectKey(userId, fileName) : fileName;
}

function resolveAssetId(
  assetId: string,
  mimeType?: string | null,
  userId?: string
): string {
  return buildAssetUrl(assetKeyFor(assetId, mimeType, userId));
}

/**
 * Resolve a media ref object: if it has an asset_id, derive uri from it.
 */
function resolveRef(
  ref: Record<string, unknown>,
  fallbackMime?: string,
  userId?: string
): Record<string, unknown> {
  const resolved = { ...ref };
  const mime = (resolved.mimeType ?? resolved.mime_type ?? resolved.content_type ?? fallbackMime) as string | undefined;

  if (
    typeof resolved.asset_id === "string" &&
    isSafeAssetId(resolved.asset_id)
  ) {
    resolved.uri = resolveAssetId(resolved.asset_id, mime, userId);
  }

  return resolved;
}

/**
 * Resolve a media ref for an LLM provider call.
 * Maps asset_id directly to a file:// URI so providers read from disk,
 * not via an HTTP round-trip to the local server.
 */
function resolveRefForProvider(
  ref: Record<string, unknown>,
  fallbackMime?: string,
  userId?: string
): Record<string, unknown> {
  const resolved = { ...ref };
  const mime = (resolved.mimeType ?? resolved.mime_type ?? resolved.content_type ?? fallbackMime) as string | undefined;

  if (
    typeof resolved.asset_id === "string" &&
    isSafeAssetId(resolved.asset_id) &&
    !resolved.uri
  ) {
    const flat = `${resolved.asset_id}.${extFromMime(mime)}`;
    // Prefer the owner-prefixed path the bytes are actually written to, but
    // fall back to the flat legacy path for objects predating that layout.
    let filePath = getAssetFilePath(assetKeyFor(resolved.asset_id, mime, userId));
    if (userId && !existsSync(filePath)) {
      const legacy = getAssetFilePath(flat);
      if (existsSync(legacy)) filePath = legacy;
    }
    resolved.uri = pathToFileURL(filePath).href;
  }

  return resolved;
}

/**
 * Walk a message content array and resolve asset_id refs to file:// URIs
 * suitable for LLM provider calls (reads directly from disk).
 */
export function resolveContentForProvider(
  content: string | unknown[] | Record<string, unknown> | null,
  userId?: string
): string | unknown[] | Record<string, unknown> | null {
  if (!Array.isArray(content)) return content;

  return content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const b = block as Record<string, unknown>;

    if (
      (b.type === "image_url" || b.type === "image") &&
      b.image &&
      typeof b.image === "object"
    ) {
      return { ...b, image: resolveRefForProvider(b.image as Record<string, unknown>, "image/png", userId) };
    }

    if (b.type === "video" && b.video && typeof b.video === "object") {
      return { ...b, video: resolveRefForProvider(b.video as Record<string, unknown>, "video/mp4", userId) };
    }

    if (b.type === "audio" && b.audio && typeof b.audio === "object") {
      return { ...b, audio: resolveRefForProvider(b.audio as Record<string, unknown>, "audio/wav", userId) };
    }

    return block;
  });
}

/**
 * Walk a message content array and resolve asset_id refs to URLs.
 */
export function resolveContentUrls(
  content: string | unknown[] | Record<string, unknown> | null,
  userId?: string
): string | unknown[] | Record<string, unknown> | null {
  if (!Array.isArray(content)) return content;

  return content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const b = block as Record<string, unknown>;

    if (
      (b.type === "image_url" || b.type === "image") &&
      b.image &&
      typeof b.image === "object"
    ) {
      return { ...b, image: resolveRef(b.image as Record<string, unknown>, "image/png", userId) };
    }

    if (b.type === "video" && b.video && typeof b.video === "object") {
      return { ...b, video: resolveRef(b.video as Record<string, unknown>, "video/mp4", userId) };
    }

    if (b.type === "audio" && b.audio && typeof b.audio === "object") {
      return { ...b, audio: resolveRef(b.audio as Record<string, unknown>, "audio/wav", userId) };
    }

    return block;
  });
}
