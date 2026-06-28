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
import { importHidden } from "@nodetool-ai/config";
import { isRawRgbaImage, type ImageRef } from "@nodetool-ai/protocol";

type SharpFn = typeof import("sharp");
type SharpModule = SharpFn | { default: SharpFn };

let _sharpPromise: Promise<SharpFn | null> | null = null;

/**
 * Actionable error for a missing/broken `sharp` native addon, thrown by the
 * raw-RGBA → PNG encoder when {@link loadSharp} resolves null and no Canvas
 * fallback applies.
 */
export const SHARP_UNAVAILABLE_MESSAGE =
  "The 'sharp' image codec is unavailable. It is a native addon that must be " +
  "installed for this runtime (run `npm install sharp` in the server install, " +
  "or reinstall it for your platform/arch — e.g. musl or a serverless target). " +
  "Raw-RGBA images cannot be encoded to PNG here without sharp or a Canvas.";

/**
 * Lazily load `sharp`. Resolves `null` — never throws an opaque module-load
 * error — off Node (browser/edge) or when the Node native addon can't load
 * (musl, unbundled serverless, ABI mismatch, partial install). A rejected
 * attempt is never cached, so a fixed install is picked up on the next call.
 * Callers handle `null` with a Canvas fallback or a clear, actionable error.
 */
async function loadSharp(): Promise<SharpFn | null> {
  if (!_sharpPromise) {
    // The attempt rejects when the import throws (broken addon: musl, ABI
    // mismatch, partial install) so the `.catch` below can drop it from the
    // cache and a later, fixed install is picked up. A legitimate off-Node
    // `null` resolves and is cached — there is nothing to retry there.
    const attempt = (async (): Promise<SharpFn | null> => {
      const mod = await importHidden<SharpModule>("sharp");
      if (!mod) return null;
      return (mod as { default?: SharpFn }).default ?? (mod as SharpFn);
    })();
    _sharpPromise = attempt;
    attempt.catch(() => {
      if (_sharpPromise === attempt) _sharpPromise = null;
    });
  }
  // Never surface an opaque module-load error to callers; a broken addon is
  // reported as `null` (caller falls back to Canvas or a clear, actionable
  // error). The cache reset above already happened on the rejected attempt.
  return _sharpPromise.catch(() => null);
}

/** Encode raw straight-alpha RGBA8 pixels to PNG bytes. */
export async function encodeRawRgbaToPng(
  data: Uint8Array,
  width: number,
  height: number
): Promise<Uint8Array> {
  const sharp = await loadSharp();
  if (!sharp) {
    // No sharp (off Node, or a Node target where the addon won't load). Use
    // OffscreenCanvas when the runtime exposes one (a bundled browser/edge or a
    // Node build with Canvas); otherwise fail with a clear, actionable error.
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(data), width, height),
        0,
        0
      );
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await blob.arrayBuffer());
    }
    throw new Error(SHARP_UNAVAILABLE_MESSAGE);
  }
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

/** A crop box in source-image pixels. */
export interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Decode encoded image bytes (PNG/JPEG/WebP/…), optionally crop to a pixel
 * `region` and/or downscale so the longest side fits `maxSide`, then re-encode
 * to PNG. Used by the `view_image` tool to load only the pixels an agent asks
 * for — a region crop and a "low" detail downscale both cut the token cost of
 * the image the model actually sees.
 *
 * Coordinates are clamped to the image bounds, so an over-large or partly
 * out-of-frame region yields the overlapping area rather than an error. When
 * `sharp` is unavailable (off Node, or a broken native addon) the original
 * bytes are returned unchanged with `width`/`height` 0 — the caller still gets
 * a viewable full image, just uncropped.
 */
export async function extractImageRegion(
  bytes: Uint8Array,
  opts: { region?: ImageRegion; maxSide?: number } = {}
): Promise<{ data: Uint8Array; mimeType: string; width: number; height: number }> {
  const sharp = await loadSharp();
  if (!sharp) {
    return { data: bytes, mimeType: "image/png", width: 0, height: 0 };
  }

  let pipeline = sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    failOn: "none"
  });
  const meta = await pipeline.metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;

  const region = opts.region;
  if (region) {
    const left = Math.max(0, Math.min(Math.floor(region.x), Math.max(0, srcW - 1)));
    const top = Math.max(0, Math.min(Math.floor(region.y), Math.max(0, srcH - 1)));
    const maxW = srcW ? srcW - left : Math.floor(region.width);
    const maxH = srcH ? srcH - top : Math.floor(region.height);
    const width = Math.max(1, Math.min(Math.floor(region.width), maxW));
    const height = Math.max(1, Math.min(Math.floor(region.height), maxH));
    pipeline = pipeline.extract({ left, top, width, height });
  }

  if (opts.maxSide && opts.maxSide > 0) {
    pipeline = pipeline.resize({
      width: opts.maxSide,
      height: opts.maxSide,
      fit: "inside",
      withoutEnlargement: true
    });
  }

  const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data),
    mimeType: "image/png",
    width: info.width,
    height: info.height
  };
}
