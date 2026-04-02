/**
 * Admin route handler functions for the NodeTool server.
 *
 * This module exports pure handler functions with typed params and return
 * values that can be wired to any HTTP framework (Express, Fastify, Hono,
 * raw Node http, etc.). No framework-specific imports.
 *
 * Endpoints covered:
 * - HuggingFace model download (SSE)
 * - Ollama model download (SSE)
 * - Cache scan and size
 * - Delete HF model
 * - Database CRUD via adapter
 * - Collection management
 * - Asset management
 */

import {
  type HFHubAdapter,
  type OllamaAdapter,
  downloadHFModel,
  downloadOllamaModel,
  scanHFCache,
  calculateCacheSize,
  deleteHFModel
} from "./admin-operations.js";

// ── Shared types ───────────────────────────────────────────

/** Thrown by handlers to signal an HTTP error to the framework adapter. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

// ── Request / Response interfaces ──────────────────────────

// -- Collections --

export interface CollectionCreateRequest {
  name: string;
  embedding_model: string;
}

export interface CollectionResponse {
  name: string;
  count: number;
  metadata: Record<string, unknown> | null;
  workflow_name?: string | null;
}

export interface CollectionListResponse {
  collections: CollectionResponse[];
  count: number;
}

export interface CollectionModifyRequest {
  name?: string;
  metadata?: Record<string, string>;
}

export interface AddToCollectionRequest {
  documents: string[];
  ids: string[];
  metadatas: Record<string, string>[];
  embeddings: number[][];
}

// -- Assets --

export interface AssetResponse {
  id: string;
  user_id: string;
  workflow_id?: string | null;
  parent_id?: string | null;
  name: string;
  content_type: string;
  size?: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  get_url?: string | null;
  thumb_url?: string | null;
  duration?: number | null;
}

export interface AssetListResponse {
  next: string | null;
  assets: AssetResponse[];
}

export interface CreateAssetRequest {
  id?: string;
  user_id?: string;
  name?: string;
  content_type?: string;
  parent_id?: string;
  workflow_id?: string;
  metadata?: Record<string, unknown>;
}

// -- DB --

export interface DbSaveRequest {
  table: string;
  item: Record<string, unknown>;
}

// -- Model downloads --

export interface HFDownloadRequest {
  repo_id: string;
  cache_dir?: string;
  file_path?: string;
  ignore_patterns?: string[];
  allow_patterns?: string[];
  stream?: boolean;
}

export interface OllamaDownloadRequest {
  model_name: string;
  stream?: boolean;
}

// -- Index --

export interface IndexResponse {
  path: string;
  error?: string | null;
}

// ── SSE helper ─────────────────────────────────────────────

/**
 * Encode an async generator of objects into an SSE text stream.
 * Each yielded value becomes a `data: <json>\n\n` line, terminated
 * with `data: [DONE]\n\n`.
 */
export async function* encodeSSE(
  source: AsyncGenerator<Record<string, unknown>>
): AsyncGenerator<string> {
  try {
    for await (const chunk of source) {
      yield `data: ${JSON.stringify(chunk)}\n\n`;
    }
    yield "data: [DONE]\n\n";
  } catch (err) {
    const errorData = { status: "error", error: String(err) };
    yield `data: ${JSON.stringify(errorData)}\n\n`;
  }
}

/** Standard SSE response headers. */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// ── Injectable adapters ────────────────────────────────────

/**
 * Database adapter interface matching the Python DatabaseAdapter pattern.
 */
export interface DatabaseAdapter {
  get(key: string): Promise<Record<string, unknown> | null>;
  save(item: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Resolves a DatabaseAdapter for the given table name.
 */
export type DatabaseAdapterFactory = (
  table: string
) => Promise<DatabaseAdapter>;

/**
 * Chroma-like collection interface.
 */
export interface CollectionHandle {
  name: string;
  metadata: Record<string, unknown> | null;
  count(): Promise<number>;
  modify(opts: {
    name?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  add(opts: {
    documents: string[];
    ids: string[];
    metadatas: Record<string, string>[];
    embeddings: number[][];
  }): Promise<void>;
}

/**
 * Vector store client interface.
 */
export interface VecStoreClient {
  createCollection(opts: {
    name: string;
    metadata: Record<string, unknown>;
  }): Promise<CollectionHandle>;
  listCollections(): Promise<CollectionHandle[]>;
  getCollection(opts: { name: string }): Promise<CollectionHandle>;
  deleteCollection(opts: { name: string }): Promise<void>;
}

/**
 * Asset storage interface.
 */
export interface AssetStorage {
  getUrl(fileName: string): Promise<string | null>;
  delete(fileName: string): Promise<void>;
}

/**
 * Asset model interface (mirrors Python AssetModel).
 */
export interface AssetRecord {
  id: string;
  user_id: string;
  workflow_id?: string | null;
  parent_id?: string | null;
  name: string;
  content_type: string;
  size?: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  file_name: string;
  thumb_file_name: string;
  has_thumbnail: boolean;
  duration?: number | null;
  delete(): Promise<void>;
}

/**
 * Asset model static operations.
 */
export interface AssetModel {
  get(id: string): Promise<AssetRecord | null>;
  find(userId: string, id: string): Promise<AssetRecord | null>;
  create(data: CreateAssetRequest & { user_id: string }): Promise<AssetRecord>;
  paginate(opts: {
    user_id: string;
    parent_id?: string | null;
    content_type?: string | null;
    limit: number;
    start_key?: string | null;
  }): Promise<[AssetRecord[], string | null]>;
}

/**
 * Workflow model for looking up names.
 */
export interface WorkflowModel {
  get(id: string): Promise<{ name: string } | null>;
}

/**
 * All injectable dependencies for the admin route handlers.
 */
export interface AdminDeps {
  hub: HFHubAdapter;
  ollama?: OllamaAdapter;
  getDbAdapter: DatabaseAdapterFactory;
  vecStore: VecStoreClient;
  assetModel: AssetModel;
  assetStorage: AssetStorage;
  workflowModel: WorkflowModel;
  getSecret?: (key: string, userId: string) => Promise<string | null>;
}

// ── Helper: AssetRecord → AssetResponse ────────────────────

async function assetFromRecord(
  asset: AssetRecord,
  storage: AssetStorage
): Promise<AssetResponse> {
  const getUrl =
    asset.content_type !== "folder"
      ? await storage.getUrl(asset.file_name)
      : null;

  const thumbUrl = asset.has_thumbnail
    ? await storage.getUrl(asset.thumb_file_name)
    : null;

  return {
    id: asset.id,
    user_id: asset.user_id,
    workflow_id: asset.workflow_id,
    parent_id: asset.parent_id,
    name: asset.name,
    content_type: asset.content_type,
    size: asset.size,
    metadata: asset.metadata,
    created_at: asset.created_at,
    get_url: getUrl,
    thumb_url: thumbUrl,
    duration: asset.duration
  };
}

// ── Route handlers ─────────────────────────────────────────

// -- Model downloads (SSE) --

/**
 * POST /admin/models/huggingface/download
 *
 * Returns an async generator of SSE strings.
 */
export async function* handleDownloadHuggingfaceModel(
  deps: AdminDeps,
  data: HFDownloadRequest
): AsyncGenerator<string> {
  if (!data.repo_id) {
    throw new HttpError(400, "repo_id is required");
  }

  const source = downloadHFModel(deps.hub, {
    repoId: data.repo_id,
    cacheDir: data.cache_dir,
    filePath: data.file_path,
    ignorePatterns: data.ignore_patterns,
    allowPatterns: data.allow_patterns,
    stream: data.stream ?? true,
    getSecret: deps.getSecret
  });

  yield* encodeSSE(source as AsyncGenerator<Record<string, unknown>>);
}

/**
 * POST /admin/models/ollama/download
 *
 * Returns an async generator of SSE strings.
 */
export async function* handleDownloadOllamaModel(
  deps: AdminDeps,
  data: OllamaDownloadRequest
): AsyncGenerator<string> {
  if (!data.model_name) {
    throw new HttpError(400, "model_name is required");
  }
  if (!deps.ollama) {
    throw new HttpError(500, "Ollama adapter not configured");
  }

  const source = downloadOllamaModel(
    deps.ollama,
    data.model_name,
    data.stream ?? true
  );

  yield* encodeSSE(source as AsyncGenerator<Record<string, unknown>>);
}

// -- Cache --

/**
 * GET /admin/cache/scan
 */
export async function handleScanCache(
  deps: AdminDeps
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown>[] = [];
  for await (const chunk of scanHFCache(deps.hub)) {
    results.push(chunk);
  }
  return results[0] ?? { status: "error", message: "No cache data" };
}

/**
 * GET /admin/cache/size
 */
export async function handleGetCacheSize(
  cacheDir: string = "/app/.cache/huggingface/hub"
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown>[] = [];
  for await (const chunk of calculateCacheSize(cacheDir)) {
    results.push(chunk);
  }
  return results[0] ?? { status: "error", message: "No size data" };
}

// -- Delete model --

/**
 * DELETE /admin/models/huggingface/:repoId
 */
export async function handleDeleteHuggingfaceModel(
  deps: AdminDeps,
  repoId: string
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown>[] = [];
  for await (const chunk of deleteHFModel(deps.hub, repoId)) {
    results.push(chunk);
  }
  return results[0] ?? { status: "error", message: "Delete failed" };
}

// -- Database adapter operations --

/**
 * POST /admin/db/:table/save
 */
export async function handleDbSave(
  deps: AdminDeps,
  table: string,
  item: Record<string, unknown>
): Promise<{ status: string }> {
  const adapter = await deps.getDbAdapter(table);
  await adapter.save(item);
  return { status: "ok" };
}

/**
 * GET /admin/db/:table/:key
 */
export async function handleDbGet(
  deps: AdminDeps,
  table: string,
  key: string
): Promise<Record<string, unknown>> {
  const adapter = await deps.getDbAdapter(table);
  const item = await adapter.get(key);
  if (item === null) {
    throw new HttpError(404, "Not found");
  }
  return item;
}

/**
 * DELETE /admin/db/:table/:key
 */
export async function handleDbDelete(
  deps: AdminDeps,
  table: string,
  key: string
): Promise<{ status: string }> {
  const adapter = await deps.getDbAdapter(table);
  await adapter.delete(key);
  return { status: "ok" };
}

// -- Collection management --

/**
 * POST /admin/collections
 */
export async function handleCreateCollection(
  deps: AdminDeps,
  req: CollectionCreateRequest
): Promise<CollectionResponse> {
  const metadata = { embedding_model: req.embedding_model };
  const collection = await deps.vecStore.createCollection({
    name: req.name,
    metadata
  });
  return {
    name: collection.name,
    metadata: collection.metadata,
    count: 0
  };
}

/**
 * GET /admin/collections
 */
export async function handleListCollections(
  deps: AdminDeps
): Promise<CollectionListResponse> {
  const collections = await deps.vecStore.listCollections();

  const results = await Promise.all(
    collections.map(async (col) => {
      const count = await col.count();
      let workflowName: string | null = null;
      const workflowId = (col.metadata as Record<string, unknown>)?.[
        "workflow"
      ];
      if (typeof workflowId === "string") {
        const wf = await deps.workflowModel.get(workflowId);
        if (wf) workflowName = wf.name;
      }
      return {
        name: col.name,
        metadata: col.metadata ?? {},
        workflow_name: workflowName,
        count
      } satisfies CollectionResponse;
    })
  );

  return { collections: results, count: results.length };
}

/**
 * GET /admin/collections/:name
 */
export async function handleGetCollection(
  deps: AdminDeps,
  name: string
): Promise<CollectionResponse> {
  const collection = await deps.vecStore.getCollection({ name });
  const count = await collection.count();
  return {
    name: collection.name,
    metadata: collection.metadata,
    count
  };
}

/**
 * PUT /admin/collections/:name
 */
export async function handleUpdateCollection(
  deps: AdminDeps,
  name: string,
  req: CollectionModifyRequest
): Promise<CollectionResponse> {
  const collection = await deps.vecStore.getCollection({ name });
  const metadata = { ...(collection.metadata ?? {}), ...(req.metadata ?? {}) };
  const newName = req.name ?? collection.name;
  await collection.modify({ name: newName, metadata });
  return {
    name: collection.name,
    metadata: collection.metadata,
    count: await collection.count()
  };
}

/**
 * DELETE /admin/collections/:name
 */
export async function handleDeleteCollection(
  deps: AdminDeps,
  name: string
): Promise<{ message: string }> {
  await deps.vecStore.deleteCollection({ name });
  return { message: `Collection ${name} deleted successfully` };
}

/**
 * POST /admin/collections/:name/add
 */
export async function handleAddToCollection(
  deps: AdminDeps,
  name: string,
  req: AddToCollectionRequest
): Promise<{ message: string }> {
  const collection = await deps.vecStore.getCollection({ name });
  await collection.add({
    documents: req.documents,
    ids: req.ids,
    metadatas: req.metadatas,
    embeddings: req.embeddings
  });
  return { message: `Documents added to collection ${name} successfully` };
}

// -- Asset management --

/**
 * GET /admin/assets
 */
export async function handleListAssets(
  deps: AdminDeps,
  opts: {
    userId?: string;
    parentId?: string | null;
    contentType?: string | null;
    cursor?: string | null;
    pageSize?: number;
  }
): Promise<AssetListResponse> {
  const effectiveUser = opts.userId ?? "1";
  let pageSize = opts.pageSize ?? 100;
  if (pageSize > 10000) pageSize = 10000;

  let parentId = opts.parentId ?? null;
  if (opts.contentType == null && parentId == null) {
    parentId = effectiveUser;
  }

  const [assets, nextCursor] = await deps.assetModel.paginate({
    user_id: effectiveUser,
    parent_id: parentId,
    content_type: opts.contentType ?? null,
    limit: pageSize,
    start_key: opts.cursor ?? null
  });

  const assetResponses = await Promise.all(
    assets.map((a) => assetFromRecord(a, deps.assetStorage))
  );

  return { next: nextCursor, assets: assetResponses };
}

/**
 * POST /admin/assets
 */
export async function handleCreateAsset(
  deps: AdminDeps,
  data: CreateAssetRequest,
  currentUser: string = "1"
): Promise<AssetResponse> {
  const createData: CreateAssetRequest & { user_id: string } = {
    ...data,
    user_id: data.user_id ?? currentUser,
    name: data.name ?? "",
    content_type: data.content_type ?? ""
  };

  const asset = await deps.assetModel.create(createData);
  return assetFromRecord(asset, deps.assetStorage);
}

/**
 * GET /admin/assets/:assetId
 */
export async function handleGetAsset(
  deps: AdminDeps,
  assetId: string,
  userId: string = "1"
): Promise<AssetResponse> {
  // Special case: user root folder
  if (assetId === userId) {
    return {
      user_id: userId,
      id: userId,
      name: "Home",
      content_type: "folder",
      parent_id: "",
      workflow_id: null,
      size: null,
      get_url: null,
      thumb_url: null,
      created_at: ""
    };
  }

  const asset = await deps.assetModel.get(assetId);
  if (!asset) {
    throw new HttpError(404, "Asset not found");
  }
  return assetFromRecord(asset, deps.assetStorage);
}

/**
 * DELETE /admin/assets/:assetId
 *
 * Recursively deletes folders.
 */
export async function handleDeleteAsset(
  deps: AdminDeps,
  assetId: string,
  currentUser: string
): Promise<{ deleted_asset_ids: string[] }> {
  const asset = await deps.assetModel.get(assetId);
  if (!asset) {
    throw new HttpError(404, "Asset not found");
  }
  if (asset.user_id !== currentUser) {
    throw new HttpError(403, "Asset access denied");
  }

  const deletedIds: string[] = [];

  const deleteSingle = async (a: AssetRecord): Promise<void> => {
    await a.delete();
    try {
      await deps.assetStorage.delete(a.thumb_file_name);
    } catch {
      // ignore
    }
    try {
      await deps.assetStorage.delete(a.file_name);
    } catch {
      // ignore
    }
  };

  const deleteFolder = async (
    uid: string,
    folderId: string
  ): Promise<string[]> => {
    const ids: string[] = [];
    const [children] = await deps.assetModel.paginate({
      user_id: uid,
      parent_id: folderId,
      limit: 10000
    });

    for (const child of children) {
      if (child.content_type === "folder") {
        const subIds = await deleteFolder(uid, child.id);
        ids.push(...subIds);
      } else {
        await deleteSingle(child);
        ids.push(child.id);
      }
    }

    const folder = await deps.assetModel.find(uid, folderId);
    if (folder) {
      await deleteSingle(folder);
      ids.push(folderId);
    }

    return ids;
  };

  if (asset.content_type === "folder") {
    deletedIds.push(...(await deleteFolder(asset.user_id, assetId)));
  } else {
    await deleteSingle(asset);
    deletedIds.push(assetId);
  }

  return { deleted_asset_ids: deletedIds };
}
