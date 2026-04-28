/**
 * ProcessingContext – runtime context for node execution.
 *
 * Port of src/nodetool/workflows/processing_context.py.
 *
 * Provides:
 *   - Message queue for emitting ProcessingMessages.
 *   - Cache get/set interface.
 *   - Output normalization (sanitize memory URIs, etc.).
 *   - Asset handling with pluggable storage adapters.
 */

import type { AssetRef, ProcessingMessage } from "@nodetool-ai/protocol";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BaseProvider } from "./providers/base-provider.js";
import type {
  Message,
  MessageContent,
  ProviderStreamItem
} from "./providers/types.js";
import type { NodeExecutor } from "./node-executor.js";

// ---------------------------------------------------------------------------
// Cache interface
// ---------------------------------------------------------------------------

export interface CacheAdapter {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/**
 * In-memory cache adapter (default for tests and single-process execution).
 */
export class MemoryCache implements CacheAdapter {
  private _store = new Map<
    string,
    { value: unknown; expires: number | null }
  >();

  async get(key: string): Promise<unknown | undefined> {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (entry.expires !== null && Date.now() > entry.expires) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expires = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this._store.set(key, { value, expires });
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async delete(key: string): Promise<void> {
    this._store.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Storage adapter interface
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  /** Store an asset and return a URI. */
  store(key: string, data: Uint8Array, contentType?: string): Promise<string>;

  /** Retrieve an asset by URI. */
  retrieve(uri: string): Promise<Uint8Array | null>;

  /** Check if an asset exists. */
  exists(uri: string): Promise<boolean>;
}

export type AssetOutputMode =
  | "python"
  | "data_uri"
  | "temp_url"
  | "storage_url"
  | "workspace"
  | "raw";
export type ProviderCapability =
  | "generate_message"
  | "generate_messages"
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video"
  | "text_to_speech"
  | "automatic_speech_recognition"
  | "generate_embedding";

type PredictionStatus = "pending" | "running" | "completed" | "failed";

export type ProviderPredictionRequest = {
  provider: string;
  capability: ProviderCapability;
  model: string;
  nodeId?: string;
  workflowId?: string | null;
  params?: Record<string, unknown>;
};

export type HttpRetryOptions = {
  maxRetries?: number;
  backoffMs?: number;
  retryStatuses?: number[];
  headers?: Record<string, string>;
};

export type HttpRequestOptions = Omit<
  RequestInit,
  "method" | "headers" | "body"
> & {
  headers?: Record<string, string>;
  body?: RequestInit["body"] | null;
  retry?: HttpRetryOptions;
};

export interface MessageCreateRequestLike {
  thread_id: string;
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  workflow_id?: string | null;
  name?: string | null;
  tool_call_id?: string | null;
}

export interface ThreadMessagesResultLike {
  messages: Array<Record<string, unknown>>;
  next: string | null;
}

export interface AssetCreateParamsLike {
  userId: string;
  workflowId: string | null;
  jobId: string;
  name: string;
  contentType: string;
  content: Uint8Array;
  parentId?: string | null;
  nodeId?: string | null;
}

export interface ProcessingContextModelInterfaces {
  getJob?: (args: { userId: string; jobId: string }) => Promise<unknown | null>;
  createAsset?: (args: AssetCreateParamsLike) => Promise<unknown>;
  createMessage?: (args: {
    userId: string;
    req: MessageCreateRequestLike;
  }) => Promise<unknown>;
  getMessages?: (args: {
    userId: string;
    threadId: string;
    limit?: number;
    startKey?: string | null;
    reverse?: boolean;
  }) => Promise<ThreadMessagesResultLike>;
}

function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function normalizeStorageKey(key: string): string {
  const cleaned = normalize(key.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (
    !cleaned ||
    cleaned === "." ||
    cleaned.startsWith("..") ||
    cleaned.includes(`..${sep}`)
  ) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return cleaned;
}

function joinStorageKey(prefix: string | undefined, key: string): string {
  const normalizedKey = normalizeStorageKey(key);
  if (!prefix) return normalizedKey;
  const normalizedPrefix = normalizeStorageKey(prefix);
  return `${normalizedPrefix}/${normalizedKey}`;
}

/**
 * In-memory storage adapter useful for tests and single-process ephemeral runs.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private _store = new Map<string, Uint8Array>();

  async store(
    key: string,
    data: Uint8Array,
    _contentType?: string
  ): Promise<string> {
    const normalized = normalizeStorageKey(key);
    this._store.set(normalized, new Uint8Array(data));
    return `memory://${normalized}`;
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    if (!uri.startsWith("memory://")) return null;
    const key = uri.slice("memory://".length);
    const value = this._store.get(key);
    return value ? new Uint8Array(value) : null;
  }

  async exists(uri: string): Promise<boolean> {
    if (!uri.startsWith("memory://")) return false;
    const key = uri.slice("memory://".length);
    return this._store.has(key);
  }
}

/**
 * File-system storage adapter rooted to a single base directory.
 */
export class FileStorageAdapter implements StorageAdapter {
  readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  private resolvePathFromKey(key: string): string {
    const normalized = normalizeStorageKey(key);
    const absolute = resolve(join(this.rootDir, normalized));
    if (!isWithinRoot(this.rootDir, absolute)) {
      throw new Error(`Storage key escapes root: ${key}`);
    }
    return absolute;
  }

  private resolvePathFromUri(uri: string): string | null {
    let absolute: string | null = null;

    if (uri.startsWith("file://")) {
      try {
        absolute = resolve(fileURLToPath(uri));
      } catch {
        // Invalid file:// URI — treat as unresolvable.
        return null;
      }
    } else if (
      uri.startsWith("/api/storage/") ||
      uri.startsWith("api/storage/")
    ) {
      const key = uri.replace(/^\/?api\/storage\//, "");
      absolute = this.resolvePathFromKey(key);
    } else if (/^https?:\/\//.test(uri)) {
      try {
        const parsed = new URL(uri);
        if (parsed.pathname.startsWith("/api/storage/")) {
          const key = parsed.pathname.replace(/^\/api\/storage\//, "");
          absolute = this.resolvePathFromKey(key);
        }
      } catch {
        // Malformed URL — treat as unresolvable.
        return null;
      }
    } else {
      return null;
    }

    if (absolute === null || !isWithinRoot(this.rootDir, absolute)) {
      return null;
    }
    return absolute;
  }

  async store(
    key: string,
    data: Uint8Array,
    _contentType?: string
  ): Promise<string> {
    const absolutePath = this.resolvePathFromKey(key);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, data);
    return pathToFileURL(absolutePath).toString();
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    const absolutePath = this.resolvePathFromUri(uri);
    if (!absolutePath) return null;
    try {
      return await readFile(absolutePath);
    } catch {
      // File not found or unreadable — caller handles null.
      return null;
    }
  }

  async exists(uri: string): Promise<boolean> {
    const absolutePath = this.resolvePathFromUri(uri);
    if (!absolutePath) return false;
    try {
      await access(absolutePath);
      return true;
    } catch {
      // File does not exist or is inaccessible.
      return false;
    }
  }
}

export interface S3Client {
  putObject(input: {
    bucket: string;
    key: string;
    body: Uint8Array;
    contentType?: string;
  }): Promise<void>;
  getObject(input: { bucket: string; key: string }): Promise<Uint8Array | null>;
  headObject(input: { bucket: string; key: string }): Promise<boolean>;
}

/**
 * S3-backed storage adapter with injected client operations.
 *
 * This avoids hard-coupling runtime to any specific SDK while providing
 * predictable URI behavior (`s3://bucket/key`).
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly bucket: string;
  readonly prefix: string | null;
  readonly client: S3Client;

  constructor(opts: { bucket: string; client: S3Client; prefix?: string }) {
    if (!opts.bucket) {
      throw new Error("S3 bucket is required");
    }
    this.bucket = opts.bucket;
    this.client = opts.client;
    this.prefix = opts.prefix ? normalizeStorageKey(opts.prefix) : null;
  }

  private keyForStore(key: string): string {
    return joinStorageKey(this.prefix ?? undefined, key);
  }

  private parseUri(uri: string): { bucket: string; key: string } | null {
    if (!uri.startsWith("s3://")) return null;
    const withoutScheme = uri.slice("s3://".length);
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
      return null;
    }
    const bucket = withoutScheme.slice(0, slashIndex);
    const key = withoutScheme.slice(slashIndex + 1);
    return { bucket, key };
  }

  async store(
    key: string,
    data: Uint8Array,
    contentType?: string
  ): Promise<string> {
    const objectKey = this.keyForStore(key);
    await this.client.putObject({
      bucket: this.bucket,
      key: objectKey,
      body: data,
      contentType
    });
    return `s3://${this.bucket}/${objectKey}`;
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    const parsed = this.parseUri(uri);
    if (!parsed) return null;
    if (parsed.bucket !== this.bucket) return null;
    return this.client.getObject(parsed);
  }

  async exists(uri: string): Promise<boolean> {
    const parsed = this.parseUri(uri);
    if (!parsed) return false;
    if (parsed.bucket !== this.bucket) return false;
    return this.client.headObject(parsed);
  }
}

/**
 * Resolve paths relative to a configured workspace root.
 *
 * Supported path forms:
 * - /workspace/foo/bar.txt
 * - workspace/foo/bar.txt
 * - absolute paths (treated as workspace-relative)
 * - relative paths
 */
export function resolveWorkspacePath(
  workspaceDir: string | null | undefined,
  path: string
): string {
  if (workspaceDir == null) {
    throw new Error(
      "No workspace is assigned. File operations require a user-defined workspace. Please configure a workspace before performing disk I/O operations."
    );
  }
  if (workspaceDir === "") {
    throw new Error("Workspace directory is required");
  }

  const workspaceRoot = resolve(workspaceDir);
  const normalizedPath = path.replaceAll("\\", "/");

  let relativePath: string;
  if (normalizedPath.startsWith("/workspace/")) {
    relativePath = normalizedPath.slice("/workspace/".length);
  } else if (normalizedPath.startsWith("workspace/")) {
    relativePath = normalizedPath.slice("workspace/".length);
  } else if (
    isAbsolute(normalizedPath) ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    if (normalizedPath.startsWith("/")) {
      relativePath = normalizedPath.slice(1);
    } else {
      relativePath = normalizedPath.replace(/^[A-Za-z]:\//, "");
    }
  } else {
    relativePath = normalizedPath;
  }

  const absPath = resolve(join(workspaceRoot, relativePath));
  if (!isWithinRoot(workspaceRoot, absPath)) {
    throw new Error(
      `Resolved path '${absPath}' is outside the workspace directory.`
    );
  }
  return absPath;
}

// ---------------------------------------------------------------------------
// ProcessingContext
// ---------------------------------------------------------------------------

export class ProcessingContext {
  readonly jobId: string;
  readonly workflowId: string | null;
  readonly userId: string;
  readonly workspaceDir: string | null;
  readonly assetOutputMode: AssetOutputMode;
  readonly environment: Record<string, string>;

  /** Message queue: all emitted processing messages. */
  private _messages: ProcessingMessage[] = [];
  /** Latest node status by node id. */
  private _nodeStatuses = new Map<string, ProcessingMessage>();
  /** Latest edge status by edge id. */
  private _edgeStatuses = new Map<string, ProcessingMessage>();

  /** Optional message listener (for real-time streaming). */
  private _onMessage: ((msg: ProcessingMessage) => void) | null = null;

  /** Cache adapter. */
  readonly cache: CacheAdapter;

  /** Storage adapter (optional, for asset handling). */
  readonly storage: StorageAdapter | null;
  /** Variables shared across node execution. */
  private _variables: Record<string, unknown>;
  /** Optional async secret resolver. */
  private _secretResolver:
    | ((
        key: string,
        userId: string
      ) => Promise<string | null | undefined> | string | null | undefined)
    | null = null;
  /** Fetch function used by HTTP helpers. */
  private _fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** Optional temporary URL resolver for stored assets. */
  private _tempUrlResolver: ((uri: string) => Promise<string> | string) | null =
    null;
  /** Optional async provider resolver by provider id. */
  private _providerResolver:
    | ((providerId: string) => Promise<BaseProvider> | BaseProvider)
    | null = null;
  /** Optional model-layer adapters used to mirror Python ProcessingContext APIs. */
  private _modelInterfaces: ProcessingContextModelInterfaces | null = null;
  /** Provider cache keyed by provider id. */
  private _providers = new Map<string, BaseProvider>();
  /** In-context memory URI cache (memory:// key-value objects). */
  private _memory = new Map<string, unknown>();
  /** Optional control event dispatcher (set by workflow runner). */
  private _sendControlEvent:
    | ((
        targetNodeId: string,
        properties: Record<string, unknown>
      ) => Promise<Record<string, unknown>>)
    | null = null;
  /** Optional executor resolver for sub-workflow execution. */
  private _resolveExecutor:
    | ((node: {
        id: string;
        type: string;
        [key: string]: unknown;
      }) => NodeExecutor)
    | null = null;
  /** Optional node type resolver for sub-workflow graph hydration. */
  private _resolveNodeType:
    | ((nodeType: string) => Promise<{
        nodeType: string;
        propertyTypes?: Record<string, string>;
        outputs?: Record<string, string>;
        isDynamic?: boolean;
        descriptorDefaults?: Record<string, unknown>;
      } | null>)
    | null = null;
  /** Total cost tracked for operations executed via this context. */
  private _totalCost = 0;
  /** Per-operation cost entries. */
  private _operationCosts: Array<Record<string, unknown>> = [];

  constructor(opts: {
    jobId: string;
    workflowId?: string | null;
    userId?: string;
    workspaceDir?: string | null;
    assetOutputMode?: AssetOutputMode;
    cache?: CacheAdapter;
    storage?: StorageAdapter | null;
    onMessage?: (msg: ProcessingMessage) => void;
    variables?: Record<string, unknown>;
    environment?: Record<string, string>;
    secretResolver?: (
      key: string,
      userId: string
    ) => Promise<string | null | undefined> | string | null | undefined;
    fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
    tempUrlResolver?: (uri: string) => Promise<string> | string;
    modelInterfaces?: ProcessingContextModelInterfaces;
  }) {
    this.jobId = opts.jobId;
    this.workflowId = opts.workflowId ?? null;
    this.userId = opts.userId ?? "default";
    this.workspaceDir = opts.workspaceDir ?? null;
    this.assetOutputMode = opts.assetOutputMode ?? "python";
    this.cache = opts.cache ?? new MemoryCache();
    this.storage = opts.storage ?? null;
    this._onMessage = opts.onMessage ?? null;
    this._variables = { ...(opts.variables ?? {}) };
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string") env[k] = v;
    }
    this.environment = { ...env, ...(opts.environment ?? {}) };
    this._secretResolver = opts.secretResolver ?? null;
    this._fetch =
      opts.fetchFn ??
      ((input: string, init?: RequestInit) => fetch(input, init));
    this._tempUrlResolver = opts.tempUrlResolver ?? null;
    this._modelInterfaces = opts.modelInterfaces ?? null;
  }

  copy(): ProcessingContext {
    const next = new ProcessingContext({
      jobId: this.jobId,
      workflowId: this.workflowId,
      userId: this.userId,
      workspaceDir: this.workspaceDir,
      assetOutputMode: this.assetOutputMode,
      cache: this.cache,
      storage: this.storage,
      onMessage: this._onMessage ?? undefined,
      variables: { ...this._variables },
      environment: { ...this.environment },
      fetchFn: this._fetch,
      secretResolver: this._secretResolver ?? undefined,
      tempUrlResolver: this._tempUrlResolver ?? undefined
    });
    next._providerResolver = this._providerResolver;
    next._modelInterfaces = this._modelInterfaces;
    next._sendControlEvent = this._sendControlEvent;
    next._providers = new Map(this._providers);
    next._totalCost = this._totalCost;
    next._operationCosts = this._operationCosts.map((c) => ({ ...c }));
    return next;
  }

  // -----------------------------------------------------------------------
  // Provider resolution
  // -----------------------------------------------------------------------

  setProviderResolver(
    resolver: (providerId: string) => Promise<BaseProvider> | BaseProvider
  ): void {
    this._providerResolver = resolver;
  }

  setModelInterfaces(modelInterfaces: ProcessingContextModelInterfaces): void {
    this._modelInterfaces = modelInterfaces;
  }

  // -----------------------------------------------------------------------
  // Control event dispatch
  // -----------------------------------------------------------------------

  /**
   * Set the control event dispatcher (called by the workflow runner).
   * This allows agent nodes to dispatch control events to controlled nodes
   * and await their results.
   */
  setSendControlEvent(
    fn: (
      targetNodeId: string,
      properties: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
  ): void {
    this._sendControlEvent = fn;
  }

  /**
   * Dispatch a control event to a target node and await its output.
   * Returns null if no control event dispatcher is configured.
   */
  async sendControlEvent(
    targetNodeId: string,
    properties: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    if (!this._sendControlEvent) return null;
    return this._sendControlEvent(targetNodeId, properties);
  }

  // -----------------------------------------------------------------------
  // Sub-workflow executor resolution
  // -----------------------------------------------------------------------

  setResolveExecutor(
    fn: (node: {
      id: string;
      type: string;
      [key: string]: unknown;
    }) => NodeExecutor
  ): void {
    this._resolveExecutor = fn;
  }

  get resolveExecutor():
    | ((node: {
        id: string;
        type: string;
        [key: string]: unknown;
      }) => NodeExecutor)
    | null {
    return this._resolveExecutor;
  }

  setResolveNodeType(
    fn: (nodeType: string) => Promise<{
      nodeType: string;
      propertyTypes?: Record<string, string>;
      outputs?: Record<string, string>;
      isDynamic?: boolean;
      descriptorDefaults?: Record<string, unknown>;
    } | null>
  ): void {
    this._resolveNodeType = fn;
  }

  get resolveNodeType():
    | ((nodeType: string) => Promise<{
        nodeType: string;
        propertyTypes?: Record<string, string>;
        outputs?: Record<string, string>;
        isDynamic?: boolean;
        descriptorDefaults?: Record<string, unknown>;
      } | null>)
    | null {
    return this._resolveNodeType;
  }

  /**
   * Check if control event dispatch is available.
   */
  get hasControlEventSupport(): boolean {
    return this._sendControlEvent !== null;
  }

  registerProvider(providerId: string, provider: BaseProvider): void {
    this._providers.set(providerId, provider);
  }

  async getProvider(providerId: string): Promise<BaseProvider> {
    if (!providerId || providerId.trim() === "") {
      throw new Error("providerId is required");
    }

    const cached = this._providers.get(providerId);
    if (cached) return cached;

    if (!this._providerResolver) {
      const { getRegisteredProvider } = await import("./providers/index.js");
      const reg = getRegisteredProvider(providerId);
      if (!reg) {
        throw new Error(`No provider registered for "${providerId}"`);
      }
      // Resolve any missing secret kwargs from the context's own secret resolver
      const kwargs = { ...reg.kwargs };
      for (const [key, value] of Object.entries(kwargs)) {
        if (!value) {
          const envVal = process.env[key];
          if (envVal) {
            kwargs[key] = envVal;
          } else {
            const secret = await this.getSecret(key);
            if (secret) {
              kwargs[key] = secret;
            }
          }
        }
      }
      const resolved = new reg.cls(kwargs);
      this._providers.set(providerId, resolved);
      resolved.setMessageEmitter((msg) =>
        this.postMessage(msg as ProcessingMessage)
      );
      return resolved;
    }

    const resolved = await this._providerResolver(providerId);
    this._providers.set(providerId, resolved);
    resolved.setMessageEmitter((msg) =>
      this.postMessage(msg as ProcessingMessage)
    );
    return resolved;
  }

  async get_provider(providerId: string): Promise<BaseProvider> {
    return this.getProvider(providerId);
  }

  // -----------------------------------------------------------------------
  // Secrets / Variables API
  // -----------------------------------------------------------------------

  setSecretResolver(
    resolver: (
      key: string,
      userId: string
    ) => Promise<string | null | undefined> | string | null | undefined
  ): void {
    this._secretResolver = resolver;
  }

  setTempUrlResolver(
    resolver: (uri: string) => Promise<string> | string
  ): void {
    this._tempUrlResolver = resolver;
  }

  async getSecret(key: string): Promise<string | null> {
    if (!this._secretResolver) return null;
    const value = await this._secretResolver(key, this.userId);
    return value ?? null;
  }

  async getSecretRequired(key: string): Promise<string> {
    const value = await this.getSecret(key);
    if (value === null || value === "") {
      throw new Error(`Missing required secret: ${key}`);
    }
    return value;
  }

  async get_secret(key: string): Promise<string | null> {
    return this.getSecret(key);
  }

  async get_secret_required(key: string): Promise<string> {
    return this.getSecretRequired(key);
  }

  get<T = unknown>(key: string, defaultValue?: T): T {
    if (Object.prototype.hasOwnProperty.call(this._variables, key)) {
      return this._variables[key] as T;
    }
    return defaultValue as T;
  }

  set(key: string, value: unknown): void {
    this._variables[key] = value;
    void this.persistVariableIfNeeded(key, value);
    if (key.startsWith("memory://")) {
      this._memory.set(key, value);
    }
  }

  async storeStepResult(key: string, value: unknown): Promise<string> {
    const path = this.workspacePathFor(`${key}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2), "utf8");
    this._variables[key] = { __workspace_result__: `${key}.json` };
    return path;
  }

  async loadStepResult<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    const marker = this._variables[key];
    if (
      marker &&
      typeof marker === "object" &&
      "__workspace_result__" in marker
    ) {
      const rel = (marker as { __workspace_result__: unknown })
        .__workspace_result__;
      const path = this.workspacePathFor(String(rel));
      try {
        const raw = await readFile(path, "utf8");
        return JSON.parse(raw) as T;
      } catch {
        // File missing or corrupt — fall back to default.
        return defaultValue as T;
      }
    }
    if (Object.prototype.hasOwnProperty.call(this._variables, key)) {
      return this._variables[key] as T;
    }
    return defaultValue as T;
  }

  private workspacePathFor(fileName: string): string {
    if (!this.workspaceDir) {
      throw new Error(
        "workspace_dir is required to persist workflow variables"
      );
    }
    return resolveWorkspacePath(this.workspaceDir, fileName);
  }

  private async persistVariableIfNeeded(
    key: string,
    value: unknown
  ): Promise<void> {
    if (!this.workspaceDir) return;
    if (value === undefined || value === null) return;
    if (
      typeof value === "function" ||
      typeof value === "symbol" ||
      typeof value === "bigint"
    )
      return;
    const filePath = this.workspacePathFor(`var_${key}.json`);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
    } catch {
      // Best-effort persistence.
    }
  }

  // -----------------------------------------------------------------------
  // Node result cache helpers
  // -----------------------------------------------------------------------

  generateNodeCacheKey(nodeType: string, nodeProps: unknown): string {
    const normalizedProps =
      nodeProps && typeof nodeProps === "object"
        ? JSON.stringify(
            nodeProps,
            Object.keys(nodeProps as Record<string, unknown>).sort()
          )
        : JSON.stringify(nodeProps ?? null);
    return `${this.userId}:${nodeType}:${normalizedProps}`;
  }

  async getCachedResult(
    nodeType: string,
    nodeProps: unknown
  ): Promise<unknown> {
    const key = this.generateNodeCacheKey(nodeType, nodeProps);
    return this.cache.get(key);
  }

  async cacheResult(
    nodeType: string,
    nodeProps: unknown,
    result: unknown,
    ttlSeconds = 3600
  ): Promise<void> {
    const key = this.generateNodeCacheKey(nodeType, nodeProps);
    await this.cache.set(key, result, ttlSeconds);
  }

  // -----------------------------------------------------------------------
  // Message queue API
  // -----------------------------------------------------------------------

  /**
   * Emit a processing message.
   * Appended to the internal queue and forwarded to listener if set.
   */
  emit(msg: ProcessingMessage): void {
    this._messages.push(msg);
    this._notifyMessage();
    if (msg.type === "node_update" && msg.node_id) {
      this._nodeStatuses.set(msg.node_id, msg);
    }
    if (msg.type === "edge_update" && msg.edge_id) {
      this._edgeStatuses.set(msg.edge_id, msg);
    }
    if (this._onMessage) {
      this._onMessage(msg);
    }
  }

  postMessage(msg: ProcessingMessage): void {
    this.emit(msg);
  }

  post_message(msg: ProcessingMessage): void {
    this.emit(msg);
  }

  /** Get all emitted messages. */
  getMessages(): ReadonlyArray<ProcessingMessage> {
    return this._messages;
  }

  hasMessages(): boolean {
    return this._messages.length > 0;
  }

  popMessage(): ProcessingMessage | undefined {
    return this._messages.shift();
  }

  private _messageResolve: (() => void) | null = null;

  /** Notify that a new message has been pushed. */
  private _notifyMessage(): void {
    if (this._messageResolve) {
      const resolve = this._messageResolve;
      this._messageResolve = null;
      resolve();
    }
  }

  async popMessageAsync(): Promise<ProcessingMessage> {
    while (this._messages.length === 0) {
      await new Promise<void>((r) => {
        this._messageResolve = r;
      });
    }
    return this._messages.shift() as ProcessingMessage;
  }

  async pop_message_async(): Promise<ProcessingMessage> {
    return this.popMessageAsync();
  }

  getNodeStatuses(): Readonly<Record<string, ProcessingMessage>> {
    return Object.fromEntries(this._nodeStatuses);
  }

  getEdgeStatuses(): Readonly<Record<string, ProcessingMessage>> {
    return Object.fromEntries(this._edgeStatuses);
  }

  /** Clear the message queue. */
  clearMessages(): void {
    this._messages = [];
  }

  clear_messages(): void {
    this.clearMessages();
  }

  trackOperationCost(
    operation: string,
    cost: number,
    metadata?: Record<string, unknown>
  ): void {
    const safeCost = Number.isFinite(cost) ? cost : 0;
    this._totalCost += safeCost;
    this._operationCosts.push({
      operation,
      cost: safeCost,
      timestamp: new Date().toISOString(),
      ...(metadata ?? {})
    });
  }

  addToTotalCost(cost: number): void {
    const safeCost = Number.isFinite(cost) ? cost : 0;
    this._totalCost += safeCost;
  }

  resetTotalCost(): void {
    this._totalCost = 0;
    this._operationCosts = [];
  }

  getTotalCost(): number {
    return this._totalCost;
  }

  getOperationCosts(): ReadonlyArray<Record<string, unknown>> {
    return this._operationCosts;
  }

  // -----------------------------------------------------------------------
  // Memory cache helpers
  // -----------------------------------------------------------------------

  clearMemory(pattern?: string): void {
    if (!pattern) {
      this._memory.clear();
      return;
    }
    for (const key of this._memory.keys()) {
      if (key.includes(pattern)) {
        this._memory.delete(key);
      }
    }
  }

  getMemoryStats(): { total: number; byPrefix: Record<string, number> } {
    const byPrefix: Record<string, number> = {};
    for (const key of this._memory.keys()) {
      const withoutScheme = key.replace(/^memory:\/\//, "");
      const prefix = withoutScheme.includes("/")
        ? withoutScheme.split("/")[0]
        : withoutScheme;
      byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
    }
    return { total: this._memory.size, byPrefix };
  }

  // -----------------------------------------------------------------------
  // HTTP helpers
  // -----------------------------------------------------------------------

  private async httpRequestWithRetries(
    method: string,
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    const retry = opts.retry ?? {};
    const maxRetries = retry.maxRetries ?? 3;
    const backoffMs = retry.backoffMs ?? 500;
    const retryStatuses = retry.retryStatuses ?? [
      408, 425, 429, 500, 502, 503, 504
    ];
    const headers = {
      "User-Agent": "nodetool-ts-runtime/0.1",
      Accept: "*/*",
      ...(opts.headers ?? {})
    };
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const response = await this._fetch(url, {
          ...opts,
          method,
          headers
        });
        if (
          retryStatuses.includes(response.status) &&
          attempt < maxRetries - 1
        ) {
          const retryAfter = response.headers.get("Retry-After");
          const retryDelay = retryAfter ? Number(retryAfter) * 1000 : NaN;
          const delayMs = Number.isFinite(retryDelay)
            ? retryDelay
            : backoffMs * 2 ** attempt;
          await new Promise((r) => setTimeout(r, Math.max(0, delayMs)));
          continue;
        }
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} ${response.statusText} for ${method} ${url}`
          );
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries - 1) break;
        const delayMs = backoffMs * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`HTTP request failed: ${method} ${url}`);
  }

  async httpGet(url: string, opts: HttpRequestOptions = {}): Promise<Response> {
    return this.httpRequestWithRetries("GET", url, opts);
  }

  async httpPost(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpRequestWithRetries("POST", url, opts);
  }

  async httpPatch(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpRequestWithRetries("PATCH", url, opts);
  }

  async httpPut(url: string, opts: HttpRequestOptions = {}): Promise<Response> {
    return this.httpRequestWithRetries("PUT", url, opts);
  }

  async httpDelete(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpRequestWithRetries("DELETE", url, opts);
  }

  async httpHead(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpRequestWithRetries("HEAD", url, opts);
  }

  async downloadFile(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Uint8Array> {
    const response = await this.httpGet(url, opts);
    const arr = await response.arrayBuffer();
    return new Uint8Array(arr);
  }

  async downloadText(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<string> {
    const response = await this.httpGet(url, opts);
    return response.text();
  }

  async http_get(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpGet(url, opts);
  }

  async http_post(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpPost(url, opts);
  }

  async http_patch(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpPatch(url, opts);
  }

  async http_put(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpPut(url, opts);
  }

  async http_delete(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpDelete(url, opts);
  }

  async http_head(
    url: string,
    opts: HttpRequestOptions = {}
  ): Promise<Response> {
    return this.httpHead(url, opts);
  }

  private requireModelInterface<
    K extends keyof ProcessingContextModelInterfaces
  >(name: K): NonNullable<ProcessingContextModelInterfaces[K]> {
    const fn = this._modelInterfaces?.[name];
    if (!fn) {
      throw new Error(
        `ProcessingContext model interface '${String(name)}' is not configured`
      );
    }
    return fn as NonNullable<ProcessingContextModelInterfaces[K]>;
  }

  async getJob(jobId: string): Promise<unknown | null> {
    const fn = this.requireModelInterface("getJob");
    return fn({ userId: this.userId, jobId });
  }

  async get_job(jobId: string): Promise<unknown | null> {
    return this.getJob(jobId);
  }

  async createAsset(args: {
    name: string;
    contentType: string;
    content?: Uint8Array | null;
    parentId?: string | null;
    instructions?: Uint8Array | null;
    nodeId?: string | null;
  }): Promise<unknown> {
    const fn = this.requireModelInterface("createAsset");
    const content = args.content ?? args.instructions;
    if (!content) {
      throw new Error("Asset content is required");
    }
    return fn({
      userId: this.userId,
      workflowId: this.workflowId,
      jobId: this.jobId,
      name: args.name,
      contentType: args.contentType,
      content,
      parentId: args.parentId ?? null,
      nodeId: args.nodeId ?? null
    });
  }

  async create_asset(args: {
    name: string;
    contentType: string;
    content?: Uint8Array | null;
    parentId?: string | null;
    instructions?: Uint8Array | null;
    nodeId?: string | null;
  }): Promise<unknown> {
    return this.createAsset(args);
  }

  private resolveSandboxFilePath(path: string): string {
    if (this.workspaceDir == null || this.workspaceDir === "") {
      throw new Error("workspaceDir is required for sandbox file operations");
    }
    const workspaceRoot = resolve(this.workspaceDir);
    const normalizedPath = path.replaceAll("\\", "/");
    if (
      (isAbsolute(normalizedPath) || /^[A-Za-z]:\//.test(normalizedPath)) &&
      isWithinRoot(workspaceRoot, resolve(normalizedPath))
    ) {
      return resolve(normalizedPath);
    }
    return resolveWorkspacePath(this.workspaceDir, path);
  }

  private static guessMimeFromPath(path: string): string {
    const ext = extname(path).toLowerCase();
    const byExt: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml",
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
      ".ogg": "audio/ogg",
      ".flac": "audio/flac",
      ".m4a": "audio/mp4",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".pdf": "application/pdf",
      ".csv": "text/csv"
    };
    return byExt[ext] ?? "application/octet-stream";
  }

  private static assetTypeForMime(mime: string): AssetRef["type"] {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("text/")) return "text";
    if (mime === "application/pdf") return "document";
    return "asset";
  }

  private parseAssetIdCandidates(assetId: string): string[] {
    const trimmed = assetId.trim();
    if (!trimmed) {
      return [];
    }
    const raw =
      trimmed.startsWith("asset://") ? trimmed.slice("asset://".length) : trimmed;
    const primary = raw.split(/[/?#]/)[0];
    if (!primary) {
      return [];
    }
    const withoutExt = primary.replace(/\.[^.]+$/, "");
    return Array.from(new Set([primary, withoutExt].filter(Boolean)));
  }

  async assetToSandbox(assetId: string, path: string): Promise<string> {
    const outputPath = this.resolveSandboxFilePath(path);
    const uriCandidates = new Set<string>();
    const idCandidates = this.parseAssetIdCandidates(assetId);
    const trimmed = assetId.trim();
    const resolutionAttempts: string[] = [];

    if (trimmed.includes("://") && !trimmed.startsWith("asset://")) {
      uriCandidates.add(trimmed);
    }
    for (const candidate of idCandidates) {
      for (const prefix of ["memory://", "file://", "s3://"]) {
        uriCandidates.add(`${prefix}${candidate}`);
        uriCandidates.add(`${prefix}assets/${candidate}`);
      }
    }

    let bytes: Uint8Array | null = null;
    if (this.storage) {
      for (const uri of uriCandidates) {
        try {
          const retrieved = await this.storage.retrieve(uri);
          if (retrieved) {
            bytes = retrieved;
            break;
          }
          resolutionAttempts.push(`storage miss: ${uri}`);
        } catch (error) {
          resolutionAttempts.push(
            `storage error: ${uri} (${error instanceof Error ? error.message : String(error)})`
          );
        }
      }
    }

    if (!bytes) {
      let baseUrl = (
        this.environment.NODETOOL_API_URL ??
        process.env.NODETOOL_API_URL ??
        "http://localhost:7777"
      );
      while (baseUrl.endsWith("/")) {
        baseUrl = baseUrl.slice(0, -1);
      }
      for (const candidate of idCandidates) {
        try {
          const metaResponse = await this.httpGet(
            `${baseUrl}/api/assets/${encodeURIComponent(candidate)}`
          );
          const metadata = (await metaResponse.json()) as Record<string, unknown>;
          const getUrl = metadata.get_url;
          const uri = metadata.uri;
          if (typeof getUrl === "string" && getUrl) {
            const downloadUrl = getUrl.startsWith("/")
              ? `${baseUrl}${getUrl}`
              : getUrl;
            bytes = await this.downloadFile(downloadUrl, {
              retry: { maxRetries: 1, backoffMs: 200 }
            });
            resolutionAttempts.push(`downloaded: ${downloadUrl}`);
            break;
          }
          if (typeof uri === "string" && this.storage) {
            const retrieved = await this.storage.retrieve(uri);
            if (retrieved) {
              bytes = retrieved;
              resolutionAttempts.push(`storage hit via metadata: ${uri}`);
              break;
            }
            resolutionAttempts.push(`storage miss via metadata: ${uri}`);
          }
        } catch (error) {
          resolutionAttempts.push(
            `api lookup error for ${candidate}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    if (!bytes) {
      const details =
        resolutionAttempts.length > 0
          ? ` Attempts: ${resolutionAttempts.join("; ")}`
          : "";
      throw new Error(
        `Unable to resolve asset '${assetId}' to sandbox bytes.${details}`
      );
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
    return outputPath;
  }

  async asset_to_sandbox(asset_id: string, path: string): Promise<string> {
    return this.assetToSandbox(asset_id, path);
  }

  async sandboxToAsset(path: string): Promise<AssetRef> {
    const filePath = this.resolveSandboxFilePath(path);
    const bytes = await readFile(filePath);
    const contentType = ProcessingContext.guessMimeFromPath(filePath);
    const created = (await this.createAsset({
      name: basename(filePath),
      contentType,
      content: bytes
    })) as Record<string, unknown>;

    const type = ProcessingContext.assetTypeForMime(contentType);
    const assetId = typeof created.id === "string" ? created.id : null;
    const uri =
      assetId !== null
        ? `asset://${assetId}`
        : typeof created.uri === "string"
          ? created.uri
          : pathToFileURL(filePath).toString();

    return {
      type,
      uri,
      asset_id: assetId
    };
  }

  async sandbox_to_asset(path: string): Promise<AssetRef> {
    return this.sandboxToAsset(path);
  }

  async createMessage(req: MessageCreateRequestLike): Promise<unknown> {
    if (!req.thread_id) {
      throw new Error("Thread ID is required");
    }
    const fn = this.requireModelInterface("createMessage");
    return fn({ userId: this.userId, req });
  }

  async create_message(req: MessageCreateRequestLike): Promise<unknown> {
    return this.createMessage(req);
  }

  async getThreadMessages(
    threadId: string,
    limit = 10,
    startKey: string | null = null,
    reverse = false
  ): Promise<ThreadMessagesResultLike> {
    const fn = this.requireModelInterface("getMessages");
    return fn({
      userId: this.userId,
      threadId,
      limit,
      startKey,
      reverse
    });
  }

  async get_messages(
    thread_id: string,
    limit = 10,
    start_key: string | null = null,
    reverse = false
  ): Promise<ThreadMessagesResultLike> {
    return this.getThreadMessages(thread_id, limit, start_key, reverse);
  }

  async assetsToDataUri(value: unknown): Promise<unknown> {
    return this.normalizeOutputValue(value, "data_uri");
  }

  async assetsToStorageUrl(value: unknown): Promise<unknown> {
    return this.normalizeOutputValue(value, "storage_url");
  }

  async assetsToWorkspaceFiles(value: unknown): Promise<unknown> {
    return this.normalizeOutputValue(value, "workspace");
  }

  async uploadAssetsToTemp(value: unknown): Promise<unknown> {
    return this.normalizeOutputValue(value, "temp_url");
  }

  // -----------------------------------------------------------------------
  // Provider prediction pipeline
  // -----------------------------------------------------------------------

  private emitPrediction(
    status: PredictionStatus,
    req: ProviderPredictionRequest,
    id: string,
    data?: unknown,
    error?: string,
    startedAt?: number
  ): void {
    this.emit({
      type: "prediction",
      id,
      user_id: this.userId,
      node_id: req.nodeId ?? "",
      workflow_id: req.workflowId ?? this.workflowId ?? null,
      provider: req.provider,
      model: req.model,
      status,
      params: req.params ?? {},
      data: data ?? null,
      error: error ?? null,
      duration: startedAt ? Date.now() - startedAt : null
    });
  }

  /**
   * Resolve /api/storage/ URIs in message content to data URIs so providers
   * can fetch them without needing a base URL.
   */
  private async resolveMessageMediaUris(
    messages: Message[]
  ): Promise<Message[]> {
    if (!this.storage) return messages;
    const resolved: Message[] = [];
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) {
        resolved.push(msg);
        continue;
      }
      const parts: MessageContent[] = [];
      for (const part of msg.content) {
        if (
          part.type === "image_url" &&
          part.image.uri &&
          !part.image.uri.startsWith("data:") &&
          !part.image.uri.startsWith("http")
        ) {
          const bytes = await this.storage.retrieve(part.image.uri);
          if (bytes) {
            const ext = part.image.uri.split(".").pop()?.toLowerCase() ?? "png";
            const mime: Record<string, string> = {
              png: "image/png",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              gif: "image/gif",
              webp: "image/webp"
            };
            const mimeType = mime[ext] ?? part.image.mimeType ?? "image/png";
            const b64 = Buffer.from(bytes).toString("base64");
            parts.push({
              type: "image_url",
              image: { uri: `data:${mimeType};base64,${b64}`, mimeType }
            });
            continue;
          }
        }
        if (
          part.type === "audio" &&
          part.audio.uri &&
          !part.audio.uri.startsWith("data:") &&
          !part.audio.uri.startsWith("http")
        ) {
          const bytes = await this.storage.retrieve(part.audio.uri);
          if (bytes) {
            const ext = part.audio.uri.split(".").pop()?.toLowerCase() ?? "mp3";
            const mime: Record<string, string> = {
              mp3: "audio/mpeg",
              wav: "audio/wav",
              ogg: "audio/ogg",
              m4a: "audio/mp4",
              flac: "audio/flac"
            };
            const mimeType = mime[ext] ?? part.audio.mimeType ?? "audio/mpeg";
            const b64 = Buffer.from(bytes).toString("base64");
            parts.push({
              type: "audio",
              audio: { uri: `data:${mimeType};base64,${b64}`, mimeType }
            });
            continue;
          }
        }
        parts.push(part);
      }
      resolved.push({ ...msg, content: parts });
    }
    return resolved;
  }

  private async dispatchCapability(
    provider: BaseProvider,
    req: ProviderPredictionRequest
  ): Promise<unknown> {
    const params = req.params ?? {};
    switch (req.capability) {
      case "generate_message":
        return provider.generateMessageTraced({
          messages: await this.resolveMessageMediaUris(
            (params.messages as Message[]) ?? []
          ),
          model: req.model,
          tools: params.tools as Parameters<
            BaseProvider["generateMessage"]
          >[0]["tools"],
          toolChoice: params.tool_choice as string | undefined,
          maxTokens: params.max_tokens as number | undefined,
          temperature: params.temperature as number | undefined,
          topP: params.top_p as number | undefined,
          presencePenalty: params.presence_penalty as number | undefined,
          frequencyPenalty: params.frequency_penalty as number | undefined
        });
      case "text_to_image":
        return provider.textToImage({
          prompt: String(params.prompt ?? ""),
          model: { id: req.model, name: req.model, provider: req.provider },
          width: params.width as number | undefined,
          height: params.height as number | undefined,
          aspectRatio: params.aspect_ratio as string | undefined,
          resolution: params.resolution as string | undefined,
          negativePrompt: params.negative_prompt as string | undefined,
          quality: params.quality as string | undefined
        });
      case "image_to_image":
        return provider.imageToImage(params.image as Uint8Array, {
          prompt: String(params.prompt ?? ""),
          model: { id: req.model, name: req.model, provider: req.provider },
          negativePrompt: params.negative_prompt as string | undefined,
          targetWidth: params.target_width as number | undefined,
          targetHeight: params.target_height as number | undefined,
          aspectRatio: params.aspect_ratio as string | undefined,
          resolution: params.resolution as string | undefined,
          strength: params.strength as number | undefined,
          quality: params.quality as string | undefined
        });
      case "text_to_video":
        return provider.textToVideo({
          prompt: String(params.prompt ?? ""),
          model: { id: req.model, name: req.model, provider: req.provider },
          negativePrompt: params.negative_prompt as string | undefined,
          numFrames: params.num_frames as number | undefined,
          durationSeconds: params.duration_seconds as number | undefined,
          aspectRatio: params.aspect_ratio as string | undefined,
          resolution: params.resolution as string | undefined
        });
      case "image_to_video":
        return provider.imageToVideo(params.image as Uint8Array, {
          prompt: params.prompt as string | undefined,
          model: { id: req.model, name: req.model, provider: req.provider },
          negativePrompt: params.negative_prompt as string | undefined,
          numFrames: params.num_frames as number | undefined,
          durationSeconds: params.duration_seconds as number | undefined,
          aspectRatio: params.aspect_ratio as string | undefined,
          resolution: params.resolution as string | undefined
        });
      case "automatic_speech_recognition":
        return provider.automaticSpeechRecognition({
          audio: params.audio as Uint8Array,
          model: req.model,
          language: params.language as string | undefined,
          prompt: params.prompt as string | undefined,
          temperature: params.temperature as number | undefined
        });
      case "generate_embedding":
        return provider.generateEmbedding({
          text: (params.text as string | string[]) ?? "",
          model: req.model,
          dimensions: params.dimensions as number | undefined
        });
      default:
        throw new Error(
          `Capability '${req.capability}' requires streaming API`
        );
    }
  }

  async runProviderPrediction(
    req: ProviderPredictionRequest
  ): Promise<unknown> {
    const id = randomUUID();
    const startedAt = Date.now();
    this.emitPrediction("running", req, id, null, undefined, startedAt);
    try {
      const provider = await this.getProvider(req.provider);
      const output = await this.dispatchCapability(provider, req);
      this.emitPrediction("completed", req, id, output, undefined, startedAt);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitPrediction("failed", req, id, null, message, startedAt);
      throw error;
    }
  }

  async *streamProviderPrediction(
    req: ProviderPredictionRequest
  ): AsyncGenerator<ProviderStreamItem | unknown> {
    const id = randomUUID();
    const startedAt = Date.now();
    this.emitPrediction("running", req, id, null, undefined, startedAt);
    try {
      const provider = await this.getProvider(req.provider);
      const params = req.params ?? {};

      if (req.capability === "generate_messages") {
        for await (const item of provider.generateMessagesTraced({
          messages: await this.resolveMessageMediaUris(
            (params.messages as Message[]) ?? []
          ),
          model: req.model,
          tools: params.tools as Parameters<
            BaseProvider["generateMessages"]
          >[0]["tools"],
          maxTokens: params.max_tokens as number | undefined,
          temperature: params.temperature as number | undefined,
          topP: params.top_p as number | undefined,
          presencePenalty: params.presence_penalty as number | undefined,
          frequencyPenalty: params.frequency_penalty as number | undefined,
          audio: params.audio as Record<string, unknown> | undefined,
          threadId: params.thread_id as string | undefined
        })) {
          yield item;
        }
      } else if (req.capability === "text_to_speech") {
        for await (const item of provider.textToSpeech({
          text: String(params.text ?? ""),
          model: req.model,
          voice: params.voice as string | undefined,
          speed: params.speed as number | undefined
        })) {
          yield item;
        }
      } else {
        throw new Error(`Capability '${req.capability}' is not streamable`);
      }

      this.emitPrediction("completed", req, id, null, undefined, startedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitPrediction("failed", req, id, null, message, startedAt);
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Output normalization
  // -----------------------------------------------------------------------

  /**
   * Sanitize memory URIs from output values before sending to client.
   * Replaces internal memory:// URIs with safe placeholders.
   *
   * Port of sanitize_memory_uris_for_client() from types.py.
   */
  static sanitizeForClient(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    const binary = ProcessingContext.toClientBytes(value);
    if (binary) return binary;
    if (Array.isArray(value)) {
      return value.map((v) => ProcessingContext.sanitizeForClient(v));
    }
    if (typeof value !== "object") return value;

    const obj = value as Record<string, unknown>;
    const uri = obj.uri;
    const isAssetLike = "type" in obj && typeof uri === "string";

    if (isAssetLike && uri.startsWith("memory://")) {
      const sanitized: Record<string, unknown> = { ...obj };
      if (sanitized.data !== undefined && sanitized.data !== null) {
        sanitized.uri = "";
      } else if (sanitized.asset_id) {
        sanitized.uri = `asset://${String(sanitized.asset_id)}`;
      } else {
        sanitized.uri = "";
      }

      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(sanitized)) {
        if (k === "uri" || k === "data" || k === "asset_id") {
          result[k] = v;
        } else {
          result[k] = ProcessingContext.sanitizeForClient(v);
        }
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = ProcessingContext.sanitizeForClient(v);
    }
    return result;
  }

  private static toClientBytes(
    value: unknown
  ): Record<string, unknown> | null {
    if (value instanceof Uint8Array) {
      return { type: "bytes", length: value.length };
    }
    if (value instanceof ArrayBuffer) {
      return { type: "bytes", length: value.byteLength };
    }
    return null;
  }

  /**
   * Resolve a file path against the configured workspace root.
   */
  resolveWorkspacePath(path: string): string {
    return resolveWorkspacePath(this.workspaceDir, path);
  }

  private static isAssetLike(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const v = value as Record<string, unknown>;
    return "type" in v && ("uri" in v || "data" in v || "asset_id" in v);
  }

  private static guessAssetMime(asset: Record<string, unknown>): string {
    const explicit = asset.mime_type ?? asset.content_type;
    if (typeof explicit === "string" && explicit) return explicit;

    const type = String(asset.type ?? "").toLowerCase();
    if (type.includes("image")) return "image/png";
    if (type.includes("audio")) return "audio/wav";
    if (type.includes("video")) return "video/mp4";
    if (type.includes("text")) return "text/plain";
    if (type.includes("model3d")) return "model/gltf-binary";
    return "application/octet-stream";
  }

  private static extForMime(mime: string): string {
    const map: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "audio/wav": "wav",
      "audio/mpeg": "mp3",
      "video/mp4": "mp4",
      "text/plain": "txt",
      "application/json": "json",
      "model/gltf-binary": "glb"
    };
    return map[mime] ?? "bin";
  }

  private static decodeAssetData(data: unknown): Uint8Array | null {
    if (data === null || data === undefined) return null;
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data) && data.every((v) => Number.isInteger(v))) {
      return new Uint8Array(data as number[]);
    }
    if (typeof data === "string") {
      return Uint8Array.from(Buffer.from(data, "base64"));
    }
    return null;
  }

  private async getAssetBytes(
    asset: Record<string, unknown>
  ): Promise<Uint8Array | null> {
    const decoded = ProcessingContext.decodeAssetData(asset.data);
    if (decoded) return decoded;

    const uri = asset.uri;
    if (typeof uri !== "string" || !this.storage) return null;
    return this.storage.retrieve(uri);
  }

  private async materializeAsset(
    asset: Record<string, unknown>,
    mode: AssetOutputMode
  ): Promise<Record<string, unknown>> {
    if (mode === "python" || mode === "raw") {
      return asset;
    }

    const bytes = await this.getAssetBytes(asset);
    if (!bytes) return asset;

    const mime = ProcessingContext.guessAssetMime(asset);

    if (mode === "data_uri") {
      const encoded = Buffer.from(bytes).toString("base64");
      return {
        ...asset,
        uri: `data:${mime};base64,${encoded}`
      };
    }

    if (mode === "storage_url") {
      if (!this.storage) return asset;
      const key = `assets/${randomUUID()}.${ProcessingContext.extForMime(mime)}`;
      const uri = await this.storage.store(key, bytes, mime);
      return {
        ...asset,
        uri,
        data: undefined
      };
    }

    if (mode === "temp_url") {
      if (!this.storage) return asset;
      const key = `temp/${randomUUID()}.${ProcessingContext.extForMime(mime)}`;
      const storedUri = await this.storage.store(key, bytes, mime);
      const resolvedUri = this._tempUrlResolver
        ? await this._tempUrlResolver(storedUri)
        : storedUri;
      return {
        ...asset,
        uri: resolvedUri,
        data: undefined
      };
    }

    if (mode === "workspace") {
      if (!this.workspaceDir) {
        throw new Error("workspace_dir is required for workspace asset output");
      }
      const workspaceAssets = new FileStorageAdapter(
        resolveWorkspacePath(this.workspaceDir, "assets")
      );
      const key = `${randomUUID()}.${ProcessingContext.extForMime(mime)}`;
      const uri = await workspaceAssets.store(key, bytes, mime);
      return {
        ...asset,
        uri,
        data: undefined
      };
    }

    return asset;
  }

  /**
   * Recursively normalize workflow outputs, materializing asset-like values
   * according to the selected output mode.
   */
  async normalizeOutputValue(
    value: unknown,
    mode: AssetOutputMode = this.assetOutputMode
  ): Promise<unknown> {
    if (value === null || value === undefined) return value;
    const binary = ProcessingContext.toClientBytes(value);
    if (binary) return binary;

    if (Array.isArray(value)) {
      return Promise.all(
        value.map((item) => this.normalizeOutputValue(item, mode))
      );
    }

    if (ProcessingContext.isAssetLike(value)) {
      return this.materializeAsset(value, mode);
    }

    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      const normalized = await Promise.all(
        entries.map(
          async ([k, v]) =>
            [k, await this.normalizeOutputValue(v, mode)] as const
        )
      );
      return Object.fromEntries(normalized);
    }

    return value;
  }
}
