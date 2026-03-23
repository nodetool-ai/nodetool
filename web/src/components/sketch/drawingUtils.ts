/**
 * drawingUtils.ts
 *
 * Pure drawing algorithm functions extracted from SketchCanvas.
 * These functions have no React dependencies and operate directly on
 * Canvas2D contexts and plain data structures.
 */

import type {
  Point,
  BlendMode,
  BrushSettings,
  BrushType,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings,
  SketchTool
} from "./types";
import { parseColorToRgba } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

export const MIN_PRESSURE_FACTOR = 0.2;

function normalizeStampOpacity(
  targetOpacity: number,
  brushSize: number,
  spacing: number,
  isSingleDab: boolean
): number {
  const clampedTarget = Math.max(0, Math.min(1, targetOpacity));
  if (isSingleDab || clampedTarget <= 0 || clampedTarget >= 1) {
    return clampedTarget;
  }

  // A dragged stroke lays down many overlapping stamps. Convert the UI opacity
  // into a per-stamp alpha so the built-up stroke more closely matches the
  // requested opacity instead of saturating to fully opaque immediately.
  const overlapCount = Math.max(1, brushSize / Math.max(0.01, spacing));
  return 1 - Math.pow(1 - clampedTarget, 1 / overlapCount);
}

export interface StrokeStampState {
  hasStamped: boolean;
  distanceToNextDab: number;
}

function stampAlongStroke(
  from: Point,
  to: Point,
  spacing: number,
  stampAtPoint: (x: number, y: number) => void,
  stampState?: StrokeStampState
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  if (!stampState) {
    if (distance === 0) {
      stampAtPoint(from.x, from.y);
      return;
    }

    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      stampAtPoint(from.x + dx * t, from.y + dy * t);
    }
    return;
  }

  if (!stampState.hasStamped) {
    stampAtPoint(from.x, from.y);
    stampState.hasStamped = true;
    stampState.distanceToNextDab = spacing;
  }

  if (distance === 0) {
    return;
  }

  let travelled = 0;
  let distanceToNextDab = stampState.distanceToNextDab;

  while (travelled + distanceToNextDab <= distance) {
    travelled += distanceToNextDab;
    const t = travelled / distance;
    stampAtPoint(from.x + dx * t, from.y + dy * t);
    distanceToNextDab = spacing;
  }

  stampState.distanceToNextDab = distanceToNextDab - (distance - travelled);
}

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface DirtyRectBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Mutable ref-like object for tracking the dirty rect during a stroke */
export interface DirtyRectTracker {
  current: DirtyRectBox | null;
}

/** Reusable off-screen canvases for the blur tool */
export interface BlurTempCanvases {
  tmp: HTMLCanvasElement | null;
  blurred: HTMLCanvasElement | null;
  mask: HTMLCanvasElement | null;
}

// ─── Blend mode mapping ──────────────────────────────────────────────────────

export function blendModeToComposite(
  mode: BlendMode
): GlobalCompositeOperation {
  switch (mode) {
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "darken":
      return "darken";
    case "lighten":
      return "lighten";
    case "color-dodge":
      return "color-dodge";
    case "color-burn":
      return "color-burn";
    case "hard-light":
      return "hard-light";
    case "soft-light":
      return "soft-light";
    case "difference":
      return "difference";
    case "exclusion":
      return "exclusion";
    default:
      return "source-over";
  }
}

// ─── Checkerboard ────────────────────────────────────────────────────────────

let cachedCheckerboardTile: HTMLCanvasElement | null = null;

export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const size = 8;
  if (!cachedCheckerboardTile) {
    cachedCheckerboardTile = document.createElement("canvas");
    cachedCheckerboardTile.width = size * 2;
    cachedCheckerboardTile.height = size * 2;
    const pCtx = cachedCheckerboardTile.getContext("2d");
    if (pCtx) {
      pCtx.fillStyle = "#2a2a2a";
      pCtx.fillRect(0, 0, size * 2, size * 2);
      pCtx.fillStyle = "#3a3a3a";
      pCtx.fillRect(0, 0, size, size);
      pCtx.fillRect(size, size, size, size);
    }
  }
  const pattern = ctx.createPattern(cachedCheckerboardTile, "repeat");
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Fallback: solid background
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, width, height);
  }
}

// ─── Dirty-rect helper ──────────────────────────────────────────────────────

function expandDirtyRect(
  dirtyRect: DirtyRectTracker,
  x: number,
  y: number,
  pad: number
): void {
  const next: DirtyRectBox = {
    minX: Math.floor(x - pad),
    minY: Math.floor(y - pad),
    maxX: Math.ceil(x + pad),
    maxY: Math.ceil(y + pad)
  };
  const current = dirtyRect.current;
  if (!current) {
    dirtyRect.current = next;
    return;
  }
  current.minX = Math.min(current.minX, next.minX);
  current.minY = Math.min(current.minY, next.minY);
  current.maxX = Math.max(current.maxX, next.maxX);
  current.maxY = Math.max(current.maxY, next.maxY);
}

function expandDirtyRectFromPoints(
  dirtyRect: DirtyRectTracker,
  start: Point,
  end: Point,
  pad: number
): void {
  const next: DirtyRectBox = {
    minX: Math.floor(Math.min(start.x, end.x) - pad),
    minY: Math.floor(Math.min(start.y, end.y) - pad),
    maxX: Math.ceil(Math.max(start.x, end.x) + pad),
    maxY: Math.ceil(Math.max(start.y, end.y) + pad)
  };
  const current = dirtyRect.current;
  if (!current) {
    dirtyRect.current = next;
    return;
  }
  current.minX = Math.min(current.minX, next.minX);
  current.minY = Math.min(current.minY, next.minY);
  current.maxX = Math.max(current.maxX, next.maxX);
  current.maxY = Math.max(current.maxY, next.maxY);
}

// ─── Brush Stroke ────────────────────────────────────────────────────────────

export function drawBrushStroke(
  from: Point,
  to: Point,
  settings: BrushSettings,
  ctx: CanvasRenderingContext2D,
  pressure: number | undefined,
  dirtyRect: DirtyRectTracker,
  brushStampCache: Map<string, HTMLCanvasElement>,
  stampState?: StrokeStampState
): void {
  const brushType: BrushType = settings.brushType || "round";
  let effectiveSize = settings.size;
  let effectiveOpacity = settings.opacity;
  if (
    settings.pressureSensitivity &&
    pressure !== undefined &&
    pressure > 0
  ) {
    const pressureFactor = Math.max(MIN_PRESSURE_FACTOR, pressure);
    if (
      settings.pressureAffects === "size" ||
      settings.pressureAffects === "both"
    ) {
      effectiveSize = settings.size * pressureFactor;
    }
    if (
      settings.pressureAffects === "opacity" ||
      settings.pressureAffects === "both"
    ) {
      effectiveOpacity = settings.opacity * pressureFactor;
    }
  }

  const markDirtyRect = (x: number, y: number, radius: number) => {
    expandDirtyRect(dirtyRect, x, y, Math.max(2, radius + 2));
  };

  const createBrushStamp = (
    size: number,
    hardness: number,
    roundness: number,
    angle: number,
    color: string
  ) => {
    const feather = Math.max(4, Math.ceil(size * 0.5));
    const diameter = Math.max(2, Math.ceil(size + feather * 2));
    const stamp = window.document.createElement("canvas");
    stamp.width = diameter;
    stamp.height = diameter;
    const stampCtx = stamp.getContext("2d");
    if (!stampCtx) {
      return stamp;
    }
    const center = diameter / 2;
    const radius = size / 2;
    const innerStop = Math.max(0, Math.min(1, hardness * 0.85 + 0.1));
    const parsed = parseColorToRgba(color);

    stampCtx.save();
    stampCtx.translate(center, center);
    stampCtx.rotate((angle * Math.PI) / 180);
    stampCtx.scale(1, roundness);

    if (hardness >= 0.999) {
      stampCtx.fillStyle = color;
      stampCtx.beginPath();
      stampCtx.arc(0, 0, radius, 0, Math.PI * 2);
      stampCtx.fill();
    } else {
      const gradient = stampCtx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(
        0,
        `rgba(${parsed.r},${parsed.g},${parsed.b},${parsed.a})`
      );
      gradient.addColorStop(
        innerStop,
        `rgba(${parsed.r},${parsed.g},${parsed.b},${parsed.a})`
      );
      gradient.addColorStop(
        1,
        `rgba(${parsed.r},${parsed.g},${parsed.b},0)`
      );
      stampCtx.fillStyle = gradient;
      stampCtx.beginPath();
      stampCtx.arc(0, 0, radius, 0, Math.PI * 2);
      stampCtx.fill();
    }
    stampCtx.restore();
    return stamp;
  };

  const getBrushStamp = (
    size: number,
    hardness: number,
    roundness: number,
    angle: number,
    color: string
  ) => {
    const cacheKey = [
      brushType,
      size.toFixed(2),
      hardness.toFixed(3),
      roundness.toFixed(3),
      angle.toFixed(2),
      color
    ].join("|");
    const cached = brushStampCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const created = createBrushStamp(size, hardness, roundness, angle, color);
    brushStampCache.set(cacheKey, created);
    return created;
  };

  const stampBrushDab = (x: number, y: number) => {
    if (brushType === "spray") {
      const density = Math.max(6, Math.round(effectiveSize * 0.8));
      const radius = effectiveSize / 2;
      ctx.save();
      ctx.globalAlpha = stampOpacity;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = settings.color;
      for (let i = 0; i < density; i++) {
        const theta = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * radius;
        const dotSize = Math.max(1, effectiveSize * 0.06 * Math.random());
        const px = x + Math.cos(theta) * dist;
        const py = y + Math.sin(theta) * dist;
        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      markDirtyRect(x, y, radius);
      return;
    }

    const stampHardness =
      brushType === "soft"
        ? Math.min(settings.hardness, 0.35)
        : brushType === "airbrush"
          ? Math.min(settings.hardness, 0.18)
          : settings.hardness;
    const stamp = getBrushStamp(
      effectiveSize,
      stampHardness,
      settings.roundness,
      settings.angle,
      settings.color
    );
    ctx.save();
    ctx.globalAlpha = stampOpacity;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(stamp, x - stamp.width / 2, y - stamp.height / 2);
    ctx.restore();
    markDirtyRect(x, y, effectiveSize / 2);
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const spacing =
    brushType === "spray"
      ? Math.max(1, effectiveSize * 0.22)
      : brushType === "airbrush"
        ? Math.max(0.5, effectiveSize * 0.08)
        : Math.max(0.5, effectiveSize * 0.12);
  const stampOpacity = normalizeStampOpacity(
    brushType === "airbrush" ? effectiveOpacity * 0.18 : effectiveOpacity,
    effectiveSize,
    spacing,
    distance === 0
  );

  stampAlongStroke(from, to, spacing, stampBrushDab, stampState);
}

// ─── Eraser Stroke ───────────────────────────────────────────────────────────

export function drawEraserStroke(
  from: Point,
  to: Point,
  settings: EraserSettings,
  ctx: CanvasRenderingContext2D,
  pressure: number | undefined,
  dirtyRect: DirtyRectTracker,
  eraserStampCache: Map<string, HTMLCanvasElement>,
  stampState?: StrokeStampState
): void {
  let effectiveSize = settings.size;
  let effectiveOpacity = settings.opacity;
  if (pressure !== undefined && pressure > 0) {
    const pressureFactor = Math.max(MIN_PRESSURE_FACTOR, pressure);
    effectiveSize = settings.size * pressureFactor;
    effectiveOpacity = settings.opacity * pressureFactor;
  }

  const markDirtyRect = (x: number, y: number, radius: number) => {
    expandDirtyRect(dirtyRect, x, y, Math.max(2, radius + 2));
  };

  const createEraserStamp = (
    size: number,
    hardness: number
  ): HTMLCanvasElement => {
    const feather = Math.max(4, Math.ceil(size * 0.5));
    const diameter = Math.max(2, Math.ceil(size + feather * 2));
    const stamp = window.document.createElement("canvas");
    stamp.width = diameter;
    stamp.height = diameter;
    const stampCtx = stamp.getContext("2d");
    if (!stampCtx) {
      return stamp;
    }
    const center = diameter / 2;
    const radius = size / 2;
    const innerStop = Math.max(0, Math.min(1, hardness * 0.85 + 0.1));
    const gradient = stampCtx.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      radius
    );
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(innerStop, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    stampCtx.fillStyle = gradient;
    stampCtx.beginPath();
    stampCtx.arc(center, center, radius, 0, Math.PI * 2);
    stampCtx.fill();
    return stamp;
  };

  const getEraserStamp = (size: number, hardness: number) => {
    const cacheKey = `${size.toFixed(2)}|${hardness.toFixed(3)}`;
    const cached = eraserStampCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const created = createEraserStamp(size, hardness);
    eraserStampCache.set(cacheKey, created);
    return created;
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const spacing = Math.max(0.5, effectiveSize * 0.12);
  const stamp = getEraserStamp(
    effectiveSize,
    Math.max(0.05, Math.min(1, settings.hardness))
  );
  const stampOpacity = normalizeStampOpacity(
    effectiveOpacity,
    effectiveSize,
    spacing,
    distance === 0
  );

  ctx.save();
  ctx.globalAlpha = stampOpacity;
  ctx.globalCompositeOperation = "destination-out";
  stampAlongStroke(
    from,
    to,
    spacing,
    (x, y) => {
    ctx.drawImage(stamp, x - stamp.width / 2, y - stamp.height / 2);
    markDirtyRect(x, y, effectiveSize / 2);
    },
    stampState
  );
  ctx.restore();
}

// ─── Pencil Stroke ───────────────────────────────────────────────────────────

export function drawPencilStroke(
  from: Point,
  to: Point,
  settings: PencilSettings,
  ctx: CanvasRenderingContext2D,
  pressure: number | undefined,
  dirtyRect: DirtyRectTracker
): void {
  let effectiveSize = settings.size;
  let effectiveOpacity = settings.opacity;
  if (pressure !== undefined && pressure > 0) {
    const pressureFactor = Math.max(MIN_PRESSURE_FACTOR, pressure);
    effectiveSize = settings.size * pressureFactor;
    effectiveOpacity = settings.opacity * pressureFactor;
  }

  const markDirtyRect = (start: Point, end: Point, radius: number) => {
    expandDirtyRectFromPoints(
      dirtyRect,
      start,
      end,
      Math.max(2, radius + 2)
    );
  };

  // True 1px anti-aliased pencil: use a crisp hairline stroke.
  // Coordinates are snapped to nearest pixel center (x+0.5) for
  // consistent visual weight at any zoom level.
  if (effectiveSize <= 1.5) {
    ctx.save();
    ctx.globalAlpha = effectiveOpacity;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = settings.color;
    ctx.lineWidth = Math.max(0.5, effectiveSize);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.imageSmoothingEnabled = true;

    // Snap to pixel grid for crisp lines at 1px
    const snapX = (v: number) => Math.round(v - 0.5) + 0.5;
    const snapY = (v: number) => Math.round(v - 0.5) + 0.5;

    ctx.beginPath();
    ctx.moveTo(snapX(from.x), snapY(from.y));
    ctx.lineTo(snapX(to.x), snapY(to.y));
    ctx.stroke();
    ctx.restore();
    markDirtyRect(from, to, 1);
    return;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const spacing = Math.max(0.35, effectiveSize * 0.3);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  const radius = Math.max(0.75, effectiveSize / 2);

  ctx.save();
  ctx.globalAlpha = effectiveOpacity;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = settings.color;
  ctx.imageSmoothingEnabled = true;
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 1 : i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  markDirtyRect(from, to, radius);
}

// ─── Blur Stroke ─────────────────────────────────────────────────────────────

export function drawBlurStroke(
  from: Point,
  to: Point,
  settings: BlurSettings,
  layerCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  dirtyRect: DirtyRectTracker,
  blurTempCanvases: BlurTempCanvases
): void {
  const targetCtx = layerCanvas.getContext("2d");
  if (!targetCtx) {
    return;
  }

  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) {
    return;
  }

  // Lazily create temp canvases if needed
  if (!blurTempCanvases.tmp) {
    blurTempCanvases.tmp = window.document.createElement("canvas");
  }
  if (!blurTempCanvases.blurred) {
    blurTempCanvases.blurred = window.document.createElement("canvas");
  }
  if (!blurTempCanvases.mask) {
    blurTempCanvases.mask = window.document.createElement("canvas");
  }
  const tmp = blurTempCanvases.tmp;
  const blurred = blurTempCanvases.blurred;
  const maskCanvas = blurTempCanvases.mask;

  const markDirtyRect = (x: number, y: number, radius: number) => {
    expandDirtyRect(dirtyRect, x, y, Math.max(2, radius + settings.strength + 2));
  };

  const blurPoint = (point: Point) => {
    const r = Math.round(settings.size / 2);
    const pad = Math.ceil(settings.strength * 2);
    const x = Math.round(point.x) - r - pad;
    const y = Math.round(point.y) - r - pad;
    const w = (r + pad) * 2;
    const h = (r + pad) * 2;
    const sx = Math.max(0, x);
    const sy = Math.max(0, y);
    const sw = Math.min(layerCanvas.width - sx, w - (sx - x));
    const sh = Math.min(layerCanvas.height - sy, h - (sy - y));
    if (sw <= 0 || sh <= 0) {
      return;
    }

    const imgData = sourceCtx.getImageData(sx, sy, sw, sh);

    if (tmp.width !== sw || tmp.height !== sh) {
      tmp.width = sw;
      tmp.height = sh;
    }
    if (blurred.width !== sw || blurred.height !== sh) {
      blurred.width = sw;
      blurred.height = sh;
    }
    if (maskCanvas.width !== sw || maskCanvas.height !== sh) {
      maskCanvas.width = sw;
      maskCanvas.height = sh;
    }

    const tmpCtx = tmp.getContext("2d");
    const blurCtx = blurred.getContext("2d");
    const maskCtx = maskCanvas.getContext("2d");
    if (!tmpCtx || !blurCtx || !maskCtx) {
      return;
    }

    tmpCtx.clearRect(0, 0, sw, sh);
    tmpCtx.putImageData(imgData, 0, 0);

    blurCtx.clearRect(0, 0, sw, sh);
    blurCtx.filter = `blur(${settings.strength}px)`;
    blurCtx.drawImage(tmp, 0, 0);
    blurCtx.filter = "none";

    const cx = Math.round(point.x) - sx;
    const cy = Math.round(point.y) - sy;

    maskCtx.clearRect(0, 0, sw, sh);
    maskCtx.putImageData(imgData, 0, 0);
    maskCtx.save();
    maskCtx.beginPath();
    maskCtx.arc(cx, cy, r, 0, Math.PI * 2);
    maskCtx.clip();

    const grad = maskCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");

    maskCtx.globalCompositeOperation = "source-over";
    maskCtx.clearRect(cx - r, cy - r, r * 2, r * 2);
    maskCtx.drawImage(blurred, 0, 0);
    maskCtx.globalCompositeOperation = "destination-in";
    maskCtx.fillStyle = grad;
    maskCtx.fillRect(cx - r, cy - r, r * 2, r * 2);
    maskCtx.restore();

    targetCtx.save();
    targetCtx.clearRect(sx, sy, sw, sh);
    targetCtx.putImageData(imgData, sx, sy);
    targetCtx.globalCompositeOperation = "source-over";
    targetCtx.drawImage(maskCanvas, sx, sy);
    targetCtx.restore();
    markDirtyRect(point.x, point.y, r);
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const spacing = Math.max(1.5, settings.size * 0.2);
  const steps = Math.max(1, Math.ceil(distance / spacing));

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 1 : i / steps;
    blurPoint({
      x: from.x + dx * t,
      y: from.y + dy * t
    });
  }
}

// ─── Clone Stamp Stroke ──────────────────────────────────────────────────────

export function drawCloneStampStroke(
  from: Point,
  to: Point,
  settings: CloneStampSettings,
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  offset: Point
): void {
  const r = settings.size / 2;
  const opacity = settings.opacity;
  const hardness = settings.hardness;

  const stampPoint = (point: Point) => {
    // Source coordinates = paint point + offset
    const sx = point.x + offset.x;
    const sy = point.y + offset.y;

    const srcCtx = sourceCanvas.getContext("2d");
    if (!srcCtx) {
      return;
    }

    const px = Math.round(point.x - r);
    const py = Math.round(point.y - r);
    const diameter = Math.ceil(settings.size);
    const srcPx = Math.round(sx - r);
    const srcPy = Math.round(sy - r);

    // Skip if source region is completely outside the canvas
    if (
      srcPx + diameter < 0 ||
      srcPx >= sourceCanvas.width ||
      srcPy + diameter < 0 ||
      srcPy >= sourceCanvas.height
    ) {
      return;
    }

    // Build brush mask (radial gradient → alpha channel)
    const maskCanvas = window.document.createElement("canvas");
    maskCanvas.width = diameter;
    maskCanvas.height = diameter;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) {
      return;
    }
    const innerStop = Math.max(0, hardness);
    const grad = maskCtx.createRadialGradient(
      diameter / 2, diameter / 2, 0,
      diameter / 2, diameter / 2, diameter / 2
    );
    grad.addColorStop(0, `rgba(255,255,255,${opacity})`);
    grad.addColorStop(innerStop, `rgba(255,255,255,${opacity})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    maskCtx.fillStyle = grad;
    maskCtx.fillRect(0, 0, diameter, diameter);

    // Pixel-level lerp: result = dst*(1-t) + src*t  (premultiplied alpha)
    // This correctly copies source transparency — transparent source erases destination.
    const srcData  = srcCtx.getImageData(srcPx, srcPy, diameter, diameter).data;
    const dstID    = ctx.getImageData(px, py, diameter, diameter);
    const dstData  = dstID.data;
    const maskData = maskCtx.getImageData(0, 0, diameter, diameter).data;

    for (let i = 0; i < dstData.length; i += 4) {
      const t = maskData[i + 3] / 255; // blend factor from gradient
      if (t <= 0) continue;

      const srcA = srcData[i + 3] / 255;
      const dstA = dstData[i + 3] / 255;
      const outA = srcA * t + dstA * (1 - t);

      dstData[i + 3] = Math.round(outA * 255);

      if (outA > 0) {
        // Un-premultiply source and destination, then lerp
        const sR = (srcData[i]     / 255) * srcA;
        const sG = (srcData[i + 1] / 255) * srcA;
        const sB = (srcData[i + 2] / 255) * srcA;
        const dR = (dstData[i]     / 255) * dstA;
        const dG = (dstData[i + 1] / 255) * dstA;
        const dB = (dstData[i + 2] / 255) * dstA;
        dstData[i]     = Math.round(((sR * t + dR * (1 - t)) / outA) * 255);
        dstData[i + 1] = Math.round(((sG * t + dG * (1 - t)) / outA) * 255);
        dstData[i + 2] = Math.round(((sB * t + dB * (1 - t)) / outA) * 255);
      }
    }

    ctx.putImageData(dstID, px, py);
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const spacing = Math.max(1.5, settings.size * 0.25);
  const steps = Math.max(1, Math.ceil(distance / spacing));

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 1 : i / steps;
    stampPoint({
      x: from.x + dx * t,
      y: from.y + dy * t
    });
  }
}

// ─── Gradient Drawing ────────────────────────────────────────────────────────

export function drawGradient(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  settings: GradientSettings
): void {
  ctx.save();
  let gradient: CanvasGradient;
  if (settings.type === "radial") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    // Minimum radius of 1 prevents invalid gradient when start/end points overlap
    gradient = ctx.createRadialGradient(
      start.x,
      start.y,
      0,
      start.x,
      start.y,
      Math.max(radius, 1)
    );
  } else {
    gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  }
  gradient.addColorStop(0, settings.startColor);
  gradient.addColorStop(1, settings.endColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

// ─── Shape Drawing ───────────────────────────────────────────────────────────

/** Apply shift-constraint to shape end point */
export function constrainEnd(
  start: Point,
  end: Point,
  tool: SketchTool,
  shiftHeld: boolean
): Point {
  if (!shiftHeld) {
    return end;
  }
  if (tool === "rectangle" || tool === "ellipse") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: start.x + size * Math.sign(dx || 1),
      y: start.y + size * Math.sign(dy || 1)
    };
  }
  if (tool === "line" || tool === "arrow") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const dist = Math.sqrt(dx * dx + dy * dy);
    return {
      x: start.x + dist * Math.cos(snapped),
      y: start.y + dist * Math.sin(snapped)
    };
  }
  return end;
}

/**
 * When Alt is held for rectangle/ellipse, the start point is treated as
 * the center of the shape. Returns adjusted {start, end} pair.
 */
export function applyAltCenterDraw(
  start: Point,
  end: Point,
  tool: SketchTool,
  altHeld: boolean
): { start: Point; end: Point } {
  if (!altHeld) {
    return { start, end };
  }
  if (tool === "rectangle" || tool === "ellipse") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return {
      start: { x: start.x - dx, y: start.y - dy },
      end: { x: start.x + dx, y: start.y + dy }
    };
  }
  return { start, end };
}

export function drawShapeOnCtx(
  ctx: CanvasRenderingContext2D,
  tool: SketchTool,
  start: Point,
  end: Point,
  settings: ShapeSettings,
  shiftHeld: boolean,
  altHeld: boolean
): void {
  // Apply Alt (draw from center) before constraint
  const centered = applyAltCenterDraw(start, end, tool, altHeld);
  const constrained = constrainEnd(
    centered.start,
    centered.end,
    tool,
    shiftHeld
  );
  const s = centered.start;
  ctx.save();
  ctx.strokeStyle = settings.strokeColor;
  ctx.lineWidth = settings.strokeWidth;
  ctx.fillStyle = settings.fillColor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (tool) {
    case "rectangle": {
      const x = Math.min(s.x, constrained.x);
      const y = Math.min(s.y, constrained.y);
      const w = Math.abs(constrained.x - s.x);
      const h = Math.abs(constrained.y - s.y);
      if (settings.filled) {
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      const cx = (s.x + constrained.x) / 2;
      const cy = (s.y + constrained.y) / 2;
      const rx = Math.abs(constrained.x - s.x) / 2;
      const ry = Math.abs(constrained.y - s.y) / 2;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        Math.max(rx, 0.1),
        Math.max(ry, 0.1),
        0,
        0,
        Math.PI * 2
      );
      if (settings.filled) {
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case "line": {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(constrained.x, constrained.y);
      ctx.stroke();
      break;
    }
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(constrained.x, constrained.y);
      ctx.stroke();
      const angle = Math.atan2(constrained.y - s.y, constrained.x - s.x);
      const headLen = Math.max(settings.strokeWidth * 3, 10);
      ctx.beginPath();
      ctx.moveTo(constrained.x, constrained.y);
      ctx.lineTo(
        constrained.x - headLen * Math.cos(angle - Math.PI / 6),
        constrained.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(constrained.x, constrained.y);
      ctx.lineTo(
        constrained.x - headLen * Math.cos(angle + Math.PI / 6),
        constrained.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ─── Flood Fill ──────────────────────────────────────────────────────────────

export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  settings: FillSettings
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
    return;
  }

  const fillParsed = parseColorToRgba(settings.color);
  const fillR = fillParsed.r;
  const fillG = fillParsed.g;
  const fillB = fillParsed.b;
  const fillA = Math.round(Math.max(0, Math.min(1, fillParsed.a)) * 255);

  const idx = (sy * w + sx) * 4;
  const targetR = data[idx];
  const targetG = data[idx + 1];
  const targetB = data[idx + 2];
  const targetA = data[idx + 3];

  if (
    targetR === fillR &&
    targetG === fillG &&
    targetB === fillB &&
    targetA === fillA
  ) {
    return;
  }

  const tolerance = settings.tolerance;
  const matches = (i: number): boolean => {
    return (
      Math.abs(data[i] - targetR) <= tolerance &&
      Math.abs(data[i + 1] - targetG) <= tolerance &&
      Math.abs(data[i + 2] - targetB) <= tolerance &&
      Math.abs(data[i + 3] - targetA) <= tolerance
    );
  };

  const stack: [number, number][] = [[sx, sy]];
  const visited = new Uint8Array(w * h);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const pi = y * w + x;
    if (x < 0 || x >= w || y < 0 || y >= h || visited[pi]) {
      continue;
    }
    const i = pi * 4;
    if (!matches(i)) {
      continue;
    }
    visited[pi] = 1;
    data[i] = fillR;
    data[i + 1] = fillG;
    data[i + 2] = fillB;
    data[i + 3] = fillA;

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  ctx.putImageData(imageData, 0, 0);
}
