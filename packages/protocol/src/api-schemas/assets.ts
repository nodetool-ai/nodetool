import { z } from "zod";

// ── Asset response ───────────────────────────────────────────────
// Mirrors `toAssetResponse` in the legacy http-api.ts handler. `get_url`
// and `thumb_url` are resolved server-side; `duration` is only set for
// audio/video assets.

/** The states of a video asset's preview proxy. */
export const videoProxyStatus = z.enum([
  "none",
  "queued",
  "running",
  "ready",
  "failed"
]);
export type VideoProxyStatus = z.infer<typeof videoProxyStatus>;

export const assetResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  workflow_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  name: z.string(),
  content_type: z.string(),
  size: z.number().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  sketch_document_id: z.string().nullable(),
  created_at: z.string(),
  /**
   * When the row last changed, a content overwrite included. An open editor
   * compares it with the value it loaded to notice a write from elsewhere.
   */
  updated_at: z.string().optional(),
  get_url: z.string().nullable(),
  thumb_url: z.string().nullable(),
  duration: z.number().nullable(),
  node_id: z.string().nullable(),
  job_id: z.string().nullable(),
  timeline_id: z.string().nullable().optional(),
  /** The project the asset belongs to; `"default"` for none. */
  project_id: z.string().optional(),
  /** The user starred this asset. */
  favorite: z.boolean().optional(),
  /**
   * Present on an asset that references a local file in place: true when
   * that file is missing or has changed since import or relink. Also true on
   * an asset whose file is missing from its project folder. An offline
   * asset's `get_url` answers 404 until `relinkExternal` points it at a file.
   */
  offline: z.boolean().optional(),
  /**
   * True on an asset that references a file outside its project folder in
   * place (linked media). Absent on every other asset.
   */
  linked: z.boolean().optional(),
  /**
   * The project-relative path of the asset's file in its project folder.
   * Absent on an asset with no file there.
   */
  workspace_path: z.string().optional(),
  /**
   * Present only on a video asset on a local server: the state of its
   * all-intra preview proxy. `ready` means `proxy_url` plays it. A proxy made
   * from an earlier version of the file is not ready.
   */
  proxy_status: videoProxyStatus.optional(),
  /**
   * The preview proxy's URL while `proxy_status` is `ready`, else null. For
   * the timeline preview only: export and every other reader use `get_url`.
   */
  proxy_url: z.string().nullable().optional()
});
export type AssetResponse = z.infer<typeof assetResponse>;

// ── list (GET /api/assets) ───────────────────────────────────────
// All filter parameters are optional; legacy defaults to the user's
// home folder if none are specified.
export const listInput = z.object({
  parent_id: z.string().optional(),
  /** Restrict browsing to one project; omitted keeps the explicit global view. */
  project_id: z.string().optional(),
  content_type: z.string().optional(),
  workflow_id: z.string().optional(),
  node_id: z.string().optional(),
  job_id: z.string().optional(),
  timeline_id: z.string().optional(),
  /** Only starred assets, from every folder. */
  favorite: z.boolean().optional(),
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
  id: z.string().min(1),
  /** Restrict a folder lookup to one project when it is used for navigation. */
  project_id: z.string().optional()
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
  timeline_id: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  project_id: z.string().min(1).optional(),
  sketch_document_id: z.string().nullable().optional(),
  size: z.number().nullable().optional()
});
export type CreateInput = z.infer<typeof createInput>;

// ── createUpload / finalizeUpload (client-direct upload) ─────────
//
// Two-step upload that keeps object bytes out of the API process. The server
// creates the row, picks the storage key, and hands back a short-lived target
// scoped to that one key; the client PUTs the bytes straight to the storage
// backend and then calls `finalizeUpload`, which verifies what actually
// landed. `upload` is null on backends with no direct-upload concept (the
// local file store) — the client falls back to the multipart POST.

export const uploadTarget = z.object({
  url: z.string(),
  method: z.enum(["PUT", "POST"]),
  headers: z.record(z.string(), z.string()),
  expires_at: z.number()
});
export type UploadTarget = z.infer<typeof uploadTarget>;

export const createUploadInput = z.object({
  name: z.string().min(1),
  content_type: z.string().min(1),
  /** Empty or omitted means the user's root folder, as on `POST /api/assets/`. */
  parent_id: z.string().optional(),
  /** Declared byte size, checked against the upload cap before minting. */
  size: z.number().int().nonnegative(),
  workflow_id: z.string().nullable().optional(),
  node_id: z.string().nullable().optional(),
  job_id: z.string().nullable().optional(),
  timeline_id: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  project_id: z.string().min(1).optional()
});
export type CreateUploadInput = z.infer<typeof createUploadInput>;

export const createUploadOutput = z.object({
  asset_id: z.string(),
  /** Storage key the server assigned. Never chosen by the client. */
  key: z.string(),
  upload: uploadTarget.nullable()
});
export type CreateUploadOutput = z.infer<typeof createUploadOutput>;

export const finalizeUploadInput = z.object({
  asset_id: z.string().min(1),
  /**
   * Directory in the project folder the file was dropped on, relative to the
   * folder. Omitted, the upload goes to `Imported/`.
   */
  directory: z.string().optional()
});
export type FinalizeUploadInput = z.infer<typeof finalizeUploadInput>;

export const finalizeUploadOutput = assetResponse;
export type FinalizeUploadOutput = z.infer<typeof finalizeUploadOutput>;

// ── createExternal (reference a local file in place) ─────────────
// Desktop only. The server validates `path` against the local file roots and
// records it on the row; no bytes are copied. The response never carries the
// path, and `get_url` stays the id-based `/api/storage/...` URL.

export const externalImportConfigOutput = z.object({
  /** False in the cloud, in production, and on any non-file asset store. */
  enabled: z.boolean(),
  /** Files at or above this size are referenced in place. */
  threshold_bytes: z.number().int().positive()
});
export type ExternalImportConfigOutput = z.infer<
  typeof externalImportConfigOutput
>;

export const createExternalInput = z.object({
  /** Absolute path of the file on the server's disk. */
  path: z.string().min(1),
  /** Defaults to the file's base name. */
  name: z.string().min(1).optional(),
  /** Inferred from the name when omitted or generic. */
  content_type: z.string().optional(),
  /** Empty or omitted means the user's root folder. */
  parent_id: z.string().optional(),
  project_id: z.string().min(1).optional(),
  workflow_id: z.string().nullable().optional()
});
export type CreateExternalInput = z.infer<typeof createExternalInput>;

export const createExternalOutput = assetResponse;
export type CreateExternalOutput = z.infer<typeof createExternalOutput>;

// ── relinkExternal (point an asset at another file) ──────────────
// Keeps the asset id and `get_url`. An absolute path is validated again
// against the local file roots, and the file's size and mtime are recorded
// anew. An asset whose file is in its project folder is pointed at a file in
// that folder, or at a file outside it, which is copied in.

export const relinkExternalInput = z.object({
  id: z.string().min(1),
  /**
   * Absolute path of the replacement file on the server's disk. For an asset
   * in a project folder, a relative path names a file in that folder.
   */
  path: z.string().min(1)
});
export type RelinkExternalInput = z.infer<typeof relinkExternalInput>;

export const relinkExternalOutput = assetResponse;
export type RelinkExternalOutput = z.infer<typeof relinkExternalOutput>;

// ── collect (copy a project's linked files into its folder) ──────
// Each linked file is copied into `Imported/`, verified, and its row pointed
// at the copy. Asset ids stay. A linked file that is offline is skipped.

export const collectInput = z.object({
  project_id: z.string().min(1)
});
export type CollectInput = z.infer<typeof collectInput>;

const uncollectedAsset = z.object({
  id: z.string(),
  name: z.string(),
  reason: z.string()
});

export const collectOutput = z.object({
  copied: z.array(
    z.object({ id: z.string(), name: z.string(), workspace_path: z.string() })
  ),
  /** Linked files that are missing or changed since they were linked. */
  skipped: z.array(uncollectedAsset),
  /** Linked files whose copy could not be written or verified. */
  failed: z.array(uncollectedAsset),
  /** The request was cancelled before every linked file was tried. */
  interrupted: z.boolean()
});
export type CollectOutput = z.infer<typeof collectOutput>;

// ── ensureProxy (preview proxy for a video asset) ─────────────────
// Queues an all-intra preview proxy for a video asset at any size and answers
// the current state. Local server only.

export const ensureProxyInput = z.object({
  id: z.string().min(1)
});
export type EnsureProxyInput = z.infer<typeof ensureProxyInput>;

export const ensureProxyOutput = z.object({
  status: videoProxyStatus,
  proxy_url: z.string().nullable()
});
export type EnsureProxyOutput = z.infer<typeof ensureProxyOutput>;

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
  /** Reject the update if metadata changed since the caller read the asset. */
  expected_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * Reject the update if the row's `updated_at` changed since the caller read
   * it. Document editors autosave with this compare-and-swap token.
   */
  expected_updated_at: z.string().optional(),
  sketch_document_id: z.string().nullable().optional(),
  timeline_id: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
  size: z.number().optional(),
  data: z.string().nullable().optional(),
  data_encoding: z.enum(["base64", "utf-8"]).nullable().optional()
});
export type UpdateInput = z.infer<typeof updateInput>;

// ── copyToProject ────────────────────────────────────────────────
// Use an asset of another project, Personal included, in `project_id`. The
// file is copied into the project's `Imported/` directory and the copy is
// returned; the same unchanged source returns the same copy. An asset of the
// project itself comes back as it is, with `copied: false`.
export const copyToProjectInput = z.object({
  asset_id: z.string().min(1),
  project_id: z.string().min(1)
});
export type CopyToProjectInput = z.infer<typeof copyToProjectInput>;

export const copyToProjectOutput = z.object({
  asset: assetResponse,
  copied: z.boolean()
});
export type CopyToProjectOutput = z.infer<typeof copyToProjectOutput>;

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
  id: z.string().min(1),
  /** Restrict the recursive folder walk to one project. */
  project_id: z.string().optional()
});
export type RecursiveInput = z.infer<typeof recursiveInput>;

export const recursiveOutput = z.object({
  assets: z.array(assetResponse)
});
export type RecursiveOutput = z.infer<typeof recursiveOutput>;

// ── search (GET /api/assets/search) ──────────────────────────────
// Matches by name substring. An empty query matches everything, which lets
// the `@`-mention typeahead show a list of assets before the user narrows it.
export const searchInput = z.object({
  query: z.string(),
  /** Restrict search results to one project; omitted is the explicit global search. */
  project_id: z.string().optional(),
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
