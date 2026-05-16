/**
 * Browser implementation of `ImageRuntime` using OffscreenCanvas, falling back
 * to `HTMLCanvasElement` in environments where OffscreenCanvas is unavailable.
 *
 * This module is BROWSER-ONLY. It must never import node-only modules (sharp,
 * fs, @napi-rs/canvas, etc.). Server-side execution lives in
 * `packages/base-nodes/src/image-runtime/node.ts`; the contract is shared.
 *
 * VENDORED for the live-preview spike. Mirror of
 * `packages/base-nodes/src/image-runtime/browser.ts`. We avoid taking a
 * web → base-nodes workspace dependency because base-nodes pulls in sharp
 * and other node-only modules. Long-term fix: hoist `image-runtime/` into
 * its own tiny workspace package both consume.
 *
 * Encoding: every op returns PNG bytes via `convertToBlob({ type: 'image/png' })`
 * (OffscreenCanvas) or `toBlob` (HTMLCanvasElement). Empty input short-circuits
 * to a returned no-op per the contract.
 */

import {
  type ImageBytes,
  type ImageRuntime,
  isEmpty
} from "./imageRuntimeContract";

// ---------- pure geometry helpers (tested in isolation) ---------------------

/**
 * Compute proportional dimensions that fit `srcW × srcH` inside `fitW × fitH`.
 * When either target dim is undefined, the other constrains. Returns the source
 * dims unchanged if no target is given.
 */
export function computeFitScale(
  srcW: number,
  srcH: number,
  fitW: number | undefined,
  fitH: number | undefined
): { width: number; height: number; scale: number } {
  if (srcW <= 0 || srcH <= 0) return { width: srcW, height: srcH, scale: 1 };
  const sw = fitW !== undefined ? fitW / srcW : Infinity;
  const sh = fitH !== undefined ? fitH / srcH : Infinity;
  const scale = Math.min(sw, sh);
  if (!Number.isFinite(scale) || scale <= 0) {
    return { width: srcW, height: srcH, scale: 1 };
  }
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
    scale
  };
}

/**
 * Compute target dimensions for a free (non-fit) resize. When only one of
 * `width`/`height` is given, the other is derived to preserve aspect ratio.
 */
export function computeResizeDims(
  srcW: number,
  srcH: number,
  reqW: number | undefined,
  reqH: number | undefined
): { width: number; height: number } {
  if (reqW !== undefined && reqH !== undefined) {
    return { width: Math.max(1, Math.round(reqW)), height: Math.max(1, Math.round(reqH)) };
  }
  if (reqW !== undefined) {
    const h = srcH > 0 ? Math.max(1, Math.round((reqW / srcW) * srcH)) : srcH;
    return { width: Math.max(1, Math.round(reqW)), height: h };
  }
  if (reqH !== undefined) {
    const w = srcW > 0 ? Math.max(1, Math.round((reqH / srcH) * srcW)) : srcW;
    return { width: w, height: Math.max(1, Math.round(reqH)) };
  }
  return { width: srcW, height: srcH };
}

/**
 * Compute output canvas dimensions for a rotation. Odd 90° multiples swap
 * width/height; otherwise dimensions are unchanged (we don't expand the canvas
 * for arbitrary angles in the spike — corners are cropped, like sharp's default).
 */
export function computeRotatedDims(
  srcW: number,
  srcH: number,
  angleDeg: number
): { width: number; height: number } {
  const normalized = ((angleDeg % 360) + 360) % 360;
  if (normalized === 90 || normalized === 270) {
    return { width: srcH, height: srcW };
  }
  return { width: srcW, height: srcH };
}

// ---------- canvas / bitmap helpers ----------------------------------------

/**
 * Wrap raw image bytes in a Blob and decode them to an `ImageBitmap`.
 * `createImageBitmap` handles PNG/JPEG/WEBP/etc. automatically.
 */
export async function bytesToImageBitmap(
  bytes: Uint8Array,
  mime: string = "image/png"
): Promise<ImageBitmap> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  return createImageBitmap(blob);
}

/**
 * Create a drawable canvas. Prefers `OffscreenCanvas`; falls back to a detached
 * `HTMLCanvasElement` when OffscreenCanvas isn't available (older browsers,
 * jsdom without polyfill).
 */
function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  throw new Error(
    "browserImageRuntime: no OffscreenCanvas and no document. Run in a browser or jsdom with canvas polyfill."
  );
}

function get2DContext(
  canvas: OffscreenCanvas | HTMLCanvasElement
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("browserImageRuntime: failed to obtain 2D context");
  return ctx;
}

/**
 * Encode a canvas to PNG bytes and return as `ImageBytes`. Uses
 * `convertToBlob` (OffscreenCanvas) or `toBlob` (HTMLCanvasElement).
 */
export async function canvasToImageBytes(
  canvas: OffscreenCanvas | HTMLCanvasElement
): Promise<ImageBytes> {
  const width = canvas.width;
  const height = canvas.height;
  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    blob = await canvas.convertToBlob({ type: "image/png" });
  } else {
    const html = canvas as HTMLCanvasElement;
    blob = await new Promise<Blob>((resolve, reject) => {
      html.toBlob(b => {
        if (b) resolve(b);
        else reject(new Error("HTMLCanvasElement.toBlob returned null"));
      }, "image/png");
    });
  }
  const buffer = await blob.arrayBuffer();
  return {
    data: new Uint8Array(buffer),
    width,
    height,
    mimeType: "image/png"
  };
}

// ---------- runtime ---------------------------------------------------------

function noop(image: ImageBytes): ImageBytes {
  return image;
}

export function createBrowserImageRuntime(): ImageRuntime {
  async function decode(image: ImageBytes): Promise<ImageBitmap> {
    return bytesToImageBitmap(image.data, image.mimeType ?? "image/png");
  }

  return {
    async resize(image, opts) {
      if (isEmpty(image)) return noop(image);
      const bitmap = await decode(image);
      try {
        const dims = opts.fit
          ? computeFitScale(bitmap.width, bitmap.height, opts.width, opts.height)
          : computeResizeDims(bitmap.width, bitmap.height, opts.width, opts.height);
        const canvas = makeCanvas(dims.width, dims.height);
        const ctx = get2DContext(canvas);
        // Use higher-quality smoothing by default; "nearest" disables it.
        ctx.imageSmoothingEnabled = opts.filter !== "nearest";
        if (ctx.imageSmoothingEnabled) {
          ctx.imageSmoothingQuality = opts.filter === "lanczos" ? "high" : "medium";
        }
        ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);
        return canvasToImageBytes(canvas);
      } finally {
        bitmap.close?.();
      }
    },

    async crop(image, opts) {
      if (isEmpty(image)) return noop(image);
      const bitmap = await decode(image);
      try {
        const sx = Math.max(0, Math.floor(opts.x));
        const sy = Math.max(0, Math.floor(opts.y));
        const sw = Math.max(1, Math.min(Math.floor(opts.width), bitmap.width - sx));
        const sh = Math.max(1, Math.min(Math.floor(opts.height), bitmap.height - sy));
        const canvas = makeCanvas(sw, sh);
        const ctx = get2DContext(canvas);
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
        return canvasToImageBytes(canvas);
      } finally {
        bitmap.close?.();
      }
    },

    async rotate(image, opts) {
      if (isEmpty(image)) return noop(image);
      const bitmap = await decode(image);
      try {
        const { width, height } = computeRotatedDims(bitmap.width, bitmap.height, opts.angle);
        const canvas = makeCanvas(width, height);
        const ctx = get2DContext(canvas);
        if (opts.background) {
          ctx.fillStyle = opts.background;
          ctx.fillRect(0, 0, width, height);
        }
        ctx.translate(width / 2, height / 2);
        ctx.rotate((opts.angle * Math.PI) / 180);
        ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        return canvasToImageBytes(canvas);
      } finally {
        bitmap.close?.();
      }
    },

    async flip(image, opts) {
      if (isEmpty(image)) return noop(image);
      const horizontal = opts.horizontal === true;
      const vertical = opts.vertical === true;
      if (!horizontal && !vertical) return noop(image);
      const bitmap = await decode(image);
      try {
        const canvas = makeCanvas(bitmap.width, bitmap.height);
        const ctx = get2DContext(canvas);
        ctx.translate(horizontal ? bitmap.width : 0, vertical ? bitmap.height : 0);
        ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
        ctx.drawImage(bitmap, 0, 0);
        return canvasToImageBytes(canvas);
      } finally {
        bitmap.close?.();
      }
    },

    async blur(image, opts) {
      if (isEmpty(image)) return noop(image);
      // NOTE: Canvas `filter: blur(...)` is Gaussian; the spike treats
      // `opts.kind === "box"` the same. A real box-blur would need a manual
      // convolution pass or a WebGL/WebGPU shader.
      const bitmap = await decode(image);
      try {
        const canvas = makeCanvas(bitmap.width, bitmap.height);
        const ctx = get2DContext(canvas);
        const radius = Math.max(0, opts.radius);
        if (radius > 0) ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(bitmap, 0, 0);
        return canvasToImageBytes(canvas);
      } finally {
        bitmap.close?.();
      }
    }
  };
}

/** Shared singleton for callers that don't need a fresh instance. */
export const browserImageRuntime: ImageRuntime = createBrowserImageRuntime();
