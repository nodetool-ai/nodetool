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
import { BitmapFrameScope } from "./BitmapFrameScope";

const MAX_CACHE_ENTRIES = 64;

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

  private retire(bitmap: ImageBitmap): void {
    if (this.pins.has(bitmap)) this.deferredClose.add(bitmap);
    else bitmap.close();
  }

  private pin(bitmap: ImageBitmap, frameScope: BitmapFrameScope): void {
    if (!frameScope.pin(bitmap, () => {
      const remaining = (this.pins.get(bitmap) ?? 1) - 1;
      if (remaining === 0) {
        this.pins.delete(bitmap);
        if (this.deferredClose.delete(bitmap)) bitmap.close();
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

    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        const retired = this.cache.get(oldest);
        if (retired) this.retire(retired);
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, bitmap);
    return bitmap;
  }

  dispose(): void {
    for (const bitmap of this.cache.values()) this.retire(bitmap);
    this.cache.clear();
  }
}
