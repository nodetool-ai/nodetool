import type { ClipTextStyle, CompiledAnimation } from "@nodetool-ai/timeline";
import { sampleStaggeredAnimations } from "@nodetool-ai/timeline";
import type { AnimationSample } from "@nodetool-ai/timeline";

const MAX_CACHE_ENTRIES = 64;

/**
 * Per-frame input for a staggered text draw: the clip's compiled animations
 * (at least one carrying a `stagger`) and the clip-local time. Structurally
 * identical to `TextStaggerContext` from `sceneModel` — declared here too so
 * the rasterizer has no dependency on the scene model.
 */
export interface TextRenderStagger {
  compiled: CompiledAnimation[];
  localMs: number;
}

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
  ctx: OffscreenCanvasRenderingContext2D,
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
  ctx: OffscreenCanvasRenderingContext2D,
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

function drawText(
  ctx: OffscreenCanvasRenderingContext2D,
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
 * Draw each word with its own animation sample: translate to the word's
 * center (plus the sample's offset), rotate/scale about it, multiply alpha.
 * Effect/mask properties are not applied per word (block-level, v1).
 */
function drawStaggeredText(
  ctx: OffscreenCanvasRenderingContext2D,
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
function staggerPhase(stagger: TextRenderStagger): "active" | string {
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
  private scratchSample: AnimationSample = {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    blur: 0,
    brightness: 0,
    saturation: 1
  };

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
    const phase = stagger ? staggerPhase(stagger) : undefined;
    const cacheable = phase !== "active";
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
