/**
 * Resolve asset IDs in message content to browser-accessible URLs.
 *
 * Media refs store an `asset_id` in the database. Before sending to a
 * client, this module resolves each to a URL the browser can load directly
 * from an `<img>` / `<video>` / `<audio>` element — which is why it goes
 * through the storage backend's own URL builder, exactly like
 * `assets.get_url` does. A media element sends no `Authorization` header, so
 * on a deployment with auth enforced and asset bytes in S3/Supabase the old
 * `/api/storage/<key>` path answered 401 (and pointed at a local file backend
 * that did not hold the bytes anyway); the signed URL those backends mint is
 * loadable as-is.
 *
 * For LLM providers use `resolveContentForProvider` instead, which maps
 * asset_id directly to a file:// URI so no HTTP round-trip is needed.
 *
 * Pass the owning `userId` wherever it's known: asset bytes are written
 * owner-prefixed (`<userId>/<assetId>.<ext>`), and a key built without the
 * prefix resolves to a path that no longer exists.
 */

import {
  buildAssetUrl,
  getAssetFilePath,
  loadAssetStorageConfig
} from "@nodetool-ai/config";
import { assetObjectKey, createAssetUrlBuilder } from "@nodetool-ai/storage";
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

/**
 * The configured backend's URL builder, rebuilt when the backend kind changes
 * (tests switch backends in-process). The `file` backend is served by this
 * server's own `/api/storage` route, so it keeps going through
 * `buildAssetUrl`, which percent-encodes each key segment; the cloud backends
 * mint a signed URL to their own origin.
 */
let cachedBuilderKind: string | null = null;
let cachedBuilder: ((key: string) => Promise<string>) | null = null;

async function assetUrlForKey(key: string): Promise<string> {
  const config = loadAssetStorageConfig();
  if (config.kind === "file") {
    return buildAssetUrl(key);
  }
  if (!cachedBuilder || cachedBuilderKind !== config.kind) {
    cachedBuilderKind = config.kind;
    cachedBuilder = createAssetUrlBuilder(config);
  }
  try {
    return await cachedBuilder(key);
  } catch {
    // Signing failed (network, expired credentials). The server-side route is
    // no worse than emitting nothing, and it still works for a caller that can
    // authenticate.
    return buildAssetUrl(key);
  }
}

/**
 * Resolve a media ref object: if it has an asset_id, derive uri from it.
 */
async function resolveRef(
  ref: Record<string, unknown>,
  fallbackMime?: string,
  userId?: string
): Promise<Record<string, unknown>> {
  const resolved = { ...ref };
  const mime = (resolved.mimeType ?? resolved.mime_type ?? resolved.content_type ?? fallbackMime) as string | undefined;

  if (
    typeof resolved.asset_id === "string" &&
    isSafeAssetId(resolved.asset_id)
  ) {
    resolved.uri = await assetUrlForKey(
      assetKeyFor(resolved.asset_id, mime, userId)
    );
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
) {
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
 *
 * Async because a cloud storage backend signs each URL; the `file` backend
 * resolves without I/O.
 */
export async function resolveContentUrls(
  content: string | unknown[] | Record<string, unknown> | null,
  userId?: string
): Promise<string | unknown[] | Record<string, unknown> | null> {
  if (!Array.isArray(content)) return content;

  return Promise.all(
    content.map(async (block) => {
      if (!block || typeof block !== "object") return block;
      const b = block as Record<string, unknown>;

      if (
        (b.type === "image_url" || b.type === "image") &&
        b.image &&
        typeof b.image === "object"
      ) {
        return {
          ...b,
          image: await resolveRef(
            b.image as Record<string, unknown>,
            "image/png",
            userId
          )
        };
      }

      if (b.type === "video" && b.video && typeof b.video === "object") {
        return {
          ...b,
          video: await resolveRef(
            b.video as Record<string, unknown>,
            "video/mp4",
            userId
          )
        };
      }

      if (b.type === "audio" && b.audio && typeof b.audio === "object") {
        return {
          ...b,
          audio: await resolveRef(
            b.audio as Record<string, unknown>,
            "audio/wav",
            userId
          )
        };
      }

      return block;
    })
  );
}
