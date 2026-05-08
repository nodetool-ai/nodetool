import { z } from "zod";

// ── Input schemas ──────────────────────────────────────────────────

export const replicateStatusOutput = z.object({
  configured: z.boolean()
});

export const validateUsernameInput = z.object({
  username: z.string().min(3).max(32)
});

export const validateUsernameOutput = z.object({
  valid: z.boolean(),
  available: z.boolean()
});

export const dummyOutput = z.object({
  type: z.string(),
  uri: z.string(),
  asset_id: z.string().nullable(),
  data: z.unknown().nullable(),
  metadata: z.unknown().nullable()
});

// ── Node metadata ──────────────────────────────────────────────────
// Mirrors `NodeMetadata` in api-types.ts. Inner shapes (Property,
// OutputSlot, UnifiedModel, ModelPack) carry many nested `unknown`
// fields, so we accept a passthrough record on the wire and trust the
// registry to produce well-formed output.

export const nodeMetadataSchema = z
  .object({
    node_type: z.string(),
    title: z.string(),
    description: z.string(),
    namespace: z.string()
  })
  .passthrough();
export type NodeMetadataSchema = z.infer<typeof nodeMetadataSchema>;

// Slim summary returned when `fields=summary` (the default).
export const nodeMetadataSummary = z.object({
  node_type: z.string(),
  title: z.string(),
  description: z.string(),
  namespace: z.string()
});
export type NodeMetadataSummary = z.infer<typeof nodeMetadataSummary>;

// ── list (GET /api/nodes/metadata, no node_type) ─────────────────
export const listInput = z.object({
  namespace: z.string().optional(),
  query: z.string().optional(),
  fields: z.enum(["summary", "full"]).default("summary"),
  limit: z.number().int().min(1).max(10000).optional()
});
export type ListInput = z.infer<typeof listInput>;

// Output is a union of summary[] or full[] depending on `fields`.
// Both shapes use the same `nodes` envelope so clients can switch on
// the fields they care about.
export const listOutput = z.object({
  nodes: z.array(nodeMetadataSchema)
});
export type ListOutput = z.infer<typeof listOutput>;

// ── get (GET /api/nodes/metadata?node_type=…) ────────────────────
export const getInput = z.object({
  node_type: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;

export const getOutput = nodeMetadataSchema;
export type GetOutput = z.infer<typeof getOutput>;

// ── Inferred types ─────────────────────────────────────────────────

export type ReplicateStatusOutput = z.infer<typeof replicateStatusOutput>;
export type ValidateUsernameInput = z.infer<typeof validateUsernameInput>;
export type ValidateUsernameOutput = z.infer<typeof validateUsernameOutput>;
export type DummyOutput = z.infer<typeof dummyOutput>;
