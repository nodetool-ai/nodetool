/**
 * captionRender — rasterise a {@link ResolvedCaption} to an `ImageBitmap`.
 *
 * The live {@link PreviewCompositor} and the offline {@link renderTimeline}
 * renderer both turn caption layers into GPU sources through this one helper,
 * so a caption looks identical in the preview and the exported MP4. The bitmap
 * is drawn at full frame resolution, so it composites with an identity
 * transform (no scaling, no positioning math at the GPU layer).
 *
 * A single fixed style is used for the MVP: bold, outlined, lower-third text
 * with the currently-spoken word highlighted.
 */

import type { ResolvedCaption } from "@nodetool-ai/timeline/render";
import { captionSignature, drawCaption } from "@nodetool-ai/timeline/render";
import { BitmapFrameScope, bitmapByteSize } from "./BitmapFrameScope";

/** Resident-bitmap budget, the same 64 MB `textRender` keeps. A caption bitmap
 *  is a full frame, so an entry count alone would hold 530 MB at 1080p. */
export const CAPTION_BITMAP_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;

export { captionSignature };

/**
 * Caches caption bitmaps by content signature so scrubbing or replaying the
 * same word doesn't re-rasterise. Stable bitmap identity also lets the GPU
 * compositor skip re-uploading an unchanged caption. One instance lives per
 * compositor (preview) or per render pass (export); call {@link dispose} to
 * release the bitmaps.
 */
export class CaptionRasterizer {
  private cache = new Map<string, ImageBitmap>();
  private pins = new Map<ImageBitmap, number>();
  private deferredClose = new Set<ImageBitmap>();

  private ownedBytes = 0;

  get residentBytes(): number {
    return this.ownedBytes;
  }

  private close(bitmap: ImageBitmap): void {
    this.ownedBytes -= bitmapByteSize(bitmap);
    bitmap.close();
  }

  private retire(bitmap: ImageBitmap): void {
    if (this.pins.has(bitmap)) this.deferredClose.add(bitmap);
    else this.close(bitmap);
  }

  private pin(bitmap: ImageBitmap, frameScope: BitmapFrameScope): void {
    if (!frameScope.pin(bitmap, () => {
      const remaining = (this.pins.get(bitmap) ?? 1) - 1;
      if (remaining === 0) {
        this.pins.delete(bitmap);
        if (this.deferredClose.delete(bitmap)) this.close(bitmap);
      } else {
        this.pins.set(bitmap, remaining);
      }
    })) return;
    this.pins.set(bitmap, (this.pins.get(bitmap) ?? 0) + 1);
  }
  /**
   * Memoize the content signature per caption object identity. A
   * `ResolvedCaption` is rebuilt each frame the *content* changes, so an
   * unchanged reference means an unchanged signature — let us skip the
   * per-word string rebuild on cache hits (the hot path while a single word is
   * highlighted across many frames).
   */
  private signatureByRef = new WeakMap<
    ResolvedCaption,
    { width: number; height: number; signature: string }
  >();

  private signatureFor(
    caption: ResolvedCaption,
    width: number,
    height: number
  ): string {
    const memo = this.signatureByRef.get(caption);
    if (memo && memo.width === width && memo.height === height) {
      return memo.signature;
    }
    const signature = captionSignature(caption, width, height);
    this.signatureByRef.set(caption, { width, height, signature });
    return signature;
  }

  rasterize(
    caption: ResolvedCaption,
    width: number,
    height: number,
    frameScope: BitmapFrameScope
  ): ImageBitmap | null {
    if (caption.words.length === 0) return null;
    if (typeof OffscreenCanvas === "undefined") return null;
    if (width <= 0 || height <= 0) return null;

    const key = this.signatureFor(caption, width, height);
    const hit = this.cache.get(key);
    if (hit) {
      this.pin(hit, frameScope);
      return hit;
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawCaption(ctx, caption, width, height);
    const bitmap = canvas.transferToImageBitmap();
    this.pin(bitmap, frameScope);

    this.ownedBytes += bitmapByteSize(bitmap);
    this.cache.set(key, bitmap);
    // Evict oldest first, but never the bitmap just drawn.
    while (
      this.ownedBytes > CAPTION_BITMAP_CACHE_BUDGET_BYTES &&
      this.cache.size > 1
    ) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      const retired = this.cache.get(oldest);
      this.cache.delete(oldest);
      if (retired) this.retire(retired);
    }
    return bitmap;
  }

  dispose(): void {
    for (const bitmap of this.cache.values()) this.retire(bitmap);
    this.cache.clear();
  }
}
