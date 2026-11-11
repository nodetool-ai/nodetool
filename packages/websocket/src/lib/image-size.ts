/**
 * The pixel size of a PNG, JPEG, GIF or WebP, read from its header bytes.
 * The Premiere export needs it to scale a still the way the editor fits it.
 * Anything else, or a header that is cut short, has no size.
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** Enough bytes for a JPEG whose size follows a large EXIF block. */
export const IMAGE_HEADER_BYTES = 256 * 1024;

const ascii = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(at, at + length));

function sized(width: number, height: number): ImageSize | undefined {
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function pngSize(bytes: Uint8Array, view: DataView): ImageSize | undefined {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return undefined;
  return sized(view.getUint32(16), view.getUint32(20));
}

function gifSize(bytes: Uint8Array, view: DataView): ImageSize | undefined {
  return bytes.length < 10 ? undefined : sized(view.getUint16(6, true), view.getUint16(8, true));
}

function jpegSize(bytes: Uint8Array, view: DataView): ImageSize | undefined {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) { at += 1; continue; }
    const marker = bytes[at + 1]!;
    if (marker === 0xff) { at += 1; continue; }
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    const length = view.getUint16(at + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return at + 9 <= bytes.length ? sized(view.getUint16(at + 7), view.getUint16(at + 5)) : undefined;
    }
    if (length < 2) return undefined;
    at += 2 + length;
  }
  return undefined;
}

function webpSize(bytes: Uint8Array, view: DataView): ImageSize | undefined {
  if (bytes.length < 30) return undefined;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8 ") return sized(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return sized((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X") {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return sized(width, height);
  }
  return undefined;
}

export function readImageSize(bytes: Uint8Array): ImageSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return pngSize(bytes, view);
  if (bytes.length >= 4 && ascii(bytes, 0, 3) === "GIF") return gifSize(bytes, view);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes, view);
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return webpSize(bytes, view);
  return undefined;
}
