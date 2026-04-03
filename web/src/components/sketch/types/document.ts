/**
 * Sketch Editor – Document Types
 *
 * Serialized sketch document format, layer definitions, blend modes, canvas
 * presets, normalization logic, and layer-tree helpers.
 */

import type {
  ToolSettings,
  EraserSettings,
  EraserMode,
  PenPressureSettings,
  StrokeAssistSettings,
  SegmentationLayerMeta
} from "./tools";
import {
  cloneDefaultToolSettings,
  resolveStrokeAssistSettings,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_PEN_PRESSURE,
  DEFAULT_SHAPE_SETTINGS,
  DEFAULT_FILL_SETTINGS,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_GRADIENT_SETTINGS,
  DEFAULT_CLONE_STAMP_SETTINGS,
  DEFAULT_SELECT_SETTINGS,
  DEFAULT_SEGMENT_SETTINGS
} from "./tools";

// ─── Document Format Version ──────────────────────────────────────────────────

export const SKETCH_FORMAT_VERSION = 3;

/** Display name for the raster created from the Sketch node `input_image` handle. */
export const SKETCH_NODE_INPUT_IMAGE_LAYER_NAME = "Input Image";

// ─── Layer Transform & Bounds ─────────────────────────────────────────────────

export interface LayerTransform {
  x: number;
  y: number;
  /** Horizontal scale factor. 1 = no scale. Default 1. */
  scaleX?: number;
  /** Vertical scale factor. 1 = no scale. Default 1. */
  scaleY?: number;
  /** Rotation in radians. 0 = no rotation. Default 0. */
  rotation?: number;
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

const BLEND_MODE_VALUES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion"
] as const satisfies readonly BlendMode[];

const BLEND_MODE_SET: ReadonlySet<string> = new Set(BLEND_MODE_VALUES);

/** Ensures UI (e.g. layer blend Select) never receives garbage strings like data URLs. */
export function coerceBlendMode(value: unknown): BlendMode {
  if (typeof value === "string" && BLEND_MODE_SET.has(value)) {
    return value as BlendMode;
  }
  return "normal";
}

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

// ─── Layer Effects ────────────────────────────────────────────────────────────

/**
 * Supported per-layer effect types.
 * Each effect is evaluated between "draw raster" and "blend into composite"
 * via the runtime's `evaluateLayerEffects` method.
 */
export type LayerEffectType =
  | "hue_saturation"
  | "brightness_contrast"
  | "exposure"
  | "curves"    // future
  | "tonemap";  // future

/**
 * A single non-destructive effect attached to a layer.
 * Effects are evaluated in order before the layer is blended into its parent.
 *
 * - `enabled`: toggling without removing allows quick A/B comparison.
 * - `params`: typed per-effect; keys and ranges documented per effect type.
 *
 * When absent on a loaded document (`effects` missing from Layer), default is `[]`.
 */
export interface LayerEffect {
  type: LayerEffectType;
  enabled: boolean;
  params: Record<string, number>;
}

// ─── Layer ────────────────────────────────────────────────────────────────────

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
  /** Provenance metadata for layers created by SAM segmentation. */
  segmentationMeta?: SegmentationLayerMeta | null;
  /**
   * Non-destructive effects applied to this layer before compositing.
   * Evaluated in order by the runtime's `evaluateLayerEffects` method.
   * Absent or empty means no effects.
   */
  effects?: LayerEffect[];
}

// ─── Color Mode ───────────────────────────────────────────────────────────────

export type ColorMode = "hex" | "rgb" | "hsl";

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

// ─── Layer Helpers ────────────────────────────────────────────────────────────

export function generateLayerId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Locked pixel buffer, but transform (move / nudge) is still allowed. */
export function layerAllowsTransformWhilePixelLocked(layer: Layer): boolean {
  return Boolean(layer.imageReference?.uri);
}

const MAX_IMAGE_REF_URI_CHARS = 160;

/**
 * Shorten data URLs and very long paths for tooltips / layers panel (never dump base64).
 */
export function summarizeImageRefUriForDisplay(uri: string): string {
  if (!uri) {
    return "";
  }
  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    const header = comma >= 0 ? uri.slice(0, comma) : uri.slice(0, 48);
    return `${header} … (${uri.length.toLocaleString()} chars)`;
  }
  if (uri.length <= MAX_IMAGE_REF_URI_CHARS) {
    return uri;
  }
  const head = Math.max(24, Math.floor(MAX_IMAGE_REF_URI_CHARS / 2) - 1);
  const tail = MAX_IMAGE_REF_URI_CHARS - head - 1;
  return `${uri.slice(0, head)}…${uri.slice(-tail)}`;
}

/** Tooltip / panel text for an image-backed layer. */
export function summarizeLayerImageReference(ref: LayerImageReference): string {
  const crop = ref.sourceCrop;
  const cropPart = crop
    ? ` · crop ${crop.width}×${crop.height} @ (${crop.x}, ${crop.y})`
    : "";
  const uriLine = summarizeImageRefUriForDisplay(ref.uri);
  return `${ref.objectFit} · source ${ref.naturalWidth}×${ref.naturalHeight}${cropPart}\n${uriLine}`;
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
    },
    exposedAsInput: true,
    exposedAsOutput: true
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
    toolSettings: cloneDefaultToolSettings(),
    metadata: {
      createdAt: now,
      updatedAt: now
    }
  };
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

// ─── Normalization Helpers (private) ──────────────────────────────────────────

/** Upper bound for brush / eraser / blur / clone stamp diameter (matches tool panels). */
const SKETCH_LARGE_TOOL_SIZE_MAX = 200;
/** Pencil size slider max in ToolSettingsPanels. */
const SKETCH_PENCIL_SIZE_MAX = 10;

function normalizedLargeToolSize(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded < 1) {
    return fallback;
  }
  return Math.min(SKETCH_LARGE_TOOL_SIZE_MAX, rounded);
}

function normalizedPencilSize(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded < 1) {
    return fallback;
  }
  return Math.min(SKETCH_PENCIL_SIZE_MAX, rounded);
}

function normalizedUnitScalar(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizedBrushRoundness(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0.1, value));
}

function normalizedBrushAngle(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return ((Math.round(value) % 360) + 360) % 360;
}

function normalizedBlurStrength(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded < 1) {
    return fallback;
  }
  return Math.min(20, rounded);
}

// ─── Document Normalization ───────────────────────────────────────────────────

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
        blendMode: coerceBlendMode(layer.blendMode),
        data: layer.data ?? null,
        imageReference: layer.imageReference ?? undefined,
        parentId: layer.parentId ?? undefined,
        collapsed: layer.collapsed ?? false,
        segmentationMeta: layer.segmentationMeta ?? undefined,
        effects: Array.isArray(layer.effects) ? layer.effects : undefined,
        transform: {
          x: layer.transform?.x ?? 0,
          y: layer.transform?.y ?? 0,
          scaleX: layer.transform?.scaleX,
          scaleY: layer.transform?.scaleY,
          rotation: layer.transform?.rotation
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
    toolSettings: (() => {
      const mergedBrush = {
        ...DEFAULT_BRUSH_SETTINGS,
        ...doc.toolSettings?.brush
      };
      const mergedPencil = {
        ...DEFAULT_PENCIL_SETTINGS,
        ...doc.toolSettings?.pencil
      };
      const rawEraser = doc.toolSettings?.eraser as
        | (Partial<EraserSettings> & { hardness?: number; tip?: EraserMode })
        | undefined;
      const eraserMode: EraserMode =
        rawEraser?.mode ?? rawEraser?.tip ?? DEFAULT_ERASER_SETTINGS.mode;
      const mergedEraser = {
        ...DEFAULT_ERASER_SETTINGS,
        ...rawEraser,
        mode: eraserMode
      };
      const mergedBlur = {
        ...DEFAULT_BLUR_SETTINGS,
        ...doc.toolSettings?.blur
      };
      const mergedClone = {
        ...DEFAULT_CLONE_STAMP_SETTINGS,
        ...doc.toolSettings?.cloneStamp
      };
      const normalizedBrush = {
        ...mergedBrush,
        size: normalizedLargeToolSize(
          mergedBrush.size,
          DEFAULT_BRUSH_SETTINGS.size
        ),
        opacity: normalizedUnitScalar(
          mergedBrush.opacity,
          DEFAULT_BRUSH_SETTINGS.opacity
        ),
        hardness: normalizedUnitScalar(
          mergedBrush.hardness,
          DEFAULT_BRUSH_SETTINGS.hardness
        ),
        roundness: normalizedBrushRoundness(
          mergedBrush.roundness,
          DEFAULT_BRUSH_SETTINGS.roundness
        ),
        angle: normalizedBrushAngle(
          mergedBrush.angle,
          DEFAULT_BRUSH_SETTINGS.angle
        ),
        strokeAssist: resolveStrokeAssistSettings(
          mergedBrush.stabilizer,
          mergedBrush.strokeAssist
        )
      };
      const normalizedPencil = {
        ...mergedPencil,
        size: normalizedPencilSize(
          mergedPencil.size,
          DEFAULT_PENCIL_SETTINGS.size
        ),
        opacity: normalizedUnitScalar(
          mergedPencil.opacity,
          DEFAULT_PENCIL_SETTINGS.opacity
        ),
        strokeAssist: resolveStrokeAssistSettings(
          mergedPencil.stabilizer,
          mergedPencil.strokeAssist
        )
      };
      const rawPen = doc.toolSettings?.penPressure as
        | Partial<PenPressureSettings>
        | undefined;
      const mergedPenPressure: PenPressureSettings =
        rawPen == null || Object.keys(rawPen).length === 0
          ? {
              ...DEFAULT_PEN_PRESSURE,
              pressureSensitivity: normalizedBrush.pressureSensitivity,
              pressureAffects: normalizedBrush.pressureAffects,
              pressureMinScale: normalizedBrush.pressureMinScale,
              pressureCurve: normalizedBrush.pressureCurve
            }
          : {
              ...DEFAULT_PEN_PRESSURE,
              ...rawPen
            };
      return {
        brush: normalizedBrush,
        pencil: normalizedPencil,
        penPressure: mergedPenPressure,
        eraser: {
          ...mergedEraser,
          size: normalizedLargeToolSize(
            mergedEraser.size,
            DEFAULT_ERASER_SETTINGS.size
          ),
          opacity: normalizedUnitScalar(
            mergedEraser.opacity,
            DEFAULT_ERASER_SETTINGS.opacity
          ),
          strokeAssist: resolveStrokeAssistSettings(
            mergedEraser.stabilizer,
            mergedEraser.strokeAssist
          )
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
          ...mergedBlur,
          size: normalizedLargeToolSize(
            mergedBlur.size,
            DEFAULT_BLUR_SETTINGS.size
          ),
          strength: normalizedBlurStrength(
            mergedBlur.strength,
            DEFAULT_BLUR_SETTINGS.strength
          )
        },
        gradient: {
          ...DEFAULT_GRADIENT_SETTINGS,
          ...doc.toolSettings?.gradient
        },
        cloneStamp: {
          ...mergedClone,
          size: normalizedLargeToolSize(
            mergedClone.size,
            DEFAULT_CLONE_STAMP_SETTINGS.size
          ),
          opacity: normalizedUnitScalar(
            mergedClone.opacity,
            DEFAULT_CLONE_STAMP_SETTINGS.opacity
          ),
          hardness: normalizedUnitScalar(
            mergedClone.hardness,
            DEFAULT_CLONE_STAMP_SETTINGS.hardness
          )
        },
        select: {
          ...DEFAULT_SELECT_SETTINGS,
          ...doc.toolSettings?.select
        },
        segment: {
          ...DEFAULT_SEGMENT_SETTINGS,
          ...doc.toolSettings?.segment
        }
      };
    })(),
    metadata: {
      ...baseDocument.metadata,
      ...doc.metadata
    }
  };
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
 * Whether a layer should be drawn in the flat composite stack: the layer is
 * visible and every ancestor group is visible. Hiding a group therefore hides
 * all descendant pixels without changing child `visible` flags.
 *
 * When `isolatedLayerId` matches this layer, ancestor visibility is ignored so
 * solo/isolate still shows that layer's pixels.
 */
export function isLayerCompositeVisible(
  layers: Layer[],
  layer: Layer,
  isolatedLayerId: string | null | undefined
): boolean {
  if (!layer.visible) {
    return false;
  }
  if (isolatedLayerId && layer.id === isolatedLayerId) {
    return true;
  }
  let current: Layer | undefined = layer;
  let depth = 0;
  while (current?.parentId) {
    if (depth++ > MAX_LAYER_DEPTH) {
      break;
    }
    const parent = layers.find((l) => l.id === current!.parentId);
    if (!parent || !parent.visible) {
      return false;
    }
    current = parent;
  }
  return true;
}

/**
 * Product of `opacity` for every ancestor group of `layer`. Multiplied with
 * the layer's own opacity when compositing so folder opacity dims descendants.
 *
 * When `isolatedLayerId` matches this layer, returns 1 so solo view is not
 * double-dimmed by hidden folder opacity.
 */
export function getAncestorGroupOpacityProduct(
  layers: Layer[],
  layer: Layer,
  isolatedLayerId: string | null | undefined
): number {
  if (isolatedLayerId && layer.id === isolatedLayerId) {
    return 1;
  }
  let product = 1;
  let current: Layer | undefined = layer;
  let depth = 0;
  while (current?.parentId && depth++ <= MAX_LAYER_DEPTH) {
    const parent = layers.find((l) => l.id === current!.parentId);
    if (!parent) {
      break;
    }
    if (parent.type === "group") {
      product *= parent.opacity;
    }
    current = parent;
  }
  return product;
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

function layerHiddenByCollapsedAncestor(
  layers: Layer[],
  layer: Layer,
  collapsedGroupIds: Set<string>
): boolean {
  let current: Layer | undefined = layer;
  while (current?.parentId) {
    if (collapsedGroupIds.has(current.parentId)) {
      return true;
    }
    current = layers.find((l) => l.id === current!.parentId);
  }
  return false;
}

/**
 * Layer panel order: composite top → bottom, with each group row immediately above
 * its children (children indented one level deeper). Respects collapsed groups.
 */
export function buildLayersPanelRows(layers: Layer[]): Array<{ layer: Layer; depth: number }> {
  const collapsedGroupIds = new Set(
    layers.filter((l) => l.type === "group" && l.collapsed).map((l) => l.id)
  );
  const result: Array<{ layer: Layer; depth: number }> = [];

  function emitGroup(group: Layer, depth: number): void {
    if (layerHiddenByCollapsedAncestor(layers, group, collapsedGroupIds)) {
      return;
    }
    result.push({ layer: group, depth });
    if (group.type === "group" && group.collapsed) {
      return;
    }
    const children = getChildLayers(layers, group.id);
    children.sort((a, b) => layers.indexOf(b) - layers.indexOf(a));
    for (const child of children) {
      if (layerHiddenByCollapsedAncestor(layers, child, collapsedGroupIds)) {
        continue;
      }
      if (child.type === "group") {
        emitGroup(child, depth + 1);
      } else {
        result.push({ layer: child, depth: depth + 1 });
      }
    }
  }

  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (layerHiddenByCollapsedAncestor(layers, L, collapsedGroupIds)) {
      continue;
    }
    if (L.parentId) {
      continue;
    }
    if (L.type === "group") {
      emitGroup(L, 0);
    } else {
      result.push({ layer: L, depth: 0 });
    }
  }

  return result;
}

// ─── History Limit ────────────────────────────────────────────────────────────

export const MAX_HISTORY_SIZE = 30;
