/**
 * types.ts
 *
 * Data shapes the stroke engine reads: geometry, colour parsing, pen pressure,
 * stroke assist, and the brush/pencil/eraser tool settings with their defaults.
 * Pure values only — nothing here touches a canvas or the DOM.
 *
 * This is the single definition of these types. The web sketch editor
 * re-exports them from here.
 */

// ─── Geometry ────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

// ─── Colour ──────────────────────────────────────────────────────────────────

/** RGBA with alpha in the 0–1 range (CSS-style). */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp255 = (v: number): number =>
  Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Parse hex, rgb(), or rgba() strings used by the sketch colour pickers.
 * Unknown input falls back to opaque white.
 */
export function parseColorToRgba(input: string): Rgba {
  const t = input.trim();
  if (!t) {
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  const lower = t.toLowerCase();
  if (lower.startsWith("rgba")) {
    const m = lower.match(
      /rgba\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/
    );
    if (m) {
      return {
        r: clamp255(Number(m[1])),
        g: clamp255(Number(m[2])),
        b: clamp255(Number(m[3])),
        a: clamp01(Number(m[4]))
      };
    }
  }
  if (lower.startsWith("rgb(")) {
    const m = lower.match(
      /rgb\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/
    );
    if (m) {
      return {
        r: clamp255(Number(m[1])),
        g: clamp255(Number(m[2])),
        b: clamp255(Number(m[3])),
        a: 1
      };
    }
  }

  let h = t.replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(h)) {
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((x) => Number.isNaN(x))) {
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    return { r, g, b, a: 1 };
  }
  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const aByte = parseInt(h.slice(6, 8), 16);
    if ([r, g, b, aByte].some((x) => Number.isNaN(x))) {
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    return { r, g, b, a: clamp01(aByte / 255) };
  }

  return { r: 255, g: 255, b: 255, a: 1 };
}

// ─── Dirty rect ──────────────────────────────────────────────────────────────

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

// ─── Brush shapes ────────────────────────────────────────────────────────────

export type BrushType = "round" | "soft" | "airbrush" | "spray";

// ─── Pen Pressure ────────────────────────────────────────────────────────────

/**
 * Default light-press scale (6% of full size at minimum pressure; see `strokePressureMultiplier`).
 * Lower = thinner light strokes and a wider thin→thick range (also adjustable per tool in settings).
 */
export const DEFAULT_PRESSURE_MIN_SCALE = 0.06;

/**
 * Raw pen pressure is raised to this power before mapping to `[pressureMinScale, 1]`.
 * `1` = linear; values above 1 need firmer pressure to reach full size (more contrast in mid/high pressure).
 */
export const DEFAULT_PRESSURE_CURVE = 1;

/**
 * Global pen/tablet pressure (single source of truth for drawing).
 * {@link BrushSettings} / {@link PencilSettings} still include the same fields for future per-tool expansion.
 */
export interface PenPressureSettings {
  pressureSensitivity: boolean;
  pressureAffects: "size" | "opacity" | "both";
  pressureMinScale: number;
  pressureCurve: number;
}

export const DEFAULT_PEN_PRESSURE: PenPressureSettings = {
  pressureSensitivity: true,
  pressureAffects: "both",
  pressureMinScale: DEFAULT_PRESSURE_MIN_SCALE,
  pressureCurve: DEFAULT_PRESSURE_CURVE
};

// ─── Stroke Assist ───────────────────────────────────────────────────────────

export type StrokeAssistMode = "stabilizer" | "lazy";

export type StrokeAssistSnapMode = "off" | "angle";

export type StrokeAssistPreset = "smooth" | "lazy" | "inking" | "custom";

export interface StrokeAssistSettings {
  preset: StrokeAssistPreset;
  mode: StrokeAssistMode;
  /** Main assist amount: 0 = off, 1 = maximum effect. */
  strength: number;
  snapMode: StrokeAssistSnapMode;
  /** Blend toward the snapped guide when snapping is enabled. */
  snapStrength: number;
  /** Angle step in degrees for angle snap. */
  angleIncrement: number;
}

export const DEFAULT_STROKE_ASSIST_SETTINGS: StrokeAssistSettings = {
  preset: "custom",
  mode: "stabilizer",
  strength: 0,
  snapMode: "off",
  snapStrength: 0.75,
  angleIncrement: 45
};

export function createStrokeAssistPreset(
  preset: Exclude<StrokeAssistPreset, "custom">
): StrokeAssistSettings {
  switch (preset) {
    case "smooth":
      return {
        preset,
        mode: "stabilizer",
        strength: 0.65,
        snapMode: "off",
        snapStrength: DEFAULT_STROKE_ASSIST_SETTINGS.snapStrength,
        angleIncrement: 45
      };
    case "lazy":
      return {
        preset,
        mode: "lazy",
        strength: 0.6,
        snapMode: "off",
        snapStrength: DEFAULT_STROKE_ASSIST_SETTINGS.snapStrength,
        angleIncrement: 45
      };
    case "inking":
      return {
        preset,
        mode: "lazy",
        strength: 0.45,
        snapMode: "angle",
        snapStrength: 0.9,
        angleIncrement: 45
      };
  }
}

const STROKE_ASSIST_ANGLE_INCREMENTS = [15, 30, 45, 90] as const;

function normalizedStrokeAssistAngleIncrement(
  value: StrokeAssistSettings["angleIncrement"] | undefined,
  fallback: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  const nearest = STROKE_ASSIST_ANGLE_INCREMENTS.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  );
  return nearest;
}

function normalizedUnitScalar(
  value: number | undefined,
  fallback: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

export function resolveStrokeAssistSettings(
  legacyStabilizer: number | undefined,
  strokeAssist: Partial<StrokeAssistSettings> | undefined
): StrokeAssistSettings {
  const presetBase =
    strokeAssist?.preset && strokeAssist.preset !== "custom"
      ? createStrokeAssistPreset(strokeAssist.preset)
      : DEFAULT_STROKE_ASSIST_SETTINGS;
  const merged = {
    ...presetBase,
    ...(strokeAssist ?? {})
  };
  if (!strokeAssist) {
    merged.strength = normalizedUnitScalar(
      legacyStabilizer,
      DEFAULT_STROKE_ASSIST_SETTINGS.strength
    );
    merged.mode = "stabilizer";
    merged.snapMode = "off";
    merged.preset = "custom";
  }
  const shouldPreferLegacyStabilizer =
    legacyStabilizer !== undefined &&
    legacyStabilizer > 0 &&
    merged.preset === "custom" &&
    merged.mode === "stabilizer" &&
    merged.strength === DEFAULT_STROKE_ASSIST_SETTINGS.strength &&
    merged.snapMode === DEFAULT_STROKE_ASSIST_SETTINGS.snapMode;
  if (shouldPreferLegacyStabilizer) {
    merged.strength = legacyStabilizer;
  }
  return {
    preset: merged.preset ?? "custom",
    mode: merged.mode === "lazy" ? "lazy" : "stabilizer",
    strength: normalizedUnitScalar(
      merged.strength,
      DEFAULT_STROKE_ASSIST_SETTINGS.strength
    ),
    snapMode: merged.snapMode === "angle" ? "angle" : "off",
    snapStrength: normalizedUnitScalar(
      merged.snapStrength,
      DEFAULT_STROKE_ASSIST_SETTINGS.snapStrength
    ),
    angleIncrement: normalizedStrokeAssistAngleIncrement(
      merged.angleIncrement,
      DEFAULT_STROKE_ASSIST_SETTINGS.angleIncrement
    )
  };
}

// ─── Tool Settings ───────────────────────────────────────────────────────────

export interface BrushSettings {
  size: number;
  opacity: number;
  hardness: number;
  color: string;
  brushType: BrushType;
  pressureSensitivity: boolean;
  pressureAffects: "size" | "opacity" | "both";
  /** Light-press scale (typically 0.02–0.5). Defaults: {@link DEFAULT_PRESSURE_MIN_SCALE}. */
  pressureMinScale: number;
  /** Pressure response curve exponent (typically 0.5–2.5). Defaults: {@link DEFAULT_PRESSURE_CURVE}. */
  pressureCurve: number;
  roundness: number; // 0.1 to 1.0 (1.0 = perfect circle)
  angle: number; // 0 to 360 degrees
  /** Stroke stabilizer strength: 0 = off, 1 = maximum smoothing. */
  stabilizer: number;
  /** New stroke input assist model. Falls back to legacy `stabilizer` when absent. */
  strokeAssist?: StrokeAssistSettings;
}

export interface PencilSettings {
  size: number;
  opacity: number;
  color: string;
  pressureSensitivity: boolean;
  pressureAffects: "size" | "opacity" | "both";
  /** @see {@link BrushSettings.pressureMinScale} */
  pressureMinScale: number;
  /** @see {@link BrushSettings.pressureCurve} */
  pressureCurve: number;
  /** Stroke stabilizer strength: 0 = off, 1 = maximum smoothing. */
  stabilizer: number;
  /** New stroke input assist model. Falls back to legacy `stabilizer` when absent. */
  strokeAssist?: StrokeAssistSettings;
  /**
   * When true, dabs are drawn as crisp N×N filled squares centered on the
   * pixel under the cursor (pixel-art style) instead of antialiased circles.
   * Optional for back-compat with older serialized documents; treat absent
   * as `true` (the default for new pencils).
   */
  pixelPerfect?: boolean;
}

/** Brush: same stamp as Brush tool (`drawBrushStroke`). Pencil: same as Pencil tool (`drawPencilStroke`). */
export type EraserMode = "brush" | "pencil";

export interface EraserSettings {
  size: number;
  opacity: number;
  mode: EraserMode;
  /** Stroke stabilizer strength: 0 = off, 1 = maximum smoothing. */
  stabilizer: number;
  /** New stroke input assist model. Falls back to legacy `stabilizer` when absent. */
  strokeAssist?: StrokeAssistSettings;
}

/** Apply global pen-pressure settings for paint engines (brush/pencil store strips these for UI). */
export function mergePenPressureIntoBrush(
  brush: BrushSettings,
  penPressure: PenPressureSettings | undefined
): BrushSettings {
  return {
    ...brush,
    ...DEFAULT_PEN_PRESSURE,
    ...(penPressure ?? {})
  };
}

/** Apply global pen-pressure settings for paint engines (brush/pencil store strips these for UI). */
export function mergePenPressureIntoPencil(
  pencil: PencilSettings,
  penPressure: PenPressureSettings | undefined
): PencilSettings {
  return {
    ...pencil,
    ...DEFAULT_PEN_PRESSURE,
    ...(penPressure ?? {})
  };
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 8,
  opacity: 1,
  hardness: 0.65,
  color: "#ffffff",
  brushType: "round",
  pressureSensitivity: true,
  pressureAffects: "both",
  pressureMinScale: DEFAULT_PRESSURE_MIN_SCALE,
  pressureCurve: DEFAULT_PRESSURE_CURVE,
  roundness: 1.0,
  angle: 0,
  stabilizer: 0,
  strokeAssist: { ...DEFAULT_STROKE_ASSIST_SETTINGS }
};

export const DEFAULT_PENCIL_SETTINGS: PencilSettings = {
  size: 2,
  opacity: 1,
  color: "#ffffff",
  pressureSensitivity: true,
  pressureAffects: "both",
  pressureMinScale: DEFAULT_PRESSURE_MIN_SCALE,
  pressureCurve: DEFAULT_PRESSURE_CURVE,
  stabilizer: 0,
  strokeAssist: { ...DEFAULT_STROKE_ASSIST_SETTINGS },
  pixelPerfect: true
};

export const DEFAULT_ERASER_SETTINGS: EraserSettings = {
  size: 14,
  opacity: 1,
  mode: "brush",
  stabilizer: 0,
  strokeAssist: { ...DEFAULT_STROKE_ASSIST_SETTINGS }
};
