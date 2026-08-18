/**
 * Detect a video container from its leading magic bytes.
 *
 * Used when a video reaches a provider without a reliable Content-Type — e.g.
 * asset bytes read from storage. Defaults to `video/mp4`, the container every
 * multimodal provider accepts.
 */
export function sniffVideoMime(bytes: Uint8Array): string {
  // ISO base media file format: <4-byte size> "ftyp" — mp4, m4v and mov all
  // use it; the brand that follows separates QuickTime from mp4.
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(
      bytes[8] ?? 0,
      bytes[9] ?? 0,
      bytes[10] ?? 0,
      bytes[11] ?? 0
    );
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  // EBML header — Matroska and WebM share it; WebM is the only one Gemini takes.
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  // "RIFF" ... "AVI "
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x56 &&
    bytes[10] === 0x49
  ) {
    return "video/x-msvideo";
  }
  return "video/mp4";
}
