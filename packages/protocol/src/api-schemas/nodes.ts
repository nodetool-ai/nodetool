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

export const sdkNodeTypeInventoryInput = z.object({
  cursor: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(100)
});
export type SdkNodeTypeInventoryInput = z.infer<
  typeof sdkNodeTypeInventoryInput
>;

const nodeMetadataSource = z.enum([
  "typescript",
  "python-package",
  "python-bridge",
  "loaded-metadata"
]);

const sourceCounts = z.partialRecord(
  nodeMetadataSource,
  z.number().int().min(0)
);

export const sdkNodeTypeInventoryOutput = z.object({
  version: z.literal(1),
  registry_revision: z.number().int().min(0),
  registry_ready: z.literal(true),
  python_bridge_ready: z.boolean(),
  node_count: z.number().int().min(0),
  type_count: z.number().int().min(0),
  provenance_counts: sourceCounts,
  cursor: z.number().int().min(0),
  next_cursor: z.number().int().min(0).nullable(),
  types: z
    .array(
      z.object({
        signature: z.string(),
        type: z.string(),
        type_name: z.string().nullable(),
        optional: z.boolean(),
        type_args: z.array(z.string()).max(8),
        values: z.array(z.union([z.string(), z.number()])).max(64),
        values_truncated: z.boolean(),
        input_uses: z.number().int().min(0),
        output_uses: z.number().int().min(0),
        node_count: z.number().int().min(0),
        sources: sourceCounts,
        examples: z
          .array(
            z.object({
              node_type: z.string(),
              pin: z.string(),
              direction: z.enum(["input", "output"])
            })
          )
          .max(5)
      })
    )
    .max(100),
  unavailable_packs: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        reason: z.string()
      })
    )
    .max(100)
});
export type SdkNodeTypeInventoryOutput = z.infer<
  typeof sdkNodeTypeInventoryOutput
>;

// ── Inferred types ─────────────────────────────────────────────────

export type ReplicateStatusOutput = z.infer<typeof replicateStatusOutput>;
export type ValidateUsernameInput = z.infer<typeof validateUsernameInput>;
export type ValidateUsernameOutput = z.infer<typeof validateUsernameOutput>;
export type DummyOutput = z.infer<typeof dummyOutput>;
