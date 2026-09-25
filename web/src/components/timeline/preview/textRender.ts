/**
 * textRender — rasterise a text clip to an `ImageBitmap`.
 *
 * Layout, wrapping and the staggered per-word draw live in
 * `@nodetool-ai/timeline/render`, shared with the server-side renderer, so a
 * title reads the same in the preview, the browser export and a workflow
 * render. What stays here is the browser's bitmap cache.
 *
 * The cache is why font loading must finish first: a bitmap drawn before a
 * bundled face arrives shows the fallback, and caching it keeps the wrong
 * glyphs on screen long after the file landed. So nothing is cached until
 * `bundledFontsReady()` says the corpus is drawable (D8).
 */

import type {
  AnimationSample,
  ClipTextStyle,
  CompiledAnimation
} from "@nodetool-ai/timeline";
import type { TextRenderStagger } from "@nodetool-ai/timeline/render";
import {
  createStaggerScratch,
  drawStaggeredText,
  drawText,
  staggerPhase,
  textStyleSignature
} from "@nodetool-ai/timeline/render";
import {
  bundledFontsReady,
  ensureBundledFontsLoaded
} from "./fontLoading";
import { BitmapFrameScope, bitmapByteSize } from "./BitmapFrameScope";

export const TEXT_BITMAP_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;

export type { TextRenderStagger };

let nextCompiledRefId = 1;
/** Stable id per compiled-animations array reference, for cache keys. */
const compiledRefIds = new WeakMap<CompiledAnimation[], number>();
function compiledRefId(compiled: CompiledAnimation[]): number {
  let id = compiledRefIds.get(compiled);
  if (id === undefined) {
    id = nextCompiledRefId++;
    compiledRefIds.set(compiled, id);
  }
  return id;
}

/** Bounded per-compositor bitmap cache keyed by content and sequence size. */
export class TextRasterizer {
  private cache = new Map<string, ImageBitmap>();
  private pins = new Map<ImageBitmap, number>();
  private owned = new Set<ImageBitmap>();
  private deferredClose = new Set<ImageBitmap>();
  private ownedBytes = 0;
  /**
   * The latest mid-stagger bitmap per style signature, tagged with the exact
   * animation time it was drawn at. Replacing it retires the prior bitmap;
   * a frame scope keeps that bitmap alive until upload finishes. The time tag
   * lets a paused playhead reuse the frame instead of re-rasterizing it.
   */
  private activeBitmaps = new Map<
    string,
    { timeKey: string; bitmap: ImageBitmap }
  >();
  private scratchSample: AnimationSample = createStaggerScratch();

  get residentBytes(): number {
    return this.ownedBytes;
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

  private close(bitmap: ImageBitmap): void {
    if (!this.owned.delete(bitmap)) return;
    this.ownedBytes -= bitmapByteSize(bitmap);
    bitmap.close();
  }

  private retire(bitmap: ImageBitmap): void {
    if (this.pins.has(bitmap)) this.deferredClose.add(bitmap);
    else this.close(bitmap);
  }

  private evictToBudget(): void {
    while (this.residentBytes > TEXT_BITMAP_CACHE_BUDGET_BYTES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        const bitmap = this.cache.get(oldest);
        this.cache.delete(oldest);
        if (bitmap) this.retire(bitmap);
        continue;
      }
      const active = this.activeBitmaps.keys().next().value;
      if (active === undefined) break;
      const entry = this.activeBitmaps.get(active);
      this.activeBitmaps.delete(active);
      if (entry) this.retire(entry.bitmap);
    }
  }

  /**
   * Rasterize `style` at sequence resolution. Pass `stagger` for a text clip
   * with a staggered animation: words are drawn with per-word samples at
   * `stagger.localMs`. While a stagger window is active the bitmap changes
   * every frame, so it is returned uncached (like captions during a karaoke
   * highlight); held frames outside the window cache by phase.
   */
  rasterize(
    style: ClipTextStyle,
    width: number,
    height: number,
    stagger: TextRenderStagger | null | undefined,
    frameScope: BitmapFrameScope
  ): ImageBitmap | null {
    if (
      !style.text ||
      typeof OffscreenCanvas === "undefined" ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }
    // Kick the load on the first raster rather than at import: a page that
    // never opens the timeline should not fetch three megabytes of fonts.
    const fontsReady = bundledFontsReady();
    if (!fontsReady) void ensureBundledFontsLoaded();
    const phase = stagger ? staggerPhase(stagger) : undefined;
    const cacheable = phase !== "active" && fontsReady;
    const baseKey = textStyleSignature(style, width, height);
    let key = baseKey;
    if (stagger && cacheable) {
      key += `|stg:${compiledRefId(stagger.compiled)}:${phase}`;
    }
    if (cacheable) {
      const lingering = this.activeBitmaps.get(baseKey);
      if (lingering) {
        this.retire(lingering.bitmap);
        this.activeBitmaps.delete(baseKey);
      }
      const hit = this.cache.get(key);
      if (hit) {
        this.pin(hit, frameScope);
        return hit;
      }
    } else if (stagger) {
      // Paused mid-window: the same frame is requested every tick.
      const timeKey = `${compiledRefId(stagger.compiled)}:${stagger.localMs}`;
      const last = this.activeBitmaps.get(baseKey);
      if (last && last.timeKey === timeKey) {
        this.pin(last.bitmap, frameScope);
        return last.bitmap;
      }
    }
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (stagger) {
      drawStaggeredText(ctx, style, width, height, stagger, this.scratchSample);
    } else {
      drawText(ctx, style, width, height);
    }
    const bitmap = canvas.transferToImageBitmap();
    if (!this.owned.has(bitmap)) {
      this.owned.add(bitmap);
      this.ownedBytes += bitmapByteSize(bitmap);
    }
    this.pin(bitmap, frameScope);
    if (!cacheable) {
      const previous = this.activeBitmaps.get(baseKey)?.bitmap;
      if (previous) this.retire(previous);
      this.activeBitmaps.set(baseKey, {
        timeKey: stagger
          ? `${compiledRefId(stagger.compiled)}:${stagger.localMs}`
          : "",
        bitmap
      });
      this.evictToBudget();
      return bitmap;
    }
    this.cache.set(key, bitmap);
    this.evictToBudget();
    return bitmap;
  }

  dispose(): void {
    for (const bitmap of this.cache.values()) this.retire(bitmap);
    this.cache.clear();
    for (const entry of this.activeBitmaps.values()) this.retire(entry.bitmap);
    this.activeBitmaps.clear();
    for (const bitmap of [...this.owned]) this.retire(bitmap);
  }
}
