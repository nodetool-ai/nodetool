/**
 * Sketch Editor – History Types
 *
 * Undo/redo history entries, layer structure snapshots, and top-level editor
 * state interface.
 */

import type { Point } from "./geometry";
import type {
  Layer,
  LayerType,
  BlendMode,
  LayerTransform,
  LayerContentBounds,
  LayerImageReference,
  LayerEffect,
  SketchDocument
} from "./document";
import type { SketchTool } from "./tools";

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
  segmentationMeta?: Layer["segmentationMeta"];
  effects: LayerEffect[];
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
  /**
   * IDs of layers whose raster data changed in this entry.
   * Only these layers have snapshots in `layerSnapshots`.
   * When absent (legacy entries or full snapshots), all layers in
   * `layerSnapshots` are assumed to be present.
   */
  changedLayerIds?: string[];
  /** Snapshot of layers data (pixel data URLs keyed by layer ID) — only changed layers for delta entries. */
  layerSnapshots: Record<string, string | null>;
  /** Optional in-memory canvas snapshots keyed by layer ID for fast undo/redo. */
  layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>;
  /** Snapshot of layer structure (order + metadata) */
  layerStructure: LayerStructureSnapshot[];
  /** Snapshot of document canvas metadata that affects layer placement. */
  documentCanvas: SketchDocument["canvas"];
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
