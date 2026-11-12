// Guest half of the host image capability (src/host/image.cpp): the codec
// seam of @nodetool-ai/image-nodes (image-io). In the browser that module
// decodes and encodes through Canvas and on Node through sharp. Neither
// exists in QuickJS, so these replacements decode with the host's codec and
// read GPU-texture refs back through the gpu capability (gpu.mjs).
// guest/host/plugins.mjs makes the swap at bundle time. The other image-io
// exports stay the real ones.
import { isBitmapImage, isGpuTextureImage, isRawRgbaImage, RAW_RGBA_MIME } from "@nodetool-ai/protocol";
import { isNumber, isObjectLike } from "@nodetool-ai/node-sdk";
import { encodedImageBytes, readbackTextureRef } from "./gpu.mjs";

function codec() {
  const host = globalThis.__host?.image;
  if (!host) throw new Error("The native runner has no host image codec capability");
  return host;
}

function rawRgbaImageRef(rgba, width, height) {
  return { type: "image", data: rgba, mimeType: RAW_RGBA_MIME, width, height };
}

/**
 * Straight-alpha RGBA8 to PNG bytes, encoded on the run's CPU lane from a
 * copy taken at the call. Empty input gives empty bytes.
 */
export async function encodeRgbaToPng(data, width, height) {
  if (data.length === 0 || width === 0 || height === 0) return new Uint8Array();
  return codec().encodePngAsync(data, width, height);
}

export async function loadImageBytes(ref, context) {
  if (isRawRgbaImage(ref)) return encodeRgbaToPng(ref.data, ref.width, ref.height);
  if (isGpuTextureImage(ref)) {
    const { rgba, width, height } = await readbackTextureRef(ref);
    return encodeRgbaToPng(rgba, width, height);
  }
  return encodedImageBytes(ref, context);
}

export async function decodeRgba(image, context) {
  if (isRawRgbaImage(image)) return { rgba: image.data, width: image.width, height: image.height };
  if (isGpuTextureImage(image)) return readbackTextureRef(image);
  if (isBitmapImage(image)) throw new Error("ImageBitmap images exist only in the browser runner");
  const bytes = await loadImageBytes(image, context);
  if (bytes.length === 0) return { rgba: new Uint8Array(), width: 0, height: 0 };
  return codec().decode(bytes);
}

export async function imageDimensions(image, context) {
  if (isRawRgbaImage(image) || isGpuTextureImage(image) || isBitmapImage(image)) {
    return { width: image.width, height: image.height };
  }
  if (isObjectLike(image)) {
    const { width, height } = image;
    if (isNumber(width) && isNumber(height) && width > 0 && height > 0) return { width, height };
  }
  const bytes = await loadImageBytes(image, context);
  if (bytes.length === 0) return { width: 0, height: 0 };
  return codec().info(bytes);
}

export async function encodePngFromRef(ref) {
  if (isGpuTextureImage(ref)) {
    const { rgba, width, height } = await readbackTextureRef(ref);
    return encodeRgbaToPng(rgba, width, height);
  }
  if (isBitmapImage(ref)) throw new Error("ImageBitmap images exist only in the browser runner");
  const { data, width = 0, height = 0 } = ref;
  if (!(data instanceof Uint8Array) || width === 0 || height === 0) {
    return data instanceof Uint8Array ? data : new Uint8Array();
  }
  return encodeRgbaToPng(data, width, height);
}

export async function resolveImageRefForTransport(value) {
  if (isGpuTextureImage(value)) {
    const { rgba, width, height } = await readbackTextureRef(value);
    return rawRgbaImageRef(rgba, width, height);
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => resolveImageRefForTransport(v)));
  if (isObjectLike(value) && !ArrayBuffer.isView(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await resolveImageRefForTransport(v)])
    );
    return Object.fromEntries(entries);
  }
  return value;
}

export { loadSharp } from "./sharp.mjs";
