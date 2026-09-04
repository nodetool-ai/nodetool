/**
 * Host-neutral raster types for agent-driven fill / shape / adjust / crop.
 *
 * `RasterImageData` is the ImageData subset both a DOM canvas and
 * `@napi-rs/canvas` produce. Ops that only need pixels take this; ops that
 * need a gradient or a path take {@link RasterContext2D}.
 */

import type { PaintContext2D, PaintGradient } from "../painting/surface.js";

export interface RasterImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface RasterContext2D extends PaintContext2D {
  canvas: { width: number; height: number };
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  getImageData(sx: number, sy: number, sw: number, sh: number): RasterImageData;
  putImageData(imageData: RasterImageData, dx: number, dy: number): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): PaintGradient;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  ellipse?(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number
  ): void;
  quadraticCurveTo?(cpx: number, cpy: number, x: number, y: number): void;
}

function isRasterContext(
  ctx: PaintContext2D | RasterContext2D
): ctx is RasterContext2D {
  return "getImageData" in ctx && typeof ctx.getImageData === "function";
}

export function requireRasterContext(
  ctx: PaintContext2D | RasterContext2D | null
): RasterContext2D {
  if (!ctx || !isRasterContext(ctx)) {
    throw new Error("A 2D context with getImageData is required.");
  }
  return ctx;
}

export function readFullImage(ctx: RasterContext2D): RasterImageData {
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}
