/**
 * draw — the 2D drawing rules for the layer kinds that are rasterized rather
 * than decoded: captions, text clips and shapes.
 *
 * Written against {@link RasterContext2D}, the subset of the Canvas 2D API all
 * three drawings need, so one implementation serves the browser
 * (`OffscreenCanvas`) and the server (`@napi-rs/canvas`). Caching and the
 * host's bitmap type stay with the caller — everything here just draws.
 */

import type {
  ClipMask,
  ClipShapeStyle,
  ClipTextStyle,
  ShapeFill
} from "../types.js";
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
import { parseSvgPath, tracePath, type PathSegment } from "./svgPath.js";
import {
  buildShapeSegments,
  flattenSegments,
  shapeBox,
  shapeUnitScale,
  trimFlatPath
} from "./shapeGeometry.js";
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

/** The gradient object `createLinearGradient` / `createRadialGradient` vend. */
export interface CanvasGradient2D {
  addColorStop(offset: number, color: string): void;
}

/**
 * The gradient factories a fill resolves through. Its own interface, and the
 * narrowest one in this file, so {@link resolveShapeFill} can be handed a mask
 * surface, a raster surface or a compositing scratch surface alike.
 */
export interface GradientContext2D {
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): CanvasGradient2D;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): CanvasGradient2D;
}

/**
 * The Canvas 2D surface a mask rasterizes through: paths, gradients, composite
 * ops and a filter.
 *
 * Its own interface rather than more members on {@link RasterContext2D},
 * because both the rasterizers and the Canvas 2D compositor draw masks and
 * their contexts have otherwise disjoint needs — `CompositeContext2D` extends
 * this too, so `drawMask` runs on a compositing scratch surface without a cast
 * (I6). Every member is satisfied by `OffscreenCanvasRenderingContext2D`, a DOM
 * canvas context and `@napi-rs/canvas`.
 */
export interface MaskContext2D extends GradientContext2D {
  fillStyle: CanvasPaint;
  filter: string;
  globalCompositeOperation: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
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
  fill(fillRule?: string): void;
  clip(fillRule?: string): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** The Canvas 2D surface the rasterizers draw through. */
export interface RasterContext2D extends MaskContext2D {
  font: string;
  strokeStyle: CanvasPaint;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  setLineDash(pattern: number[]): void;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  measureText(text: string): { width: number };
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  stroke(): void;
  rotate(angle: number): void;
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

// ── Fills ───────────────────────────────────────────────────────────────────

/** The box a gradient fill is measured against, in surface pixels. */
export interface FillBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A {@link ShapeFill} as something assignable to `fillStyle`: the colour itself
 * for a solid, a canvas gradient placed against `box` for the other two.
 *
 * Stops are normalized 0..1 offsets, so the same fill reads the same on a
 * title, a rounded rect and a traced path — which is why text takes this too
 * rather than growing a gradient of its own.
 *
 * A linear fill's `angle` is degrees clockwise from left→right, and its axis is
 * scaled so the gradient spans the box's projection onto that angle exactly: at
 * 0° it runs the full width, at 90° the full height, and in between it still
 * reaches both ends. A radial fill runs from the box's centre to its corners,
 * matching CSS `radial-gradient`'s farthest-corner default.
 */
export function resolveShapeFill(
  ctx: GradientContext2D,
  fill: ShapeFill,
  box: FillBox
): CanvasPaint {
  if (fill.type === "solid") return fill.color;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (fill.type === "linear") {
    const radians = (fill.angle * Math.PI) / 180;
    const half =
      (Math.abs(Math.cos(radians)) * box.width +
        Math.abs(Math.sin(radians)) * box.height) /
      2;
    const dx = Math.cos(radians) * half;
    const dy = Math.sin(radians) * half;
    return withStops(
      ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy),
      fill.stops
    );
  }
  const radius = Math.hypot(box.width, box.height) / 2;
  return withStops(
    ctx.createRadialGradient(cx, cy, 0, cx, cy, radius),
    fill.stops
  );
}

/** Apply stops in authored order, clamped — a canvas throws outside 0..1. */
function withStops(
  gradient: CanvasGradient2D,
  stops: readonly { offset: number; color: string }[]
): CanvasGradient2D {
  for (const stop of stops) {
    gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
  }
  return gradient;
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

/** The segments are already in surface pixels, so tracing them is a replay. */
const UNSCALED = { scaleX: 1, scaleY: 1 };

/** The whole outline, when neither trim channel is driven away from its end. */
function trimIsWhole(style: ClipShapeStyle): boolean {
  return (style.trimStart ?? 0) <= 0 && (style.trimEnd ?? 1) >= 1;
}

/** The dash pattern in surface pixels, or an empty list for a solid stroke. */
function dashPattern(style: ClipShapeStyle, width: number): number[] {
  const scale = shapeUnitScale(width);
  const pattern = (style.dash ?? [])
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((n) => n * scale);
  return pattern.some((n) => n > 0) ? pattern : [];
}

/**
 * Draw a shape clip's geometry: fill, then stroke.
 *
 * The fill always covers the whole outline. `trimStart`/`trimEnd` cut the
 * **stroke** to a sub-range of the outline's arc length — the channel exists so
 * a line can draw itself on, and a partly-filled shape is not that.
 */
export function drawShape(
  ctx: RasterContext2D,
  style: ClipShapeStyle,
  width: number,
  height: number
): void {
  const segments = buildShapeSegments(style, width, height);
  if (!segments || segments.length === 0) return;
  const box = shapeBox(style, width, height);
  const lineWidth = style.strokeWidthPx ?? 0;

  ctx.save();
  if (style.fill || style.fillStyle) {
    ctx.fillStyle = style.fillStyle
      ? resolveShapeFill(ctx, style.fillStyle, box)
      : (style.fill ?? "transparent");
    ctx.beginPath();
    tracePath(ctx, segments, UNSCALED);
    ctx.fill();
  }
  if (style.stroke && lineWidth > 0) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = style.lineJoin ?? "miter";
    ctx.lineCap = style.lineCap ?? "butt";
    ctx.setLineDash(dashPattern(style, width));
    ctx.beginPath();
    if (trimIsWhole(style)) {
      tracePath(ctx, segments, UNSCALED);
    } else {
      traceTrimmed(ctx, segments, style);
    }
    ctx.stroke();
  }
  ctx.restore();
}


/** Issue only the trimmed sub-range of the outline, as open polylines. */
function traceTrimmed(
  ctx: RasterContext2D,
  segments: readonly PathSegment[],
  style: ClipShapeStyle
): void {
  const runs = trimFlatPath(
    flattenSegments(segments),
    style.trimStart ?? 0,
    style.trimEnd ?? 1
  );
  for (const run of runs) {
    if (run.length < 2) continue;
    ctx.moveTo(run[0]!.x, run[0]!.y);
    for (let i = 1; i < run.length; i++) {
      ctx.lineTo(run[i]!.x, run[i]!.y);
    }
  }
}

// ── Masks ────────────────────────────────────────────────────────────────────

/**
 * Coverage colours. A mask raster carries its coverage in **alpha**, which is
 * what `mask.apply@1` reads and what a Canvas 2D `destination-in` multiplies
 * with; the RGB is white so the same raster reads correctly if anything ever
 * samples luminance from it.
 */
const MASK_ON = "#ffffff";
const MASK_OFF = "rgba(255, 255, 255, 0)";

/** Mask kinds this build rasterizes. Anything else is `mask_path_invalid`. */
export const MASK_KINDS = ["rect", "ellipse", "path"] as const;

/** Content signature of a mask raster, for host-side caching. */
export function maskSignature(
  mask: ClipMask,
  width: number,
  height: number
): string {
  return `${width}x${height}|${JSON.stringify(mask)}`;
}

/** Whether a mask has a hard edge, which a 2D path clip draws with no scratch. */
export function maskIsHard(mask: ClipMask): boolean {
  return !((mask.featherPx ?? 0) > 0);
}

/** The mask's region in surface pixels. Absent bounds mean the whole layer. */
function maskRegion(
  mask: ClipMask,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: (mask.x ?? 0) * width,
    y: (mask.y ?? 0) * height,
    w: (mask.width ?? 1) * width,
    h: (mask.height ?? 1) * height
  };
}

/**
 * Issue the mask's outline onto `ctx` as a path, without filling it. False when
 * the mask names a kind this build does not rasterize, or path data that does
 * not parse — the caller then leaves the layer unmasked and the validator
 * reports `mask_path_invalid`.
 */
function buildMaskPath(
  ctx: MaskContext2D,
  mask: ClipMask,
  width: number,
  height: number
): boolean {
  const { x, y, w, h } = maskRegion(mask, width, height);
  if (mask.kind === "rect") {
    ctx.rect(x, y, w, h);
    return true;
  }
  if (mask.kind === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return true;
  }
  if (mask.kind === "path") {
    const parsed = parseSvgPath(mask.d ?? "");
    if (!parsed.ok) return false;
    // Path data is authored in the layer's own normalized 0..1 space, the same
    // space the rect and ellipse bounds live in.
    tracePath(ctx, parsed.segments, { scaleX: width, scaleY: height });
    return true;
  }
  return false;
}

/**
 * Clip `ctx` to a hard-edged mask, in the surface's own pixel space. False when
 * the mask is unreadable, in which case nothing was clipped.
 *
 * An inverted mask is the outer rectangle plus the shape under the even-odd
 * rule: what survives is everything the shape does not cover. That is why this
 * takes the whole surface size rather than just the shape — the rectangle is
 * the mask's other half.
 */
export function clipMask(
  ctx: MaskContext2D,
  mask: ClipMask,
  width: number,
  height: number
): boolean {
  ctx.beginPath();
  if (mask.invert) ctx.rect(0, 0, width, height);
  if (!buildMaskPath(ctx, mask, width, height)) return false;
  ctx.clip(mask.invert ? "evenodd" : "nonzero");
  return true;
}

/**
 * Rasterize a mask's coverage onto `ctx` as white-on-transparent: opaque where
 * the layer shows through, transparent where it is cut away. The surface is
 * cleared first and the context is left as it was found.
 *
 * `featherPx` softens the edge, in the surface's own pixels. A rect feathers
 * through a ring — an inset solid, four edge gradients and four corner
 * gradients, none overlapping — and an ellipse through one radial gradient in
 * its own scaled space, so both are exact rather than blurred. A path has no
 * such construction, so it feathers with `ctx.filter`; a context that ignores
 * the property draws the hard edge instead, which is a visible difference and
 * not a wrong picture.
 *
 * Inversion is a full-surface fill the shape then erases with
 * `destination-out`, which keeps the feather: the coverage of an inverted mask
 * is `1 - coverage`, band included.
 *
 * False when the mask is unreadable; the surface is then left cleared and the
 * caller draws the layer unmasked.
 */
export function drawMask(
  ctx: MaskContext2D,
  mask: ClipMask,
  width: number,
  height: number
): boolean {
  ctx.save();
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  if (mask.invert) {
    ctx.fillStyle = MASK_ON;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-out";
  }
  const painted = paintCoverage(ctx, mask, width, height);
  ctx.restore();
  return painted;
}

/** Fill the mask's own shape, feathered, in whatever composite op is set. */
function paintCoverage(
  ctx: MaskContext2D,
  mask: ClipMask,
  width: number,
  height: number
): boolean {
  const feather = Math.max(0, mask.featherPx ?? 0);
  if (feather <= 0 || mask.kind === "path") {
    if (feather > 0) ctx.filter = `blur(${(feather / 2).toFixed(2)}px)`;
    ctx.fillStyle = MASK_ON;
    ctx.beginPath();
    if (!buildMaskPath(ctx, mask, width, height)) return false;
    ctx.fill();
    return true;
  }
  const { x, y, w, h } = maskRegion(mask, width, height);
  if (w <= 0 || h <= 0) return mask.kind === "rect" || mask.kind === "ellipse";
  if (mask.kind === "rect") {
    featherRect(ctx, x, y, w, h, Math.min(feather, w / 2, h / 2));
    return true;
  }
  if (mask.kind === "ellipse") {
    featherEllipse(ctx, x, y, w, h, feather);
    return true;
  }
  return false;
}

/**
 * A rect with a soft edge: one solid inset rectangle, four edge gradients and
 * four corner gradients. The nine regions are disjoint, which is what lets the
 * whole ring be drawn under `destination-out` for an inverted mask without any
 * pixel being erased twice.
 */
function featherRect(
  ctx: MaskContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number
): void {
  ctx.fillStyle = MASK_ON;
  ctx.fillRect(x + f, y + f, w - 2 * f, h - 2 * f);
  if (f <= 0) return;

  const edge = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ): void => {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, MASK_OFF);
    gradient.addColorStop(1, MASK_ON);
    ctx.fillStyle = gradient;
    ctx.fillRect(rx, ry, rw, rh);
  };
  edge(x, y, x + f, y, x, y + f, f, h - 2 * f);
  edge(x + w, y, x + w - f, y, x + w - f, y + f, f, h - 2 * f);
  edge(x, y, x, y + f, x + f, y, w - 2 * f, f);
  edge(x, y + h, x, y + h - f, x + f, y + h - f, w - 2 * f, f);

  const corner = (cx: number, cy: number, sx: number, sy: number): void => {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, f);
    gradient.addColorStop(0, MASK_ON);
    gradient.addColorStop(1, MASK_OFF);
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.min(cx, sx), Math.min(cy, sy), f, f);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.min(cx, sx), Math.min(cy, sy), f, f);
    ctx.restore();
  };
  corner(x + f, y + f, x, y);
  corner(x + w - f, y + f, x + w, y);
  corner(x + f, y + h - f, x, y + h);
  corner(x + w - f, y + h - f, x + w, y + h);
}

/**
 * An ellipse with a soft edge: one radial gradient painted in the ellipse's own
 * unit space, so the band follows the curve instead of a circle inscribed in
 * it. The feather is measured against the shorter radius, which is the one that
 * runs out first.
 */
function featherEllipse(
  ctx: MaskContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  feather: number
): void {
  const rx = w / 2;
  const ry = h / 2;
  const inner = Math.max(0, 1 - feather / Math.max(1e-3, Math.min(rx, ry)));
  ctx.save();
  ctx.translate(x + rx, y + ry);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, MASK_ON);
  gradient.addColorStop(Math.min(0.999, inner), MASK_ON);
  gradient.addColorStop(1, MASK_OFF);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, 1, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
