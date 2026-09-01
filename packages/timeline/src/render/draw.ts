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
import type { AnimationSample, CompiledAnimation } from "../animation/index.js";
import {
  createAnimationSample,
  sampleStaggeredAnimations
} from "../animation/index.js";

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

// ── Text clips ───────────────────────────────────────────────────────────────

/** Content signature of a text raster, for host-side caching. */
export function textStyleSignature(
  style: ClipTextStyle,
  width: number,
  height: number
): string {
  return `${width}x${height}|${style.text}|${style.fontFamily ?? "Inter"}|${style.fontSizePx}|${style.fontWeight ?? 400}|${style.color}|${style.align ?? "center"}|${style.maxWidthFrac ?? 0.8}`;
}

interface TextLayoutWord {
  text: string;
  /** Left edge in canvas px. */
  x: number;
  width: number;
  /** Vertical center of the word's line (textBaseline "middle"). */
  y: number;
}

interface WrappedLine {
  text: string;
  words: string[];
}

/**
 * Greedy word-wrap by measured candidate width — the one wrap rule for both
 * draw paths, so a staggered title breaks lines exactly like its
 * un-staggered self.
 */
function wrapLines(
  ctx: RasterContext2D,
  text: string,
  maxWidth: number
): WrappedLine[] {
  const lines: WrappedLine[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    let lineWords: string[] = [];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push({ text: line, words: lineWords });
        line = word;
        lineWords = [word];
      } else {
        line = candidate;
        lineWords.push(word);
      }
    }
    lines.push({ text: line, words: lineWords });
  }
  return lines;
}

/** Word-wrap `style.text` into positioned word boxes. */
function layoutWords(
  ctx: RasterContext2D,
  style: ClipTextStyle,
  width: number,
  height: number
): TextLayoutWord[] {
  const fontSize = Math.max(1, style.fontSizePx);
  const align = style.align ?? "center";
  const maxWidth =
    width * Math.min(1, Math.max(0.05, style.maxWidthFrac ?? 0.8));
  const lines = wrapLines(ctx, style.text, maxWidth);
  const spaceWidth = ctx.measureText(" ").width;
  const lineHeight = fontSize * 1.2;
  const firstY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  const out: TextLayoutWord[] = [];

  lines.forEach((line, lineIndex) => {
    const widths = line.words.map((w) => ctx.measureText(w).width);
    const lineWidth =
      widths.reduce((sum, w) => sum + w, 0) +
      spaceWidth * Math.max(0, line.words.length - 1);
    let x =
      align === "left"
        ? (width - maxWidth) / 2
        : align === "right"
          ? (width + maxWidth) / 2 - lineWidth
          : (width - lineWidth) / 2;
    const y = firstY + lineIndex * lineHeight;
    line.words.forEach((word, i) => {
      out.push({ text: word, x, width: widths[i], y });
      x += widths[i] + spaceWidth;
    });
  });
  return out;
}

export function drawText(
  ctx: RasterContext2D,
  style: ClipTextStyle,
  width: number,
  height: number
): void {
  const fontSize = Math.max(1, style.fontSizePx);
  const align = style.align ?? "center";
  const maxWidth =
    width * Math.min(1, Math.max(0.05, style.maxWidthFrac ?? 0.8));

  ctx.font = `${style.fontWeight ?? 400} ${fontSize}px ${style.fontFamily ?? "Inter, Arial, sans-serif"}`;
  const lines = wrapLines(ctx, style.text, maxWidth);

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
 * Draw each word with its own animation sample: translate to the word's
 * center (plus the sample's offset), rotate/scale about it, multiply alpha.
 * Effect/mask properties are not applied per word (block-level, v1).
 */
export function drawStaggeredText(
  ctx: RasterContext2D,
  style: ClipTextStyle,
  width: number,
  height: number,
  stagger: TextRenderStagger,
  scratch: AnimationSample
): void {
  ctx.font = `${style.fontWeight ?? 400} ${Math.max(1, style.fontSizePx)}px ${style.fontFamily ?? "Inter, Arial, sans-serif"}`;
  const words = layoutWords(ctx, style, width, height);
  ctx.fillStyle = style.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  words.forEach((word, index) => {
    const s = sampleStaggeredAnimations(
      stagger.compiled,
      stagger.localMs,
      index,
      scratch
    );
    if (s.opacity <= 0 || s.scale <= 0) return;
    ctx.save();
    ctx.translate(word.x + word.width / 2 + s.offsetX, word.y + s.offsetY);
    if (s.rotation !== 0) ctx.rotate(s.rotation);
    if (s.scale !== 1) ctx.scale(s.scale, s.scale);
    ctx.globalAlpha = s.opacity;
    ctx.fillText(word.text, -word.width / 2, 0);
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
