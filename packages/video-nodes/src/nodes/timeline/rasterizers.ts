/**
 * Server-side rasterization of the layer kinds that have no media behind them:
 * captions, text clips and shapes.
 *
 * The drawing rules come from `@nodetool-ai/timeline/render` — the same ones
 * the editor's preview and its in-browser export use — applied to a
 * `@napi-rs/canvas` surface instead of an `OffscreenCanvas`. Output is
 * straight-alpha RGBA at frame resolution, ready to hand to the compositor.
 */

import { createCanvas } from "@napi-rs/canvas";
import type {
  ClipMask,
  ClipShapeStyle,
  ClipTextStyle
} from "@nodetool-ai/timeline";
import type {
  RasterContext2D,
  ResolvedCaption,
  TextRenderStagger
} from "@nodetool-ai/timeline/render";
import {
  captionSignature,
  createStaggerScratch,
  drawCaption,
  drawMask,
  drawShape,
  drawStaggeredText,
  drawText,
  maskSignature,
  shapeStyleSignature,
  staggerPhase,
  textStyleSignature
} from "@nodetool-ai/timeline/render";

import type { RawImage } from "./rawFrames.js";

/** A rasterized layer plus the signature that identifies its pixels. */
interface RasterResult extends RawImage {
  /** Changes exactly when the pixels do — the compositor's upload key. */
  version: string;
}

const MAX_CACHE_ENTRIES = 32;

/**
 * Draws through the shared rules and caches by content signature, so a title
 * that holds still for 300 frames is rasterized once.
 */
export class NodeRasterizer {
  private readonly cache = new Map<string, RasterResult>();

  constructor(
    private readonly width: number,
    private readonly height: number
  ) {}

  caption(caption: ResolvedCaption): RasterResult | null {
    if (caption.words.length === 0) return null;
    return this.render(
      `caption|${captionSignature(caption, this.width, this.height)}`,
      (ctx) => drawCaption(ctx, caption, this.width, this.height)
    );
  }

  /**
   * A clip mask's coverage, at the size of the layer it cuts rather than the
   * frame — the mask is authored in the layer's own normalized space, and the
   * GPU compositor applies it to the source texture before placing it.
   *
   * Null when the mask names a kind this build cannot rasterize or path data
   * that does not parse; the layer then draws unmasked and the validator
   * reports `mask_path_invalid`.
   */
  mask(mask: ClipMask, width: number, height: number): RasterResult | null {
    let painted = true;
    const result = this.render(
      `mask|${maskSignature(mask, width, height)}`,
      (ctx) => {
        painted = drawMask(ctx, mask, width, height);
      },
      true,
      width,
      height
    );
    return painted ? result : null;
  }

  shape(style: ClipShapeStyle): RasterResult | null {
    return this.render(
      `shape|${shapeStyleSignature(style, this.width, this.height)}`,
      (ctx) => drawShape(ctx, style, this.width, this.height)
    );
  }

  text(
    style: ClipTextStyle,
    stagger?: TextRenderStagger | null
  ): RasterResult | null {
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
    cacheable = true,
    atWidth = this.width,
    atHeight = this.height
  ): RasterResult | null {
    if (atWidth <= 0 || atHeight <= 0) return null;
    if (cacheable) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }
    const canvas = createCanvas(atWidth, atHeight);
    const ctx = canvas.getContext("2d");
    // SAFETY: `RasterContext2D` is the subset of the 2D canvas API the
    // drawing helpers use, and a skia canvas context provides all of it.
    draw(ctx as unknown as RasterContext2D);
    const result: RasterResult = {
      rgba: new Uint8Array(ctx.getImageData(0, 0, atWidth, atHeight).data),
      width: atWidth,
      height: atHeight,
      version: key
    };
    if (!cacheable) return result;
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, result);
    return result;
  }
}
