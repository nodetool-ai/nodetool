/**
 * Sketch Editor Type Definitions
 *
 * Defines the serialized sketch document format that is editor-owned and versioned.
 * Includes canvas settings, layers, tool settings, and project metadata.
 */

// ─── Document Format Version ──────────────────────────────────────────────────

export const SKETCH_FORMAT_VERSION = 1;

// ─── Primitive Types ──────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ─── Tool Types ───────────────────────────────────────────────────────────────

export type SketchTool =
  | "move"
  | "brush"
  | "pencil"
  | "eraser"
  | "eyedropper"
  | "fill"
  | "line"
  | "rectangle"
  | "ellipse"
  | "arrow";

export type ShapeToolType = "line" | "rectangle" | "ellipse" | "arrow";

export interface BrushSettings {
  size: number;
  opacity: number;
  hardness: number;
  color: string;
}

export interface PencilSettings {
  size: number;
  opacity: number;
  color: string;
}

export interface EraserSettings {
  size: number;
  opacity: number;
  hardness: number;
}

export interface ShapeSettings {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  filled: boolean;
}

export interface FillSettings {
  color: string;
  tolerance: number;
}

export interface ToolSettings {
  brush: BrushSettings;
  pencil: PencilSettings;
  eraser: EraserSettings;
  shape: ShapeSettings;
  fill: FillSettings;
}

// ─── Layer Types ──────────────────────────────────────────────────────────────

export type LayerType = "raster" | "mask";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion";

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blendMode: BlendMode;
  /** Base64-encoded PNG data for the layer content */
  data: string | null;
}

// ─── Color Swatches ───────────────────────────────────────────────────────────

export const DEFAULT_SWATCHES: string[] = [
  "#ffffff", "#c0c0c0", "#808080", "#404040", "#000000",
  "#ff0000", "#ff8000", "#ffff00", "#80ff00", "#00ff00",
  "#00ff80", "#00ffff", "#0080ff", "#0000ff", "#8000ff",
  "#ff00ff", "#ff0080", "#800000", "#804000", "#808000",
  "#408000", "#008000", "#008040", "#008080", "#004080",
  "#000080", "#400080", "#800080", "#800040"
];

// ─── Sketch Document ──────────────────────────────────────────────────────────

export interface SketchDocument {
  version: number;
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
  };
  layers: Layer[];
  activeLayerId: string;
  maskLayerId: string | null;
  toolSettings: ToolSettings;
  metadata: {
    createdAt: string;
    updatedAt: string;
  };
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  /** Snapshot of layers data */
  layerSnapshots: Record<string, string | null>;
  action: string;
  timestamp: number;
}

// ─── Editor State ─────────────────────────────────────────────────────────────

export interface SketchEditorState {
  document: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pan: Point;
  isDrawing: boolean;
  history: HistoryEntry[];
  historyIndex: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 12,
  opacity: 1,
  hardness: 0.8,
  color: "#ffffff"
};

export const DEFAULT_PENCIL_SETTINGS: PencilSettings = {
  size: 1,
  opacity: 1,
  color: "#ffffff"
};

export const DEFAULT_ERASER_SETTINGS: EraserSettings = {
  size: 20,
  opacity: 1,
  hardness: 0.8
};

export const DEFAULT_SHAPE_SETTINGS: ShapeSettings = {
  strokeColor: "#ffffff",
  strokeWidth: 2,
  fillColor: "#ffffff",
  filled: false
};

export const DEFAULT_FILL_SETTINGS: FillSettings = {
  color: "#ffffff",
  tolerance: 32
};

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  brush: DEFAULT_BRUSH_SETTINGS,
  pencil: DEFAULT_PENCIL_SETTINGS,
  eraser: DEFAULT_ERASER_SETTINGS,
  shape: DEFAULT_SHAPE_SETTINGS,
  fill: DEFAULT_FILL_SETTINGS
};

export function generateLayerId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultLayer(
  name: string,
  type: LayerType = "raster"
): Layer {
  return {
    id: generateLayerId(),
    name,
    type,
    visible: true,
    opacity: 1,
    locked: false,
    blendMode: "normal",
    data: null
  };
}

export function createDefaultDocument(
  width = 512,
  height = 512
): SketchDocument {
  const baseLayer = createDefaultLayer("Background", "raster");
  const now = new Date().toISOString();

  return {
    version: SKETCH_FORMAT_VERSION,
    canvas: {
      width,
      height,
      backgroundColor: "#000000"
    },
    layers: [baseLayer],
    activeLayerId: baseLayer.id,
    maskLayerId: null,
    toolSettings: DEFAULT_TOOL_SETTINGS,
    metadata: {
      createdAt: now,
      updatedAt: now
    }
  };
}

/** Check if a tool is a shape tool */
export function isShapeTool(tool: SketchTool): tool is ShapeToolType {
  return tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "arrow";
}

export const MAX_HISTORY_SIZE = 30;
