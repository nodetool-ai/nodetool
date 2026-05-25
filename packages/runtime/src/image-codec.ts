/**
 * Image codec helpers for the raw-RGBA in-flight format.
 *
 * GPU image ops emit `ImageRef`s whose `data` is raw straight-alpha RGBA8
 * (marked by `mimeType === RAW_RGBA_MIME`) so adjacent GPU ops skip the codec.
 * Any boundary that needs portable bytes (client, storage, file save, the
 * Python bridge) lazily encodes them to PNG via these helpers. Everything else
 * must go through the shared decode/encode paths rather than assume `data` is
 * already an encoded image.
 */
import sharp from "sharp";
import { isRawRgbaImage, type ImageRef } from "@nodetool-ai/protocol";

/** Encode raw straight-alpha RGBA8 pixels to PNG bytes. */
export async function encodeRawRgbaToPng(
  data: Uint8Array,
  width: number,
  height: number
): Promise<Uint8Array> {
  const png = await sharp(
    Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    { raw: { width, height, channels: 4 } }
  )
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

/**
 * If `ref` is a raw-RGBA image, return an equivalent ImageRef with `data`
 * encoded to PNG and `mimeType` set to `image/png`; otherwise return it
 * unchanged. Use at any boundary that must hand out a portable image.
 */
export async function encodeRawImageRef(ref: unknown): Promise<unknown> {
  if (!isRawRgbaImage(ref)) return ref;
  const png = await encodeRawRgbaToPng(ref.data, ref.width, ref.height);
  return { ...(ref as ImageRef), data: png, mimeType: "image/png" };
}
