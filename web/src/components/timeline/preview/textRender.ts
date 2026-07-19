import type { ClipTextStyle } from "@nodetool-ai/timeline";

const MAX_CACHE_ENTRIES = 64;

export function textStyleSignature(
  style: ClipTextStyle,
  width: number,
  height: number
): string {
  return `${width}x${height}|${style.text}|${style.fontFamily ?? "Inter"}|${style.fontSizePx}|${style.fontWeight ?? 400}|${style.color}|${style.align ?? "center"}|${style.maxWidthFrac ?? 0.8}`;
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
  const lines: string[] = [];

  ctx.font = `${style.fontWeight ?? 400} ${fontSize}px ${style.fontFamily ?? "Inter, Arial, sans-serif"}`;
  for (const paragraph of style.text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }

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
    ctx.fillText(entry, x, firstBaseline + index * lineHeight)
  );
}

/** Bounded per-compositor bitmap cache keyed by content and sequence size. */
export class TextRasterizer {
  private cache = new Map<string, ImageBitmap>();

  rasterize(
    style: ClipTextStyle,
    width: number,
    height: number
  ): ImageBitmap | null {
    if (
      !style.text ||
      typeof OffscreenCanvas === "undefined" ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }
    const key = textStyleSignature(style, width, height);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawText(ctx, style, width, height);
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
