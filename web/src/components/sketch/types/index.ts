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

// ─── Color Mode ───────────────────────────────────────────────────────────────

export type ColorMode = "hex" | "rgb" | "hsl";

// ─── Selection ────────────────────────────────────────────────────────────────

export interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Tool Types ───────────────────────────────────────────────────────────────

export type SketchTool =
  | "move"
  | "select"
  | "brush"
  | "pencil"
  | "eraser"
  | "eyedropper"
  | "fill"
  | "line"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "blur"
  | "gradient"
  | "crop";

export type ShapeToolType = "line" | "rectangle" | "ellipse" | "arrow";

export type BrushType = "round" | "soft" | "airbrush" | "spray";

export interface BrushSettings {
  size: number;
  opacity: number;
  hardness: number;
  color: string;
  brushType: BrushType;
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

export interface BlurSettings {
  size: number;
  strength: number;
}

export interface GradientSettings {
  startColor: string;
  endColor: string;
  type: "linear" | "radial";
}

export interface ToolSettings {
  brush: BrushSettings;
  pencil: PencilSettings;
  eraser: EraserSettings;
  shape: ShapeSettings;
  fill: FillSettings;
  blur: BlurSettings;
  gradient: GradientSettings;
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
  /** When true, painting only affects existing opaque pixels (Krita/Photoshop "Lock Transparency") */
  alphaLock: boolean;
  blendMode: BlendMode;
  /** Base64-encoded PNG data for the layer content */
  data: string | null;
}

// ─── Color Swatches ───────────────────────────────────────────────────────────

// ─── Canvas Preset Sizes ──────────────────────────────────────────────────

export interface CanvasPreset {
  label: string;
  width: number;
  height: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { label: "512 × 512", width: 512, height: 512 },
  { label: "512 × 768", width: 512, height: 768 },
  { label: "768 × 512", width: 768, height: 512 },
  { label: "1024 × 1024", width: 1024, height: 1024 },
  { label: "1920 × 1080", width: 1920, height: 1080 }
];

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
  color: "#ffffff",
  brushType: "round"
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

export const DEFAULT_BLUR_SETTINGS: BlurSettings = {
  size: 20,
  strength: 5
};

export const DEFAULT_GRADIENT_SETTINGS: GradientSettings = {
  startColor: "#ffffff",
  endColor: "#000000",
  type: "linear"
};

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  brush: DEFAULT_BRUSH_SETTINGS,
  pencil: DEFAULT_PENCIL_SETTINGS,
  eraser: DEFAULT_ERASER_SETTINGS,
  shape: DEFAULT_SHAPE_SETTINGS,
  fill: DEFAULT_FILL_SETTINGS,
  blur: DEFAULT_BLUR_SETTINGS,
  gradient: DEFAULT_GRADIENT_SETTINGS
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
    alphaLock: false,
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

/** Check if a tool is a painting tool (supports Alt+click eyedropper) */
export function isPaintingTool(tool: SketchTool): boolean {
  return tool === "brush" || tool === "pencil" || tool === "eraser" || tool === "fill";
}

export const MAX_HISTORY_SIZE = 30;

// ─── Color Conversion Helpers ─────────────────────────────────────────────────

/** Parse a hex color string to {r, g, b} (0-255) */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

/** Convert {r, g, b} (0-255) to a hex color string */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

/** Convert {r, g, b} (0-255) to {h, s, l} (h: 0-360, s: 0-100, l: 0-100) */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/** Convert {h, s, l} (h: 0-360, s: 0-100, l: 0-100) to {r, g, b} (0-255) */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;

  if (sn === 0) {
    const val = Math.round(ln * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) { tn += 1; }
    if (tn > 1) { tn -= 1; }
    if (tn < 1 / 6) { return p + (q - p) * 6 * tn; }
    if (tn < 1 / 2) { return q; }
    if (tn < 2 / 3) { return p + (q - p) * (2 / 3 - tn) * 6; }
    return p;
  };

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;

  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255)
  };
}
