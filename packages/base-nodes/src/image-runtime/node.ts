/**
 * Node.js implementation of `ImageRuntime`, backed by sharp.
 *
 * Pure: each call creates a fresh sharp pipeline from the input bytes. The
 * server uses this when nodes call into the runtime; the contract is
 * environment-agnostic so the same node code runs against the browser
 * implementation during live preview.
 *
 * Output is always re-encoded as PNG to match the contract's "fresh
 * `ImageBytes` with re-encoded PNG bytes" promise. The width/height fields
 * are read back from sharp's metadata so the caller sees authoritative
 * post-op dimensions, not stale input hints.
 */

import sharp from "sharp";
import type { ImageBytes, ImageRuntime, ResizeOptions } from "./index.js";
import { EMPTY_IMAGE, isEmpty } from "./index.js";

const OUTPUT_MIME = "image/png";

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

async function finalize(pipeline: sharp.Sharp): Promise<ImageBytes> {
  const out = await pipeline.png().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(out.data),
    width: out.info.width,
    height: out.info.height,
    mimeType: OUTPUT_MIME
  };
}

function makePipeline(image: ImageBytes): sharp.Sharp {
  // failOn:none mirrors the existing nodes/image.ts choice — we'd rather
  // pass through a slightly broken image than abort the whole workflow.
  return sharp(toBuffer(image.data), { failOn: "none" });
}

/**
 * Map our resampling hint onto a sharp kernel. sharp's kernels:
 *   nearest | cubic | mitchell | lanczos2 | lanczos3 (default).
 * We pick the closest match per contract.
 */
function resolveKernel(filter: ResizeOptions["filter"]): keyof sharp.KernelEnum {
  switch (filter) {
    case "nearest":
      return "nearest";
    case "bilinear":
      // sharp has no plain bilinear; mitchell is the next-best cheap choice.
      return "mitchell";
    case "lanczos":
    default:
      return "lanczos3";
  }
}

/**
 * Parse a CSS-ish color string into sharp's RGBA object. Accepts:
 *   #rgb | #rrggbb | #rrggbbaa | "transparent" | undefined (= transparent).
 * Anything we can't parse falls back to transparent — matches sharp's
 * default for revealed corners.
 */
function parseColor(input: string | undefined): sharp.Color {
  if (!input || input.toLowerCase() === "transparent") {
    return { r: 0, g: 0, b: 0, alpha: 0 };
  }
  const hex = input.startsWith("#") ? input.slice(1) : input;
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if ([r, g, b].every(Number.isFinite)) return { r, g, b, alpha: 1 };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].every(Number.isFinite)) return { r, g, b, alpha: a };
  }
  return { r: 0, g: 0, b: 0, alpha: 0 };
}

export function createNodeImageRuntime(): ImageRuntime {
  return {
    async resize(image, opts) {
      if (isEmpty(image)) return EMPTY_IMAGE;
      const width = opts.width && opts.width > 0 ? opts.width : undefined;
      const height = opts.height && opts.height > 0 ? opts.height : undefined;
      if (width === undefined && height === undefined) {
        // Nothing to do — re-encode to honor "fresh ImageBytes" contract.
        return finalize(makePipeline(image));
      }
      return finalize(
        makePipeline(image).resize(width, height, {
          fit: opts.fit ? "inside" : "fill",
          kernel: resolveKernel(opts.filter)
        })
      );
    },

    async crop(image, opts) {
      if (isEmpty(image)) return EMPTY_IMAGE;
      const left = Math.max(0, Math.floor(opts.x));
      const top = Math.max(0, Math.floor(opts.y));
      const width = Math.max(1, Math.floor(opts.width));
      const height = Math.max(1, Math.floor(opts.height));
      return finalize(
        makePipeline(image).extract({ left, top, width, height })
      );
    },

    async rotate(image, opts) {
      if (isEmpty(image)) return EMPTY_IMAGE;
      return finalize(
        makePipeline(image).rotate(opts.angle, {
          background: parseColor(opts.background)
        })
      );
    },

    async flip(image, opts) {
      if (isEmpty(image)) return EMPTY_IMAGE;
      // sharp: .flip() is vertical (top-to-bottom), .flop() is horizontal.
      let p = makePipeline(image);
      if (opts.horizontal) p = p.flop();
      if (opts.vertical) p = p.flip();
      return finalize(p);
    },

    async blur(image, opts) {
      if (isEmpty(image)) return EMPTY_IMAGE;
      // sharp's `.blur(sigma)` is gaussian. There's no native box kernel;
      // treat opts.kind === "box" as a request that we map to the closest
      // available primitive (gaussian) rather than approximating with
      // multiple passes. The contract allows implementations to pick the
      // closest match.
      const sigma = Math.max(0.3, opts.radius);
      return finalize(makePipeline(image).blur(sigma));
    }
  };
}

/**
 * Process-wide singleton. Stateless — safe to share across calls.
 */
export const nodeImageRuntime: ImageRuntime = createNodeImageRuntime();
