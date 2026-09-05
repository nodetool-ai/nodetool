/**
 * sketchAgentBridge
 *
 * Bridge between the agent tooling layer (the `ui_sketch_*` frontend tools) and
 * the live image / sketch editor, mirroring `timelineAgentBridge` for the video
 * editor.
 *
 * Every open {@link SketchEditor} registers a {@link SketchAgentHandler} under
 * its document id (and clears it on unmount). The handler closes over that
 * editor's per-instance stores (document, session bindings, canvas refs) plus
 * the direct-generation job runner, so a tool call addresses one document
 * explicitly — or fails cleanly, naming the ids that are open.
 *
 * Everything crossing the bridge is a plain serializable value: the agent reads
 * {@link SketchSnapshot} / {@link SketchLayerNode} objects and never touches
 * Zustand store handles directly.
 */

import type { BlendMode } from "@nodetool-ai/gpu";
import type { SketchTool } from "./types";


/** Direct-generation kinds the agent can spawn on a new layer. */
export type SketchGenerateKind = "text-to-image" | "image-to-image";

/** Serializable view of a single layer (agent-friendly). */
export interface SketchLayerNode {
  id: string;
  name: string;
  type: "raster" | "mask" | "group";
  visible: boolean;
  /** 0..1 layer opacity. */
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
  alphaLock: boolean;
  /** Id of the parent group layer, when nested. */
  parentId: string | null;
  /** 0-based stacking index in the flat layer array (higher = visually above). */
  index: number;
  /** True when this layer carries a generation binding. */
  hasBinding: boolean;
  /** Generation binding summary, when the layer has one. */
  bindingKind?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  bindingStatus?: string;
}

/** Full snapshot of the open document the agent reads to plan edits. */
export interface SketchSnapshot {
  documentId: string | null;
  name: string;
  /** Canvas (artboard) size in pixels. */
  width: number;
  height: number;
  activeLayerId: string | null;
  /** Active foreground color (hex). */
  foregroundColor: string;
  backgroundColor: string;
  /** Currently-selected tool. */
  activeTool: SketchTool;
  /** True when a pixel selection is active (mask present). */
  hasSelection: boolean;
  /** Layers from bottom to top. */
  layers: SketchLayerNode[];
}

interface SketchGenerateOptions {
  kind: SketchGenerateKind;
  prompt: string;
  /** New layer name; defaults to a sensible name for the kind. */
  name?: string;
  provider?: string;
  model?: string;
  /** For image-to-image: the source layer id/name to transform. */
  sourceLayer?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  /** Kick off generation immediately (default true). */
  autoGenerate?: boolean;
}

interface SketchGenerateResult {
  layer: SketchLayerNode;
  /** True when a generation job was dispatched for the new layer. */
  generationStarted: boolean;
  /** Why generation did not start, when applicable. */
  note?: string;
}

/** Layer props the agent can patch. Omit a field to leave it unchanged. */
interface SketchLayerPropsPatch {
  name?: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
  locked?: boolean;
  alphaLock?: boolean;
}

interface SketchAddLayerOptions {
  name?: string;
  type?: "raster" | "mask";
  /** Fill the new layer with this color (hex). */
  fillColor?: string;
}

/** How {@link SketchAgentHandler.setSelection} shapes the pixel selection. */
export type SketchSelectionOp = "all" | "clear" | "invert";

/** The paint engines an agent can drive. Mirrors the editor's own tools. */
export type SketchStrokeTool = "brush" | "pencil" | "eraser";

/** One sampled point of a stroke, in canvas (document) pixel coordinates. */
interface SketchStrokePoint {
  x: number;
  y: number;
  /** Pen pressure in [0,1]; omit for an unmodulated (mouse-like) stroke. */
  pressure?: number;
}

/** A single continuous stroke, as the agent describes it. */
interface SketchStrokeOptions {
  /** Layer to paint on; defaults to the active layer. */
  target?: string;
  /** Paint engine; defaults to `brush`. */
  tool?: SketchStrokeTool;
  /**
   * Polyline the stroke follows. A single point lays down one dab; the engine
   * interpolates dabs along each segment, so a smooth curve just needs enough
   * points.
   */
  points: SketchStrokePoint[];
  /** Stroke color (hex). Defaults to the foreground; ignored by the eraser. */
  color?: string;
  /** Brush diameter in pixels. Defaults to the layer's current brush size. */
  size?: number;
  /** Stroke opacity in [0,1]. */
  opacity?: number;
  /** Edge hardness in [0,1] — 1 is a crisp edge, 0 a soft falloff. */
  hardness?: number;
  /** Connect the last point back to the first, closing the shape. */
  closed?: boolean;
}

interface SketchStrokeResult {
  layerId: string;
  layerName: string;
  tool: SketchStrokeTool;
  /** Number of points the stroke was drawn through. */
  points: number;
  /** Bounding box of the pixels this stroke touched; null if it painted none. */
  bounds: { x: number; y: number; width: number; height: number } | null;
}

interface SketchLayerImageResult {
  /** null target → the flattened composite; otherwise the addressed layer. */
  layerId: string | null;
  layerName: string | null;
  width: number;
  height: number;
  dataUrl: string;
}

export interface SketchRenderedAssetResult {
  /** Uploaded (temporary) asset id. */
  assetId: string;
  /** Best-effort resolvable URL (falls back to asset://). */
  url: string;
  width: number;
  height: number;
  /** null for the composite; otherwise the rendered layer id. */
  layerId: string | null;
  layerName: string | null;
}

interface SketchFillOptions {
  target?: string;
  x: number;
  y: number;
  color?: string;
  tolerance?: number;
  contiguous?: boolean;
}

interface SketchFillResult {
  layerId: string;
  layerName: string;
  x: number;
  y: number;
  color: string;
}

interface SketchGradientStop {
  offset: number;
  color: string;
}

interface SketchGradientOptions {
  target?: string;
  type: "linear" | "radial";
  start: { x: number; y: number };
  end: { x: number; y: number };
  stops?: SketchGradientStop[];
}

interface SketchGradientResult {
  layerId: string;
  layerName: string;
  type: "linear" | "radial";
}

interface SketchDrawShapeOptions {
  target?: string;
  shape: "rect" | "ellipse" | "line" | "arrow" | "polygon" | "star";
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  points?: number;
  innerRadius?: number;
}

interface SketchDrawShapeResult {
  layerId: string;
  layerName: string;
  shape: string;
  bounds: { x: number; y: number; width: number; height: number };
}

interface SketchSelectionShapeOptions {
  mode?: "replace" | "add" | "subtract" | "intersect";
  shape: "rect" | "ellipse" | "lasso" | "polygon";
  bounds?: { x: number; y: number; width: number; height: number };
  points?: { x: number; y: number }[];
  feather?: number;
}

interface SketchSelectionShapeResult {
  hasSelection: boolean;
  shape: string;
  mode: string;
}

interface SketchTransformOptions {
  target?: string;
  dx?: number;
  dy?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

interface SketchTransformResult {
  layerId: string;
  layerName: string;
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

interface SketchAdjustLayerOptions {
  target?: string;
  brightness?: number;
  contrast?: number;
  exposure?: number;
  saturation?: number;
  hue?: number;
  blur?: number;
}

export interface SketchAdjustLayerResult {
  layerId: string;
  layerName: string;
  adjustments: Record<string, number>;
}

interface SketchCropOptions {
  target?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SketchCropResult {
  layerId: string | null;
  width: number;
  height: number;
}

interface SketchPickColorOptions {
  target?: string | null;
  x: number;
  y: number;
}

interface SketchPickColorResult {
  x: number;
  y: number;
  color: string;
  rgba: { r: number; g: number; b: number; a: number };
}

export interface SketchPlaceImageOptions {
  /**
   * Image to place: an asset id, an `asset://` locator, a data: URL, or an
   * http(s) URL.
   */
  image: string;
  /** Layer to place it on. Omit to create a new one. */
  target?: string | null;
  /** Name for the layer created when `target` is omitted. */
  name?: string;
  /** Top-left corner on the canvas. Defaults to (0, 0). */
  x?: number;
  /** Drawn size. Defaults to the image's own dimensions. */
  width?: number;
  height?: number;
  y?: number;
}

export interface SketchPlaceImageResult {
  layerId: string;
  layerName: string;
  /** The locator stored on the layer. */
  image: string;
  /** Where the image sits on the canvas. */
  bounds: { x: number; y: number; width: number; height: number };
  /** The image's own pixel dimensions, as loaded. */
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Operations the live {@link SketchEditor} exposes to the agent tooling layer.
 * Layers are addressed by id, by (case-insensitive) name, or the literal
 * `"active"` for the active layer. Each mutator returns the affected node so the
 * agent gets immediate feedback.
 */
export interface SketchAgentHandler {
  getSnapshot: () => SketchSnapshot;
  addLayer: (opts: SketchAddLayerOptions) => SketchLayerNode;
  removeLayer: (target: string) => SketchLayerNode;
  duplicateLayer: (target: string) => SketchLayerNode;
  selectLayer: (target: string) => SketchLayerNode;
  setLayerProps: (
    target: string,
    patch: SketchLayerPropsPatch
  ) => SketchLayerNode;
  reorderLayer: (target: string, direction: "up" | "down") => SketchLayerNode;
  mergeLayerDown: (target: string) => SketchLayerNode | null;
  flattenVisible: () => SketchLayerNode;
  generate: (opts: SketchGenerateOptions) => Promise<SketchGenerateResult>;
  /**
   * Put an existing image — an asset or a URL — onto a layer. The layer stores
   * the locator, not the pixels, so the document stays small and the canvas
   * resolves and draws it the way a sketch seeded from an asset loads.
   */
  placeImage: (opts: SketchPlaceImageOptions) => Promise<SketchPlaceImageResult>;
  setForegroundColor: (color: string) => string;
  setBackgroundColor: (color: string) => string;
  setActiveTool: (tool: SketchTool) => SketchTool;
  /**
   * Paint strokes onto raster layers with the real brush/pencil/eraser engine.
   * The whole batch commits as one undo step, so an agent can lay down a full
   * drawing in a single call instead of one round trip per stroke.
   */
  paintStrokes: (strokes: SketchStrokeOptions[]) => SketchStrokeResult[];
  resizeCanvas: (width: number, height: number) => { width: number; height: number };
  setSelection: (op: SketchSelectionOp) => { hasSelection: boolean };
  fill: (opts: SketchFillOptions) => Promise<SketchFillResult> | SketchFillResult;
  gradient: (opts: SketchGradientOptions) => Promise<SketchGradientResult> | SketchGradientResult;
  drawShape: (opts: SketchDrawShapeOptions) => Promise<SketchDrawShapeResult> | SketchDrawShapeResult;
  setSelectionShape: (opts: SketchSelectionShapeOptions) => SketchSelectionShapeResult;
  transform: (opts: SketchTransformOptions) => Promise<SketchTransformResult> | SketchTransformResult;
  adjustLayer: (opts: SketchAdjustLayerOptions) => Promise<SketchAdjustLayerResult> | SketchAdjustLayerResult;
  crop: (opts: SketchCropOptions) => Promise<SketchCropResult> | SketchCropResult;
  pickColor: (opts: SketchPickColorOptions) => Promise<SketchPickColorResult>;
  /** Read pixels: the flattened composite (target null) or a single layer. */
  getLayerImage: (target: string | null) => Promise<SketchLayerImageResult>;
  /**
   * Render the composite (target null) or a single layer to a PNG and upload it
   * as a temporary asset, returning its id + URL so it can be fed to other
   * tools/workflows.
   */
  renderLayerToAsset: (
    target: string | null,
    name?: string
  ) => Promise<SketchRenderedAssetResult>;
  /**
   * Render several layers to temporary assets. With `merge` false (default)
   * each layer becomes its own asset; with `merge` true the named layers are
   * composited (bottom-to-top, honoring opacity/blend) into a single asset.
   * Returns one result per asset produced.
   */
  renderLayersToAssets: (
    targets: string[],
    opts?: { merge?: boolean; name?: string }
  ) => Promise<SketchRenderedAssetResult[]>;
}

const handlers = new Map<string, SketchAgentHandler>();

/**
 * Register (or clear, with null) the handler for one image document. Every open
 * editor registers under its own document id, so the ui_sketch_* tools address
 * any open document explicitly instead of guessing at a focused one.
 */
export function setSketchAgentHandler(
  documentId: string,
  next: SketchAgentHandler | null
): void {
  if (next) handlers.set(documentId, next);
  else handlers.delete(documentId);
}

export function hasSketchAgentHandler(documentId: string): boolean {
  return handlers.has(documentId);
}

export function getSketchAgentHandler(documentId: string): SketchAgentHandler {
  const handler = handlers.get(documentId);
  if (!handler) {
    const open = listOpenSketchDocumentIds();
    throw new Error(
      `No image document "${documentId}" is open. ` +
        (open.length > 0
          ? `Open documents: ${open.join(", ")}. `
          : "No image documents are currently open. ") +
        'Call ui_open_document with type "sketch" to open it.'
    );
  }
  return handler;
}

/** Ids of every image document currently open in an editor. */
function listOpenSketchDocumentIds(): string[] {
  return [...handlers.keys()];
}
