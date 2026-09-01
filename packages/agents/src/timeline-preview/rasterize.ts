/**
 * Rasterization of the timeline layer kinds that have no media behind them:
 * captions, text clips and shapes.
 *
 * The same job `NodeRasterizer` does for the video renderer, with one
 * difference that matters for a preview: the output is the `@napi-rs/canvas`
 * surface itself rather than an RGBA buffer, because the Canvas 2D compositor
 * draws it with `drawImage` instead of uploading it to a texture.
 *
 * The drawing rules come from `@nodetool-ai/timeline/scene` — the same ones the
 * editor's preview and the video export use — so a title previewed here is the
 * title that renders.
 */

import { createCanvas, type Canvas } from "@napi-rs/canvas";
import type { ClipShapeStyle, ClipTextStyle } from "@nodetool-ai/timeline";
import type {
  RasterContext2D,
  ResolvedCaption,
  TextRenderStagger
} from "@nodetool-ai/timeline/scene";
import {
  captionSignature,
  createStaggerScratch,
  drawCaption,
  drawShape,
  drawStaggeredText,
  drawText,
  shapeStyleSignature,
  staggerPhase,
  textStyleSignature
} from "@nodetool-ai/timeline/scene";

/** How many rasterized surfaces to keep before evicting the oldest. */
const MAX_CACHE_ENTRIES = 32;

/**
 * Draws through the shared rules and caches by content signature, so a title
 * held across several previewed timecodes is rasterized once.
 */
export class PreviewRasterizer {
  private readonly cache = new Map<string, Canvas>();

  constructor(
    private readonly width: number,
    private readonly height: number
  ) {}

  caption(caption: ResolvedCaption): Canvas | null {
    if (caption.words.length === 0) return null;
    return this.render(
      `caption|${captionSignature(caption, this.width, this.height)}`,
      (ctx) => drawCaption(ctx, caption, this.width, this.height)
    );
  }

  shape(style: ClipShapeStyle): Canvas | null {
    return this.render(
      `shape|${shapeStyleSignature(style, this.width, this.height)}`,
      (ctx) => drawShape(ctx, style, this.width, this.height)
    );
  }

  text(style: ClipTextStyle, stagger?: TextRenderStagger | null): Canvas | null {
    if (!style.text) return null;
    const base = `text|${textStyleSignature(style, this.width, this.height)}`;
    if (!stagger) {
      return this.render(base, (ctx) =>
        drawText(ctx, style, this.width, this.height)
      );
    }
    const phase = staggerPhase(stagger);
    // Mid-stagger the raster changes every frame, so it is keyed by time and
    // never reused; a held frame outside the animation window caches by phase.
    const key =
      phase === "active"
        ? `${base}|stg:${stagger.localMs}`
        : `${base}|stg:${phase}`;
    return this.render(
      key,
      (ctx) =>
        drawStaggeredText(
          ctx,
          style,
          this.width,
          this.height,
          stagger,
          createStaggerScratch()
        ),
      phase !== "active"
    );
  }

  private render(
    key: string,
    draw: (ctx: RasterContext2D) => void,
    cacheable = true
  ): Canvas | null {
    if (this.width <= 0 || this.height <= 0) return null;
    if (cacheable) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }
    const canvas = createCanvas(this.width, this.height);
    // SAFETY: `RasterContext2D` is the subset of the 2D canvas API the drawing
    // helpers use, and a skia canvas context provides all of it.
    draw(canvas.getContext("2d") as unknown as RasterContext2D);
    if (!cacheable) return canvas;
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, canvas);
    return canvas;
  }
}
