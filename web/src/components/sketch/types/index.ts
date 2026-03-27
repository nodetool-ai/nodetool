/**
 * Sketch Editor Type Definitions
 *
 * Defines the serialized sketch document format that is editor-owned and versioned.
 * Includes canvas settings, layers, tool settings, and project metadata.
 */

// ─── Document Format Version ──────────────────────────────────────────────────

export const SKETCH_FORMAT_VERSION = 2;

/** Display name for the raster created from the Sketch node `input_image` handle. */
export const SKETCH_NODE_INPUT_IMAGE_LAYER_NAME = "Input Image";

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

/**
 * Document-space selection: one byte per canvas pixel (0–255).
 * Values ≥ 128 are treated as selected for tools and marching ants.
 */
export interface Selection {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type SelectToolMode = "rectangle" | "lasso" | "magic_wand";

export interface SelectSettings {
  mode: SelectToolMode;
  /** 0–255, same perceptual scale as fill tolerance */
  magicWandTolerance: number;
  /** Pixels — used by “Feather” / “Smooth” post-actions */
  featherRadius: number;
}

export interface LayerTransform {
  x: number;
  y: number;
}

export interface LayerContentBounds {
  /** Top-left of the backing raster in layer-local space. */
  x: number;
  /** Top-left of the backing raster in layer-local space. */
  y: number;
  /** Backing raster width. */
  width: number;
  /** Backing raster height. */
  height: number;
}

// ─── Symmetry Modes ───────────────────────────────────────────────────────────

export type SymmetryMode =
  | "off"
  | "horizontal"
  | "vertical"
  | "dual"
  | "radial"
  | "mandala";

export const SYMMETRY_MIN_RAYS = 2;
export const SYMMETRY_MAX_RAYS = 12;
export const SYMMETRY_DEFAULT_RAYS = 6;

// ─── Tool Types ───────────────────────────────────────────────────────────────

export type SketchTool =
  | "move"
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
  | "adjust";

export type ShapeToolType = "line" | "rectangle" | "ellipse" | "arrow";

export type BrushType = "round" | "soft" | "airbrush" | "spray";

export interface BrushSettings {
  size: number;
  opacity: number;
  hardness: number;
  color: string;
  brushType: BrushType;
  pressureSensitivity: boolean;
  pressureAffects: "size" | "opacity" | "both";
  roundness: number; // 0.1 to 1.0 (1.0 = perfect circle)
  angle: number; // 0 to 360 degrees
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

export interface ToolSettings {
  brush: BrushSettings;
  pencil: PencilSettings;
  eraser: EraserSettings;
  shape: ShapeSettings;
  fill: FillSettings;
  blur: BlurSettings;
  gradient: GradientSettings;
  cloneStamp: CloneStampSettings;
  select: SelectSettings;
}

// ─── Layer Types ──────────────────────────────────────────────────────────────

export type LayerType = "raster" | "mask" | "group";

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

/**
 * How the (optionally cropped) source image is mapped into the layer's
 * `contentBounds` when the two aspect ratios differ.
 */
export type LayerImageObjectFit = "fill" | "contain" | "cover";

/**
 * Image-backed layer metadata: stable source URI plus crop/fit bookkeeping.
 * Pixel data in `data` remains the working copy for compositing and export.
 */
export interface LayerImageReference {
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Optional sub-rectangle in source pixel space; omit to use the full image. */
  sourceCrop?: { x: number; y: number; width: number; height: number };
  objectFit: LayerImageObjectFit;
}

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
  /** Serialized layer raster payload, or a legacy PNG data URL. */
  data: string | null;
  /** Layer placement in document space. */
  transform: LayerTransform;
  /** Backing raster bounds in layer-local space. */
  contentBounds: LayerContentBounds;
  /** When true, this layer creates a dynamic input handle on the SketchNode */
  exposedAsInput?: boolean;
  /** When true, this layer creates a dynamic output handle on the SketchNode */
  exposedAsOutput?: boolean;
  /**
   * When set, pixels are tied to an external image URI (workflow input, asset URL, etc.).
   * The layer may stay `locked` for painting while still allowing move/nudge transforms.
   */
  imageReference?: LayerImageReference | null;
  /** ID of the parent group layer. `undefined` or `null` means root level. */
  parentId?: string | null;
  /** For group layers: whether child layers are collapsed (hidden) in the panel. */
  collapsed?: boolean;
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

/**
 * Default color swatches — 7 rows × 7 columns = 49 colors.
 * Row 1: Grays (black → white)
 * Rows 2–7: Base hue with 7 value/saturation variations each
 *   (Red, Orange/Yellow, Green, Cyan, Blue, Purple/Pink)
 */
export const DEFAULT_SWATCHES: string[] = [
  // Row 1 — Grays
  "#000000", "#333333", "#555555", "#808080", "#aaaaaa", "#d5d5d5", "#ffffff",
  // Row 2 — Reds
  "#330000", "#660000", "#990000", "#cc0000", "#ff0000", "#ff4d4d", "#ff9999",
  // Row 3 — Orange / Yellow
  "#332200", "#664400", "#996600", "#cc8800", "#ffaa00", "#ffcc44", "#ffee99",
  // Row 4 — Greens
  "#003300", "#006600", "#009900", "#00cc00", "#00ff00", "#66ff66", "#99ff99",
  // Row 5 — Cyans
  "#003333", "#006666", "#009999", "#00cccc", "#00ffff", "#66ffff", "#99ffff",
  // Row 6 — Blues
  "#000033", "#000066", "#000099", "#0000cc", "#0000ff", "#4d4dff", "#9999ff",
  // Row 7 — Purple / Pink
  "#330033", "#660066", "#990099", "#cc00cc", "#ff00ff", "#ff66ff", "#ff99ff"
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

/** Layer metadata snapshot (pixel data excluded — stored separately in layerSnapshots) */
export interface LayerStructureSnapshot {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;
  locked: boolean;
  alphaLock: boolean;
  blendMode: BlendMode;
  transform: LayerTransform;
  contentBounds: LayerContentBounds;
  exposedAsInput?: boolean;
  exposedAsOutput?: boolean;
  imageReference?: LayerImageReference | null;
  parentId?: string | null;
  collapsed?: boolean;
}

export type HistoryRestoreMode = "full" | "structure-only";

export interface PushHistoryOptions {
  /**
   * `structure-only` means undo/redo should restore document/layer metadata
   * without replaying raster data into runtime canvases.
   */
  restoreMode?: HistoryRestoreMode;
}

export interface HistoryEntry {
  /** Snapshot of layers data (pixel data URLs keyed by layer ID) */
  layerSnapshots: Record<string, string | null>;
  /** Optional in-memory canvas snapshots keyed by layer ID for fast undo/redo. */
  layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>;
  /** Snapshot of layer structure (order + metadata) */
  layerStructure: LayerStructureSnapshot[];
  /** Active layer ID at the time of the snapshot */
  activeLayerId: string;
  /** Mask layer ID at the time of the snapshot */
  maskLayerId: string | null;
  /** Controls whether undo/redo must replay raster data or only restore structure. */
  restoreMode: HistoryRestoreMode;
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
  brushType: "round",
  pressureSensitivity: true,
  pressureAffects: "both",
  roundness: 1.0,
  angle: 0
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
  size: 20,
  strength: 5
};

export const DEFAULT_GRADIENT_SETTINGS: GradientSettings = {
  startColor: "#ffffff",
  endColor: "#000000",
  type: "linear"
};

export const DEFAULT_CLONE_STAMP_SETTINGS: CloneStampSettings = {
  size: 20,
  opacity: 1,
  hardness: 0.8,
  sampling: "active_layer"
};

export const DEFAULT_SELECT_SETTINGS: SelectSettings = {
  mode: "rectangle",
  magicWandTolerance: 32,
  featherRadius: 4
};

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  brush: DEFAULT_BRUSH_SETTINGS,
  pencil: DEFAULT_PENCIL_SETTINGS,
  eraser: DEFAULT_ERASER_SETTINGS,
  shape: DEFAULT_SHAPE_SETTINGS,
  fill: DEFAULT_FILL_SETTINGS,
  blur: DEFAULT_BLUR_SETTINGS,
  gradient: DEFAULT_GRADIENT_SETTINGS,
  cloneStamp: DEFAULT_CLONE_STAMP_SETTINGS,
  select: DEFAULT_SELECT_SETTINGS
};

export function generateLayerId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Locked pixel buffer, but transform (move / nudge) is still allowed. */
export function layerAllowsTransformWhilePixelLocked(layer: Layer): boolean {
  return Boolean(layer.imageReference?.uri);
}

/** Tooltip / panel text for an image-backed layer. */
export function summarizeLayerImageReference(ref: LayerImageReference): string {
  const crop = ref.sourceCrop;
  const cropPart = crop
    ? ` · crop ${crop.width}×${crop.height} @ (${crop.x}, ${crop.y})`
    : "";
  return `${ref.objectFit} · source ${ref.naturalWidth}×${ref.naturalHeight}${cropPart}\n${ref.uri}`;
}

export function createDefaultLayer(
  name: string,
  type: LayerType = "raster",
  canvasWidth = 0,
  canvasHeight = 0
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
    data: null,
    transform: { x: 0, y: 0 },
    contentBounds: {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight
    }
  };
}

export function createDefaultDocument(
  width = 512,
  height = 512
): SketchDocument {
  const baseLayer = createDefaultLayer("Background", "raster", width, height);
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

/**
 * Normalize a sketch document so older serialized payloads can still be used
 * after new tool settings or layer fields are added.
 */
export function normalizeSketchDocument(doc: SketchDocument): SketchDocument {
  const baseDocument = createDefaultDocument(
    doc.canvas?.width ?? 512,
    doc.canvas?.height ?? 512
  );

  const layers = Array.isArray(doc.layers) && doc.layers.length > 0
    ? doc.layers.map((layer) => ({
        ...layer,
        type: layer.type ?? "raster",
        visible: layer.visible ?? true,
        opacity: layer.opacity ?? 1,
        locked: layer.locked ?? false,
        alphaLock: layer.alphaLock ?? false,
        blendMode: layer.blendMode ?? "normal",
        data: layer.data ?? null,
        imageReference: layer.imageReference ?? undefined,
        parentId: layer.parentId ?? undefined,
        collapsed: layer.collapsed ?? false,
        transform: {
          x: layer.transform?.x ?? 0,
          y: layer.transform?.y ?? 0
        },
        contentBounds: {
          x: layer.contentBounds?.x ?? 0,
          y: layer.contentBounds?.y ?? 0,
          width: layer.contentBounds?.width ?? (doc.canvas?.width ?? baseDocument.canvas.width),
          height: layer.contentBounds?.height ?? (doc.canvas?.height ?? baseDocument.canvas.height)
        },
        exposedAsInput: layer.exposedAsInput === true,
        exposedAsOutput: layer.exposedAsOutput === true
      }))
    : baseDocument.layers;

  const activeLayerId = layers.some((layer) => layer.id === doc.activeLayerId)
    ? doc.activeLayerId
    : layers[layers.length - 1]?.id ?? baseDocument.activeLayerId;

  const maskLayerId =
    doc.maskLayerId && layers.some((layer) => layer.id === doc.maskLayerId)
      ? doc.maskLayerId
      : null;

  return {
    ...baseDocument,
    ...doc,
    canvas: {
      ...baseDocument.canvas,
      ...doc.canvas
    },
    layers,
    activeLayerId,
    maskLayerId,
    toolSettings: {
      brush: {
        ...DEFAULT_BRUSH_SETTINGS,
        ...doc.toolSettings?.brush
      },
      pencil: {
        ...DEFAULT_PENCIL_SETTINGS,
        ...doc.toolSettings?.pencil
      },
      eraser: {
        ...DEFAULT_ERASER_SETTINGS,
        ...doc.toolSettings?.eraser
      },
      shape: {
        ...DEFAULT_SHAPE_SETTINGS,
        ...doc.toolSettings?.shape
      },
      fill: {
        ...DEFAULT_FILL_SETTINGS,
        ...doc.toolSettings?.fill
      },
      blur: {
        ...DEFAULT_BLUR_SETTINGS,
        ...doc.toolSettings?.blur
      },
      gradient: {
        ...DEFAULT_GRADIENT_SETTINGS,
        ...doc.toolSettings?.gradient
      },
      cloneStamp: {
        ...DEFAULT_CLONE_STAMP_SETTINGS,
        ...doc.toolSettings?.cloneStamp
      },
      select: {
        ...DEFAULT_SELECT_SETTINGS,
        ...doc.toolSettings?.select
      }
    },
    metadata: {
      ...baseDocument.metadata,
      ...doc.metadata
    }
  };
}

/** Check if a tool is the unified shape tool */
export function isShapeTool(tool: SketchTool): boolean {
  return tool === "shape";
}

/** Check if a tool is a painting tool (supports Alt+click eyedropper) */
export function isPaintingTool(tool: SketchTool): boolean {
  return tool === "brush" || tool === "pencil" || tool === "eraser" || tool === "fill" || tool === "clone_stamp" || tool === "blur";
}

// ─── Layer Group Helpers ──────────────────────────────────────────────────────

/** Maximum nesting depth to prevent infinite loops in corrupt data. */
const MAX_LAYER_DEPTH = 20;

/** Returns the children of a given group layer (or root if parentId is null). */
export function getChildLayers(layers: Layer[], parentId: string | null | undefined): Layer[] {
  return layers.filter((l) =>
    parentId ? l.parentId === parentId : !l.parentId
  );
}

/** Returns the nesting depth of a layer in the tree (0 for root). */
export function getLayerDepth(layers: Layer[], layerId: string): number {
  let depth = 0;
  let current = layers.find((l) => l.id === layerId);
  while (current?.parentId) {
    depth++;
    current = layers.find((l) => l.id === current!.parentId);
    if (depth > MAX_LAYER_DEPTH) { break; } // prevent infinite loops in corrupt data
  }
  return depth;
}

/** Recursively collect all descendant IDs of a group (children, grandchildren, etc.) */
export function getDescendantIds(layers: Layer[], groupId: string): string[] {
  const ids: string[] = [];
  const children = layers.filter((l) => l.parentId === groupId);
  for (const child of children) {
    ids.push(child.id);
    if (child.type === "group") {
      ids.push(...getDescendantIds(layers, child.id));
    }
  }
  return ids;
}

/**
 * Build a flat rendering order that respects the tree structure.
 * Returns layers in the same order as the flat array but annotated
 * with their depth. Layers whose ancestor group is collapsed are excluded.
 */
export function buildVisibleLayerTree(layers: Layer[]): Array<{ layer: Layer; depth: number }> {
  const result: Array<{ layer: Layer; depth: number }> = [];
  const collapsedGroupIds = new Set(
    layers.filter((l) => l.type === "group" && l.collapsed).map((l) => l.id)
  );

  for (const layer of layers) {
    const depth = getLayerDepth(layers, layer.id);
    // Check if any ancestor group is collapsed
    let hidden = false;
    let current: Layer | undefined = layer;
    while (current?.parentId) {
      if (collapsedGroupIds.has(current.parentId)) {
        hidden = true;
        break;
      }
      current = layers.find((l) => l.id === current!.parentId);
    }
    if (!hidden) {
      result.push({ layer, depth });
    }
  }
  return result;
}

/** Create a default group layer. */
export function createDefaultGroupLayer(name: string): Layer {
  return {
    id: generateLayerId(),
    name,
    type: "group",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: { x: 0, y: 0 },
    contentBounds: { x: 0, y: 0, width: 0, height: 0 },
    collapsed: false
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
      return "transform-only";
    case "eyedropper":
    case "select":
    case "crop":
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

/** True when the tool only modifies layer.transform, never pixel data. */
export function isTransformOnlyTool(tool: SketchTool): boolean {
  return editActionKindForTool(tool) === "transform-only";
}

/** True when the tool may modify layer.data / raster bounds. */
export function isPixelEditTool(tool: SketchTool): boolean {
  return editActionKindForTool(tool) === "pixel-edit";
}

export const MAX_HISTORY_SIZE = 30;

// ─── Color Conversion Helpers ─────────────────────────────────────────────────

/** RGBA with alpha in the 0–1 range (CSS-style). */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Parse hex, rgb(), or rgba() strings used by the sketch color pickers.
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
    const m = lower.match(/rgb\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
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

/** Serialize to rgb() / rgba() for canvas and CSS. */
export function rgbaToCss({ r, g, b, a }: Rgba): string {
  const rr = clamp255(r);
  const gg = clamp255(g);
  const bb = clamp255(b);
  const aa = clamp01(a);
  if (aa >= 1) {
    return `rgb(${rr}, ${gg}, ${bb})`;
  }
  return `rgba(${rr}, ${gg}, ${bb}, ${aa})`;
}

/** Parse a hex or rgb/rgba string to {r, g, b} (0-255). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = parseColorToRgba(hex);
  return { r, g, b };
}

/** Convert {r, g, b} (0-255) to a hex color string */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

/** #rrggbb for HTML color inputs (alpha stripped). */
export function colorToHex6(input: string): string {
  const { r, g, b } = parseColorToRgba(input);
  return rgbToHex(r, g, b);
}

/**
 * Eyedropper supplies opaque #rrggbb; keep the current foreground alpha.
 */
export function mergeRgbHexIntoColor(rgbHex6: string, currentColor: string): string {
  const next = rgbHex6.startsWith("#") ? rgbHex6 : `#${rgbHex6}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(next)) {
    return currentColor;
  }
  const { r, g, b } = parseColorToRgba(next);
  const { a } = parseColorToRgba(currentColor);
  return rgbaToCss({ r, g, b, a });
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

/** Convert {r, g, b} (0-255) to {h, s, v} (h: 0-360, s: 0-1, v: 0-1) */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }
  return { h: Math.round(h * 360), s: max === 0 ? 0 : d / max, v: max };
}

/** Convert {h, s, v} (h: 0-360, s: 0-1, v: 0-1) to {r, g, b} (0-255) */
export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hn = (h % 360) / 60;
  const i = Math.floor(hn);
  const f = hn - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  let r = 0, g = 0, b = 0;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
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
