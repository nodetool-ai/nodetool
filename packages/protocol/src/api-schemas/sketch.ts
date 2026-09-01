import { z } from "zod";

import { isNumber, isString } from "../predicates.js";

// ── Layer version ──────────────────────────────────────────────────────────

export const layerVersion = z.object({
  id: z.string(),
  createdAt: z.string(),
  jobId: z.string(),
  assetId: z.string(),
  workflowUpdatedAt: z.string(),
  dependencyHash: z.string(),
  paramOverridesSnapshot: z.record(z.string(), z.unknown()),
  costCredits: z.number().optional(),
  durationMs: z.number().optional(),
  status: z.enum(["success", "failed", "cancelled"]),
  favorite: z.boolean().optional()
});
export type LayerVersion = z.infer<typeof layerVersion>;

// ── Layer binding (workflow-bound + direct-gen) ─────────────────────────────

export const layerBindingKind = z.enum([
  "workflow",
  "text-to-image",
  "image-to-image",
  "inpaint"
]);

/**
 * Unified per-layer generation binding. The `kind` discriminator selects
 * between workflow-bound and direct-generation modes; mode-specific fields
 * are optional so a single shape can travel through the persisted document
 * and the tRPC routers without a discriminated union schema (which would
 * complicate the legacy "no kind" → workflow back-compat path).
 */
export const layerWorkflowBinding = z.object({
  layerId: z.string(),
  /** Absent on legacy data — treat as "workflow". */
  kind: layerBindingKind.optional(),
  // Workflow-bound ──────────────────────────────────────────────────────
  workflowId: z.string().optional(),
  selectedOutputNodeId: z.string().optional(),
  paramOverrides: z.record(z.string(), z.unknown()).optional(),
  // Direct-gen ──────────────────────────────────────────────────────────
  prompt: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  sourceLayerId: z.string().nullable().optional(),
  sourceAssetId: z.string().nullable().optional(),
  maskAssetId: z.string().nullable().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  strength: z.number().optional(),
  numInferenceSteps: z.number().optional(),
  // Common ───────────────────────────────────────────────────────────────
  dependencyHash: z.string().optional(),
  lastGeneratedHash: z.string().optional(),
  currentAssetId: z.string().optional(),
  status: z.enum([
    "draft",
    "queued",
    "generating",
    "generated",
    "stale",
    "failed",
    "locked",
    "missing"
  ]),
  versions: z.array(layerVersion)
});
export type LayerWorkflowBindingSchema = z.infer<typeof layerWorkflowBinding>;

// ── Sketch layer (minimal for protocol) ────────────────────────────────────

export const sketchLayerLike = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["raster", "mask", "group"]),
  visible: z.boolean(),
  locked: z.boolean(),
  parentId: z.string().nullable().optional(),
  exposedAsInput: z.boolean().optional(),
  exposedAsOutput: z.boolean().optional()
});

// ── Sketch document (minimal for protocol) ─────────────────────────────────

const pointLike = z.object({
  x: z.number(),
  y: z.number()
});

const persistedHistoryEntry = z.object({
  changedLayerIds: z.array(z.string()).optional(),
  layerSnapshots: z.record(z.string(), z.string().nullable()),
  layerStructure: z.array(z.record(z.string(), z.unknown())),
  documentCanvas: z.object({
    width: z.number(),
    height: z.number(),
    backgroundColor: z.string().optional()
  }),
  activeLayerId: z.string(),
  maskLayerId: z.string().nullable(),
  selection: z.unknown().optional(),
  restoreMode: z.enum(["full", "structure-only"]),
  action: z.string(),
  timestamp: z.number()
});

export const sketchDocumentLike = z.object({
  version: z.number(),
  canvas: z.object({
    width: z.number(),
    height: z.number(),
    backgroundColor: z.string().optional()
  }),
  layers: z.array(z.unknown()),
  activeLayerId: z.string(),
  maskLayerId: z.string().nullable().optional(),
  toolSettings: z.record(z.string(), z.unknown()).optional(),
  activeTool: z.string().optional(),
  viewport: z
    .object({
      zoom: z.number(),
      pan: pointLike
    })
    .optional(),
  history: z.array(persistedHistoryEntry).optional(),
  historyIndex: z.number().optional(),
  metadata: z
    .object({
      createdAt: z.string(),
      updatedAt: z.string()
    })
    .optional()
});

// ── Image document data (persisted JSON) ───────────────────────────────────

export const imageDocumentData = z.object({
  sketch: sketchDocumentLike,
  layerBindings: z.array(layerWorkflowBinding)
});
export type ImageDocumentData = z.infer<typeof imageDocumentData>;

// ── Image document response ────────────────────────────────────────────────

export const imageDocumentResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  workflowId: z.string().optional(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  backgroundColor: z.string(),
  document: imageDocumentData,
  thumbnailAssetId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ImageDocumentResponse = z.infer<typeof imageDocumentResponse>;

// ── List item ──────────────────────────────────────────────────────────────

export const imageDocumentListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  updatedAt: z.string()
});
export type ImageDocumentListItem = z.infer<typeof imageDocumentListItem>;

// ── create ─────────────────────────────────────────────────────────────────

export const createImageDocumentInput = z.object({
  /**
   * Client-supplied id. The caller mints it so the document is addressable
   * (agent tools, tab refs) before the create round-trip returns, and so a
   * retried create is idempotent rather than duplicating the document.
   */
  id: z.string().optional(),
  name: z.string().min(1),
  projectId: z.string().min(1),
  width: z.number().int().min(1).optional().default(1024),
  height: z.number().int().min(1).optional().default(1024),
  backgroundColor: z.string().optional().default("#ffffff")
});
export type CreateImageDocumentInput = z.infer<typeof createImageDocumentInput>;

// ── patch ──────────────────────────────────────────────────────────────────

export const patchImageDocumentInput = z
  .object({
    name: z.string().min(1).optional(),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
    backgroundColor: z.string().optional(),
    document: imageDocumentData.optional(),
    thumbnailAssetId: z.string().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required"
  });
export type PatchImageDocumentInput = z.infer<typeof patchImageDocumentInput>;

// ── create layer (POST /api/sketch/:id/layers) ─────────────────────────────

export const createLayerInput = z.object({
  id: z.string(),
  layerId: z.string(),
  sourceWorkflowId: z.string(),
  selectedOutputNodeId: z.string().optional()
});
export type CreateLayerInput = z.infer<typeof createLayerInput>;

export const createLayerResponse = layerWorkflowBinding;
export type CreateLayerResponse = z.infer<typeof createLayerResponse>;

// ── append layer version ───────────────────────────────────────────────────

export const appendLayerVersionInput = z.object({
  jobId: z.string(),
  assetId: z.string(),
  dependencyHash: z.string(),
  workflowUpdatedAt: z.string(),
  paramOverridesSnapshot: z.record(z.string(), z.unknown()).optional(),
  costCredits: z.number().optional(),
  durationMs: z.number().optional(),
  status: z
    .enum(["success", "failed", "cancelled"])
    .optional()
    .default("success")
});
export type AppendLayerVersionInput = z.infer<typeof appendLayerVersionInput>;

// ── document version history (/api/sketch/:id/versions) ────────────────────
// Distinct from `layerVersion` above: that records one generation take on a
// single layer, this snapshots the whole sketch document.

/**
 * How a snapshot came to exist. `restore` marks the snapshot taken of the
 * *pre-restore* state, so restoring is itself undoable.
 */
export const sketchVersionSaveType = z.enum(["manual", "autosave", "restore"]);
export type SketchVersionSaveType = z.infer<typeof sketchVersionSaveType>;

/**
 * Metadata for one snapshot. Deliberately carries no `document`: a sketch
 * document holds layer bitmaps, and the history list renders from metadata
 * alone.
 */
export const sketchVersionListItem = z.object({
  id: z.string(),
  version: z.number().int(),
  name: z.string().nullable().optional(),
  saveType: sketchVersionSaveType,
  width: z.number(),
  height: z.number(),
  backgroundColor: z.string(),
  createdAt: z.string()
});
export type SketchVersionListItem = z.infer<typeof sketchVersionListItem>;

/** One snapshot including the document it captured. */
export const sketchVersionResponse = sketchVersionListItem.extend({
  document: z.unknown()
});
export type SketchVersionResponse = z.infer<typeof sketchVersionResponse>;

export const listSketchVersionsInput = z.object({
  /** Image document whose history is read. */
  id: z.string(),
  limit: z.number().int().positive().max(500).optional(),
  saveType: sketchVersionSaveType.optional()
});
export type ListSketchVersionsInput = z.infer<typeof listSketchVersionsInput>;

export const getSketchVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type GetSketchVersionInput = z.infer<typeof getSketchVersionInput>;

export const createSketchVersionInput = z.object({
  id: z.string(),
  name: z.string().max(200).optional()
});
export type CreateSketchVersionInput = z.infer<typeof createSketchVersionInput>;

export const restoreSketchVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type RestoreSketchVersionInput = z.infer<
  typeof restoreSketchVersionInput
>;

export const deleteSketchVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type DeleteSketchVersionInput = z.infer<typeof deleteSketchVersionInput>;

// ── Layer raster payload codec ─────────────────────────────────────────────

/**
 * A layer's `data` field carries `ntlayer:<base64 JSON>` — the image (a data
 * URL, an `asset://` locator, or an http(s) URL) plus the bounds it occupies
 * on the canvas. It lives here because four surfaces read and write it: the
 * editor's serializer, the canvas runtime, the `nodetool.image` sketch nodes,
 * and the headless `edit_sketch` capability. A format they each re-derived is
 * a format they can each get subtly wrong.
 */
export const SERIALIZED_LAYER_DATA_PREFIX = "ntlayer:";

export interface SketchLayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SerializedSketchLayerData {
  version: 1;
  image: string | null;
  bounds: SketchLayerBounds;
}

/**
 * Base64 of a UTF-8 string. `btoa`/`atob` are globals in Node and in the
 * browser, and the byte dance around them is what keeps a non-Latin-1
 * character from throwing.
 */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Inverse of {@link toBase64}. */
function fromBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Encode a layer image plus its canvas bounds into the `data` field. */
export function encodeSketchLayerData(
  image: string | null,
  bounds: SketchLayerBounds
): string {
  const payload: SerializedSketchLayerData = { version: 1, image, bounds };
  return `${SERIALIZED_LAYER_DATA_PREFIX}${toBase64(JSON.stringify(payload))}`;
}

const numberOr = (value: unknown, fallback: number): number =>
  isNumber(value) && Number.isFinite(value) ? value : fallback;

/**
 * Decode a layer `data` field. Anything without the prefix is a legacy bare
 * image (a data URL or a locator) and is returned as the image with the
 * fallback bounds, which is what every reader did before the envelope existed.
 */
export function decodeSketchLayerData(
  data: string | null | undefined,
  fallbackWidth: number,
  fallbackHeight: number
): { image: string | null; bounds: SketchLayerBounds } {
  const fallbackBounds: SketchLayerBounds = {
    x: 0,
    y: 0,
    width: fallbackWidth,
    height: fallbackHeight
  };
  if (!data) {
    return { image: null, bounds: fallbackBounds };
  }
  if (!data.startsWith(SERIALIZED_LAYER_DATA_PREFIX)) {
    return { image: data, bounds: fallbackBounds };
  }
  try {
    const decoded: unknown = JSON.parse(
      fromBase64(data.slice(SERIALIZED_LAYER_DATA_PREFIX.length))
    );
    const payload = (decoded ?? {}) as Partial<SerializedSketchLayerData>;
    const bounds = payload.bounds;
    return {
      image: isString(payload.image) ? payload.image : null,
      bounds: {
        x: numberOr(bounds?.x, fallbackBounds.x),
        y: numberOr(bounds?.y, fallbackBounds.y),
        width: numberOr(bounds?.width, fallbackBounds.width),
        height: numberOr(bounds?.height, fallbackBounds.height)
      }
    };
  } catch {
    return { image: data, bounds: fallbackBounds };
  }
}
