/**
 * maskRender — rasterize a clip's shape mask to an `ImageBitmap` the GPU
 * compositor multiplies into a layer's alpha.
 *
 * The coverage itself is drawn by `drawMask` from `@nodetool-ai/timeline/render`
 * — the same rasterization the server render and the Canvas 2D path use — so a
 * feathered ellipse cuts the same silhouette wherever the frame is composited.
 * Only the bitmap cache lives here, the way it does for text and shapes.
 *
 * The mask is authored in the layer's own normalized space and sampled that
 * way, so it is drawn at the layer's source size: coverage and pixels then line
 * up one to one, and a mask on a 4K clip is not rasterized at preview scale.
 */

import type { ClipMask } from "@nodetool-ai/timeline";
import { drawMask, maskSignature } from "@nodetool-ai/timeline/render";

import type { CompositeSource } from "./gpu/types";
import { sourceDimensions } from "./gpu/source";

const MAX_CACHE_ENTRIES = 32;
/** Beyond this a coverage raster costs more than the edge it buys. */
const MAX_RASTER_SIZE = 2048;

export class MaskRasterizer {
  private cache = new Map<string, ImageBitmap>();

  /**
   * The coverage for `mask` at the size of the layer it cuts. Null when the
   * host cannot rasterize (no `OffscreenCanvas`), the source has no size yet,
   * or the mask names a kind this build does not draw — the layer then composites
   * unmasked, which the validator reports as `mask_path_invalid`.
   */
  rasterize(mask: ClipMask, source: CompositeSource): ImageBitmap | null {
    if (typeof OffscreenCanvas === "undefined") return null;
    const dims = sourceDimensions(source);
    if (dims.width <= 0 || dims.height <= 0) return null;
    const scale = Math.min(
      1,
      MAX_RASTER_SIZE / Math.max(dims.width, dims.height)
    );
    const width = Math.max(1, Math.round(dims.width * scale));
    const height = Math.max(1, Math.round(dims.height * scale));

    const key = maskSignature(mask, width, height);
    const hit = this.cache.get(key);
    if (hit) return hit;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (!drawMask(ctx, mask, width, height)) return null;
    const bitmap = canvas.transferToImageBitmap();

    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.get(oldest)?.close();
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, bitmap);
    return bitmap;
  }

  dispose(): void {
    for (const bitmap of this.cache.values()) bitmap.close();
    this.cache.clear();
  }
}
