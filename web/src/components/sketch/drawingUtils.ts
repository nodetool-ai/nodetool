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
  ShapeToolType,
  BrushSettings,
  BrushType,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings
} from "./types";
import { parseColorToRgba } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

export const MIN_PRESSURE_FACTOR = 0.2;

/** Tool opacity at or above this is treated as fully opaque (no pressure fade). */
const PENCIL_FULL_OPACITY_THRESHOLD = 0.999;

function adjustSpacingForHardness(
  baseSpacing: number,
  hardness: number,
  minimumSpacing: number
): number {
  const clampedHardness = Math.max(0, Math.min(1, hardness));

  // Only tighten spacing for very hard brushes where the edge becomes nearly
  // binary and the dab pattern starts showing through.
  const normalizedTightening =
    clampedHardness <= 0.7 ? 0 : (clampedHardness - 0.7) / 0.3;
  const easedTightening =
    normalizedTightening * normalizedTightening * (3 - 2 * normalizedTightening);
  const spacingFactor = 1 - 0.45 * easedTightening;

  return Math.max(minimumSpacing, baseSpacing * spacingFactor);
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
/** The target visual cell size in screen pixels. */
const CHECKERBOARD_SCREEN_CELL = 8;
const cloneMaskCache = new Map<string, Uint8ClampedArray>();
const blurBrushMaskCache = new Map<string, Float32Array>();
const blurOutputImageDataCache = new Map<string, ImageData>();

type BlurScratchBuffers = {
  capacity: number;
  influence: Float32Array;
  alpha: Float32Array;
  premultR: Float32Array;
  premultG: Float32Array;
  premultB: Float32Array;
  blurredA: Float32Array;
  blurredR: Float32Array;
  blurredG: Float32Array;
  blurredB: Float32Array;
  tempA: Float32Array;
  tempB: Float32Array;
  output: Uint8ClampedArray;
};

const blurScratch: BlurScratchBuffers = {
  capacity: 0,
  influence: new Float32Array(0),
  alpha: new Float32Array(0),
  premultR: new Float32Array(0),
  premultG: new Float32Array(0),
  premultB: new Float32Array(0),
  blurredA: new Float32Array(0),
  blurredR: new Float32Array(0),
  blurredG: new Float32Array(0),
  blurredB: new Float32Array(0),
  tempA: new Float32Array(0),
  tempB: new Float32Array(0),
  output: new Uint8ClampedArray(0)
};

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function getBlurBrushMask(radius: number): {
  diameter: number;
  radius: number;
  data: Float32Array;
} {
  const safeRadius = Math.max(1, radius);
  const diameter = Math.max(1, Math.ceil(safeRadius * 2));
  const cacheKey = `${diameter}`;
  const cached = blurBrushMaskCache.get(cacheKey);
  if (cached) {
    return { diameter, radius: safeRadius, data: cached };
  }
  const center = diameter / 2;
  const innerRadius = safeRadius * 0.2;
  const data = new Float32Array(diameter * diameter);
  for (let y = 0; y < diameter; y++) {
    for (let x = 0; x < diameter; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const dist = Math.hypot(dx, dy);
      if (dist >= safeRadius) {
        continue;
      }
      data[y * diameter + x] =
        dist <= innerRadius ? 1 : 1 - smoothstep(innerRadius, safeRadius, dist);
    }
  }
  blurBrushMaskCache.set(cacheKey, data);
  return { diameter, radius: safeRadius, data };
}

function ensureBlurScratchCapacity(pixelCount: number): BlurScratchBuffers {
  if (blurScratch.capacity >= pixelCount) {
    return blurScratch;
  }
  blurScratch.capacity = pixelCount;
  blurScratch.influence = new Float32Array(pixelCount);
  blurScratch.alpha = new Float32Array(pixelCount);
  blurScratch.premultR = new Float32Array(pixelCount);
  blurScratch.premultG = new Float32Array(pixelCount);
  blurScratch.premultB = new Float32Array(pixelCount);
  blurScratch.blurredA = new Float32Array(pixelCount);
  blurScratch.blurredR = new Float32Array(pixelCount);
  blurScratch.blurredG = new Float32Array(pixelCount);
  blurScratch.blurredB = new Float32Array(pixelCount);
  blurScratch.tempA = new Float32Array(pixelCount);
  blurScratch.tempB = new Float32Array(pixelCount);
  blurScratch.output = new Uint8ClampedArray(pixelCount * 4);
  return blurScratch;
}

function boxBlurHorizontalInto(
  source: Float32Array,
  target: Float32Array,
  width: number,
  height: number,
  radius: number
): void {
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const sampleX = Math.max(0, Math.min(width - 1, i));
      sum += source[rowOffset + sampleX];
    }
    target[rowOffset] = sum / windowSize;
    for (let x = 1; x < width; x++) {
      const addX = Math.min(width - 1, x + radius);
      const removeX = Math.max(0, x - radius - 1);
      sum += source[rowOffset + addX] - source[rowOffset + removeX];
      target[rowOffset + x] = sum / windowSize;
    }
  }
}

function boxBlurVerticalInto(
  source: Float32Array,
  target: Float32Array,
  width: number,
  height: number,
  radius: number
): void {
  const windowSize = radius * 2 + 1;
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const sampleY = Math.max(0, Math.min(height - 1, i));
      sum += source[sampleY * width + x];
    }
    target[x] = sum / windowSize;
    for (let y = 1; y < height; y++) {
      const addY = Math.min(height - 1, y + radius);
      const removeY = Math.max(0, y - radius - 1);
      sum += source[addY * width + x] - source[removeY * width + x];
      target[y * width + x] = sum / windowSize;
    }
  }
}

function applySeparableBoxBlurInto(
  source: Float32Array,
  target: Float32Array,
  tempA: Float32Array,
  tempB: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes: number
): void {
  if (radius <= 0 || passes <= 0) {
    target.set(source.subarray(0, width * height));
    return;
  }
  let currentSource = source;
  let horizontalTarget = tempA;
  for (let pass = 0; pass < passes; pass++) {
    boxBlurHorizontalInto(currentSource, horizontalTarget, width, height, radius);
    const verticalTarget = pass === passes - 1 ? target : tempB;
    boxBlurVerticalInto(horizontalTarget, verticalTarget, width, height, radius);
    currentSource = verticalTarget;
    horizontalTarget = horizontalTarget === tempA ? tempB : tempA;
  }
}

function getBlurOutputImageData(width: number, height: number): ImageData {
  const cacheKey = `${width}x${height}`;
  const cached = blurOutputImageDataCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const created = new ImageData(width, height);
  blurOutputImageDataCache.set(cacheKey, created);
  return created;
}

function getEffectiveBlurSettings(strength: number): {
  radius: number;
  blend: number;
  passes: number;
} {
  const normalized = Math.max(0, Math.min(1, (strength - 1) / 19));
  const radius = Math.max(1, 1 + Math.round(Math.pow(normalized, 1.5) * 7));
  const blend = 0.18 + normalized * 0.58;
  const passes = radius >= 7 ? 2 : 1;
  return { radius, blend, passes };
}

export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom?: number
): void {
  // Build a 2×2-cell tile at a fixed pixel size; we'll use a pattern
  // transform to scale it so the visual cell size stays constant on screen.
  const tileCell = CHECKERBOARD_SCREEN_CELL;
  if (!cachedCheckerboardTile) {
    cachedCheckerboardTile = document.createElement("canvas");
    cachedCheckerboardTile.width = tileCell * 2;
    cachedCheckerboardTile.height = tileCell * 2;
    const pCtx = cachedCheckerboardTile.getContext("2d");
    if (pCtx) {
      pCtx.fillStyle = "#2a2a2a";
      pCtx.fillRect(0, 0, tileCell * 2, tileCell * 2);
      pCtx.fillStyle = "#3a3a3a";
      pCtx.fillRect(0, 0, tileCell, tileCell);
      pCtx.fillRect(tileCell, tileCell, tileCell, tileCell);
    }
  }
  const pattern = ctx.createPattern(cachedCheckerboardTile, "repeat");
  if (pattern) {
    // Scale the pattern so each cell is `tileCell / zoom` document pixels.
    // After CSS `scale(zoom)` the result is `tileCell` screen pixels — constant.
    const s = 1 / (zoom && zoom > 0 ? zoom : 1);
    if (s !== 1 && typeof DOMMatrix !== "undefined" && pattern.setTransform) {
      pattern.setTransform(new DOMMatrix().scaleSelf(s, s));
    }
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
  }

  const markDirtyRect = (x: number, y: number, radius: number) => {
    expandDirtyRect(dirtyRect, x, y, Math.max(2, radius + 2));
  };
  const stampHardness =
    brushType === "soft"
      ? Math.min(settings.hardness, 0.35)
      : brushType === "airbrush"
        ? Math.min(settings.hardness, 0.18)
        : settings.hardness;

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

  const baseSpacing =
    brushType === "spray"
      ? Math.max(1, effectiveSize * 0.22)
      : brushType === "airbrush"
        ? Math.max(0.5, effectiveSize * 0.08)
        : Math.max(0.5, effectiveSize * 0.12);
  const spacing =
    brushType === "spray"
      ? baseSpacing
      : adjustSpacingForHardness(baseSpacing, stampHardness, 0.5);

  // Dabs paint at full alpha onto the stroke buffer. The stroke buffer is
  // composited onto the layer at the brush opacity, so per-dab alpha only
  // needs to be reduced for build-up brush types (airbrush).
  const dabAlpha = brushType === "airbrush" ? 0.18 : 1.0;

  const stampBrushDab = (x: number, y: number) => {
    if (brushType === "spray") {
      const density = Math.max(6, Math.round(effectiveSize * 0.8));
      const radius = effectiveSize / 2;
      ctx.save();
      ctx.globalAlpha = dabAlpha;
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

    const stamp = getBrushStamp(
      effectiveSize,
      stampHardness,
      settings.roundness,
      settings.angle,
      settings.color
    );
    ctx.save();
    ctx.globalAlpha = dabAlpha;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(stamp, x - stamp.width / 2, y - stamp.height / 2);
    ctx.restore();
    markDirtyRect(x, y, effectiveSize / 2);
  };

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
  if (pressure !== undefined && pressure > 0) {
    const pressureFactor = Math.max(MIN_PRESSURE_FACTOR, pressure);
    effectiveSize = settings.size * pressureFactor;
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

  const baseSpacing = Math.max(0.5, effectiveSize * 0.12);
  const stamp = getEraserStamp(
    effectiveSize,
    Math.max(0.05, Math.min(1, settings.hardness))
  );
  const spacing = adjustSpacingForHardness(
    baseSpacing,
    Math.max(0.05, Math.min(1, settings.hardness)),
    0.5
  );

  // Eraser dabs paint at full alpha with source-over onto the stroke buffer.
  // The buffer is composited as destination-out at eraser opacity by the
  // compositing system, so no per-dab alpha normalization is needed.
  ctx.save();
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = "source-over";
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
  dirtyRect: DirtyRectTracker,
  stampState?: StrokeStampState
): void {
  const pressureFactor =
    pressure !== undefined && pressure > 0
      ? Math.max(MIN_PRESSURE_FACTOR, pressure)
      : 1;

  let effectiveSize = settings.size;
  if (pressure !== undefined && pressure > 0) {
    effectiveSize = settings.size * pressureFactor;
  }

  const fullOpaque = settings.opacity >= PENCIL_FULL_OPACITY_THRESHOLD;
  let effectiveOpacity: number;
  if (fullOpaque) {
    effectiveOpacity = 1;
  } else if (pressure !== undefined && pressure > 0) {
    effectiveOpacity = settings.opacity * pressureFactor;
  } else {
    effectiveOpacity = settings.opacity;
  }

  const spacing = Math.max(0.35, effectiveSize * 0.3);
  const radius =
    effectiveSize <= 1.5
      ? Math.max(0.5, effectiveSize / 2)
      : Math.max(0.75, effectiveSize / 2);

  const markDab = (x: number, y: number) => {
    expandDirtyRect(dirtyRect, x, y, Math.max(2, radius + 2));
  };

  ctx.save();
  ctx.globalAlpha = effectiveOpacity;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = settings.color;
  ctx.imageSmoothingEnabled = true;

  const dabAt = (x: number, y: number) => {
    const px = fullOpaque ? Math.round(x) : x;
    const py = fullOpaque ? Math.round(y) : y;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    markDab(px, py);
  };

  stampAlongStroke(from, to, spacing, dabAt, stampState);

  ctx.restore();
}

// ─── Blur Stroke ─────────────────────────────────────────────────────────────

export function drawBlurStroke(
  from: Point,
  to: Point,
  settings: BlurSettings,
  layerCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  dirtyRect: DirtyRectTracker,
  _blurTempCanvases: BlurTempCanvases
): void {
  const targetCtx = layerCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetCtx) {
    return;
  }

  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) {
    return;
  }
  const brushRadius = Math.max(1, settings.size / 2);
  const effectiveBlur = getEffectiveBlurSettings(settings.strength);
  const blurRadius = effectiveBlur.radius;
  if (blurRadius <= 0) {
    expandDirtyRectFromPoints(dirtyRect, from, to, Math.max(2, brushRadius + 2));
    return;
  }
  const patchPad = Math.ceil(brushRadius + blurRadius * 2);
  const minX = Math.min(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxX = Math.max(from.x, to.x);
  const maxY = Math.max(from.y, to.y);
  const sx = Math.max(0, Math.floor(minX - patchPad));
  const sy = Math.max(0, Math.floor(minY - patchPad));
  const ex = Math.min(layerCanvas.width, Math.ceil(maxX + patchPad));
  const ey = Math.min(layerCanvas.height, Math.ceil(maxY + patchPad));
  const sw = ex - sx;
  const sh = ey - sy;
  if (sw <= 0 || sh <= 0) {
    return;
  }

  const sourceImage = sourceCtx.getImageData(sx, sy, sw, sh);
  const sourceData = sourceImage.data;
  const pixelCount = sw * sh;
  const scratch = ensureBlurScratchCapacity(pixelCount);
  const influence = scratch.influence.subarray(0, pixelCount);
  influence.fill(0);
  const blurBrushMask = getBlurBrushMask(brushRadius);

  const stampInfluence = (cx: number, cy: number) => {
    const startX = Math.max(0, Math.floor(cx - blurBrushMask.radius));
    const startY = Math.max(0, Math.floor(cy - blurBrushMask.radius));
    const endX = Math.min(sw, Math.ceil(cx + blurBrushMask.radius));
    const endY = Math.min(sh, Math.ceil(cy + blurBrushMask.radius));
    for (let y = startY; y < endY; y++) {
      const maskY = Math.floor(y - (cy - blurBrushMask.radius));
      for (let x = startX; x < endX; x++) {
        const maskX = Math.floor(x - (cx - blurBrushMask.radius));
        if (
          maskX < 0 ||
          maskY < 0 ||
          maskX >= blurBrushMask.diameter ||
          maskY >= blurBrushMask.diameter
        ) {
          continue;
        }
        const maskValue =
          blurBrushMask.data[maskY * blurBrushMask.diameter + maskX];
        if (maskValue <= 0) {
          continue;
        }
        const index = y * sw + x;
        influence[index] = Math.max(influence[index], maskValue);
      }
    }
  };

  const localFrom = { x: from.x - sx, y: from.y - sy };
  const localTo = { x: to.x - sx, y: to.y - sy };
  const spacing = Math.max(1.25, settings.size * 0.18);
  stampAlongStroke(localFrom, localTo, spacing, stampInfluence);
  const alpha = scratch.alpha.subarray(0, pixelCount);
  const premultR = scratch.premultR.subarray(0, pixelCount);
  const premultG = scratch.premultG.subarray(0, pixelCount);
  const premultB = scratch.premultB.subarray(0, pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const dataIndex = i * 4;
    const a = sourceData[dataIndex + 3] / 255;
    alpha[i] = a;
    premultR[i] = (sourceData[dataIndex] / 255) * a;
    premultG[i] = (sourceData[dataIndex + 1] / 255) * a;
    premultB[i] = (sourceData[dataIndex + 2] / 255) * a;
  }
  const blurredA = scratch.blurredA.subarray(0, pixelCount);
  const blurredR = scratch.blurredR.subarray(0, pixelCount);
  const blurredG = scratch.blurredG.subarray(0, pixelCount);
  const blurredB = scratch.blurredB.subarray(0, pixelCount);
  const tempA = scratch.tempA.subarray(0, pixelCount);
  const tempB = scratch.tempB.subarray(0, pixelCount);
  applySeparableBoxBlurInto(
    alpha,
    blurredA,
    tempA,
    tempB,
    sw,
    sh,
    blurRadius,
    effectiveBlur.passes
  );
  applySeparableBoxBlurInto(
    premultR,
    blurredR,
    tempA,
    tempB,
    sw,
    sh,
    blurRadius,
    effectiveBlur.passes
  );
  applySeparableBoxBlurInto(
    premultG,
    blurredG,
    tempA,
    tempB,
    sw,
    sh,
    blurRadius,
    effectiveBlur.passes
  );
  applySeparableBoxBlurInto(
    premultB,
    blurredB,
    tempA,
    tempB,
    sw,
    sh,
    blurRadius,
    effectiveBlur.passes
  );

  const output = scratch.output.subarray(0, sourceData.length);
  output.set(sourceData);
  for (let i = 0; i < pixelCount; i++) {
    const t = influence[i] * effectiveBlur.blend;
    if (t <= 0) {
      continue;
    }
    const dataIndex = i * 4;
    const originalA = alpha[i];
    const originalR = premultR[i];
    const originalG = premultG[i];
    const originalB = premultB[i];
    const outA = originalA + (blurredA[i] - originalA) * t;
    const outR = originalR + (blurredR[i] - originalR) * t;
    const outG = originalG + (blurredG[i] - originalG) * t;
    const outB = originalB + (blurredB[i] - originalB) * t;

    output[dataIndex + 3] = Math.round(Math.max(0, Math.min(1, outA)) * 255);
    if (outA > 1e-6) {
      output[dataIndex] = Math.round(
        Math.max(0, Math.min(1, outR / outA)) * 255
      );
      output[dataIndex + 1] = Math.round(
        Math.max(0, Math.min(1, outG / outA)) * 255
      );
      output[dataIndex + 2] = Math.round(
        Math.max(0, Math.min(1, outB / outA)) * 255
      );
    } else {
      output[dataIndex] = 0;
      output[dataIndex + 1] = 0;
      output[dataIndex + 2] = 0;
    }
  }
  const outputImageData = getBlurOutputImageData(sw, sh);
  outputImageData.data.set(output);
  targetCtx.putImageData(outputImageData, sx, sy);
  expandDirtyRectFromPoints(
    dirtyRect,
    from,
    to,
    Math.max(2, brushRadius + blurRadius + 2)
  );
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
  const diameter = Math.ceil(settings.size);
  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) {
    return;
  }

  const getCloneMaskData = (): Uint8ClampedArray => {
    const cacheKey = [
      diameter,
      Math.round(hardness * 1000),
      Math.round(opacity * 1000)
    ].join(":");
    const cached = cloneMaskCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const maskCanvas = window.document.createElement("canvas");
    maskCanvas.width = diameter;
    maskCanvas.height = diameter;
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskCtx) {
      return new Uint8ClampedArray(diameter * diameter * 4);
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
    const maskData = new Uint8ClampedArray(
      maskCtx.getImageData(0, 0, diameter, diameter).data
    );
    cloneMaskCache.set(cacheKey, maskData);
    return maskData;
  };

  const maskData = getCloneMaskData();

  const stampPoint = (point: Point) => {
    // Source coordinates = paint point + offset
    const sx = point.x + offset.x;
    const sy = point.y + offset.y;

    const px = Math.round(point.x - r);
    const py = Math.round(point.y - r);
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

    // Pixel-level lerp: result = dst*(1-t) + src*t  (premultiplied alpha)
    // This correctly copies source transparency — transparent source erases destination.
    const srcData  = srcCtx.getImageData(srcPx, srcPy, diameter, diameter).data;
    const dstID    = ctx.getImageData(px, py, diameter, diameter);
    const dstData  = dstID.data;

    for (let i = 0; i < dstData.length; i += 4) {
      const t = maskData[i + 3] / 255; // blend factor from gradient
      if (t <= 0) {
        continue;
      }

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
  tool: ShapeToolType,
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
  tool: ShapeToolType,
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
  tool: ShapeToolType,
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
//
// Scanline span-fill: ~7x faster than 4-way pixel-stack fill.
// Uses perceptually weighted color distance (luminance-weighted RGB + alpha)
// so tolerance behaves consistently across the color spectrum.

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

  const idx0 = (sy * w + sx) * 4;
  const targetR = data[idx0];
  const targetG = data[idx0 + 1];
  const targetB = data[idx0 + 2];
  const targetA = data[idx0 + 3];

  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
    return;
  }

  // Perceptually weighted distance² threshold.
  // Weights: R×0.299, G×0.587, B×0.114 (standard luminance coefficients).
  // tolerance is on a 0–255 per-channel scale; we square it for comparison.
  const tol = settings.tolerance;
  const tol2 = tol * tol;

  const colorMatches = (i: number): boolean => {
    const dr = data[i] - targetR;
    const dg = data[i + 1] - targetG;
    const db = data[i + 2] - targetB;
    const da = data[i + 3] - targetA;
    return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114 + da * da * 0.5 <= tol2;
  };

  const filled = new Uint8Array(w * h);

  // Stack stores interleaved (x, y) pairs as plain numbers.
  // Pre-allocate generously to avoid repeated array growth.
  const stack: number[] = [sx, sy];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    if (filled[y * w + x]) continue;
    if (!colorMatches((y * w + x) * 4)) continue;

    // ── Scan left from seed ────────────────────────────────────────────
    let x1 = x;
    while (x1 > 0 && !filled[y * w + x1 - 1] && colorMatches((y * w + x1 - 1) * 4)) {
      x1--;
    }

    // ── Scan right from seed ───────────────────────────────────────────
    let x2 = x;
    while (x2 < w - 1 && !filled[y * w + x2 + 1] && colorMatches((y * w + x2 + 1) * 4)) {
      x2++;
    }

    // ── Fill the horizontal span ───────────────────────────────────────
    const rowBase = y * w;
    for (let xi = x1; xi <= x2; xi++) {
      filled[rowBase + xi] = 1;
      const ii = (rowBase + xi) * 4;
      data[ii] = fillR;
      data[ii + 1] = fillG;
      data[ii + 2] = fillB;
      data[ii + 3] = fillA;
    }

    // ── Push one seed per contiguous unfilled sub-span above and below ─
    if (y > 0) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi++) {
        const pi = (y - 1) * w + xi;
        if (!filled[pi] && colorMatches(pi * 4)) {
          if (!inSpan) { stack.push(xi, y - 1); inSpan = true; }
        } else {
          inSpan = false;
        }
      }
    }
    if (y < h - 1) {
      let inSpan = false;
      for (let xi = x1; xi <= x2; xi++) {
        const pi = (y + 1) * w + xi;
        if (!filled[pi] && colorMatches(pi * 4)) {
          if (!inSpan) { stack.push(xi, y + 1); inSpan = true; }
        } else {
          inSpan = false;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
