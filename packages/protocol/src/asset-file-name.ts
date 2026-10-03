/**
 * The file name an asset's bytes are stored under, `<assetId>.<ext>`, with the
 * extension derived from the asset's content type. The server writes uploads
 * under this name, and readers that only hold the asset row rebuild it here.
 */

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
  "model/gltf+json": "gltf",
  "font/ttf": "ttf",
  "font/otf": "otf"
};

/** Whether the content type has its own stored extension (not `bin`). */
export function hasAssetFileExtension(contentType: string): boolean {
  return Object.hasOwn(CONTENT_TYPE_TO_EXTENSION, contentType);
}

/** The asset's stored file name, with no owner prefix. */
export function getAssetFileName(
  assetId: string,
  contentType: string
): string {
  const extension = hasAssetFileExtension(contentType)
    ? CONTENT_TYPE_TO_EXTENSION[contentType]
    : "bin";
  return `${assetId}.${extension}`;
}

/**
 * Names to try when reading an asset, newest first. Models and fonts used
 * to be stored as `.bin` before their content types had extension mappings.
 */
export function assetFileNameCandidates(
  assetId: string,
  contentType: string
): string[] {
  const canonical = getAssetFileName(assetId, contentType);
  if (canonical.endsWith(".glb") || canonical.endsWith(".gltf") ||
      canonical.endsWith(".ttf") || canonical.endsWith(".otf")) {
    return [canonical, `${assetId}.bin`];
  }
  return [canonical];
}
