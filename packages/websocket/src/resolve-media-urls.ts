/**
 * Resolve asset IDs in message content to browser-accessible URLs.
 *
 * Media refs store an `asset_id` in the database. Before sending to a
 * client, this module resolves each to a full URL via `buildAssetUrl`.
 *
 * For LLM providers use `resolveContentForProvider` instead, which maps
 * asset_id directly to a file:// URI so no HTTP round-trip is needed.
 */

import { buildAssetUrl, getAssetFilePath } from "@nodetool/config";
import { pathToFileURL } from "node:url";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
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

function resolveAssetId(assetId: string, mimeType?: string | null): string {
  return buildAssetUrl(`${assetId}.${extFromMime(mimeType)}`);
}

/**
 * Resolve a media ref object: if it has an asset_id, derive uri from it.
 */
function resolveRef(
  ref: Record<string, unknown>,
  fallbackMime?: string
): Record<string, unknown> {
  const resolved = { ...ref };
  const mime = (resolved.mimeType ?? resolved.mime_type ?? resolved.content_type ?? fallbackMime) as string | undefined;

  if (typeof resolved.asset_id === "string" && resolved.asset_id) {
    resolved.uri = resolveAssetId(resolved.asset_id as string, mime);
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
  fallbackMime?: string
): Record<string, unknown> {
  const resolved = { ...ref };
  const mime = (resolved.mimeType ?? resolved.mime_type ?? resolved.content_type ?? fallbackMime) as string | undefined;

  if (typeof resolved.asset_id === "string" && resolved.asset_id && !resolved.uri) {
    const ext = extFromMime(mime);
    const filePath = getAssetFilePath(`${resolved.asset_id as string}.${ext}`);
    resolved.uri = pathToFileURL(filePath).href;
  }

  return resolved;
}

/**
 * Walk a message content array and resolve asset_id refs to file:// URIs
 * suitable for LLM provider calls (reads directly from disk).
 */
export function resolveContentForProvider(
  content: string | unknown[] | Record<string, unknown> | null
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
      return { ...b, image: resolveRefForProvider(b.image as Record<string, unknown>, "image/png") };
    }

    if (b.type === "video" && b.video && typeof b.video === "object") {
      return { ...b, video: resolveRefForProvider(b.video as Record<string, unknown>, "video/mp4") };
    }

    if (b.type === "audio" && b.audio && typeof b.audio === "object") {
      return { ...b, audio: resolveRefForProvider(b.audio as Record<string, unknown>, "audio/wav") };
    }

    return block;
  });
}

/**
 * Walk a message content array and resolve asset_id refs to URLs.
 */
export function resolveContentUrls(
  content: string | unknown[] | Record<string, unknown> | null
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
      return { ...b, image: resolveRef(b.image as Record<string, unknown>, "image/png") };
    }

    if (b.type === "video" && b.video && typeof b.video === "object") {
      return { ...b, video: resolveRef(b.video as Record<string, unknown>, "video/mp4") };
    }

    if (b.type === "audio" && b.audio && typeof b.audio === "object") {
      return { ...b, audio: resolveRef(b.audio as Record<string, unknown>, "audio/wav") };
    }

    return block;
  });
}
