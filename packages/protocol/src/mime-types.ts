/**
 * Content types named from a file's extension, for routes and importers
 * that only hold a file name. Values are the registered IANA types where one
 * exists. A caller that needs a different answer for some extensions passes
 * overrides instead of keeping its own table.
 */

export const DEFAULT_MIME_TYPE = "application/octet-stream";

/** Content type per lowercase extension, leading dot included. */
export const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".json": "application/json",
  ".xml": "application/xml",
  ".js": "application/javascript",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".py": "text/x-python",
  ".ts": "text/typescript"
};

/**
 * Overrides for routes that serve user files inline on the API's own origin.
 * A browser runs HTML, XML and JavaScript as a document or script there, so
 * those are served as plain text. SVG keeps its type for `<img>` and gets a
 * sandbox CSP from the route instead.
 */
export const INLINE_USER_FILE_MIME_OVERRIDES: Readonly<Record<string, string>> = {
  ".html": "text/plain",
  ".htm": "text/plain",
  ".xml": "text/plain",
  ".js": "text/plain"
};

/** The lowercase extension of the path's last segment, or "" when it has none. */
export function fileExtension(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * The content type for a file path or name. `overrides` is checked first,
 * then the shared table, then {@link DEFAULT_MIME_TYPE}.
 */
export function mimeTypeForPath(
  path: string,
  overrides?: Readonly<Record<string, string>>
): string {
  const ext = fileExtension(path);
  if (!ext) return DEFAULT_MIME_TYPE;
  if (overrides && Object.hasOwn(overrides, ext)) return overrides[ext];
  return Object.hasOwn(MIME_TYPES_BY_EXTENSION, ext)
    ? MIME_TYPES_BY_EXTENSION[ext]
    : DEFAULT_MIME_TYPE;
}
