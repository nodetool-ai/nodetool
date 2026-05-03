import { z } from "zod";

// ── Metadata ──────────────────────────────────────────────────────
// CollectionMetadata from vectorstore is `Record<string, string|number|boolean|undefined>`.
// We keep `undefined` out of the wire schema and normalize to `string | number | boolean`.
export const collectionMetadata = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()])
);
export type CollectionMetadata = z.infer<typeof collectionMetadata>;

// ── Collection response shapes ────────────────────────────────────
// Mirrors the REST handler's list-item response (with workflow_name resolved).
export const collectionListItem = z.object({
  name: z.string(),
  count: z.number(),
  metadata: collectionMetadata,
  workflow_name: z.string().nullable()
});

// Mirrors the single-collection response (create, get, update).
export const collectionResponse = z.object({
  name: z.string(),
  metadata: collectionMetadata,
  count: z.number()
});

// ── list (GET /api/collections) ───────────────────────────────────
export const listOutput = z.object({
  collections: z.array(collectionListItem),
  count: z.number()
});

// ── get (GET /api/collections/:name) ──────────────────────────────
export const getInput = z.object({
  name: z.string().min(1)
});

// ── create (POST /api/collections) ────────────────────────────────
export const createInput = z.object({
  name: z.string().min(1),
  embedding_model: z.string().optional(),
  embedding_provider: z.string().optional()
});

// ── update (PUT /api/collections/:name) ───────────────────────────
export const updateInput = z.object({
  name: z.string().min(1), // current name
  rename: z.string().min(1).optional(), // new name (maps to body.name in REST)
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
});

// ── delete (DELETE /api/collections/:name) ────────────────────────
export const deleteInput = z.object({
  name: z.string().min(1)
});

export const deleteOutput = z.object({
  message: z.string()
});

// ── query (POST /api/collections/:name/query) ─────────────────────
// Public wire shape for collection queries. Per-text embeddings and metadata
// filters are intentionally not exposed at this stage; callers that need them
// should use the in-process VectorCollection.query API directly.
export const queryInput = z.object({
  name: z.string().min(1),
  query_texts: z.array(z.string()).min(1),
  n_results: z.number().int().min(1).max(1000).default(10)
});

// Mirrors QueryResult shape in sqlite-vec-store.ts.
export const queryOutput = z.object({
  ids: z.array(z.array(z.string())),
  documents: z.array(z.array(z.string().nullable())),
  metadatas: z.array(z.array(z.record(z.string(), z.unknown()).nullable())),
  distances: z.array(z.array(z.number()))
});

// ── Inferred types ────────────────────────────────────────────────
export type CollectionListItem = z.infer<typeof collectionListItem>;
export type CollectionResponse = z.infer<typeof collectionResponse>;
export type ListOutput = z.infer<typeof listOutput>;
export type GetInput = z.infer<typeof getInput>;
export type CreateInput = z.infer<typeof createInput>;
export type UpdateInput = z.infer<typeof updateInput>;
export type DeleteInput = z.infer<typeof deleteInput>;
export type DeleteOutput = z.infer<typeof deleteOutput>;
export type QueryInput = z.infer<typeof queryInput>;
export type QueryOutput = z.infer<typeof queryOutput>;
