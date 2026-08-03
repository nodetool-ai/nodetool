/**
 * shapeRender — rasterise a shape clip to an `ImageBitmap`. The geometry is
 * drawn by `@nodetool-ai/timeline/render`, shared with the server-side
 * renderer; the bitmap cache stays here.
 */

import type { ClipShapeStyle } from "@nodetool-ai/timeline";
import { drawShape, shapeStyleSignature } from "@nodetool-ai/timeline/render";

const MAX_CACHE_ENTRIES = 64;

export class ShapeRasterizer {
  private cache = new Map<string, ImageBitmap>();
  rasterize(
    style: ClipShapeStyle,
    width: number,
    height: number
  ): ImageBitmap | null {
    if (typeof OffscreenCanvas === "undefined" || width <= 0 || height <= 0) {
      return null;
    }
    const key = shapeStyleSignature(style, width, height);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawShape(ctx, style, width, height);
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
