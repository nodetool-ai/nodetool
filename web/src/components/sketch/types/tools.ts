/**
 * Sketch Editor – Tool Types & Settings
 *
 * Tool union, per-tool settings interfaces, default constants, pressure/assist
 * configuration, segmentation types, and tool-classification utilities.
 *
 * Everything the headless stroke engine reads — brush type, pen pressure,
 * stroke assist, and the brush/pencil/eraser settings with their defaults —
 * lives in the paint core (`@nodetool-ai/image-editor/painting.js`) and is
 * re-exported here so the sketch editor's own imports are unchanged.
 */

import type { SelectSettings } from "./selection";
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_PEN_PRESSURE
} from "@nodetool-ai/image-editor/painting.js";
import type {
  BrushSettings,
  EraserSettings,
  PencilSettings,
  PenPressureSettings
} from "@nodetool-ai/image-editor/painting.js";

export type {
  BrushType,
  BrushSettings,
  PencilSettings,
  EraserMode,
  EraserSettings,
  PenPressureSettings,
  StrokeAssistMode,
  StrokeAssistSnapMode,
  StrokeAssistPreset,
  StrokeAssistSettings
} from "@nodetool-ai/image-editor/painting.js";
export {
  DEFAULT_PRESSURE_MIN_SCALE,
  DEFAULT_PRESSURE_CURVE,
  DEFAULT_PEN_PRESSURE,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  createStrokeAssistPreset,
  resolveStrokeAssistSettings,
  mergePenPressureIntoBrush,
  mergePenPressureIntoPencil
} from "@nodetool-ai/image-editor/painting.js";

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

// ─── Pen Pressure ─────────────────────────────────────────────────────────────

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

// ─── Tool Settings Interfaces ─────────────────────────────────────────────────

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

/**
 * A stored model selection, or null when the document names none or names one
 * that is missing a provider or an id.
 */
export function normalizeSegmentModel(
  value: unknown
): SegmentModelSelection | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<SegmentModelSelection>;
  if (
    typeof candidate.provider !== "string" ||
    candidate.provider.length === 0 ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0
  ) {
    return null;
  }
  return {
    provider: candidate.provider,
    id: candidate.id,
    name: typeof candidate.name === "string" ? candidate.name : candidate.id
  };
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
  layerTransform: import("../transform/types").LayerTransform;
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

/** A segmentation model the user picked, as the provider node takes it. */
export interface SegmentModelSelection {
  provider: string;
  id: string;
  name: string;
}

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
  /**
   * The segmentation model to run. Null means the shipped default — a document
   * saved before the picker existed says nothing about a model.
   */
  model: SegmentModelSelection | null;
}

/** Metadata stored on layers created by segmentation. */
export interface SegmentationLayerMeta {
  /** UUID linking all layers from one segmentation operation. */
  segmentationRunId: string;
  /** Layer ID that was segmented. */
  sourceLayerId: string;
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
 * - `scale`: standard scale/rotate behavior. Modifiers can still temporarily
 *   switch to advanced behavior (Ctrl/Cmd on a side handle = skew, Ctrl/Cmd
 *   on a corner = distort, Ctrl+Alt+Shift = perspective).
 * - `distort`: treat corner drags as affine corner distortions.
 * - `skew`: treat edge drags as affine skew/shear adjustments.
 * - `perspective`: tied-corner perspective drags that bake through the shared
 *   quad path on commit.
 * - `warp`: independent corner warps that also bake through the shared quad
 *   path on commit.
 */
export type TransformMode =
  | "scale"
  | "distort"
  | "skew"
  | "perspective"
  | "mesh-warp";

export interface TransformSettings {
  /**
   * When true, clicking opaque pixels on the canvas while the TransformTool is
   * active auto-selects the topmost visible transformable layer as the transform
   * target, without requiring the user to switch layers in the layers panel first.
   */
  autoSelect: boolean;
  /**
   * Active transform mode. Defaults to `scale`; modifier keys can still
   * temporarily switch to skew/distort/perspective during a single drag.
   */
  mode: TransformMode;
}

export const DEFAULT_TRANSFORM_SETTINGS: TransformSettings = {
  autoSelect: true,
  mode: "scale"
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
  // Auto pairs with the shipped model: SAM 3.1 segments by concept, and a
  // point or a box on its own returns nothing.
  promptMode: "auto",
  conceptPrompt: "",
  maxObjects: 5,
  minObjectSize: 100,
  confidenceThreshold: 0.5,
  sourceLayerAction: "keep",
  maskFeather: 0,
  outputCutouts: true,
  model: null
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
