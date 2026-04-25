import { z } from "zod";

// ── Asset response ───────────────────────────────────────────────
// Mirrors `toAssetResponse` in the legacy http-api.ts handler. `get_url`
// and `thumb_url` are resolved server-side; `duration` is only set for
// audio/video assets.
export const assetResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  workflow_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  name: z.string(),
  content_type: z.string(),
  size: z.number().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  get_url: z.string().nullable(),
  thumb_url: z.string().nullable(),
  duration: z.number().nullable(),
  node_id: z.string().nullable(),
  job_id: z.string().nullable()
});
export type AssetResponse = z.infer<typeof assetResponse>;

// ── list (GET /api/assets) ───────────────────────────────────────
// All filter parameters are optional; legacy defaults to the user's
// home folder if none are specified.
export const listInput = z.object({
  parent_id: z.string().optional(),
  content_type: z.string().optional(),
  workflow_id: z.string().optional(),
  node_id: z.string().optional(),
  job_id: z.string().optional(),
  page_size: z.number().int().min(1).max(10000).default(10000)
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  assets: z.array(assetResponse),
  next: z.string().nullable()
});
export type ListOutput = z.infer<typeof listOutput>;

// ── get (GET /api/assets/:id) ────────────────────────────────────
export const getInput = z.object({
  id: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;

// ── create (POST /api/assets, JSON-only) ─────────────────────────
// Multipart/file uploads stay on REST — only the JSON-creation path
// (e.g. folder creation, metadata-only asset registration) is exposed here.
export const createInput = z.object({
  name: z.string().min(1),
  content_type: z.string().min(1),
  parent_id: z.string().min(1),
  workflow_id: z.string().nullable().optional(),
  node_id: z.string().nullable().optional(),
  job_id: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  size: z.number().nullable().optional()
});
export type CreateInput = z.infer<typeof createInput>;

// ── update (PUT /api/assets/:id) ─────────────────────────────────
// The `data` field (base64 or utf-8 content) is supported here for
// small text/data writes; large binary uploads should go through the
// multipart REST endpoint instead.
export const updateInput = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  content_type: z.string().optional(),
  parent_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  size: z.number().optional(),
  data: z.string().nullable().optional(),
  data_encoding: z.enum(["base64", "utf-8"]).nullable().optional()
});
export type UpdateInput = z.infer<typeof updateInput>;

// ── delete (DELETE /api/assets/:id) ──────────────────────────────
// Cascading delete: folders remove all contents recursively. Response
// carries every id that was deleted so clients can invalidate caches.
export const deleteInput = z.object({
  id: z.string().min(1)
});
export type DeleteInput = z.infer<typeof deleteInput>;

export const deleteOutput = z.object({
  deleted_asset_ids: z.array(z.string())
});
export type DeleteOutput = z.infer<typeof deleteOutput>;

// ── children (GET /api/assets/:id/children) ──────────────────────
// Returns a trimmed list of direct children (just id/name/content_type).
export const childrenInput = z.object({
  id: z.string().min(1),
  limit: z.number().int().min(1).max(10000).default(100)
});
export type ChildrenInput = z.infer<typeof childrenInput>;

export const childAsset = z.object({
  id: z.string(),
  name: z.string(),
  content_type: z.string()
});
export type ChildAsset = z.infer<typeof childAsset>;

export const childrenOutput = z.object({
  assets: z.array(childAsset),
  next: z.string().nullable()
});
export type ChildrenOutput = z.infer<typeof childrenOutput>;

// ── recursive (GET /api/assets/:id/recursive) ────────────────────
// Flat list of every asset under the folder, including nested sub-folders.
export const recursiveInput = z.object({
  id: z.string().min(1)
});
export type RecursiveInput = z.infer<typeof recursiveInput>;

export const recursiveOutput = z.object({
  assets: z.array(assetResponse)
});
export type RecursiveOutput = z.infer<typeof recursiveOutput>;

// ── search (GET /api/assets/search) ──────────────────────────────
// Minimum query length of 2 characters; matches by name substring.
export const searchInput = z.object({
  query: z.string().min(2),
  content_type: z.string().optional(),
  page_size: z.number().int().min(1).max(10000).default(200),
  cursor: z.string().optional(),
  workflow_id: z.string().optional()
});
export type SearchInput = z.infer<typeof searchInput>;

export const searchOutput = z.object({
  assets: z.array(assetResponse),
  next_cursor: z.string().nullable(),
  total_count: z.number(),
  is_global_search: z.boolean()
});
export type SearchOutput = z.infer<typeof searchOutput>;

// ── byFilename (GET /api/assets/by-filename/:filename) ───────────
export const byFilenameInput = z.object({
  filename: z.string().min(1)
});
export type ByFilenameInput = z.infer<typeof byFilenameInput>;
