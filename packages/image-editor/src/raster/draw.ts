import { createPaintSurface } from "../painting/surface.js";
import type { RasterContext2D } from "./types.js";

export interface GradientStop {
  offset: number;
  color: string;
}

export function drawGradient(
  ctx: RasterContext2D,
  type: "linear" | "radial",
  start: { x: number; y: number },
  end: { x: number; y: number },
  stops: readonly GradientStop[]
): void {
  const ramp =
    type === "radial"
      ? ctx.createRadialGradient(
          start.x,
          start.y,
          0,
          start.x,
          start.y,
          Math.max(1, Math.hypot(end.x - start.x, end.y - start.y))
        )
      : ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  for (const stop of sorted) {
    ramp.addColorStop(
      Math.max(0, Math.min(1, stop.offset)),
      stop.color
    );
  }
  ctx.save();
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export type RasterShapeKind =
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "polygon"
  | "star";

export interface DrawShapeOptions {
  shape: RasterShapeKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  points?: number;
  innerRadius?: number;
}

function regularPolygon(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  inner?: number
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const count = inner === undefined ? n : n * 2;
  for (let i = 0; i < count; i += 1) {
    const angle = (i * Math.PI * 2) / count - Math.PI / 2;
    const isOuter = inner === undefined || i % 2 === 0;
    const sx = isOuter ? rx : rx * inner;
    const sy = isOuter ? ry : ry * inner;
    pts.push({ x: cx + Math.cos(angle) * sx, y: cy + Math.sin(angle) * sy });
  }
  return pts;
}

function strokeAndFill(
  ctx: RasterContext2D,
  fill: string | undefined,
  stroke: string | undefined,
  strokeWidth: number
): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

export function drawShape(ctx: RasterContext2D, opts: DrawShapeOptions) {
  const strokeWidth = opts.strokeWidth ?? 1;
  const w = opts.width ?? 0;
  const h = opts.height ?? 0;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (opts.shape) {
    case "rect": {
      const x = opts.x;
      const y = opts.y;
      const r = Math.min(opts.cornerRadius ?? 0, w / 2, h / 2);
      ctx.beginPath();
      if (r > 0 && ctx.quadraticCurveTo) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      } else {
        ctx.fillStyle = opts.fill ?? "transparent";
        if (opts.fill) {
          ctx.fillRect(x, y, w, h);
        }
        if (opts.stroke && strokeWidth > 0) {
          ctx.strokeStyle = opts.stroke;
          ctx.lineWidth = strokeWidth;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x + w, y + h);
          ctx.lineTo(x, y + h);
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
        return { x, y, width: w, height: h };
      }
      strokeAndFill(ctx, opts.fill, opts.stroke, strokeWidth);
      ctx.restore();
      return { x, y, width: w, height: h };
    }
    case "ellipse": {
      const cx = opts.x + w / 2;
      const cy = opts.y + h / 2;
      const rx = Math.max(0.1, w / 2);
      const ry = Math.max(0.1, h / 2);
      ctx.beginPath();
      if (ctx.ellipse) {
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
      }
      strokeAndFill(ctx, opts.fill, opts.stroke, strokeWidth);
      ctx.restore();
      return { x: opts.x, y: opts.y, width: w, height: h };
    }
    case "line": {
      const x2 = opts.x + w;
      const y2 = opts.y + h;
      ctx.beginPath();
      ctx.moveTo(opts.x, opts.y);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = opts.stroke ?? opts.fill ?? "#000000";
      ctx.lineWidth = Math.max(1, strokeWidth);
      ctx.stroke();
      ctx.restore();
      return {
        x: Math.min(opts.x, x2),
        y: Math.min(opts.y, y2),
        width: Math.abs(w) || 1,
        height: Math.abs(h) || 1
      };
    }
    case "arrow": {
      const x2 = opts.x + w;
      const y2 = opts.y + h;
      const dx = x2 - opts.x;
      const dy = y2 - opts.y;
      const L = Math.hypot(dx, dy);
      if (L < 0.5) {
        ctx.restore();
        return { x: opts.x, y: opts.y, width: 1, height: 1 };
      }
      const angle = Math.atan2(dy, dx);
      const sw = Math.max(1, strokeWidth);
      const T = Math.max(3, sw * 1.6);
      const W = Math.max(T * 3, sw * 6);
      const halfSpan = W / 2 - T / 2;
      const tipLen = W / 2;
      const apexX = L;
      const wingFront = Math.max(0, apexX - tipLen);
      const wingShaftJunction = Math.max(0, apexX - tipLen);
      const wingBack = Math.max(0, wingShaftJunction - halfSpan);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const local = (lx: number, ly: number): [number, number] => [
        opts.x + lx * cos - ly * sin,
        opts.y + lx * sin + ly * cos
      ];
      const pts: Array<[number, number]> = [
        local(0, -T / 2),
        local(wingShaftJunction, -T / 2),
        local(wingBack, -W / 2),
        local(wingFront, -W / 2),
        local(apexX, 0),
        local(wingFront, W / 2),
        local(wingBack, W / 2),
        local(wingShaftJunction, T / 2),
        local(0, T / 2)
      ];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
      const color = opts.stroke ?? opts.fill ?? "#000000";
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      return {
        x: Math.min(opts.x, x2) - W / 2,
        y: Math.min(opts.y, y2) - W / 2,
        width: Math.abs(w) + W,
        height: Math.abs(h) + W
      };
    }
    case "polygon":
    case "star": {
      const n = Math.max(3, opts.points ?? (opts.shape === "star" ? 5 : 6));
      const cx = opts.x + w / 2;
      const cy = opts.y + h / 2;
      const inner =
        opts.shape === "star"
          ? Math.max(0.05, Math.min(0.95, (opts.innerRadius ?? 0.45)))
          : undefined;
      const pts = regularPolygon(cx, cy, w / 2, h / 2, n, inner);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      strokeAndFill(ctx, opts.fill, opts.stroke, strokeWidth);
      ctx.restore();
      return { x: opts.x, y: opts.y, width: w, height: h };
    }
  }
}

export interface RasterTransform {
  dx?: number;
  dy?: number;
  scaleX?: number;
  scaleY?: number;
  /** Degrees, clockwise. */
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

/** Bake a geometric transform into the current canvas pixels. */
export function transformRaster(
  ctx: RasterContext2D,
  opts: RasterTransform
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const tmp = createPaintSurface(w, h);
  const tmpCtx = tmp.getContext("2d");
  if (!tmpCtx) {
    throw new Error("Could not allocate a transform buffer.");
  }
  tmpCtx.drawImage(ctx.canvas, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const dx = opts.dx ?? 0;
  const dy = opts.dy ?? 0;
  const sx = (opts.flipH ? -1 : 1) * (opts.scaleX ?? 1);
  const sy = (opts.flipV ? -1 : 1) * (opts.scaleY ?? 1);
  const rot = ((opts.rotation ?? 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(w / 2 + dx, h / 2 + dy);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.drawImage(tmp, -w / 2, -h / 2);
  ctx.restore();
}

/** Crop the current canvas to [x, y, width, height], shrinking the surface. */
export function cropRaster(
  ctx: RasterContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const tmp = createPaintSurface(width, height);
  const tmpCtx = tmp.getContext("2d");
  if (!tmpCtx) {
    throw new Error("Could not allocate a crop buffer.");
  }
  tmpCtx.drawImage(
    ctx.canvas,
    x,
    y,
    width,
    height,
    0,
    0,
    width,
    height
  );
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(tmp, 0, 0);
}

/** Keep the canvas size; clear pixels outside the box. */
export function cropLayerInPlace(
  ctx: RasterContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const tmp = createPaintSurface(w, h);
  const tmpCtx = tmp.getContext("2d");
  if (!tmpCtx) {
    throw new Error("Could not allocate a crop buffer.");
  }
  tmpCtx.drawImage(
    ctx.canvas,
    x,
    y,
    width,
    height,
    x,
    y,
    width,
    height
  );
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
}
