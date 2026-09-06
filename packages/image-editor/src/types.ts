/**
 * Core image-editor shared types.
 *
 * The sketch document payload is intentionally modeled as a minimal
 * sketch-compatible shape (`SketchDocumentLike`) so this package stays pure
 * and does not depend on the web editor implementation.
 */

import type { HashableValue } from "./dependencyHash.js";

// Re-exported as a type only: consumers can name the value contract below
// without importing `dependencyHash`, which pulls in `node:crypto`.
export type { HashableValue };

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
  /**
   * HOLDOUT (anti-slop/no-unsafe-dictionary-type): the values arrive from
   * `paramOverridesSnapshot: z.record(z.string(), z.unknown())` in
   * `@nodetool-ai/protocol`'s sketch schema, so the parse that would name them
   * has to happen there and in the web store that writes them
   * (`setParamOverride(value: unknown)`). Typing it {@link ParamOverrides}
   * here alone fails `npm run typecheck --workspace=web`.
   */
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
  /** HOLDOUT (anti-slop/no-unsafe-dictionary-type): see `LayerVersion.paramOverridesSnapshot`. */
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
  /** Requested aspect ratio (e.g. "16:9"). Providers whose endpoints shape
   * output via a size enum honor this rather than raw width/height. */
  aspectRatio?: string;
  /** Requested named resolution (e.g. "1K"). */
  resolution?: string;
  strength?: number;
  numInferenceSteps?: number;
  /**
   * Sampling seed. Layers alike in prompt, size and model and different only
   * here are one request asked N times — which is what makes a set of
   * variations a set (PRD § 10.7, criterion 4).
   */
  seed?: number;
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
  /**
   * A persisted layer is JSON, so a host's richer layer type (opacity, blend
   * mode, transform) round-trips through here without this package naming it.
   */
  [key: string]: HashableValue;
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
  layerStructure: SketchLayerLike[];
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
  toolSettings?: Record<string, HashableValue>;
  activeTool?: string;
  viewport?: SketchViewportLike;
  history?: PersistedHistoryEntryLike[];
  historyIndex?: number;
  metadata?: {
    createdAt: string;
    updatedAt: string;
  };
  /**
   * Guided image-flow state (PRD § 10.5). Absent on every document that never
   * entered the flow; the zod shape in `@nodetool-ai/protocol` is the one that
   * validates it.
   */
  setup?: {
    stage: "idea" | "useCase" | "review" | "look" | "done";
    brief: string;
    use_case?: string;
    refined?: {
      subject: string;
      composition: string;
      lighting: string;
      style_words: string;
      negative: string;
    };
    variations?: number;
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

/**
 * A node in a template's workflow graph — the subset of
 * `@nodetool-ai/protocol`'s `Node` a template carries. Mirrored rather than
 * imported so this package keeps no dependencies.
 */
export interface TemplateGraphNode {
  id: string;
  type: string;
  parent_id?: string | null;
  data?: HashableValue;
  ui_properties?: HashableValue;
}

/** An edge in a template's workflow graph — mirrors `@nodetool-ai/protocol`'s `Edge`. */
export interface TemplateGraphEdge {
  id?: string | null;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export type LayerTemplateKind = "text-to-image" | "inpaint" | "background-remove";

export interface LayerTemplateDefinition {
  id: string;
  kind: LayerTemplateKind;
  name: string;
  description: string;
  graph: {
    nodes: TemplateGraphNode[];
    edges: TemplateGraphEdge[];
  };
}
