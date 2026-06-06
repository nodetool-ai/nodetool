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

import type { ResolvedCaption } from "./sceneModel";

const INACTIVE_COLOR = "#FFFFFF";
const ACTIVE_COLOR = "#FFD60A";
const OUTLINE_COLOR = "rgba(0, 0, 0, 0.85)";
const MAX_CACHE_ENTRIES = 64;

/**
 * Stable content key for a caption at a frame: the dimensions plus each word
 * with a marker on the active one. Two frames that look the same share a
 * cached bitmap, so the GPU side re-uploads only when the caption changes.
 */
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

function drawCaption(
  ctx: OffscreenCanvasRenderingContext2D,
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
  ctx.strokeStyle = OUTLINE_COLOR;

  for (const line of lines) {
    const lineWidth = line.reduce(
      (sum, w, i) => sum + w.width + (i > 0 ? spaceWidth : 0),
      0
    );
    let x = (width - lineWidth) / 2;
    for (let i = 0; i < line.length; i++) {
      const word = line[i];
      if (i > 0) x += spaceWidth;
      ctx.fillStyle = word.active ? ACTIVE_COLOR : INACTIVE_COLOR;
      ctx.strokeText(word.text, x, y);
      ctx.fillText(word.text, x, y);
      x += word.width;
    }
    y += lineHeight;
  }
}

/**
 * Caches caption bitmaps by content signature so scrubbing or replaying the
 * same word doesn't re-rasterise. Stable bitmap identity also lets the GPU
 * compositor skip re-uploading an unchanged caption. One instance lives per
 * compositor (preview) or per render pass (export); call {@link dispose} to
 * release the bitmaps.
 */
export class CaptionRasterizer {
  private cache = new Map<string, ImageBitmap>();

  rasterize(
    caption: ResolvedCaption,
    width: number,
    height: number
  ): ImageBitmap | null {
    if (caption.words.length === 0) return null;
    if (typeof OffscreenCanvas === "undefined") return null;
    if (width <= 0 || height <= 0) return null;

    const key = captionSignature(caption, width, height);
    const hit = this.cache.get(key);
    if (hit) return hit;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawCaption(ctx, caption, width, height);
    const bitmap = canvas.transferToImageBitmap();

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
  }
}
