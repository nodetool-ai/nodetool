/**
 * Core image-editor shared types.
 *
 * The sketch document payload is intentionally modeled as a minimal
 * sketch-compatible shape (`SketchDocumentLike`) so this package stays pure
 * and does not depend on the web editor implementation.
 */

export type LayerStatus =
  | "draft"
  | "queued"
  | "generating"
  | "generated"
  | "stale"
  | "failed"
  | "locked"
  | "missing";

export interface LayerVersion {
  id: string;
  createdAt: string;
  jobId: string;
  assetId: string;
  workflowUpdatedAt: string;
  dependencyHash: string;
  paramOverridesSnapshot: Record<string, unknown>;
  costCredits?: number;
  durationMs?: number;
  status: "success" | "failed" | "cancelled";
  favorite?: boolean;
}

export interface LayerWorkflowBinding {
  layerId: string;
  workflowId: string;
  selectedOutputNodeId?: string;
  paramOverrides?: Record<string, unknown>;
  dependencyHash?: string;
  lastGeneratedHash?: string;
  currentAssetId?: string;
  status: LayerStatus;
  versions: LayerVersion[];
}

export interface SketchLayerLike {
  [key: string]: unknown;
  id: string;
  name: string;
  type: "raster" | "mask" | "group";
  visible: boolean;
  locked: boolean;
  parentId?: string | null;
  exposedAsInput?: boolean;
  exposedAsOutput?: boolean;
}

export interface SketchViewportLike {
  zoom: number;
  pan: {
    x: number;
    y: number;
  };
}

export interface PersistedHistoryEntryLike {
  changedLayerIds?: string[];
  layerSnapshots: Record<string, string | null>;
  layerStructure: Record<string, unknown>[];
  documentCanvas: {
    width: number;
    height: number;
    backgroundColor?: string;
  };
  activeLayerId: string;
  maskLayerId: string | null;
  selection?: unknown;
  restoreMode: "full" | "structure-only";
  action: string;
  timestamp: number;
}

export interface SketchDocumentLike {
  version: number;
  canvas: {
    width: number;
    height: number;
    backgroundColor?: string;
  };
  layers: SketchLayerLike[];
  activeLayerId: string;
  maskLayerId?: string | null;
  toolSettings?: Record<string, unknown>;
  activeTool?: string;
  viewport?: SketchViewportLike;
  history?: PersistedHistoryEntryLike[];
  historyIndex?: number;
  metadata?: {
    createdAt: string;
    updatedAt: string;
  };
}

export interface ImageDocument<TSketchDocument extends SketchDocumentLike = SketchDocumentLike> {
  id: string;
  projectId: string;
  name: string;
  sketch: TSketchDocument;
  layerBindings: LayerWorkflowBinding[];
  createdAt: string;
  updatedAt: string;
}

export type LayerTemplateKind = "text-to-image" | "inpaint" | "background-remove";

export interface LayerTemplateDefinition {
  id: string;
  kind: LayerTemplateKind;
  name: string;
  description: string;
  graph: {
    nodes: Record<string, unknown>[];
    edges: Record<string, unknown>[];
  };
}
