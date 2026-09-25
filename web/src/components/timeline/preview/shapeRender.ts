/**
 * shapeRender — rasterise a shape clip to an `ImageBitmap`. The geometry is
 * drawn by `@nodetool-ai/timeline/render`, shared with the server-side
 * renderer; the bitmap cache stays here.
 */

import type { ClipShapeStyle } from "@nodetool-ai/timeline";
import { drawShape, shapeStyleSignature } from "@nodetool-ai/timeline/render";
import { BitmapFrameScope, bitmapByteSize } from "./BitmapFrameScope";

export const SHAPE_BITMAP_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;

export class ShapeRasterizer {
  private cache = new Map<string, ImageBitmap>();
  private pins = new Map<ImageBitmap, number>();
  private owned = new Set<ImageBitmap>();
  private deferredClose = new Set<ImageBitmap>();
  private ownedBytes = 0;

  get residentBytes(): number {
    return this.ownedBytes;
  }

  private close(bitmap: ImageBitmap): void {
    if (!this.owned.delete(bitmap)) return;
    this.ownedBytes -= bitmapByteSize(bitmap);
    bitmap.close();
  }

  private retire(bitmap: ImageBitmap): void {
    if (this.pins.has(bitmap)) this.deferredClose.add(bitmap);
    else this.close(bitmap);
  }

  private pin(bitmap: ImageBitmap, scope?: BitmapFrameScope): void {
    if (!scope) return;
    const added = scope.pin(bitmap, () => {
      const count = (this.pins.get(bitmap) ?? 1) - 1;
      if (count === 0) {
        this.pins.delete(bitmap);
        if (this.deferredClose.delete(bitmap)) this.close(bitmap);
      } else this.pins.set(bitmap, count);
      this.evictToBudget();
    });
    if (added) this.pins.set(bitmap, (this.pins.get(bitmap) ?? 0) + 1);
  }

  private evictToBudget(): void {
    while (this.residentBytes > SHAPE_BITMAP_CACHE_BUDGET_BYTES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      const bitmap = this.cache.get(oldest);
      this.cache.delete(oldest);
      if (bitmap) this.retire(bitmap);
    }
  }

  rasterize(
    style: ClipShapeStyle,
    width: number,
    height: number,
    frameScope: BitmapFrameScope
  ): ImageBitmap | null {
    if (typeof OffscreenCanvas === "undefined" || width <= 0 || height <= 0) {
      return null;
    }
    const key = shapeStyleSignature(style, width, height);
    const hit = this.cache.get(key);
    if (hit) {
      this.pin(hit, frameScope);
      return hit;
    }
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawShape(ctx, style, width, height);
    const bitmap = canvas.transferToImageBitmap();
    if (!this.owned.has(bitmap)) {
      this.owned.add(bitmap);
      this.ownedBytes += bitmapByteSize(bitmap);
    }
    this.pin(bitmap, frameScope);
    this.cache.set(key, bitmap);
    this.evictToBudget();
    return bitmap;
  }
  dispose(): void {
    for (const bitmap of this.cache.values()) this.retire(bitmap);
    this.cache.clear();
    for (const bitmap of [...this.owned]) this.retire(bitmap);
  }
}
