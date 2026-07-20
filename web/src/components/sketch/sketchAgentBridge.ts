/**
 * sketchAgentBridge
 *
 * Bridge between the agent tooling layer (the `ui_sketch_*` frontend tools) and
 * the live image / sketch editor, mirroring `timelineAgentBridge` for the video
 * editor.
 *
 * The open {@link SketchEditor} registers a {@link SketchAgentHandler} while it
 * is the active surface (and clears it on blur / unmount). The handler closes
 * over the editor's per-instance stores (document, session bindings, canvas
 * refs) plus the direct-generation job runner, so the tools always operate on
 * the focused document — or fail cleanly when no editor is open.
 *
 * Everything crossing the bridge is a plain serializable value: the agent reads
 * {@link SketchSnapshot} / {@link SketchLayerNode} objects and never touches
 * Zustand store handles directly.
 */

import type { BlendMode } from "@nodetool-ai/gpu";

/** The tools an agent can pick for a layer / canvas op. */
export type SketchToolName =
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
  activeTool: SketchToolName;
  /** True when a pixel selection is active (mask present). */
  hasSelection: boolean;
  /** Layers from bottom to top. */
  layers: SketchLayerNode[];
}

export interface SketchGenerateOptions {
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

export interface SketchGenerateResult {
  layer: SketchLayerNode;
  /** True when a generation job was dispatched for the new layer. */
  generationStarted: boolean;
  /** Why generation did not start, when applicable. */
  note?: string;
}

/** Layer props the agent can patch. Omit a field to leave it unchanged. */
export interface SketchLayerPropsPatch {
  name?: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
  locked?: boolean;
  alphaLock?: boolean;
}

export interface SketchAddLayerOptions {
  name?: string;
  type?: "raster" | "mask";
  /** Fill the new layer with this color (hex). */
  fillColor?: string;
}

/** How {@link SketchAgentHandler.setSelection} shapes the pixel selection. */
export type SketchSelectionOp = "all" | "clear" | "invert";

export interface SketchLayerImageResult {
  /** null target → the flattened composite; otherwise the addressed layer. */
  layerId: string | null;
  layerName: string | null;
  width: number;
  height: number;
  dataUrl: string;
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
  setForegroundColor: (color: string) => string;
  setBackgroundColor: (color: string) => string;
  setActiveTool: (tool: SketchToolName) => SketchToolName;
  resizeCanvas: (width: number, height: number) => { width: number; height: number };
  setSelection: (op: SketchSelectionOp) => { hasSelection: boolean };
  /** Read pixels: the flattened composite (target null) or a single layer. */
  getLayerImage: (target: string | null) => Promise<SketchLayerImageResult>;
}

let handler: SketchAgentHandler | null = null;

/**
 * Register (or clear, with null) the handler for the currently-focused editor.
 * The editor calls this when it becomes active and clears it on unmount / blur
 * so the ui_sketch_* tools always operate on the live document — or fail
 * cleanly when no editor is open.
 */
export function setSketchAgentHandler(next: SketchAgentHandler | null): void {
  handler = next;
}

export function hasSketchAgentHandler(): boolean {
  return handler !== null;
}

export function getSketchAgentHandler(): SketchAgentHandler {
  if (!handler) {
    throw new Error(
      "No image editor is open. Open an image document in the editor to use image-editor tools."
    );
  }
  return handler;
}
