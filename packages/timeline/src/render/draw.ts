/**
 * draw — the 2D drawing rules for the layer kinds that are rasterized rather
 * than decoded: captions, text clips and shapes.
 *
 * Written against {@link RasterContext2D}, the subset of the Canvas 2D API all
 * three drawings need, so one implementation serves the browser
 * (`OffscreenCanvas`) and the server (`@napi-rs/canvas`). Caching and the
 * host's bitmap type stay with the caller — everything here just draws.
 */

import type { ClipShapeStyle, ClipTextStyle } from "../types.js";
import type {
  AnimationSample,
  CompiledAnimation,
  StaggerUnit
} from "../animation/index.js";
import {
  createAnimationSample,
  sampleStaggeredAnimations
} from "../animation/index.js";
import type { MeasureTextWidth } from "./textLayout.js";
import {
  layoutStaggerUnits,
  textFontSpec,
  textMaxWidthPx,
  wrapTextLines
} from "./textLayout.js";

/**
 * A fill or stroke paint. Canvas also accepts gradients and patterns, which
 * these drawings never set — typed loosely so a real `CanvasRenderingContext2D`
 * satisfies the interface.
 */
export type CanvasPaint = string | object;

/** The Canvas 2D surface the rasterizers draw through. */
export interface RasterContext2D {
  font: string;
  fillStyle: CanvasPaint;
  strokeStyle: CanvasPaint;
  lineWidth: number;
  lineJoin: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  measureText(text: string): { width: number };
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number
  ): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  fill(): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
}

// ── Captions ─────────────────────────────────────────────────────────────────

const CAPTION_INACTIVE_COLOR = "#FFFFFF";
const CAPTION_ACTIVE_COLOR = "#FFD60A";
const CAPTION_OUTLINE_COLOR = "rgba(0, 0, 0, 0.85)";

/** One word of a caption resolved at a point in time. */
export interface ResolvedCaptionWord {
  text: string;
  /** True while the playhead is inside this word's spoken interval. */
  active: boolean;
}

/**
 * A caption's full per-frame state: every word of the line plus which one is
 * currently spoken. Rasterized identically by every render surface.
 */
export interface ResolvedCaption {
  words: ResolvedCaptionWord[];
}

/** Content signature of a caption raster, for host-side caching. */
export function captionSignature(
  caption: ResolvedCaption,
  width: number,
  height: number
): string {
  const words = caption.words
    .map((w) => (w.active ? `*${w.text}` : w.text))
    .join(" ");
  return `${width}x${height}|${words}`;
}

interface MeasuredWord {
  text: string;
  active: boolean;
  width: number;
}

/**
 * Draw a caption as bold, outlined, lower-third text with the currently-spoken
 * word highlighted, at full frame resolution — so it composites with an
 * identity transform.
 */
export function drawCaption(
  ctx: RasterContext2D,
  caption: ResolvedCaption,
  width: number,
  height: number
): void {
  const fontSize = Math.max(24, Math.round(height * 0.05));
  ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";

  const spaceWidth = ctx.measureText(" ").width;
  const maxWidth = width * 0.9;

  const measured: MeasuredWord[] = caption.words.map((w) => ({
    text: w.text,
    active: w.active,
    width: ctx.measureText(w.text).width
  }));

  // Greedy word-wrap into lines that fit `maxWidth`.
  const lines: MeasuredWord[][] = [];
  let current: MeasuredWord[] = [];
  let currentWidth = 0;
  for (const word of measured) {
    const advance = (current.length > 0 ? spaceWidth : 0) + word.width;
    if (current.length > 0 && currentWidth + advance > maxWidth) {
      lines.push(current);
      current = [word];
      currentWidth = word.width;
    } else {
      current.push(word);
      currentWidth += advance;
    }
  }
  if (current.length > 0) lines.push(current);

  const lineHeight = fontSize * 1.25;
  const totalHeight = lines.length * lineHeight;
  const bottomMargin = height * 0.12;
  // Baseline of the first line.
  let y = height - bottomMargin - totalHeight + fontSize;

  ctx.lineWidth = Math.max(2, fontSize * 0.12);
  ctx.strokeStyle = CAPTION_OUTLINE_COLOR;

  for (const line of lines) {
    const lineWidth = line.reduce(
      (sum, w, i) => sum + w.width + (i > 0 ? spaceWidth : 0),
      0
    );
    let x = (width - lineWidth) / 2;
    for (let i = 0; i < line.length; i++) {
      const word = line[i];
      if (i > 0) x += spaceWidth;
      ctx.fillStyle = word.active
        ? CAPTION_ACTIVE_COLOR
        : CAPTION_INACTIVE_COLOR;
      ctx.strokeText(word.text, x, y);
      ctx.fillText(word.text, x, y);
      x += word.width;
    }
    y += lineHeight;
  }
}

/**
 * A {@link MeasureTextWidth} backed by a 2D context. A host hands one to the
 * scene model so a `"line"` stagger is counted against the same wrap the
 * rasterizer draws through; the context is measured, never drawn to, so a
 * 1×1 scratch canvas is enough.
 */
export function measureTextWith(ctx: RasterContext2D): MeasureTextWidth {
  return (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

// ── Text clips ───────────────────────────────────────────────────────────────

/** Content signature of a text raster, for host-side caching. */
export function textStyleSignature(
  style: ClipTextStyle,
  width: number,
  height: number
): string {
  return `${width}x${height}|${style.text}|${style.fontFamily ?? "Inter"}|${style.fontSizePx}|${style.fontWeight ?? 400}|${style.color}|${style.align ?? "center"}|${style.maxWidthFrac ?? 0.8}`;
}

/** Draw a text style as one block: wrapped lines, centered on the raster. */
export function drawText(
  ctx: RasterContext2D,
  style: ClipTextStyle,
  width: number,
  height: number
): void {
  const fontSize = Math.max(1, style.fontSizePx);
  const align = style.align ?? "center";
  const maxWidth = textMaxWidthPx(style, width);

  ctx.font = textFontSpec(style);
  const lines = wrapTextLines(style.text, maxWidth, (text) =>
    ctx.measureText(text).width
  );

  const lineHeight = fontSize * 1.2;
  const firstBaseline = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  ctx.fillStyle = style.color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const x =
    align === "left"
      ? (width - maxWidth) / 2
      : align === "right"
        ? (width + maxWidth) / 2
        : width / 2;
  lines.forEach((entry, index) =>
    ctx.fillText(entry.text, x, firstBaseline + index * lineHeight)
  );
}

/**
 * Per-frame input for a staggered text draw: the clip's compiled animations
 * (at least one carrying a `stagger`) and the clip-local time.
 */
export interface TextRenderStagger {
  compiled: CompiledAnimation[];
  localMs: number;
}

/**
 * The unit every staggered animation on this clip was compiled against, and
 * how many of them the compiler timed. A clip lays out in one unit — the
 * compiler drops a stagger declaring a different one — so the first staggered
 * animation answers for all of them.
 */
function staggerLayout(
  compiled: CompiledAnimation[]
): { unit: StaggerUnit; count: number } | null {
  for (const anim of compiled) {
    if (anim.stagger) {
      return { unit: anim.stagger.unit, count: anim.stagger.count };
    }
  }
  return null;
}

/**
 * Draw each unit — word, grapheme cluster or wrapped line — with its own
 * animation sample: place it at its own pivot (plus the sample's offset),
 * rotate and scale about that pivot, multiply alpha.
 *
 * The channels a per-unit draw can honor are the transform ones:
 * `offsetX/Y` shift the unit, `positionX/Y` move its pivot to an absolute
 * point on the raster (canvas px from the center, like a layer's
 * `transform.position`), `anchorX/Y` move the pivot inside the unit's own box,
 * `scale`/`scaleX`/`scaleY` scale about it, `rotation` turns it, `opacity`
 * multiplies. Effect, mask and shape channels are not per-unit: the compositor
 * applies those to the whole layer, which is why the sampler classifies them
 * as block-level (`ANIMATED_PROPERTY_PASS`) and folds them over the full span
 * instead of dropping them.
 */
export function drawStaggeredText(
  ctx: RasterContext2D,
  style: ClipTextStyle,
  width: number,
  height: number,
  stagger: TextRenderStagger,
  scratch: AnimationSample
): void {
  const layout = staggerLayout(stagger.compiled);
  if (!layout) {
    drawText(ctx, style, width, height);
    return;
  }
  ctx.font = textFontSpec(style);
  const units = layoutStaggerUnits(
    (text) => ctx.measureText(text).width,
    style,
    width,
    height,
    layout.unit
  );
  ctx.fillStyle = style.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  units.forEach((unit, index) => {
    // A whitespace unit takes its index — the units after it are timed as if
    // it were drawn — and draws nothing.
    if (unit.text === "") return;
    // A host that counted units without a text measurer can lay out more lines
    // than the compiler timed; clamping lets the extra ones ride the last
    // unit's window instead of sitting outside the span, invisible.
    const s = sampleStaggeredAnimations(
      stagger.compiled,
      stagger.localMs,
      Math.min(index, layout.count - 1),
      scratch
    );
    const scaleX = s.scale * s.scaleX;
    const scaleY = s.scale * s.scaleY;
    if (s.opacity <= 0 || scaleX <= 0 || scaleY <= 0) return;
    const anchorX = s.anchorX ?? 0.5;
    const anchorY = s.anchorY ?? 0.5;
    // The pivot is the point the unit rotates and scales about, and the point
    // `positionX/Y` replaces when driven.
    const pivotX =
      (s.positionX === undefined
        ? unit.x + unit.width * anchorX
        : width / 2 + s.positionX) + s.offsetX;
    const pivotY =
      (s.positionY === undefined
        ? unit.y + (anchorY - 0.5) * unit.height
        : height / 2 + s.positionY) + s.offsetY;
    ctx.save();
    ctx.translate(pivotX, pivotY);
    if (s.rotation !== 0) ctx.rotate(s.rotation);
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = s.opacity;
    ctx.fillText(
      unit.text,
      -unit.width * anchorX,
      -(anchorY - 0.5) * unit.height
    );
    ctx.restore();
  });
}

/**
 * Where a stagger context sits relative to its animation windows, for cache
 * policy: `"active"` while any staggered window covers `localMs` (the raster
 * changes every frame — never cached), otherwise a static per-animation
 * phase signature ("b"efore / "a"fter / "i"dle-loop) that keys the held frame.
 */
export function staggerPhase(stagger: TextRenderStagger): "active" | string {
  let sig = "";
  for (const anim of stagger.compiled) {
    if (!anim.stagger) continue;
    if (anim.loop) {
      if (
        stagger.localMs >= anim.windowStartMs &&
        stagger.localMs < anim.windowEndMs
      ) {
        return "active";
      }
      sig += "i";
      continue;
    }
    if (stagger.localMs < anim.windowStartMs) sig += "b";
    else if (stagger.localMs > anim.windowEndMs) sig += "a";
    else return "active";
  }
  return sig;
}

/** A fresh scratch sample for {@link drawStaggeredText}. */
export function createStaggerScratch(): AnimationSample {
  return createAnimationSample();
}

// ── Shapes ───────────────────────────────────────────────────────────────────

/** Content signature of a shape raster, for host-side caching. */
export function shapeStyleSignature(
  style: ClipShapeStyle,
  width: number,
  height: number
): string {
  return `${width}x${height}|${JSON.stringify(style)}`;
}

function number(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

export function drawShape(
  ctx: RasterContext2D,
  style: ClipShapeStyle,
  width: number,
  height: number
): void {
  const x = number(style.x, 0.25) * width;
  const y = number(style.y, 0.25) * height;
  const shapeWidth = number(style.width, 0.5) * width;
  const shapeHeight = number(style.height, 0.5) * height;
  ctx.fillStyle = style.fill ?? "transparent";
  ctx.strokeStyle = style.stroke ?? "transparent";
  ctx.lineWidth = number(style.strokeWidthPx, 0);
  ctx.beginPath();
  if (style.kind === "rect") ctx.rect(x, y, shapeWidth, shapeHeight);
  if (style.kind === "ellipse") {
    ctx.ellipse(
      x + shapeWidth / 2,
      y + shapeHeight / 2,
      shapeWidth / 2,
      shapeHeight / 2,
      0,
      0,
      Math.PI * 2
    );
  }
  if (style.kind === "line") {
    ctx.moveTo(x, y);
    ctx.lineTo(number(style.x2, 0.75) * width, number(style.y2, 0.75) * height);
  }
  if (style.fill) ctx.fill();
  if (style.stroke && ctx.lineWidth > 0) ctx.stroke();
}
