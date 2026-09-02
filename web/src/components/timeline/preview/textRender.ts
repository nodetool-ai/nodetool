/**
 * textRender — rasterise a text clip to an `ImageBitmap`.
 *
 * Layout, wrapping and the staggered per-word draw live in
 * `@nodetool-ai/timeline/render`, shared with the server-side renderer, so a
 * title reads the same in the preview, the browser export and a workflow
 * render. What stays here is the browser's bitmap cache.
 *
 * The cache is what makes font loading load-bearing: a bitmap drawn before a
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

const MAX_CACHE_ENTRIES = 64;

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
  /**
   * The latest mid-stagger bitmap per style signature, tagged with the exact
   * animation time it was drawn at. Replaced (and the previous one closed) on
   * every animating frame — the caller has already composited the prior frame
   * by the time the next one is rasterized. The time tag lets a paused
   * playhead (same `localMs` re-requested every rAF tick) reuse the frame
   * instead of re-rasterizing.
   */
  private activeBitmaps = new Map<
    string,
    { timeKey: string; bitmap: ImageBitmap }
  >();
  private scratchSample: AnimationSample = createStaggerScratch();

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
    stagger?: TextRenderStagger | null
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
        lingering.bitmap.close();
        this.activeBitmaps.delete(baseKey);
      }
      const hit = this.cache.get(key);
      if (hit) return hit;
    } else if (stagger) {
      // Paused mid-window: the same frame is requested every tick.
      const timeKey = `${compiledRefId(stagger.compiled)}:${stagger.localMs}`;
      const last = this.activeBitmaps.get(baseKey);
      if (last && last.timeKey === timeKey) return last.bitmap;
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
    if (!cacheable) {
      this.activeBitmaps.get(baseKey)?.bitmap.close();
      this.activeBitmaps.set(baseKey, {
        timeKey: stagger
          ? `${compiledRefId(stagger.compiled)}:${stagger.localMs}`
          : "",
        bitmap
      });
      return bitmap;
    }
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
    for (const entry of this.activeBitmaps.values()) entry.bitmap.close();
    this.activeBitmaps.clear();
  }
}
