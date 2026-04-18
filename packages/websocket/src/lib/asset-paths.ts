/**
 * Asset filename + storage path helpers — shared between the REST handler
 * in `http-api.ts` and the tRPC `assets` router. Kept in a standalone module
 * so the tRPC router doesn't need to pull in the whole `http-api.ts` (which
 * imports `@nodetool/dsl` → `base-nodes` → `kie-nodes` at module load).
 */

import { getDefaultAssetsPath } from "@nodetool/config";
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
  "video/webm": "webm"
};

function getFileExtension(contentType: string): string {
  return CONTENT_TYPE_TO_EXTENSION[contentType] ?? "bin";
}

export function getAssetFileName(
  assetId: string,
  contentType: string
): string {
  return `${assetId}.${getFileExtension(contentType)}`;
}

export function getAssetStoragePath(opts?: StorageHandlerOptions): string {
  return opts?.storagePath ?? getDefaultAssetsPath();
}
