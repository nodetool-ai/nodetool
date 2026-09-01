/**
 * Magic-byte identification for image containers, mirroring `audio-mime.ts`.
 *
 * Providers hand back encoded bytes with no reliable declared type — Replicate
 * returns WebP, FAL and KIE return whatever the endpoint produced — so
 * anything that assumes PNG mislabels them, and a strict consumer rejects the
 * file on the mismatch (Kie answers `500 File type not supported`, naming
 * nothing).
 */

export const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp"
};

/** Identify a container from its leading bytes; `null` when nothing matches. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  // PNG: 89 50 4E 47
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // WebP: "RIFF" + size + "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // GIF: "GIF8"
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // BMP: "BM"
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  return null;
}

/** The MIME type SVG markup is stored and served under. */
export const SVG_MIME = "image/svg+xml";

/**
 * Whether these bytes are SVG markup.
 *
 * Deliberately not part of `sniffImageMime`: that answers "which raster
 * container is this", and its callers (provider uploads, asset extensions)
 * read a `null` as "not a picture I can hand over". SVG is text with no magic
 * number, so it is sniffed on its own, by the callers that can actually do
 * something with a vector — today, the rasterizer behind `view_image`.
 *
 * Reads only the leading bytes: an SVG document begins with an XML
 * declaration, a doctype, comments or whitespace before its `<svg` root, and
 * a whole-file decode of an arbitrary upload is not worth paying for.
 */
export function isSvgBytes(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(0, 1024)
  );
  return /<svg[\s>]/i.test(head);
}

/**
 * PNG-fallback variant, for the callers that must produce a string (a `data:`
 * URI). Where the label gets stored or forwarded, prefer `sniffImageMime` and
 * keep "unknown" as its own state.
 */
export function detectImageMime(bytes: Uint8Array): string {
  return sniffImageMime(bytes) ?? "image/png";
}

/** Encode image bytes as a base64 `data:` URI with a sniffed MIME type. */
export function bytesToImageDataUri(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${detectImageMime(bytes)};base64,${base64}`;
}

/** File extension for an image MIME type, or `null` when it is not an image. */
export function extForImageMime(mime: string): string | null {
  return IMAGE_MIME_TO_EXT[mime.toLowerCase()] ?? null;
}
