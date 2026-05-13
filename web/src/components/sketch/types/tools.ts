/**
 * Sketch Editor – Tool Types & Settings
 *
 * Tool union, per-tool settings interfaces, default constants, pressure/assist
 * configuration, segmentation types, and tool-classification utilities.
 */

import type { SelectSettings } from "./selection";

// ─── Tool Types ───────────────────────────────────────────────────────────────

export type SketchTool =
  | "move"
  | "transform"
  | "select"
  | "brush"
  | "pencil"
  | "eraser"
  | "eyedropper"
  | "fill"
  | "shape"
  | "blur"
  | "gradient"
  | "crop"
  | "clone_stamp"
  | "adjust"
  | "segment";

export type ShapeToolType = "line" | "rectangle" | "ellipse" | "arrow";

export type BrushType = "round" | "soft" | "airbrush" | "spray";

// ─── Pen Pressure ─────────────────────────────────────────────────────────────

/**
 * Default light-press scale (6% of full size at minimum pressure; see `strokePressureMultiplier` in drawingUtils).
 * Lower = thinner light strokes and a wider thin→thick range (also adjustable per tool in settings).
 */
export const DEFAULT_PRESSURE_MIN_SCALE = 0.06;

/**
 * Raw pen pressure is raised to this power before mapping to `[pressureMinScale, 1]`.
 * `1` = linear; values above 1 need firmer pressure to reach full size (more contrast in mid/high pressure).
 */
export const DEFAULT_PRESSURE_CURVE = 1;

/** Stored `pressureMinScale` range surfaced by the Light end control (see eased slider mapping). */
const PRESSURE_MIN_SCALE_UI_MIN = 0.02;
const PRESSURE_MIN_SCALE_UI_MAX = 0.55;

/**
 * Map linear slider position `u` in [0, 1] to {@link PenPressureSettings.pressureMinScale}.
 * Quadratic ease-out allocates more of the track to the upper half of the scale, where a linear
 * slider felt ineffective (perceptual change is smaller at high min widths).
 */
export function pressureMinScaleFromSliderUnit(u: number): number {
  const t = Math.max(0, Math.min(1, u));
  const span = PRESSURE_MIN_SCALE_UI_MAX - PRESSURE_MIN_SCALE_UI_MIN;
  const eased = 1 - (1 - t) * (1 - t);
  return PRESSURE_MIN_SCALE_UI_MIN + span * eased;
}

/** Inverse of {@link pressureMinScaleFromSliderUnit} for binding the Light end slider. */
export function pressureMinScaleToSliderUnit(m: number): number {
  const span = PRESSURE_MIN_SCALE_UI_MAX - PRESSURE_MIN_SCALE_UI_MIN;
  const clamped = Math.max(
    PRESSURE_MIN_SCALE_UI_MIN,
    Math.min(PRESSURE_MIN_SCALE_UI_MAX, m)
  );
  const r = (clamped - PRESSURE_MIN_SCALE_UI_MIN) / span;
  return 1 - Math.sqrt(Math.max(0, Math.min(1, 1 - r)));
}

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

// ─── Stroke Assist ────────────────────────────────────────────────────────────

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

const DEFAULT_STROKE_ASSIST_SETTINGS: StrokeAssistSettings = {
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

function normalizedStrokeAssistAngleIncrement(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const nearest = STROKE_ASSIST_ANGLE_INCREMENTS.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  );
  return nearest;
}

function normalizedUnitScalar(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
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
    typeof legacyStabilizer === "number" &&
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

// ─── Tool Settings Interfaces ─────────────────────────────────────────────────

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
}

/** Apply global {@link ToolSettings.penPressure} for paint engines (brush/pencil store strips these for UI). */
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

/** Apply global {@link ToolSettings.penPressure} for paint engines (brush/pencil store strips these for UI). */
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

/** Brush: same stamp as Brush tool (`drawBrushStroke`). Pencil: same as Pencil tool (`drawPencilStroke`). */
export type EraserMode = "brush" | "pencil";

/** @deprecated Use `EraserMode`; kept for document migration only. */
export type EraserTip = EraserMode;

export interface EraserSettings {
  size: number;
  opacity: number;
  mode: EraserMode;
  /** Stroke stabilizer strength: 0 = off, 1 = maximum smoothing. */
  stabilizer: number;
  /** New stroke input assist model. Falls back to legacy `stabilizer` when absent. */
  strokeAssist?: StrokeAssistSettings;
}

export interface ShapeSettings {
  shapeType: ShapeToolType;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  filled: boolean;
}

export interface FillSettings {
  color: string;
  tolerance: number;
}

export interface BlurSettings {
  size: number;
  strength: number;
}

export interface GradientSettings {
  startColor: string;
  endColor: string;
  type: "linear" | "radial";
}

export type CloneStampSampling = "active_layer" | "composited";

export interface CloneStampSettings {
  size: number;
  opacity: number;
  hardness: number;
  sampling: CloneStampSampling;
}

// ─── Segmentation Types ───────────────────────────────────────────────────────

/** Prompt mode for SAM-based segmentation. */
export type SegmentPromptMode = "point" | "box" | "auto";

/** Backend used for segmentation inference. */
export type SegmentBackend = "fal" | "local-sam3";

export const DEFAULT_LOCAL_SAM3_POINTS_PER_SIDE = 32;
export const DEFAULT_LOCAL_SAM3_PRED_IOU_THRESH = 0.88;

export function normalizeSegmentBackend(value: unknown): SegmentBackend {
  if (value === "local-sam3" || value === "fal") {
    return value;
  }
  if (value === "node") {
    return "local-sam3";
  }
  return "fal";
}

/** What to do with the source layer after segmentation is applied. */
export type SegmentSourceLayerAction = "keep" | "hide" | "lock";

/** A single point prompt for segmentation. */
export interface SegmentPointPrompt {
  /** X coordinate in canvas space. */
  x: number;
  /** Y coordinate in canvas space. */
  y: number;
  /** Positive = include, negative = exclude. */
  label: "positive" | "negative";
}

/** A bounding box prompt for segmentation. */
export interface SegmentBoxPrompt {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Source-layer metadata preserved across segmentation runs. */
export interface SegmentationSourceMetadata {
  layerId: string;
  layerTransform: {
    x: number;
    y: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
    matrix?: [number, number, number, number, number, number];
    mode?: "distort" | "skew" | "perspective" | "warp";
    quad?: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number }
    ];
  };
  contentBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  canvasSize: {
    width: number;
    height: number;
  };
  documentOrigin: {
    x: number;
    y: number;
  };
}

/** A single mask returned from segmentation inference. */
export interface SegmentationMask {
  /** Unique mask identifier within the segmentation run. */
  id: string;
  /** Sketch SAM result kind. */
  kind: "mask";
  /** Human-readable label (e.g. "Object 1"). */
  label: string;
  /** URI or data URL of the mask image (white = object, black = background). */
  maskDataUrl: string;
  /** Confidence score from the model (0–1). */
  confidence: number;
  /** Bounding box of the mask region in canvas space. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Backend that produced this mask. */
  backendId: SegmentBackend;
  /** Model identifier used for this mask. */
  modelId: string;
  /** Node type that produced this mask when known. */
  nodeType?: string;
  /** Original source-layer metadata when available. */
  sourceMetadata?: SegmentationSourceMetadata;
}

/** Full result from a segmentation inference run. */
export interface SegmentationResult {
  /** Unique identifier for this segmentation run. */
  runId: string;
  /** Source layer that was segmented. */
  sourceLayerId: string;
  /** All masks returned by the model. */
  masks: SegmentationMask[];
  /** Timestamp of the segmentation run. */
  timestamp: number;
  /** Model ID used for this run. */
  modelId: string;
  /** Backend used for this run. */
  backendId?: SegmentBackend;
  /** Node type used for this run when known. */
  nodeType?: string;
  /** Original source-layer metadata when available. */
  sourceMetadata?: SegmentationSourceMetadata;
}

/** Progress state of a segmentation operation. */
export type SegmentationStatus =
  | "idle"
  | "checking-model"
  | "encoding"
  | "inferring"
  | "previewing"
  | "applying"
  | "error";

/** Settings for the segment tool. */
export interface SegmentSettings {
  /** Current prompt mode: point clicks, box drag, or automatic separation. */
  promptMode: SegmentPromptMode;
  /** Optional concept text used by backends that support text-guided object separation. */
  conceptPrompt: string;
  /** Maximum number of objects to return. */
  maxObjects: number;
  /** Minimum mask area in pixels²; smaller fragments are discarded. */
  minObjectSize: number;
  /** Mask confidence threshold (0–1); masks below are discarded. */
  confidenceThreshold: number;
  /** What to do with the source layer after applying segmentation. */
  sourceLayerAction: SegmentSourceLayerAction;
  /** Feather radius (px) applied to mask edges for smoother cutouts. 0 = off. */
  maskFeather: number;
  /** Whether the result should be cutout layers (true) or mask layers (false). */
  outputCutouts: boolean;
  /** Inference backend for sketch SAM actions. */
  backend: SegmentBackend;
  /** Automatic mask generation density for Local SAM3. */
  pointsPerSide: number;
  /** Automatic mask IoU filter for Local SAM3. */
  predIouThresh: number;
}

/** Metadata stored on layers created by segmentation. */
export interface SegmentationLayerMeta {
  /** UUID linking all layers from one segmentation operation. */
  segmentationRunId: string;
  /** Layer ID that was segmented. */
  sourceLayerId: string;
  /** Backend used for segmentation. */
  backendId?: SegmentBackend;
  /** Model identifier used for segmentation. */
  modelId: string;
  /** Node type used for segmentation when known. */
  nodeType?: string;
  /** Confidence score for this particular mask (0–1). */
  confidence: number;
  /** Mask index within the segmentation result. */
  maskIndex: number;
}

// ─── Move Settings ────────────────────────────────────────────────────────────

export interface MoveSettings {
  /**
   * When true, clicking opaque pixels on the canvas while the MoveTool is
   * active auto-selects the topmost visible transformable layer as the move
   * target, without requiring the user to switch layers in the layers panel first.
   */
  autoSelect: boolean;
}

export const DEFAULT_MOVE_SETTINGS: MoveSettings = {
  autoSelect: true
};

// ─── Transform Settings ───────────────────────────────────────────────────────

/**
 * Advanced transform mode selection for Free Transform.
 *
 * - `auto`: keep the normal free-transform handles and let modifier keys
 *   temporarily switch to advanced behavior.
 * - `scale`: force standard scale/rotate behavior.
 * - `distort`: treat corner drags as affine corner distortions.
 * - `skew`: treat edge drags as affine skew/shear adjustments.
 * - `perspective`: tied-corner perspective drags that bake through the shared
 *   quad path on commit.
 * - `warp`: independent corner warps that also bake through the shared quad
 *   path on commit.
 */
export type TransformMode =
  | "auto"
  | "scale"
  | "distort"
  | "skew"
  | "perspective"
  | "warp";

export interface TransformSettings {
  /**
   * When true, clicking opaque pixels on the canvas while the TransformTool is
   * active auto-selects the topmost visible transformable layer as the transform
   * target, without requiring the user to switch layers in the layers panel first.
   */
  autoSelect: boolean;
  /**
   * Advanced transform mode selection. `auto` keeps the default free
   * transform behavior and lets modifier keys pick temporary advanced modes.
   */
  mode: TransformMode;
}

export const DEFAULT_TRANSFORM_SETTINGS: TransformSettings = {
  autoSelect: true,
  mode: "auto"
};

// ─── Composite Tool Settings ──────────────────────────────────────────────────

export interface ToolSettings {
  brush: BrushSettings;
  pencil: PencilSettings;
  eraser: EraserSettings;
  /** Global pressure curve; merged over brush/pencil when computing effective tool settings. */
  penPressure: PenPressureSettings;
  shape: ShapeSettings;
  fill: FillSettings;
  blur: BlurSettings;
  gradient: GradientSettings;
  cloneStamp: CloneStampSettings;
  select: SelectSettings;
  segment: SegmentSettings;
  move: MoveSettings;
  transform: TransformSettings;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

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
  strokeAssist: { ...DEFAULT_STROKE_ASSIST_SETTINGS }
};

export const DEFAULT_ERASER_SETTINGS: EraserSettings = {
  size: 14,
  opacity: 1,
  mode: "brush",
  stabilizer: 0,
  strokeAssist: { ...DEFAULT_STROKE_ASSIST_SETTINGS }
};

export const DEFAULT_SHAPE_SETTINGS: ShapeSettings = {
  shapeType: "rectangle",
  strokeColor: "#ffffff",
  strokeWidth: 2,
  fillColor: "#ffffff",
  filled: false
};

export const DEFAULT_FILL_SETTINGS: FillSettings = {
  color: "#ffffff",
  tolerance: 32
};

export const DEFAULT_BLUR_SETTINGS: BlurSettings = {
  size: 14,
  strength: 4
};

export const DEFAULT_GRADIENT_SETTINGS: GradientSettings = {
  startColor: "#ffffff",
  endColor: "#000000",
  type: "linear"
};

export const DEFAULT_CLONE_STAMP_SETTINGS: CloneStampSettings = {
  size: 14,
  opacity: 1,
  hardness: 0.7,
  sampling: "active_layer"
};

export const DEFAULT_SELECT_SETTINGS: SelectSettings = {
  mode: "rectangle",
  magicWandTolerance: 32,
  contiguous: true,
  sampleAllLayers: false,
  featherRadius: 4,
  borderWidth: 3
};

export const DEFAULT_SEGMENT_SETTINGS: SegmentSettings = {
  promptMode: "point",
  conceptPrompt: "",
  maxObjects: 5,
  minObjectSize: 100,
  confidenceThreshold: 0.5,
  sourceLayerAction: "keep",
  maskFeather: 0,
  outputCutouts: true,
  backend: "fal",
  pointsPerSide: DEFAULT_LOCAL_SAM3_POINTS_PER_SIDE,
  predIouThresh: DEFAULT_LOCAL_SAM3_PRED_IOU_THRESH
};

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  brush: DEFAULT_BRUSH_SETTINGS,
  pencil: DEFAULT_PENCIL_SETTINGS,
  eraser: DEFAULT_ERASER_SETTINGS,
  penPressure: DEFAULT_PEN_PRESSURE,
  shape: DEFAULT_SHAPE_SETTINGS,
  fill: DEFAULT_FILL_SETTINGS,
  blur: DEFAULT_BLUR_SETTINGS,
  gradient: DEFAULT_GRADIENT_SETTINGS,
  cloneStamp: DEFAULT_CLONE_STAMP_SETTINGS,
  select: DEFAULT_SELECT_SETTINGS,
  segment: DEFAULT_SEGMENT_SETTINGS,
  move: DEFAULT_MOVE_SETTINGS,
  transform: DEFAULT_TRANSFORM_SETTINGS
};

/**
 * Deep-enough copy for a new document so nested tool objects are not shared with
 * module-level defaults (avoids accidental cross-session mutation).
 */
export function cloneDefaultToolSettings(): ToolSettings {
  return {
    brush: {
      ...DEFAULT_BRUSH_SETTINGS,
      strokeAssist: { ...DEFAULT_BRUSH_SETTINGS.strokeAssist! }
    },
    pencil: {
      ...DEFAULT_PENCIL_SETTINGS,
      strokeAssist: { ...DEFAULT_PENCIL_SETTINGS.strokeAssist! }
    },
    eraser: {
      ...DEFAULT_ERASER_SETTINGS,
      strokeAssist: { ...DEFAULT_ERASER_SETTINGS.strokeAssist! }
    },
    penPressure: { ...DEFAULT_PEN_PRESSURE },
    shape: { ...DEFAULT_SHAPE_SETTINGS },
    fill: { ...DEFAULT_FILL_SETTINGS },
    blur: { ...DEFAULT_BLUR_SETTINGS },
    gradient: { ...DEFAULT_GRADIENT_SETTINGS },
    cloneStamp: { ...DEFAULT_CLONE_STAMP_SETTINGS },
    select: { ...DEFAULT_SELECT_SETTINGS },
    segment: { ...DEFAULT_SEGMENT_SETTINGS },
    move: { ...DEFAULT_MOVE_SETTINGS },
    transform: { ...DEFAULT_TRANSFORM_SETTINGS }
  };
}

// ─── Edit Action Kind ─────────────────────────────────────────────────────
/**
 * Classifies how a tool gesture interacts with document state:
 * - `"transform-only"`: modifies layer.transform only; never rewrites layer.data or contentBounds.
 * - `"pixel-edit"`: may change layer.data and raster bounds; uses full history sync.
 * - `"none"`: read-only tool that does not modify the document (e.g. eyedropper).
 */
export type EditActionKind = "transform-only" | "pixel-edit" | "none";

/** Map every tool to its edit-action kind. */
export function editActionKindForTool(tool: SketchTool): EditActionKind {
  switch (tool) {
    case "move":
    case "transform":
      return "transform-only";
    case "eyedropper":
    case "select":
    case "crop":
    case "segment":
      return "none";
    // pixel-edit tools
    case "brush":
    case "pencil":
    case "eraser":
    case "fill":
    case "blur":
    case "clone_stamp":
    case "shape":
    case "gradient":
    case "adjust":
      return "pixel-edit";
    default:
      return "none";
  }
}

/** Check if a tool is the unified shape tool */
export function isShapeTool(tool: SketchTool): boolean {
  return tool === "shape";
}

/** Check if a tool is a painting tool (supports Alt+click eyedropper) */
export function isPaintingTool(tool: SketchTool): boolean {
  return tool === "brush" || tool === "pencil" || tool === "eraser" || tool === "fill" || tool === "clone_stamp" || tool === "blur";
}

/** True when the tool only modifies layer.transform, never pixel data. */
export function isTransformOnlyTool(tool: SketchTool): boolean {
  return editActionKindForTool(tool) === "transform-only";
}

/** True when the tool may modify layer.data / raster bounds. */
export function isPixelEditTool(tool: SketchTool): boolean {
  return editActionKindForTool(tool) === "pixel-edit";
}
