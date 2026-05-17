/**
 * strokeRendering.ts
 *
 * Stroke rendering functions for brush, pencil, and eraser tools.
 * Handles pressure sensitivity, dab spacing, stamp caching, supersampling,
 * and dirty-rect tracking for efficient canvas updates.
 */

import type {
  Point,
  BrushSettings,
  BrushType,
  PencilSettings,
  EraserSettings
} from "../types";
import {
  parseColorToRgba,
  DEFAULT_PRESSURE_MIN_SCALE,
  DEFAULT_PRESSURE_CURVE
} from "../types";
import type { DirtyRectBox, DirtyRectTracker } from "../rendering/canvasUtils";

// ─── Constants ──────────────────────────────────────────────────────────────

/** @deprecated Prefer {@link DEFAULT_PRESSURE_MIN_SCALE} / per-tool `pressureMinScale`. */
export const MIN_PRESSURE_FACTOR = 0.2;

/**
 * Map hardware pressure in [0, 1] to a size/opacity multiplier in [minScale, 1].
 * Used by brush and pencil when pressure sensitivity is on.
 */
export function strokePressureMultiplier(
  pressure: number,
  minScale: number = DEFAULT_PRESSURE_MIN_SCALE,
  curve: number = DEFAULT_PRESSURE_CURVE
): number {
  const m = Math.max(0.02, Math.min(1, minScale));
  const c = Math.max(0.35, Math.min(3, curve));
  const p = Math.max(0, Math.min(1, pressure));
  const shaped = c === 1 ? p : Math.pow(p, c);
  return m + (1 - m) * shaped;
}

/**
 * Pointer pressure is meaningful for pen/touch. Mouse uses a nominal value
 * (commonly 0.5) while the button is down per Pointer Events — ignore it for
 * brush/pencil/eraser dynamics so mouse strokes stay full strength.
 */
export function paintPressureForEngine(
  pressure: number | undefined,
  pointerType: string | undefined
): number | undefined {
  if (pointerType !== "pen" && pointerType !== "touch") {
    return undefined;
  }
  if (pressure === undefined || pressure <= 0) {
    return undefined;
  }
  return pressure;
}

/** Tool opacity at or above this is treated as fully opaque (no pressure fade, crisp eraser stamp, etc.). */
export const SKETCH_FULL_OPACITY_THRESHOLD = 0.999;

/**
 * Document-space dab center matching `drawPencilStroke` / pencil-mode eraser `dabAt`.
 * Maps continuous pointer `(x, y)` to where ink is centered so brush/pencil previews
 * match stamped pixels (integer arc centers or half-integer crisp-cell centers).
 */
export function snapStrokeDabCenterDoc(
  x: number,
  y: number,
  effectiveSize: number,
  effectiveOpacity: number
): Point {
  const snapDabs = effectiveOpacity >= SKETCH_FULL_OPACITY_THRESHOLD;
  const usePixelCrispDab = snapDabs && effectiveSize <= 1.25;
  if (usePixelCrispDab) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    return { x: ix + 0.5, y: iy + 0.5 };
  }
  if (snapDabs) {
    // Pixel center under the cursor — matches `drawPencilStroke.dabAt`
    // (stabilize floors to cell origin, dabAt adds 0.5).
    return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
  }
  return { x, y };
}

// ─── Private helpers ────────────────────────────────────────────────────────

/**
 * Supersample factor for soft brush/eraser stamps so radial alpha falloff is
 * smooth at small brush sizes (stable appearance at any canvas zoom).
 */
function stampSupersampleScale(logicalDiameter: number): number {
  const d = Math.max(logicalDiameter, 1);
  return Math.max(2, Math.min(4, Math.round(80 / d)));
}

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

/**
 * Distribute stamps along a stroke segment with even spacing.
 * Exported for use by blur and clone rendering modules.
 */
export function stampAlongStroke(
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

// ─── Dirty-rect helpers ─────────────────────────────────────────────────────

/**
 * Expand a dirty-rect bounding box to include a point with padding.
 * Exported for use by blur rendering.
 */
export function expandDirtyRect(
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

/**
 * Expand a dirty-rect bounding box to include two points with padding.
 * Exported for use by blur rendering.
 */
export function expandDirtyRectFromPoints(
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
    const pressureFactor = strokePressureMultiplier(
      pressure,
      settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE,
      settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE
    );
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

  const pressureOpacityMul =
    settings.pressureSensitivity &&
    pressure !== undefined &&
    pressure > 0 &&
    (settings.pressureAffects === "opacity" ||
      settings.pressureAffects === "both")
      ? strokePressureMultiplier(
          pressure,
          settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE,
          settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE
        )
      : 1;

  const createBrushStamp = (
    size: number,
    hardness: number,
    roundness: number,
    angle: number,
    color: string
  ) => {
    const feather = Math.max(4, Math.ceil(size * 0.5));
    const logicalD = Math.max(2, Math.ceil(size + feather * 2));
    const stamp = window.document.createElement("canvas");
    stamp.width = logicalD;
    stamp.height = logicalD;
    const stampCtx = stamp.getContext("2d");
    if (!stampCtx) {
      return stamp;
    }
    const center = logicalD / 2;
    const radius = size / 2;
    const innerStop = Math.max(0, Math.min(1, hardness * 0.85 + 0.1));
    const parsed = parseColorToRgba(color);

    const drawAtLogicalScale = (targetCtx: CanvasRenderingContext2D) => {
      targetCtx.save();
      targetCtx.translate(center, center);
      targetCtx.rotate((angle * Math.PI) / 180);
      targetCtx.scale(1, roundness);

      if (hardness >= 0.999) {
        targetCtx.fillStyle = color;
        targetCtx.beginPath();
        targetCtx.arc(0, 0, radius, 0, Math.PI * 2);
        targetCtx.fill();
      } else {
        const gradient = targetCtx.createRadialGradient(0, 0, 0, 0, 0, radius);
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
        targetCtx.fillStyle = gradient;
        targetCtx.beginPath();
        targetCtx.arc(0, 0, radius, 0, Math.PI * 2);
        targetCtx.fill();
      }
      targetCtx.restore();
    };

    if (hardness >= 0.999) {
      drawAtLogicalScale(stampCtx);
      return stamp;
    }

    const superS = stampSupersampleScale(logicalD);
    const hiPx = Math.ceil(logicalD * superS);
    const hi = window.document.createElement("canvas");
    hi.width = hiPx;
    hi.height = hiPx;
    const hiCtx = hi.getContext("2d");
    if (!hiCtx) {
      drawAtLogicalScale(stampCtx);
      return stamp;
    }
    hiCtx.setTransform(superS, 0, 0, superS, 0, 0);
    drawAtLogicalScale(hiCtx);
    stampCtx.imageSmoothingEnabled = true;
    stampCtx.imageSmoothingQuality = "high";
    stampCtx.clearRect(0, 0, logicalD, logicalD);
    stampCtx.drawImage(hi, 0, 0, hiPx, hiPx, 0, 0, logicalD, logicalD);
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
      ctx.globalAlpha = dabAlpha * pressureOpacityMul;
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
    ctx.globalAlpha = dabAlpha * pressureOpacityMul;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(stamp, x - stamp.width / 2, y - stamp.height / 2);
    ctx.restore();
    markDirtyRect(x, y, effectiveSize / 2);
  };

  stampAlongStroke(from, to, spacing, stampBrushDab, stampState);
}

// ─── Eraser Stroke ───────────────────────────────────────────────────────────

const ERASER_STROKE_COLOR = "#000000";

/** Black stroke-buffer mask: same brush shape/behavior as `brush` (new brush types apply automatically). */
export function brushSettingsForEraserStroke(
  eraser: EraserSettings,
  brush: BrushSettings
): BrushSettings {
  return {
    ...brush,
    size: eraser.size,
    opacity: 1,
    color: ERASER_STROKE_COLOR
  };
}

/** Black stroke-buffer mask: same dab behavior as `pencil`. */
export function pencilSettingsForEraserStroke(
  eraser: EraserSettings,
  pencil: PencilSettings
): PencilSettings {
  return {
    ...pencil,
    size: eraser.size,
    opacity: 1,
    color: ERASER_STROKE_COLOR
  };
}

function eraserModeFromSettings(settings: EraserSettings): "brush" | "pencil" {
  const raw = settings as EraserSettings & { tip?: "brush" | "pencil" };
  return settings.mode ?? raw.tip ?? "brush";
}

/**
 * Eraser draws a black mask into the stroke buffer; the session composites with
 * `destination-out` at tool opacity. Delegates to `drawBrushStroke` or
 * `drawPencilStroke` using current brush/pencil tool settings (size overridden by
 * eraser).
 */
export function drawEraserStroke(
  from: Point,
  to: Point,
  eraser: EraserSettings,
  brushTemplate: BrushSettings,
  pencilTemplate: PencilSettings,
  ctx: CanvasRenderingContext2D,
  pressure: number | undefined,
  dirtyRect: DirtyRectTracker,
  brushStampCache: Map<string, HTMLCanvasElement>,
  stampState?: StrokeStampState
): void {
  if (eraserModeFromSettings(eraser) === "pencil") {
    drawPencilStroke(
      from,
      to,
      pencilSettingsForEraserStroke(eraser, pencilTemplate),
      ctx,
      pressure,
      dirtyRect,
      stampState
    );
    return;
  }

  drawBrushStroke(
    from,
    to,
    brushSettingsForEraserStroke(eraser, brushTemplate),
    ctx,
    pressure,
    dirtyRect,
    brushStampCache,
    stampState
  );
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
  const pressureAffects = settings.pressureAffects ?? "both";
  const usePressure =
    settings.pressureSensitivity &&
    pressure !== undefined &&
    pressure > 0;
  const pressureFactor = usePressure
    ? strokePressureMultiplier(
        pressure,
        settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE,
        settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE
      )
    : 1;

  let effectiveSize = settings.size;
  if (
    usePressure &&
    (pressureAffects === "size" || pressureAffects === "both")
  ) {
    effectiveSize = settings.size * pressureFactor;
  }

  let effectiveOpacity = settings.opacity;
  if (
    usePressure &&
    (pressureAffects === "opacity" || pressureAffects === "both")
  ) {
    effectiveOpacity = settings.opacity * pressureFactor;
  }

  const snapDabs = effectiveOpacity >= SKETCH_FULL_OPACITY_THRESHOLD;
  /** Single-pixel (or tiny block) dabs — avoids sub-pixel circle blur at size 1. */
  const usePixelCrispDab = snapDabs && effectiveSize <= 1.25;

  const spacing = usePixelCrispDab
    ? 0.5
    : Math.max(0.35, effectiveSize * 0.3);
  const radius =
    effectiveSize <= 1.5
      ? Math.max(0.5, effectiveSize / 2)
      : Math.max(0.75, effectiveSize / 2);

  const markDab = (x: number, y: number, pad: number) => {
    expandDirtyRect(dirtyRect, x, y, Math.max(2, pad + 2));
  };

  ctx.save();
  ctx.globalAlpha = Math.min(1, effectiveOpacity);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = settings.color;
  ctx.imageSmoothingEnabled = !usePixelCrispDab;

  const dabAt = (x: number, y: number) => {
    if (usePixelCrispDab) {
      // Cursor hotspot is the pointer (x, y). fillRect(i, j, 1, 1) covers
      // [i, i+1)×[j, j+1) with center (i+0.5, j+0.5); pick i = round(x - 0.5)
      // so that center is nearest to (x, y) (not top-left at round(x), which
      // shifts ink +0.5 vs the centered brush preview).
      const ix = Math.round(x - 0.5);
      const iy = Math.round(y - 0.5);
      ctx.fillRect(ix, iy, 1, 1);
      markDab(ix + 0.5, iy + 0.5, 0.5);
      return;
    }
    // `x`/`y` have already been floor-snapped to the cell origin by
    // `PencilEngine.stabilize` for opaque strokes. Add half a pixel so
    // circular dabs sit at the CENTER of the pixel under the cursor,
    // matching the crisp 1×1 branch and the cursor preview anchor.
    const px = snapDabs ? x + 0.5 : x;
    const py = snapDabs ? y + 0.5 : y;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    markDab(px, py, radius);
  };

  stampAlongStroke(from, to, spacing, dabAt, stampState);

  ctx.restore();
}
