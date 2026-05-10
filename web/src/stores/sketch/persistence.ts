import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";

import {
  normalizeSketchDocument,
  type HistoryEntry,
  type Point,
  type SketchDocument,
  type SketchTool
} from "../../components/sketch/types";

export const DEFAULT_SKETCH_DOCUMENT_WIDTH = 1024;
export const DEFAULT_SKETCH_DOCUMENT_HEIGHT = 1024;
export const DEFAULT_SKETCH_BACKGROUND = "#ffffff";
export const DEFAULT_SKETCH_ACTIVE_TOOL: SketchTool = "brush";
export const DEFAULT_SKETCH_ZOOM = 1;
export const DEFAULT_SKETCH_PAN: Point = { x: 0, y: 0 };
export const SKETCH_DOCUMENT_AUTOSAVE_DEBOUNCE_MS = 750;
export const MAX_PERSISTED_IMAGE_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_INLINE_LAYER_BYTES = 2 * 1024 * 1024;

export type PersistedHistoryEntry = Omit<HistoryEntry, "layerCanvasSnapshots">;

export interface PersistedSketchEditorState extends SketchDocument {
  activeTool?: SketchTool;
  viewport?: {
    zoom: number;
    pan: Point;
  };
  history?: PersistedHistoryEntry[];
  historyIndex?: number;
}

export interface SketchPersistenceSnapshot {
  document: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pan: Point;
  history: PersistedHistoryEntry[];
  historyIndex: number;
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stripHistoryCanvasSnapshots(
  history: readonly HistoryEntry[]
): PersistedHistoryEntry[] {
  return history.map(({ layerCanvasSnapshots: _ignored, ...entry }) =>
    cloneValue(entry)
  );
}

export function toPersistedSketchEditorState(
  snapshot: SketchPersistenceSnapshot
): PersistedSketchEditorState {
  return {
    ...cloneValue(snapshot.document),
    activeTool: snapshot.activeTool,
    viewport: {
      zoom: snapshot.zoom,
      pan: cloneValue(snapshot.pan)
    },
    history: cloneValue(snapshot.history),
    historyIndex: snapshot.historyIndex
  };
}

export function fromPersistedSketchEditorState(
  value: unknown
): SketchPersistenceSnapshot {
  const persisted =
    value && typeof value === "object"
      ? (value as Partial<PersistedSketchEditorState>)
      : {};
  const document = normalizeSketchDocument(
    persisted as SketchDocument
  );
  const viewport = persisted.viewport;
  const history = Array.isArray(persisted.history)
    ? cloneValue(persisted.history)
    : [];
  const historyIndex =
    typeof persisted.historyIndex === "number" ? persisted.historyIndex : -1;

  return {
    document,
    activeTool:
      typeof persisted.activeTool === "string"
        ? (persisted.activeTool as SketchTool)
        : DEFAULT_SKETCH_ACTIVE_TOOL,
    zoom:
      typeof viewport?.zoom === "number"
        ? viewport.zoom
        : DEFAULT_SKETCH_ZOOM,
    pan:
      viewport &&
      typeof viewport.pan?.x === "number" &&
      typeof viewport.pan?.y === "number"
        ? cloneValue(viewport.pan)
        : cloneValue(DEFAULT_SKETCH_PAN),
    history,
    historyIndex
  };
}

export function getDataUrlByteLength(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    return dataUrl.length;
  }
  const base64Payload = dataUrl.slice(commaIndex + 1);
  const padding =
    base64Payload.endsWith("==") ? 2 : base64Payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64Payload.length * 3) / 4) - padding);
}

export function computeImageDocumentHash(
  sketch: PersistedSketchEditorState,
  layerBindings: LayerWorkflowBinding[]
): string {
  return JSON.stringify({
    sketch,
    layerBindings
  });
}

export function getImageDocumentByteLength(
  sketch: PersistedSketchEditorState,
  layerBindings: LayerWorkflowBinding[]
): number {
  return new TextEncoder().encode(
    computeImageDocumentHash(sketch, layerBindings)
  ).length;
}

