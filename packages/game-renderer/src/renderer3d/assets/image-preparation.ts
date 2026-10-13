import type { GameModelDiagnostic } from "../preparation.js";
import type { PreparedGameImage3D } from "./image-contract.js";

export const GAME_IMAGE_MAX_SOURCE_BYTES_3D = 16 * 1024 * 1024;
export const GAME_IMAGE_MAX_DIMENSION_3D = 4096;
export const GAME_IMAGE_MAX_TEXTURE_BYTES_3D = 64 * 1024 * 1024;

type ImageFormat3D = PreparedGameImage3D["binding"]["format"];
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) { value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; }
  return value >>> 0;
});
function pngCrc(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 255] ?? 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function jpegExifOrientation(bytes: Uint8Array): number | undefined {
  if (bytes.length < 14 || bytes[0] !== 69 || bytes[1] !== 120 || bytes[2] !== 105 || bytes[3] !== 102 || bytes[4] !== 0 || bytes[5] !== 0) { return undefined; }
  const view = new DataView(bytes.buffer, bytes.byteOffset + 6, bytes.length - 6);
  const byteOrder = view.getUint16(0);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) { return undefined; }
  const littleEndian = byteOrder === 0x4949;
  if (view.getUint16(2, littleEndian) !== 42) { return undefined; }
  const offset = view.getUint32(4, littleEndian);
  if (offset < 8 || offset > view.byteLength - 2) { return undefined; }
  const count = view.getUint16(offset, littleEndian);
  if (count > Math.floor((view.byteLength - offset - 2) / 12)) { return undefined; }
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    if (view.getUint16(entry, littleEndian) !== 0x112 || view.getUint16(entry + 2, littleEndian) !== 3 || view.getUint32(entry + 4, littleEndian) !== 1) { continue; }
    const orientation = view.getUint16(entry + 8, littleEndian);
    if (orientation >= 1 && orientation <= 8) { return orientation; }
  }
  return undefined;
}
function dimensions(bytes: Uint8Array): { format: ImageFormat3D; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 33 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452) {
    let cursor = 8;
    let sawData = false;
    while (cursor + 12 <= bytes.length) {
      const length = view.getUint32(cursor);
      if (length > bytes.length - cursor - 12) { throw new Error("Truncated PNG chunk"); }
      const kind = view.getUint32(cursor + 4);
      if (view.getUint32(cursor + 8 + length) !== pngCrc(bytes.subarray(cursor + 4, cursor + 8 + length))) { throw new Error("PNG chunk checksum mismatch"); }
      if (kind === 0x49484452 && cursor !== 8) { throw new Error("Duplicate PNG image header"); }
      if (kind === 0x49444154) { sawData = true; }
      cursor += length + 12;
      if (kind === 0x49454e44) {
        if (length !== 0 || cursor !== bytes.length || !sawData) { throw new Error("Malformed PNG end chunk"); }
        return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
      }
    }
    throw new Error("PNG requires complete image data and end chunks");
  }
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8 && view.getUint16(bytes.length - 2) === 0xffd9) {
    let cursor = 2;
    let size: { width: number; height: number } | undefined;
    let orientation = 1;
    while (cursor + 2 <= bytes.length) {
      if (bytes[cursor] !== 255) { throw new Error("Malformed JPEG marker"); }
      const marker = bytes[cursor + 1];
      if (marker === 217 || marker === 218) { break; }
      if (cursor + 4 > bytes.length) { throw new Error("Truncated JPEG segment"); }
      const length = view.getUint16(cursor + 2);
      if (length < 2 || length > bytes.length - cursor - 2) { throw new Error("Truncated JPEG segment"); }
      if (marker === 225) { orientation = jpegExifOrientation(bytes.subarray(cursor + 4, cursor + 2 + length)) ?? orientation; }
      if (marker !== undefined && [192, 193, 194].includes(marker) && length >= 8) {
        size = { width: view.getUint16(cursor + 7), height: view.getUint16(cursor + 5) };
      }
      cursor += length + 2;
    }
    if (size) { return { format: "jpeg", width: orientation >= 5 ? size.height : size.width, height: orientation >= 5 ? size.width : size.height }; }
  }
  if (bytes.length >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250 && view.getUint32(4, true) === bytes.length - 8) {
    const kind = view.getUint32(12);
    const length = view.getUint32(16, true);
    if (length > bytes.length - 20) { throw new Error("Truncated WebP chunk"); }
    if (kind === 0x56503858 && length === 10) {
      const width = 1 + view.getUint8(24) + view.getUint8(25) * 256 + view.getUint8(26) * 65536;
      const height = 1 + view.getUint8(27) + view.getUint8(28) * 256 + view.getUint8(29) * 65536;
      return { format: "webp", width, height };
    }
    if (kind === 0x56503820 && length >= 10 && view.getUint8(23) === 0x9d && view.getUint8(24) === 1 && view.getUint8(25) === 0x2a) {
      return { format: "webp", width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (kind === 0x5650384c && length >= 5 && view.getUint8(20) === 0x2f) {
      const bits = view.getUint32(21, true);
      return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  throw new Error("Expected a complete PNG, JPEG or WebP image");
}

/** Checks encoded identity and decoded allocation bounds before handing bytes to an image decoder. */
export async function prepareGameImage3D(source: Uint8Array, options: { readonly assetId: string; readonly expectedDigest?: string; readonly signal?: AbortSignal }): Promise<
  | { readonly ok: true; readonly image: PreparedGameImage3D }
  | { readonly ok: false; readonly diagnostics: readonly GameModelDiagnostic[] }
> {
  options.signal?.throwIfAborted();
  try {
    if (source.length === 0 || source.length > GAME_IMAGE_MAX_SOURCE_BYTES_3D) { throw new Error("Image source exceeds byte bounds"); }
    const bytes = new Uint8Array(source);
    const size = dimensions(bytes);
    if (size.width < 1 || size.height < 1 || size.width > GAME_IMAGE_MAX_DIMENSION_3D || size.height > GAME_IMAGE_MAX_DIMENSION_3D ||
      size.width * size.height * 4 > GAME_IMAGE_MAX_TEXTURE_BYTES_3D) { throw new Error("Image dimensions exceed texture allocation bounds"); }
    const digestBytes = await crypto.subtle.digest("SHA-256", bytes);
    options.signal?.throwIfAborted();
    const digest = Array.from(new Uint8Array(digestBytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (options.expectedDigest !== undefined && digest !== options.expectedDigest) { throw new Error("Image digest does not match binding"); }
    return { ok: true, image: { bytes, binding: { mediaKind: "image", assetId: options.assetId, digest, required: true,
      ...size, byteLength: bytes.length, preparationVersion: "1" } } };
  } catch (error) {
    options.signal?.throwIfAborted();
    return { ok: false, diagnostics: [{ code: "image.preparation", path: "", message: error instanceof Error ? error.message : "Invalid image" }] };
  }
}
