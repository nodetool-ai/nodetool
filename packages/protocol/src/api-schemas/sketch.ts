import { z } from "zod";

// ── Shared sub-schemas ───────────────────────────────────────────────────────

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

// ── Image document response ─────────────────────────────────────────────────

export const imageDocumentResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  workflowId: z.string().optional(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  backgroundColor: z.string(),
  document: z.string(),
  thumbnailAssetId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ImageDocumentResponse = z.infer<typeof imageDocumentResponse>;

export const imageDocumentListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  updatedAt: z.string()
});
export type ImageDocumentListItem = z.infer<typeof imageDocumentListItem>;

// ── create ──────────────────────────────────────────────────────────────────

export const createImageDocumentInput = z.object({
  name: z.string().min(1),
  projectId: z.string().min(1),
  width: z.number().int().min(1).optional().default(1024),
  height: z.number().int().min(1).optional().default(1024),
  backgroundColor: z.string().optional().default("#ffffff")
});
export type CreateImageDocumentInput = z.infer<typeof createImageDocumentInput>;

// ── patch ───────────────────────────────────────────────────────────────────

export const patchImageDocumentInput = z
  .object({
    name: z.string().min(1).optional(),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
    backgroundColor: z.string().optional(),
    document: z.string().optional(),
    thumbnailAssetId: z.string().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required"
  });
export type PatchImageDocumentInput = z.infer<typeof patchImageDocumentInput>;

// ── append layer version ────────────────────────────────────────────────────

export const appendLayerVersionInput = z.object({
  jobId: z.string(),
  assetId: z.string(),
  dependencyHash: z.string(),
  workflowUpdatedAt: z.string(),
  paramOverridesSnapshot: z.record(z.string(), z.unknown()).optional(),
  costCredits: z.number().optional(),
  durationMs: z.number().optional(),
  status: z.enum(["success", "failed", "cancelled"]).optional().default("success")
});
export type AppendLayerVersionInput = z.infer<typeof appendLayerVersionInput>;
