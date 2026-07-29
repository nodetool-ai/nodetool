/**
 * Sniff an image container type from its magic bytes so image inputs keep the
 * correct MIME in the `data:` URIs providers embed them in. Hardcoding a single
 * type (e.g. `image/jpeg`) mislabels PNG/WebP/GIF inputs, which strict decoders
 * reject on a declared-vs-actual mismatch.
 */
export function detectImageMime(bytes: Uint8Array): string {
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
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
  // WebP: "RIFF"…"WEBP"
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
  // Unknown — default to PNG, the most widely accepted lossless container.
  return "image/png";
}

/** Encode image bytes as a base64 `data:` URI with a sniffed MIME type. */
export function bytesToImageDataUri(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${detectImageMime(bytes)};base64,${base64}`;
}
