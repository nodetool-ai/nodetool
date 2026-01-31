/**
 * Types for the Image Editor component
 */

export type EditTool =
  | "select"
  | "crop"
  | "draw"
  | "erase"
  | "fill"
  | "text"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow";

export type EditAction =
  | "rotate-cw"
  | "rotate-ccw"
  | "flip-h"
  | "flip-v"
  | "reset"
  | "apply-crop"
  | "cancel-crop";

export interface Point {
  x: number;
  y: number;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawState {
  isDrawing: boolean;
  lastPoint: Point | null;
}

export interface BrushSettings {
  size: number;
  color: string;
  opacity: number;
}

export interface ShapeSettings {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  filled: boolean;
}

export interface TextSettings {
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Represents a shape being drawn or already drawn
 */
export interface ShapeData {
  type: "rectangle" | "ellipse" | "line" | "arrow" | "text";
  startPoint: Point;
  endPoint: Point;
  settings: ShapeSettings | TextSettings;
  text?: string; // For text tool
}

export interface AdjustmentSettings {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface HistoryEntry {
  imageData: ImageData;
  action: string;
}

export interface ImageEditorState {
  tool: EditTool;
  brushSettings: BrushSettings;
  adjustments: AdjustmentSettings;
  cropRegion: CropRegion | null;
  isCropping: boolean;
  zoom: number;
  pan: Point;
  history: HistoryEntry[];
  historyIndex: number;
}

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 10,
  color: "#ffffff",
  opacity: 1
};

export const DEFAULT_SHAPE_SETTINGS: ShapeSettings = {
  fillColor: "#ffffff",
  strokeColor: "#ffffff",
  strokeWidth: 2,
  filled: false
};

export const DEFAULT_TEXT_SETTINGS: TextSettings = {
  fontSize: 24,
  fontFamily: "Arial",
  color: "#ffffff",
  bold: false,
  italic: false
};

export const DEFAULT_ADJUSTMENTS: AdjustmentSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0
};

export const DEFAULT_EDITOR_STATE: ImageEditorState = {
  tool: "select",
  brushSettings: DEFAULT_BRUSH_SETTINGS,
  adjustments: DEFAULT_ADJUSTMENTS,
  cropRegion: null,
  isCropping: false,
  zoom: 1,
  pan: { x: 0, y: 0 },
  history: [],
  historyIndex: -1
};
