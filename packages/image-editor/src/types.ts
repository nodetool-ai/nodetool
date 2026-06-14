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

/**
 * Discriminator for the kind of generation source backing a layer.
 *
 *   - "workflow": runs a NodeTool workflow via WorkflowRunner; the binding
 *     carries workflowId / selectedOutputNodeId / paramOverrides and uses
 *     dependency-hash bookkeeping to detect staleness.
 *   - "text-to-image" / "image-to-image": calls the runner's `generate_media`
 *     RPC directly with a model + prompt (and source layer for i2i). No
 *     workflow, no param overrides, no dependency hash.
 *
 * `kind` is optional in the persisted shape so documents written before this
 * field existed default to "workflow" on load.
 */
export type LayerBindingKind = "workflow" | "text-to-image" | "image-to-image" | "inpaint";

/**
 * Per-layer binding describing how the layer's pixels are generated. Carries
 * both kinds (workflow-bound and direct-gen) via the `kind` discriminator —
 * workflow-only and direct-gen-only fields are optional.
 *
 * The historical name `LayerWorkflowBinding` is preserved to avoid a
 * sprawling rename across persisted documents and tRPC routers. New code
 * should reach for it through this type or the alias `LayerBinding` below.
 */
export interface LayerWorkflowBinding {
  layerId: string;
  /** Defaults to "workflow" when absent on legacy persisted data. */
  kind?: LayerBindingKind;
  // Workflow-bound fields ────────────────────────────────────────────────
  workflowId?: string;
  selectedOutputNodeId?: string;
  paramOverrides?: Record<string, unknown>;
  // Direct-gen fields (text-to-image / image-to-image / inpaint) ──────────
  prompt?: string;
  provider?: string;
  model?: string;
  sourceLayerId?: string | null;
  /** Pre-uploaded asset ID for the source image (used by the inpaint kind). */
  sourceAssetId?: string | null;
  /** Pre-uploaded asset ID for the mask image (used by the inpaint kind). */
  maskAssetId?: string | null;
  width?: number;
  height?: number;
  strength?: number;
  numInferenceSteps?: number;
  // Common fields ─────────────────────────────────────────────────────────
  dependencyHash?: string;
  lastGeneratedHash?: string;
  currentAssetId?: string;
  status: LayerStatus;
  versions: LayerVersion[];
}

/** Alias for the unified binding — same shape, clearer name for new code. */
export type LayerBinding = LayerWorkflowBinding;

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
