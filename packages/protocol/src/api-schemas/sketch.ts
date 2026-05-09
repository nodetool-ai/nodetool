import { z } from "zod";

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

// ── Layer workflow binding ──────────────────────────────────────────────────

export const layerWorkflowBinding = z.object({
  layerId: z.string(),
  workflowId: z.string(),
  selectedOutputNodeId: z.string().optional(),
  paramOverrides: z.record(z.string(), z.unknown()).optional(),
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

export const sketchDocumentLike = z.object({
  version: z.number(),
  canvas: z.object({
    width: z.number(),
    height: z.number()
  }),
  layers: z.array(sketchLayerLike),
  activeLayerId: z.string(),
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
