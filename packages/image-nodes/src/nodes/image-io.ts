/// <reference lib="dom" />
/**
 * Environment-aware, sharp-free image I/O for the GPU shader nodes.
 *
 * The GPU image nodes run on both Node (Dawn device + `sharp` codec) and the
 * browser (`navigator.gpu` device + Canvas codec). This module is the codec
 * seam: it decodes encoded image bytes to straight-alpha RGBA and re-encodes
 * RGBA to PNG, picking the Canvas path in the browser and lazily loading
 * `sharp` on Node. Keeping it free of any *static* `sharp` import is what lets
 * the GPU node files bundle for the browser (`sharp` is a native addon that the
 * web bundle must never resolve).
 *
 * It deliberately does not live in the big `image.ts` (which stays Node-only
 * and keeps its static `sharp` import for the legacy sharp nodes). The GPU
 * nodes import their codec from here instead.
 */
import {
  isRawRgbaImage,
  isGpuTextureImage,
  isBitmapImage,
  RAW_RGBA_MIME,
  type ImageRef
} from "@nodetool-ai/protocol";
import { IS_NODE, importHidden } from "@nodetool-ai/config";
import {
  loadMediaRefBytes,
  type MediaRefValue
} from "@nodetool-ai/runtime/media-ref-bytes";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { readbackTextureRef } from "./gpu-device.js";

/** Straight-alpha RGBA8 pixels plus dimensions — the GPU upload contract. */
export interface RawRgba {
  rgba: Uint8Array;
  width: number;
  height: number;
}

/**
 * Build a raw-RGBA `ImageRef`: `data` carries straight-alpha RGBA8 pixels and
 * `mimeType` marks it as the in-flight raw format. GPU ops emit this so an
 * adjacent GPU op reuses the pixels via {@link decodeRgba} instead of decoding
 * an encoded image; the bytes are lazily encoded to PNG at any boundary that
 * needs a portable image.
 */
export function rawRgbaImageRef(
  rgba: Uint8Array,
  width: number,
  height: number
): ImageRef {
  return { type: "image", data: rgba, mimeType: RAW_RGBA_MIME, width, height };
}

/* -------------------------- base64 (Buffer-free) -------------------------- */

import { base64ToBytes, bytesToBase64 } from "@nodetool-ai/nodes-utils";
export { base64ToBytes, bytesToBase64 };

/** Strip a `data:...;base64,` prefix if present, returning the raw base64. */
function stripDataUrlPrefix(data: string): string {
  if (!data.startsWith("data:")) return data;
  const comma = data.indexOf(",");
  return comma >= 0 ? data.slice(comma + 1) : data;
}

/* ------------------------------ sharp (lazy) ------------------------------ */

type SharpFn = typeof import("sharp");
let _sharpPromise: Promise<SharpFn> | null = null;
/** Lazily load `sharp` via a bundler-hidden import; throws off Node. */
export async function loadSharp(): Promise<SharpFn> {
  if (!_sharpPromise) {
    _sharpPromise = (async () => {
      const mod = await importHidden<SharpFn | { default: SharpFn }>("sharp");
      if (!mod) throw new Error("sharp requires Node (not available in browser)");
      return (mod as { default?: SharpFn }).default ?? (mod as SharpFn);
    })();
  }
  return _sharpPromise;
}

/* ------------------------------ byte loading ------------------------------ */

/**
 * Resolve an image ref to encoded bytes, environment-aware and `Buffer`-free.
 *
 * Inline data and raw-RGBA are handled here; everything else delegates to the
 * shared {@link loadMediaRefBytes}. In the browser that loader returns `null`
 * for a relative `/api/...` URI (it only fetches absolute http(s)), so we fall
 * back to a direct `fetch`, which the browser resolves against the page origin.
 */
export async function loadImageBytes(
  ref: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!ref || typeof ref !== "object") return new Uint8Array();
  const r = ref as MediaRefValue;

  // Upstream GPU op left raw pixels — encode to PNG with the env-aware encoder
  // (never the sharp-only path in `loadMediaRefBytes`, which throws in browser).
  if (isRawRgbaImage(r)) {
    return encodeRgbaToPng(r.data, r.width, r.height);
  }
  // A preview-bitmap ref (the worker's transport format) — read the pixels
  // back off the bitmap, then encode.
  if (isBitmapImage(r)) {
    const { rgba, width, height } = await bitmapToRgba(r.bitmap as ImageBitmap);
    return encodeRgbaToPng(rgba, width, height);
  }
  if (r.data instanceof Uint8Array && r.data.length > 0) return r.data;
  if (typeof r.data === "string" && r.data.length > 0) {
    return base64ToBytes(stripDataUrlPrefix(r.data));
  }

  const viaLoader = await loadMediaRefBytes(r, context);
  if (viaLoader && viaLoader.length > 0) return viaLoader;

  // Browser: fetch a relative/origin URI (or one derived from asset_id).
  if (!IS_NODE) {
    const url =
      r.uri && r.uri.length > 0
        ? r.uri
        : r.asset_id
          ? `/api/storage/${r.asset_id}.png`
          : null;
    if (url) {
      try {
        const res = await fetch(url);
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
      } catch {
        // fall through to empty
      }
    }
  }
  return new Uint8Array();
}

/* --------------------------------- decode --------------------------------- */

/** Copy bytes into a fresh `ArrayBuffer` (a valid `BlobPart`, never shared). */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/**
 * Read the pixels of a preview `ImageBitmap` back to straight-alpha RGBA via
 * an OffscreenCanvas (browser only — bitmap refs never exist on Node). The
 * bitmap is left open: the UI may still be painting the same instance.
 */
export async function bitmapToRgba(bitmap: ImageBitmap): Promise<RawRgba> {
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { rgba: new Uint8Array(data.buffer.slice(0)), width, height };
}

/** Decode encoded image bytes to straight-alpha RGBA via Canvas (browser). */
async function decodeBytesBrowser(bytes: Uint8Array): Promise<RawRgba> {
  const bitmap = await createImageBitmap(new Blob([toArrayBuffer(bytes)]));
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { rgba: new Uint8Array(data.buffer.slice(0)), width, height };
}

/** Decode encoded image bytes to straight-alpha RGBA via sharp (Node). */
async function decodeBytesNode(bytes: Uint8Array): Promise<RawRgba> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(bytes, { failOn: "none" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height
  };
}

/**
 * Decode an image input to straight-alpha RGBA. Reuses the pixels directly when
 * the input is already raw (an upstream GPU op left them, no codec work);
 * otherwise loads and decodes the encoded bytes. Returns an empty buffer for
 * missing/empty input.
 */
export async function decodeRgba(
  image: unknown,
  context?: ProcessingContext
): Promise<RawRgba> {
  if (isRawRgbaImage(image)) {
    return { rgba: image.data, width: image.width, height: image.height };
  }
  // An in-flight GPU-texture ref — read its pixels back off the device.
  if (isGpuTextureImage(image)) {
    return readbackTextureRef(image);
  }
  // A preview-bitmap ref (e.g. a cached result re-injected into a single-node
  // run) — read the pixels off the bitmap, no codec work.
  if (isBitmapImage(image)) {
    return bitmapToRgba(image.bitmap as ImageBitmap);
  }
  const bytes = await loadImageBytes(image, context);
  if (bytes.length === 0) return { rgba: new Uint8Array(), width: 0, height: 0 };
  return IS_NODE ? decodeBytesNode(bytes) : decodeBytesBrowser(bytes);
}

/* --------------------------------- encode --------------------------------- */

/** Encode straight-alpha RGBA to PNG via Canvas (browser). Always 4-channel. */
async function encodeRgbaBrowser(
  data: Uint8Array,
  width: number,
  height: number
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Encode straight-alpha RGBA to PNG via sharp (Node). Drops a uniformly opaque
 * alpha plane so the PNG is 3-channel — matching the channel count the legacy
 * sharp pipelines produced (tests that index raw bytes with `* 3` depend on it).
 */
async function encodeRgbaNode(
  data: Uint8Array,
  width: number,
  height: number
): Promise<Uint8Array> {
  const sharp = await loadSharp();
  let allOpaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      allOpaque = false;
      break;
    }
  }
  let pipeline = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 }
  });
  if (allOpaque) pipeline = pipeline.removeAlpha();
  const png = await pipeline.png().toBuffer();
  return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
}

/** Encode straight-alpha RGBA8 pixels to PNG bytes, environment-aware. */
export async function encodeRgbaToPng(
  data: Uint8Array,
  width: number,
  height: number
): Promise<Uint8Array> {
  if (data.length === 0 || width === 0 || height === 0) return new Uint8Array();
  return IS_NODE
    ? encodeRgbaNode(data, width, height)
    : encodeRgbaBrowser(data, width, height);
}

/**
 * Encode a raw-RGBA `ImageRef` (the format {@link rawRgbaImageRef} produces)
 * to PNG bytes. Returns its `data` unchanged when it's already encoded bytes,
 * or an empty buffer when there's nothing to encode.
 */
export async function encodePngFromRef(ref: unknown): Promise<Uint8Array> {
  // In-flight GPU texture — read its pixels back, then encode.
  if (isGpuTextureImage(ref)) {
    const { rgba, width, height } = await readbackTextureRef(ref);
    return encodeRgbaToPng(rgba, width, height);
  }
  // Preview-bitmap ref — read the pixels off the bitmap, then encode.
  if (isBitmapImage(ref)) {
    const { rgba, width, height } = await bitmapToRgba(ref.bitmap as ImageBitmap);
    return encodeRgbaToPng(rgba, width, height);
  }
  const data = (ref as { data?: unknown }).data;
  const width = (ref as { width?: number }).width ?? 0;
  const height = (ref as { height?: number }).height ?? 0;
  if (!(data instanceof Uint8Array) || width === 0 || height === 0) {
    return data instanceof Uint8Array ? data : new Uint8Array();
  }
  return encodeRgbaToPng(data, width, height);
}

/**
 * Resolve any in-flight GPU-texture `ImageRef`s in `value` to a CPU backing
 * (raw-RGBA), recursively. Run at every boundary that serializes or leaves the
 * GPU device — a `GPUTexture` can't cross `postMessage`, persist, or reach the
 * server. The texture itself is left intact (the run-scoped registry frees it),
 * so a sibling edge still chains on the GPU; only the transported copy is read
 * back. Raw-RGBA (a `Uint8Array`) is serializable, so the result survives the
 * generation cache / property re-injection that single-node runs rely on — an
 * `ImageBitmap` would not. Non-texture values pass through unchanged.
 */
export async function resolveImageRefForTransport(
  value: unknown
): Promise<unknown> {
  if (isGpuTextureImage(value)) {
    const { rgba, width, height } = await readbackTextureRef(value);
    return rawRgbaImageRef(rgba, width, height);
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => resolveImageRefForTransport(v)));
  }
  if (value && typeof value === "object" && !ArrayBuffer.isView(value)) {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(
        async ([k, v]) => [k, await resolveImageRefForTransport(v)] as const
      )
    );
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Wrap freshly-encoded PNG bytes into a base64 `ImageRef`.
 *
 * The result is new content, so the input's source identifiers — `uri`,
 * `asset_id`, the previous `data`, and any raw-RGBA markers — are dropped.
 * Carrying them over is a bug: a stale `uri`/`asset_id` points at the *input*
 * asset and shadows the new `data` everywhere that prefers a uri (e.g. the
 * output preview would render the input image, not the processed output).
 * `base` is only mined for benign carry-over fields (e.g. type).
 */
export function toBase64Ref(
  png: Uint8Array,
  base?: unknown
): Record<string, unknown> {
  const seed =
    base && typeof base === "object" ? { ...(base as Record<string, unknown>) } : {};
  delete seed.mimeType;
  delete seed.width;
  delete seed.height;
  delete seed.uri;
  delete seed.asset_id;
  delete seed.data;
  return { type: "image", ...seed, data: bytesToBase64(png) };
}
