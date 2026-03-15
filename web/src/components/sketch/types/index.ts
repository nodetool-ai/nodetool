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
  | "brush"
  | "eraser"
  | "eyedropper";

export interface BrushSettings {
  size: number;
  opacity: number;
  hardness: number;
  color: string;
}

export interface EraserSettings {
  size: number;
  opacity: number;
  hardness: number;
}

export interface ToolSettings {
  brush: BrushSettings;
  eraser: EraserSettings;
}

// ─── Layer Types ──────────────────────────────────────────────────────────────

export type LayerType = "raster" | "mask";

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;
  locked: boolean;
  /** Base64-encoded PNG data for the layer content */
  data: string | null;
}

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

export const DEFAULT_ERASER_SETTINGS: EraserSettings = {
  size: 20,
  opacity: 1,
  hardness: 0.8
};

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  brush: DEFAULT_BRUSH_SETTINGS,
  eraser: DEFAULT_ERASER_SETTINGS
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

export const MAX_HISTORY_SIZE = 30;
