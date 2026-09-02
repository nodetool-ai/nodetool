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
  CaptionStyle,
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
  roundedRectSegments,
  shapeBox,
  shapeUnitScale,
  trimFlatPath
} from "./shapeGeometry.js";
import {
  layoutStaggerUnits,
  layoutTextBlock,
  segmentGraphemes,
  textFontSpec,
  textLetterSpacingPx,
  type TextBlockBox,
  type TextBlockLayout,
  type TextStaggerUnit
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
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  /**
   * Advance added after each glyph, as a CSS length. Optional because it is
   * the one member here that is not universal: Chromium's canvas and
   * `@napi-rs/canvas` both have it, an older or minimal context may not, and
   * a text draw places the glyphs itself when it is missing.
   */
  letterSpacing?: string;
  measureText(text: string): { width: number };
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  stroke(): void;
  rotate(angle: number): void;
}

/**
 * The scrim a block of text sits on. `ClipTextStyle` and {@link CaptionStyle}
 * declare the same shape, and {@link drawScrim} draws it for both.
 */
type BlockScrim = NonNullable<CaptionStyle["background"]>;

// ── Captions ─────────────────────────────────────────────────────────────────

/** The look a caption with no `style` of its own is drawn with. */
const CAPTION_INACTIVE_COLOR = "#FFFFFF";
const CAPTION_ACTIVE_COLOR = "#FFD60A";
const CAPTION_OUTLINE_COLOR = "rgba(0, 0, 0, 0.85)";
const CAPTION_FONT_WEIGHT = 700;
/** Font size as a fraction of frame height, and the floor it never goes under. */
const CAPTION_FONT_SIZE_FRAC = 0.05;
const CAPTION_MIN_FONT_SIZE_PX = 24;
/** Outline width as a fraction of the font size, and its own floor. */
const CAPTION_OUTLINE_WIDTH_FRAC = 0.12;
const CAPTION_MIN_OUTLINE_WIDTH_PX = 2;
/** Gap between the last line and the frame bottom, as a fraction of height. */
const CAPTION_BOTTOM_MARGIN_FRAC = 0.12;
/**
 * Line advance as a multiple of the font size, and the share of the frame the
 * words wrap within. Not on {@link CaptionStyle}: a caption is one or two
 * lines read at speaking pace, and both numbers are that shape rather than a
 * look somebody would want to author.
 */
const CAPTION_LINE_HEIGHT = 1.25;
const CAPTION_MAX_WIDTH_FRAC = 0.9;

/** One word of a caption resolved at a point in time. */
export interface ResolvedCaptionWord {
  text: string;
  /** True while the playhead is inside this word's spoken interval. */
  active: boolean;
}

/**
 * A caption's full per-frame state: every word of the line, which one is
 * currently spoken, and the look the clip authored. Rasterized identically by
 * every render surface.
 */
export interface ResolvedCaption {
  words: ResolvedCaptionWord[];
  /** The clip's `caption.style`. Absent means the built-in look. */
  style?: CaptionStyle;
}

/**
 * Content signature of a caption raster, for host-side caching.
 *
 * The style is in it for the reason {@link textStyleSignature} names every
 * field of its own: a host hands back the bitmap a key hits, so a field the
 * key does not read renders as the frame drawn before that field changed.
 */
export function captionSignature(
  caption: ResolvedCaption,
  width: number,
  height: number
): string {
  const words = caption.words
    .map((w) => (w.active ? `*${w.text}` : w.text))
    .join(" ");
  return `${width}x${height}|${captionStyleSignature(caption.style)}|${words}`;
}

/** Every field of {@link CaptionStyle}, in a fixed order. */
function captionStyleSignature(style: CaptionStyle | undefined): string {
  if (!style) return "-";
  return [
    style.fontFamily ?? "-",
    style.fontSizeFrac ?? "-",
    style.color ?? "-",
    style.activeColor ?? "-",
    style.outline ? `${style.outline.color}@${style.outline.widthPx}` : "-",
    style.bottomMarginFrac ?? "-",
    scrimSignature(style.background)
  ].join(",");
}

/** A block scrim's own signature, shared by both styles that carry one. */
function scrimSignature(scrim: BlockScrim | undefined): string {
  return scrim
    ? `${scrim.color}@${scrim.paddingPx}/${scrim.radiusPx ?? 0}`
    : "-";
}

interface MeasuredWord {
  text: string;
  active: boolean;
  width: number;
}

/** A caption's look with every default filled in, in surface pixels. */
interface ResolvedCaptionStyle {
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  color: string;
  activeColor: string;
  /** Null when the author asked for no outline. */
  outline: { color: string; widthPx: number } | null;
  bottomMarginPx: number;
  background: BlockScrim | null;
}

/**
 * `value` when it is a finite number at or above `min`, `fallback` otherwise.
 * A hand-written document can carry a NaN or a negative fraction, and a
 * caption laid out from one is not a look anybody asked for.
 */
function fractionOr(
  value: number | undefined,
  min: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min
    ? value
    : fallback;
}

/**
 * Fill in what the author left out. Every default is the value this drawing
 * hard-coded before it was authorable, so a caption carrying no style — which
 * is every caption written before now — renders the frame it always did.
 */
function resolveCaptionStyle(
  style: CaptionStyle | undefined,
  height: number
): ResolvedCaptionStyle {
  // The size fraction must be positive to mean anything; the bottom margin may
  // legitimately be zero, which sits the block flush against the frame edge.
  const sizeFrac = fractionOr(
    style?.fontSizeFrac,
    Number.EPSILON,
    CAPTION_FONT_SIZE_FRAC
  );
  const marginFrac = fractionOr(
    style?.bottomMarginFrac,
    0,
    CAPTION_BOTTOM_MARGIN_FRAC
  );
  const fontSizePx = Math.max(
    CAPTION_MIN_FONT_SIZE_PX,
    Math.round(height * sizeFrac)
  );
  return {
    // A caption is one weight and one size, so the font shorthand is the only
    // thing it shares with a text clip — through the same builder, which is
    // where family resolution and the bundled default live (D8).
    font: textFontSpec({
      fontSizePx,
      fontWeight: CAPTION_FONT_WEIGHT,
      fontFamily: style?.fontFamily
    }),
    fontSizePx,
    lineHeightPx: fontSizePx * CAPTION_LINE_HEIGHT,
    color: style?.color ?? CAPTION_INACTIVE_COLOR,
    activeColor: style?.activeColor ?? CAPTION_ACTIVE_COLOR,
    outline: resolveCaptionOutline(style?.outline, fontSizePx),
    bottomMarginPx: height * marginFrac,
    background: style?.background ?? null
  };
}

/**
 * The outline, or null for none. A width of zero is how an author asks for no
 * outline, and it has to be read here rather than passed on: `lineWidth = 0`
 * is ignored by a canvas, which would stroke at whatever width was last set.
 */
function resolveCaptionOutline(
  outline: CaptionStyle["outline"],
  fontSizePx: number
): { color: string; widthPx: number } | null {
  if (!outline) {
    return {
      color: CAPTION_OUTLINE_COLOR,
      widthPx: Math.max(
        CAPTION_MIN_OUTLINE_WIDTH_PX,
        fontSizePx * CAPTION_OUTLINE_WIDTH_FRAC
      )
    };
  }
  if (!Number.isFinite(outline.widthPx) || outline.widthPx <= 0) return null;
  return { color: outline.color, widthPx: outline.widthPx };
}

/**
 * Draw a caption as bold, outlined, lower-third text with the currently-spoken
 * word highlighted, at full frame resolution — so it composites with an
 * identity transform. `caption.style` moves any of that; what it leaves out
 * keeps the built-in look.
 *
 * The layout is the caption's own rather than `layoutTextBlock`: a caption is
 * anchored to the frame bottom on an alphabetic baseline and coloured word by
 * word, none of which a text block expresses. The two share the font shorthand
 * and the scrim, which is where they genuinely agree.
 */
export function drawCaption(
  ctx: RasterContext2D,
  caption: ResolvedCaption,
  width: number,
  height: number
): void {
  const style = resolveCaptionStyle(caption.style, height);
  ctx.font = style.font;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";

  const spaceWidth = ctx.measureText(" ").width;
  const maxWidth = width * CAPTION_MAX_WIDTH_FRAC;

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

  const lineWidths = lines.map((line) =>
    line.reduce((sum, w, i) => sum + w.width + (i > 0 ? spaceWidth : 0), 0)
  );
  const totalHeight = lines.length * style.lineHeightPx;
  const blockTop = height - style.bottomMarginPx - totalHeight;
  // Baseline of the first line.
  let y = blockTop + style.fontSizePx;

  if (style.background) {
    const blockWidth = lineWidths.reduce((widest, w) => Math.max(widest, w), 0);
    drawScrim(ctx, style.background, {
      x: (width - blockWidth) / 2,
      y: blockTop,
      width: blockWidth,
      height: totalHeight
    });
  }

  if (style.outline) {
    ctx.lineWidth = style.outline.widthPx;
    ctx.strokeStyle = style.outline.color;
  }

  lines.forEach((line, lineIndex) => {
    let x = (width - lineWidths[lineIndex]!) / 2;
    for (let i = 0; i < line.length; i++) {
      const word = line[i];
      if (i > 0) x += spaceWidth;
      ctx.fillStyle = word.active ? style.activeColor : style.color;
      if (style.outline) ctx.strokeText(word.text, x, y);
      ctx.fillText(word.text, x, y);
      x += word.width;
    }
    y += style.lineHeightPx;
  });
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

/**
 * Content signature of a text raster, for host-side caching.
 *
 * Every field of {@link ClipTextStyle} is in it. A key over a subset is worse
 * than no cache at all: change a stroke width, a shadow offset or a background
 * colour and the host hands back the bitmap drawn before the change. Nested
 * objects are written field by field in a fixed order, so two equal styles key
 * the same however they were built.
 */
export function textStyleSignature(
  style: ClipTextStyle,
  width: number,
  height: number
): string {
  return [
    `${width}x${height}`,
    style.text,
    style.fontFamily ?? "Inter",
    style.fontSizePx,
    style.fontWeight ?? 400,
    style.color,
    style.align ?? "center",
    style.maxWidthFrac ?? 0.8,
    style.fontStyle ?? "normal",
    style.letterSpacingPx ?? 0,
    style.lineHeight ?? 1.2,
    style.verticalAlign ?? "middle",
    style.stroke ? `${style.stroke.color}@${style.stroke.widthPx}` : "-",
    style.shadow
      ? `${style.shadow.color}@${style.shadow.blurPx}/${style.shadow.offsetX}/${style.shadow.offsetY}`
      : "-",
    scrimSignature(style.background),
    fillSignature(style.fill)
  ].join("|");
}

/** A fill's own signature, stops included. */
function fillSignature(fill: ShapeFill | undefined): string {
  if (!fill) return "-";
  if (fill.type === "solid") return `solid:${fill.color}`;
  const stops = fill.stops
    .map((stop) => `${stop.offset}:${stop.color}`)
    .join(",");
  return fill.type === "linear"
    ? `linear:${fill.angle}:${stops}`
    : `radial:${stops}`;
}

/**
 * How one run of text is painted: the resolved fill, the outline drawn under
 * it, the shadow both cast, and how the glyphs are advanced.
 *
 * Resolved once per draw and reused for every line or unit, so a gradient
 * spans the whole block rather than restarting on each line, and a staggered
 * title is painted exactly like its un-staggered self.
 */
interface TextPaint {
  fill: CanvasPaint;
  stroke: { color: string; widthPx: number } | null;
  shadow: { color: string; blurPx: number; offsetX: number; offsetY: number } | null;
  letterSpacingPx: number;
  /** True when the context advances the glyphs itself. */
  nativeSpacing: boolean;
  /** Unspaced advance, for placing the glyphs by hand. */
  measure: (text: string) => number;
}

/**
 * Set the context's own letter spacing where it has one, and report whether it
 * took. Both shipping contexts have it and both charge the advance after every
 * glyph, trailing one included — which is what the layout charges too, so the
 * hand-placed fallback lands the glyphs in the same places.
 */
function setLetterSpacing(ctx: RasterContext2D, px: number): boolean {
  if (typeof ctx.letterSpacing !== "string") return false;
  ctx.letterSpacing = `${px}px`;
  return true;
}

/** Leave no shadow in force — the state a fresh context starts in. */
function clearShadow(ctx: RasterContext2D): void {
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Measure and place `style`, leaving the context ready to paint text: the font
 * set, the glyphs positioned from their left edge and their vertical center.
 *
 * Measurement runs with native letter spacing off so a context that has the
 * property reports the same advances as one that does not; the spacing is
 * charged by the layout and switched on afterwards, for the draw.
 */
function prepareText(
  ctx: RasterContext2D,
  style: ClipTextStyle,
  width: number,
  height: number,
  staggerUnit?: StaggerUnit
): { layout: TextBlockLayout; units: TextStaggerUnit[]; paint: TextPaint } {
  ctx.font = textFontSpec(style);
  clearShadow(ctx);
  setLetterSpacing(ctx, 0);
  const measure = (text: string): number => ctx.measureText(text).width;
  const layout = layoutTextBlock(measure, style, width, height);
  const units = staggerUnit
    ? layoutStaggerUnits(measure, style, width, height, staggerUnit)
    : [];

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  if (style.background) drawScrim(ctx, style.background, layout.box);

  const letterSpacingPx = textLetterSpacingPx(style);
  const nativeSpacing = setLetterSpacing(ctx, letterSpacingPx);
  return {
    layout,
    units,
    paint: {
      fill: style.fill
        ? resolveShapeFill(ctx, style.fill, layout.box)
        : style.color,
      stroke:
        style.stroke && style.stroke.widthPx > 0 ? { ...style.stroke } : null,
      shadow: style.shadow ? { ...style.shadow } : null,
      letterSpacingPx,
      nativeSpacing,
      measure
    }
  };
}

/**
 * The scrim behind a block of text: a rounded rect grown by the padding.
 * Shared by the text draw and {@link drawCaption}, which measure their own
 * blocks but sit them on the same thing.
 */
function drawScrim(
  ctx: RasterContext2D,
  scrim: BlockScrim,
  box: TextBlockBox
): void {
  // A scrim backs text. With nothing to back — an empty title, whose block
  // collapses to a point — the padding alone would draw a bare pill.
  if (box.width <= 0) return;
  const pad = Math.max(0, scrim.paddingPx);
  const width = box.width + pad * 2;
  const height = box.height + pad * 2;
  if (height <= 0) return;
  ctx.fillStyle = scrim.color;
  ctx.beginPath();
  tracePath(
    ctx,
    roundedRectSegments(
      box.x - pad,
      box.y - pad,
      width,
      height,
      Math.max(0, scrim.radiusPx ?? 0)
    ),
    UNSCALED
  );
  ctx.fill();
}

/**
 * Paint one run at its left edge: shadow, then outline, then fill.
 *
 * The outline is drawn first so the fill sits inside it rather than being eaten
 * by it, and it is the outline that casts the shadow — a second cast from the
 * fill would darken the whole silhouette twice.
 */
function paintTextRun(
  ctx: RasterContext2D,
  paint: TextPaint,
  text: string,
  x: number,
  y: number
): void {
  if (text === "") return;
  if (paint.shadow) {
    ctx.shadowColor = paint.shadow.color;
    ctx.shadowBlur = Math.max(0, paint.shadow.blurPx);
    ctx.shadowOffsetX = paint.shadow.offsetX;
    ctx.shadowOffsetY = paint.shadow.offsetY;
  }
  if (paint.stroke) {
    ctx.strokeStyle = paint.stroke.color;
    ctx.lineWidth = paint.stroke.widthPx;
    ctx.lineJoin = "round";
    advanceRun(ctx, paint, text, x, y, "stroke");
    if (paint.shadow) clearShadow(ctx);
  }
  ctx.fillStyle = paint.fill;
  advanceRun(ctx, paint, text, x, y, "fill");
  if (paint.shadow) clearShadow(ctx);
}

/**
 * Issue a run as one call, or — when the context has no letter spacing of its
 * own — as one call per grapheme placed at its unspaced prefix width plus the
 * spacing accumulated before it, so the glyphs sit where the shaped word would
 * have put them and only the pair kerning is lost.
 */
function advanceRun(
  ctx: RasterContext2D,
  paint: TextPaint,
  text: string,
  x: number,
  y: number,
  mode: "fill" | "stroke"
): void {
  if (paint.letterSpacingPx === 0 || paint.nativeSpacing) {
    if (mode === "stroke") ctx.strokeText(text, x, y);
    else ctx.fillText(text, x, y);
    return;
  }
  let prefix = "";
  let index = 0;
  for (const grapheme of segmentGraphemes(text)) {
    const at = x + paint.measure(prefix) + paint.letterSpacingPx * index;
    if (mode === "stroke") ctx.strokeText(grapheme, at, y);
    else ctx.fillText(grapheme, at, y);
    prefix += grapheme;
    index += 1;
  }
}

/**
 * Draw a text style as one block: a scrim, then the wrapped lines, placed on
 * the raster by `align` and `verticalAlign`.
 */
export function drawText(
  ctx: RasterContext2D,
  style: ClipTextStyle,
  width: number,
  height: number
): void {
  ctx.save();
  const { layout, paint } = prepareText(ctx, style, width, height);
  for (const line of layout.lines) {
    paintTextRun(ctx, paint, line.text, line.x, line.y);
  }
  ctx.restore();
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
 *
 * Styling is the whole style, resolved once and reused for every unit: the
 * scrim sits behind the block rather than behind each glyph, and a gradient
 * fill spans the block rather than restarting on every unit — so a staggered
 * title and its un-staggered self are the same picture once the animation has
 * played out.
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
  ctx.save();
  const { layout: block, units, paint } = prepareText(
    ctx,
    style,
    width,
    height,
    layout.unit
  );
  // A gradient is issued in whatever coordinate system is in force when it is
  // painted, so one resolved against the raster would ride along with each
  // unit's transform and every glyph would show the same slice of the ramp.
  const movingFill =
    style.fill && style.fill.type !== "solid" ? style.fill : null;

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
    if (movingFill) {
      // The block box in this unit's own space. Rotation is deliberately not
      // undone: the ramp turns with the glyph, which is what a rotated letter
      // carrying a gradient should look like.
      paint.fill = resolveShapeFill(ctx, movingFill, {
        x: (block.box.x - pivotX) / scaleX,
        y: (block.box.y - pivotY) / scaleY,
        width: block.box.width / scaleX,
        height: block.box.height / scaleY
      });
    }
    paintTextRun(
      ctx,
      paint,
      unit.text,
      -unit.width * anchorX,
      -(anchorY - 0.5) * unit.height
    );
    ctx.restore();
  });
  ctx.restore();
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
