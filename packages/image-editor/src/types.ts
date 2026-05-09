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
  id: string;
  name: string;
  type: "raster" | "mask" | "group";
  visible: boolean;
  locked: boolean;
  parentId?: string | null;
  exposedAsInput?: boolean;
  exposedAsOutput?: boolean;
}

export interface SketchDocumentLike {
  version: number;
  canvas: {
    width: number;
    height: number;
  };
  layers: SketchLayerLike[];
  activeLayerId: string;
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
