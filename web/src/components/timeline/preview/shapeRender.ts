import type { ClipShapeStyle } from "@nodetool-ai/timeline";

const MAX_CACHE_ENTRIES = 64;

function number(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

export function shapeStyleSignature(
  style: ClipShapeStyle,
  width: number,
  height: number
): string {
  return `${width}x${height}|${JSON.stringify(style)}`;
}

function drawShape(
  ctx: OffscreenCanvasRenderingContext2D,
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

export class ShapeRasterizer {
  private cache = new Map<string, ImageBitmap>();
  rasterize(
    style: ClipShapeStyle,
    width: number,
    height: number
  ): ImageBitmap | null {
    if (typeof OffscreenCanvas === "undefined" || width <= 0 || height <= 0) {
      return null;
    }
    const key = shapeStyleSignature(style, width, height);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawShape(ctx, style, width, height);
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
