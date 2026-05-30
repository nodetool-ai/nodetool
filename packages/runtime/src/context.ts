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

import type { AssetRef, ProcessingMessage, ProviderCost } from "@nodetool-ai/protocol";
import { AgentMemory } from "./agent-memory.js";
import { encodeRawImageRef } from "./image-codec.js";
import { inlineTextAssetRefs } from "./prompt-asset-refs.js";
import { importNodeBuiltin } from "@nodetool-ai/config";

// `node:fs/promises`, `node:path`, `node:url`, `node:crypto` are loaded
// lazily so this module loads in browser / Edge runtimes. The
// `FileStorageAdapter`, `resolveWorkspacePath`, and `randomUUID`
// fallback all degrade gracefully when these are unavailable.
const nodeCrypto = await importNodeBuiltin<typeof import("node:crypto")>(
  "node:crypto"
);
const nodeFsP = await importNodeBuiltin<typeof import("node:fs/promises")>(
  "node:fs/promises"
);
const nodePath = await importNodeBuiltin<typeof import("node:path")>(
  "node:path"
);
const nodeUrl = await importNodeBuiltin<typeof import("node:url")>("node:url");

const randomUUID = nodeCrypto?.randomUUID
  ? nodeCrypto.randomUUID
  : (): string => {
      const g = globalThis as { crypto?: { randomUUID?: () => string } };
      if (g.crypto?.randomUUID) return g.crypto.randomUUID();
      return `id_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    };

// Eager local bindings; unavailable off-Node, throw at call time.
function notOnNode(api: string): never {
  throw new Error(
    `${api} is unavailable in this runtime — configure a StorageAdapter instead`
  );
}
const access = (...a: Parameters<typeof import("node:fs/promises").access>) =>
  nodeFsP ? nodeFsP.access(...a) : notOnNode("node:fs/promises.access");
const mkdir = (...a: Parameters<typeof import("node:fs/promises").mkdir>) =>
  nodeFsP ? nodeFsP.mkdir(...a) : notOnNode("node:fs/promises.mkdir");
const readFile = (
  ...a: Parameters<typeof import("node:fs/promises").readFile>
) => (nodeFsP ? nodeFsP.readFile(...a) : notOnNode("node:fs/promises.readFile"));
const writeFile = (
  ...a: Parameters<typeof import("node:fs/promises").writeFile>
) =>
  nodeFsP ? nodeFsP.writeFile(...a) : notOnNode("node:fs/promises.writeFile");

const basename = (p: string, ext?: string): string =>
  nodePath ? nodePath.basename(p, ext) : notOnNode("node:path.basename");
const dirname = (p: string): string =>
  nodePath ? nodePath.dirname(p) : notOnNode("node:path.dirname");
const extname = (p: string): string =>
  nodePath ? nodePath.extname(p) : notOnNode("node:path.extname");
const isAbsolute = (p: string): boolean =>
  nodePath ? nodePath.isAbsolute(p) : notOnNode("node:path.isAbsolute");
const join = (...parts: string[]): string =>
  nodePath ? nodePath.join(...parts) : notOnNode("node:path.join");
const normalize = (p: string): string =>
  nodePath ? nodePath.normalize(p) : notOnNode("node:path.normalize");
const relative = (from: string, to: string): string =>
  nodePath ? nodePath.relative(from, to) : notOnNode("node:path.relative");
const resolve = (...parts: string[]): string =>
  nodePath ? nodePath.resolve(...parts) : notOnNode("node:path.resolve");
const sep = nodePath?.sep ?? "/";

const fileURLToPath = (u: string | URL): string =>
  nodeUrl ? nodeUrl.fileURLToPath(u) : notOnNode("node:url.fileURLToPath");
const pathToFileURL = (p: string): URL =>
  nodeUrl ? nodeUrl.pathToFileURL(p) : notOnNode("node:url.pathToFileURL");
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

  /** Return the URI that store() would produce for this key, without I/O. */
  uriForKey(key: string): string;

  /**
   * List entries under a key prefix. With `delimiter: "/"` the listing is
   * hierarchical (FS-readdir style); without it the listing is flat.
   */
  list(
    prefix: string,
    opts?: { delimiter?: string }
  ): Promise<StorageListResult>;

  /** Delete an entry. Returns true if an entry was deleted. */
  delete(uri: string): Promise<boolean>;

  /** Stat an entry. Returns null if it doesn't exist. */
  stat(uri: string): Promise<StorageStat | null>;
}

export interface StorageEntry {
  key: string;
  uri: string;
  size: number;
  modifiedAt: number;
  contentType?: string;
}

export interface StorageListResult {
  entries: StorageEntry[];
  commonPrefixes: string[];
}

export interface StorageStat {
  key: string;
  size: number;
  modifiedAt: number;
  contentType?: string;
}

/**
 * Controls how asset-like values (ImageRef / AudioRef / VideoRef) are
 * materialized when {@link ProcessingContext.normalizeOutputValue} runs.
 *
 * Pick the mode by where the consumer lives:
 * - `native`: in-process JS/TS code that knows how to handle the live
 *   object as-is (DSL, tests, kernel-internal handoffs). Inline `data`
 *   bytes stay attached.
 * - `data_uri`: anything that renders a `data:image/png;base64,...` URI
 *   inline (markdown, simple HTML).
 * - `temp_url`: HTTP-fetching client over a short-lived URL — bytes are
 *   uploaded to the temp storage adapter and `data` is dropped.
 * - `storage_url`: same as `temp_url` but persistent storage.
 * - `workspace`: write the bytes to a file inside `workspaceDir` and
 *   return that file URI.
 * - `raw`: keep bytes embedded in the asset's `data` field.
 *
 * NOTE: this used to be called `"python"` (mirroring the Python enum,
 * where it accurately meant "Python-native object"). The rename to
 * `"native"` makes the contract language-agnostic and matches what the
 * mode actually does in the TS runtime.
 */
export type AssetOutputMode =
  | "native"
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
  | "upscale_image"
  | "remove_background"
  | "relight_image"
  | "vectorize_image"
  | "text_to_video"
  | "image_to_video"
  | "video_to_video"
  | "lip_sync"
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

/** A non-folder asset surfaced when listing a folder's contents. */
export interface FolderAssetEntry {
  id: string;
  content_type: string;
  name: string;
}

export interface ProcessingContextModelInterfaces {
  getJob?: (args: { userId: string; jobId: string }) => Promise<unknown | null>;
  createAsset?: (args: AssetCreateParamsLike) => Promise<unknown>;
  /**
   * Recursively list the non-folder assets contained in `folderId`. Returns
   * `null` when the id is not a folder (or does not exist) so callers can tell
   * "not a folder" apart from "empty folder" (`[]`).
   */
  listFolderAssets?: (args: {
    userId: string;
    folderId: string;
  }) => Promise<FolderAssetEntry[] | null>;
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
  private _store = new Map<string, { data: Uint8Array; contentType?: string; modifiedAt: number }>();

  async store(
    key: string,
    data: Uint8Array,
    contentType?: string
  ): Promise<string> {
    const normalized = normalizeStorageKey(key);
    this._store.set(normalized, {
      data: new Uint8Array(data),
      contentType,
      modifiedAt: Date.now()
    });
    return `memory://${normalized}`;
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    if (!uri.startsWith("memory://")) return null;
    const key = uri.slice("memory://".length);
    const value = this._store.get(key);
    return value ? new Uint8Array(value.data) : null;
  }

  async exists(uri: string): Promise<boolean> {
    if (!uri.startsWith("memory://")) return false;
    const key = uri.slice("memory://".length);
    return this._store.has(key);
  }

  uriForKey(key: string): string {
    return `memory://${normalizeStorageKey(key)}`;
  }

  async list(
    prefix: string,
    opts: { delimiter?: string } = {}
  ): Promise<StorageListResult> {
    const delimiter = opts.delimiter ?? null;
    let normalizedPrefix = "";
    if (prefix && prefix !== "" && prefix !== "/") {
      try {
        normalizedPrefix = normalizeStorageKey(prefix);
      } catch {
        return { entries: [], commonPrefixes: [] };
      }
    }
    const matchPrefix = normalizedPrefix ? `${normalizedPrefix}/` : "";
    const entries: StorageEntry[] = [];
    const commonPrefixes = new Set<string>();
    for (const [key, entry] of this._store.entries()) {
      if (matchPrefix && !key.startsWith(matchPrefix) && key !== normalizedPrefix) continue;
      if (matchPrefix === "" || key.startsWith(matchPrefix)) {
        const rest = matchPrefix ? key.slice(matchPrefix.length) : key;
        if (delimiter === "/") {
          const idx = rest.indexOf("/");
          if (idx >= 0) {
            commonPrefixes.add(`${matchPrefix}${rest.slice(0, idx + 1)}`);
            continue;
          }
        }
        entries.push({
          key,
          uri: `memory://${key}`,
          size: entry.data.byteLength,
          modifiedAt: entry.modifiedAt,
          ...(entry.contentType ? { contentType: entry.contentType } : {})
        });
      }
    }
    return {
      entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
      commonPrefixes: [...commonPrefixes].sort()
    };
  }

  async delete(uri: string): Promise<boolean> {
    if (!uri.startsWith("memory://")) return false;
    return this._store.delete(uri.slice("memory://".length));
  }

  async stat(uri: string): Promise<StorageStat | null> {
    if (!uri.startsWith("memory://")) return null;
    const key = uri.slice("memory://".length);
    const entry = this._store.get(key);
    if (!entry) return null;
    return {
      key,
      size: entry.data.byteLength,
      modifiedAt: entry.modifiedAt,
      ...(entry.contentType ? { contentType: entry.contentType } : {})
    };
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
      return (await readFile(absolutePath)) as Uint8Array;
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

  uriForKey(key: string): string {
    return pathToFileURL(this.resolvePathFromKey(key)).toString();
  }

  /**
   * Minimal listing for the runtime's own FileStorageAdapter — used by tests
   * and DSL contexts. The websocket server wires the storage package's
   * fully-featured FileStorageAdapter (with delimiter / fs-safe), which is
   * the production path.
   */
  async list(
    prefix: string,
    opts: { delimiter?: string } = {}
  ): Promise<StorageListResult> {
    if (!nodeFsP) throw new Error("LocalStorage.list requires Node");
    const { readdir: rd, stat: st } = nodeFsP;
    const delimiter = opts.delimiter ?? null;
    const baseAbs = (() => {
      try {
        return this.resolvePathFromKey(prefix || ".");
      } catch {
        return null;
      }
    })();
    if (!baseAbs) return { entries: [], commonPrefixes: [] };

    const entries: StorageEntry[] = [];
    const commonPrefixes = new Set<string>();

    if (delimiter === "/") {
      let children: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
      try {
        children = (await rd(baseAbs, { withFileTypes: true })) as unknown as typeof children;
      } catch {
        return { entries: [], commonPrefixes: [] };
      }
      const normalizedPrefix = prefix ? normalizeStorageKey(prefix) : "";
      for (const child of children) {
        const childKey = normalizedPrefix
          ? `${normalizedPrefix}/${child.name}`
          : child.name;
        if (child.isDirectory()) {
          commonPrefixes.add(`${childKey}/`);
          continue;
        }
        if (!child.isFile()) continue;
        try {
          const childAbs = join(baseAbs, child.name);
          const s = await st(childAbs);
          entries.push({
            key: childKey,
            uri: pathToFileURL(childAbs).toString(),
            size: s.size,
            modifiedAt: s.mtimeMs
          });
        } catch {
          // skip
        }
      }
      return {
        entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
        commonPrefixes: [...commonPrefixes].sort()
      };
    }
    return { entries: [], commonPrefixes: [] };
  }

  async delete(uri: string): Promise<boolean> {
    const absolutePath = this.resolvePathFromUri(uri);
    if (!absolutePath) return false;
    if (!nodeFsP) return false;
    const { unlink } = nodeFsP;
    try {
      await unlink(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async stat(uri: string): Promise<StorageStat | null> {
    const absolutePath = this.resolvePathFromUri(uri);
    if (!absolutePath) return null;
    if (!nodeFsP) return null;
    const { stat: st } = nodeFsP;
    try {
      const s = await st(absolutePath);
      if (!s.isFile()) return null;
      const rel = absolutePath
        .slice(this.rootDir.length)
        .replace(/^[\\/]+/, "");
      return { key: rel, size: s.size, modifiedAt: s.mtimeMs };
    } catch {
      return null;
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

  uriForKey(key: string): string {
    return `s3://${this.bucket}/${this.keyForStore(key)}`;
  }

  /**
   * The runtime's minimal S3Client interface doesn't expose ListObjectsV2 /
   * DeleteObject / HeadObject-with-metadata, so list/delete/stat are stubs
   * here. Production paths use `@nodetool-ai/storage`'s S3StorageAdapter
   * which calls the full SDK.
   */
  async list(
    _prefix: string,
    _opts?: { delimiter?: string }
  ): Promise<StorageListResult> {
    return { entries: [], commonPrefixes: [] };
  }

  async delete(_uri: string): Promise<boolean> {
    return false;
  }

  async stat(_uri: string): Promise<StorageStat | null> {
    return null;
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
  /** Chat thread id, when this context is serving a chat-driven agent run. */
  readonly threadId: string | null;
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

  /** Message listeners (for real-time streaming). */
  private _messageListeners = new Set<(msg: ProcessingMessage) => void>();

  /** Cache adapter. */
  readonly cache: CacheAdapter;

  /** Storage adapter (optional, for asset handling). */
  readonly storage: StorageAdapter | null;
  /**
   * Workspace storage adapter — the agent's working directory abstracted
   * behind {@link StorageAdapter}. Tools that read/write/list files use
   * this adapter so the same code paths work locally (FS-backed) and in
   * cloud deployments (S3/Supabase-backed).
   *
   * If null, file-tool operations should return a clear error rather than
   * fall back to direct FS access — there is no implicit workspace.
   */
  readonly workspaceStorage: StorageAdapter | null;
  /**
   * Unified, structured agent memory. The single source of truth for results
   * shared between agents, tasks, steps and tools. Keys use the namespaces
   * `step:`, `task:`, `input:`, `shared:` (see {@link memoryKeys}).
   */
  readonly memory: AgentMemory = new AgentMemory();
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
  /** Provider charge (USD) reported by the current node execution (e.g. FAL/KIE generation). */
  private _providerCost: ProviderCost | null = null;
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
        supportsDynamicInputs?: boolean;
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
    threadId?: string | null;
    userId?: string;
    workspaceDir?: string | null;
    assetOutputMode?: AssetOutputMode;
    cache?: CacheAdapter;
    storage?: StorageAdapter | null;
    workspaceStorage?: StorageAdapter | null;
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
    this.threadId = opts.threadId ?? null;
    this.userId = opts.userId ?? "default";
    this.workspaceDir = opts.workspaceDir ?? null;
    this.assetOutputMode = opts.assetOutputMode ?? "native";
    this.cache = opts.cache ?? new MemoryCache();
    this.storage = opts.storage ?? null;
    this.workspaceStorage = opts.workspaceStorage ?? null;
    if (opts.onMessage) {
      this._messageListeners.add(opts.onMessage);
    }
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
      threadId: this.threadId,
      userId: this.userId,
      workspaceDir: this.workspaceDir,
      assetOutputMode: this.assetOutputMode,
      cache: this.cache,
      storage: this.storage,
      workspaceStorage: this.workspaceStorage,
      variables: { ...this._variables },
      environment: { ...this.environment },
      fetchFn: this._fetch,
      secretResolver: this._secretResolver ?? undefined,
      tempUrlResolver: this._tempUrlResolver ?? undefined
    });
    for (const listener of this._messageListeners) {
      next.addMessageListener(listener);
    }
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
      supportsDynamicInputs?: boolean;
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
        supportsDynamicInputs?: boolean;
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

    let resolved: BaseProvider;
    if (this._providerResolver) {
      resolved = await this._providerResolver(providerId);
    } else {
      const { getProvider: buildProvider } = await import(
        "./providers/index.js"
      );
      resolved = await buildProvider(providerId, (key) => this.getSecret(key));
    }

    this._providers.set(providerId, resolved);
    resolved.setMessageEmitter((msg) =>
      this.postMessage(msg as ProcessingMessage)
    );
    return resolved;
  }

  async get_provider(providerId: string): Promise<BaseProvider> {
    return this.getProvider(providerId);
  }

  /**
   * Check whether a registered provider has all required credentials
   * resolvable through this context (DB/keychain/env).
   */
  async isProviderConfigured(providerId: string): Promise<boolean> {
    const { isProviderConfigured: check } = await import(
      "./providers/index.js"
    );
    return check(providerId, (key) => this.getSecret(key));
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

  /**
   * Resolve a raw storage URI (e.g. `file:///.../storage/<key>`) to a URL the
   * UI can fetch (e.g. `/api/storage/<key>`). Falls back to returning the URI
   * unchanged when no resolver is wired (DSL / tests).
   *
   * Use this from tools that write binary output via `context.storage.store()`
   * and want to surface a UI-renderable URL in their result.
   */
  async resolveTempUrl(uri: string): Promise<string> {
    if (!this._tempUrlResolver) return uri;
    return this._tempUrlResolver(uri);
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
    if (key.startsWith("memory://")) {
      this._memory.set(key, value);
    }
  }

  async storeStepResult(key: string, value: unknown): Promise<string> {
    this._variables[key] = value;
    return "";
  }

  async loadStepResult<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    if (Object.prototype.hasOwnProperty.call(this._variables, key)) {
      return this._variables[key] as T;
    }
    return defaultValue as T;
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

  addMessageListener(listener: (msg: ProcessingMessage) => void): () => void {
    this._messageListeners.add(listener);
    return () => {
      this._messageListeners.delete(listener);
    };
  }

  /**
   * Emit a processing message.
   * Appended to the internal queue and forwarded to listeners if set.
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
    for (const listener of this._messageListeners) {
      listener(msg);
    }
  }

  postMessage(msg: ProcessingMessage): void {
    this.emit(msg);
  }

  post_message(msg: ProcessingMessage): void {
    this.emit(msg);
  }

  /** Record actual provider charge for the current node run (attached to completed NodeUpdate). */
  setProviderCost(
    provider: string,
    amount: number,
    unit: string,
    details?: Pick<
      ProviderCost,
      "model" | "billing_unit" | "quantity" | "unit_price" | "currency"
    >
  ): void {
    this._providerCost = { provider, amount, unit, ...details };
  }

  getProviderCost(): ProviderCost | null {
    return this._providerCost;
  }

  clearProviderCost(): void {
    this._providerCost = null;
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

  /**
   * Recursively list the non-folder assets in `folderId`, or `null` when the id
   * is not a folder. Backed by the optional `listFolderAssets` model interface;
   * returns `null` when that interface is not configured.
   */
  async listFolderAssets(
    folderId: string
  ): Promise<FolderAssetEntry[] | null> {
    const fn = this._modelInterfaces?.listFolderAssets;
    if (!fn) {
      return null;
    }
    try {
      return await fn({ userId: this.userId, folderId });
    } catch {
      return null;
    }
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
    // Preserve sub-paths: `asset://user-1/image.png` -> primary `user-1/image.png`,
    // so storage keys with hierarchical layouts still resolve.
    const primary = raw.split(/[?#]/)[0];
    if (!primary) {
      return [];
    }
    const withoutExt = primary.replace(/\.[^.]+$/, "");
    return Array.from(new Set([primary, withoutExt].filter(Boolean)));
  }

  /**
   * Resolve an `asset://<id>[.ext]` reference (or bare id / storage URI) to its
   * raw bytes.
   *
   * Server-uploaded assets are stored under the key `<id>.<ext>` and served at
   * `/api/storage/<id>.<ext>`; runtime-materialized refs live under `assets/`.
   * Resolution order: the in-process storage adapter (file/s3/supabase/memory),
   * a prefix listing that tolerates extension mismatches, then an HTTP download
   * from the server's `/api/storage` route. Returns the bytes plus an `attempts`
   * trail for callers that build detailed errors; `null` bytes means unresolved.
   */
  async resolveAssetBytes(
    assetId: string
  ): Promise<{ bytes: Uint8Array | null; attempts: string[] }> {
    const idCandidates = this.parseAssetIdCandidates(assetId);
    const trimmed = assetId.trim();
    const attempts: string[] = [];

    const tryStorageUri = async (uri: string): Promise<Uint8Array | null> => {
      if (!this.storage) {
        return null;
      }
      try {
        const retrieved = await this.storage.retrieve(uri);
        if (retrieved) {
          return retrieved;
        }
        attempts.push(`storage miss: ${uri}`);
      } catch (error) {
        attempts.push(
          `storage error: ${uri} (${error instanceof Error ? error.message : String(error)})`
        );
      }
      return null;
    };

    // A concrete storage URI / http URL handed in directly.
    if (trimmed.includes("://") && !trimmed.startsWith("asset://")) {
      const direct = await tryStorageUri(trimmed);
      if (direct) {
        return { bytes: direct, attempts };
      }
      if (/^https?:\/\//.test(trimmed)) {
        try {
          const bytes = await this.downloadFile(trimmed, {
            retry: { maxRetries: 1, backoffMs: 200 }
          });
          attempts.push(`downloaded: ${trimmed}`);
          return { bytes, attempts };
        } catch (error) {
          attempts.push(
            `http error: ${trimmed} (${error instanceof Error ? error.message : String(error)})`
          );
        }
      }
    }

    if (this.storage) {
      // Keys assets are written under: `<id>.<ext>` (uploads, at root) and
      // `assets/<id>` (runtime-materialized refs).
      for (const candidate of idCandidates) {
        for (const key of [candidate, `assets/${candidate}`]) {
          const bytes = await tryStorageUri(this.storage.uriForKey(key));
          if (bytes) {
            return { bytes, attempts };
          }
        }
      }
      // Extension-tolerant fallback: locate the stored file whose name starts
      // with the id, since the URN extension may differ from the one on disk
      // (e.g. jpeg vs jpg). Only reached when the exact-key lookups all miss.
      //
      // Try a narrow prefix first (S3 treats `list(bareId)` as a raw-string
      // prefix match — bounded to a handful of entries) before falling back to
      // a root listing for adapters that treat the prefix as a folder path
      // (memory/supabase). Avoids `list("")` becoming a multi-thousand-object
      // scan on production S3 backends.
      const bareId = idCandidates[idCandidates.length - 1];
      if (bareId) {
        const tryListing = async (prefix: string): Promise<Uint8Array | null> => {
          try {
            const listing = await this.storage!.list(prefix);
            const match = listing.entries.find((entry) => {
              const base = entry.key.split("/").pop() ?? "";
              return base.startsWith(`${bareId}.`) && !base.includes("_thumb");
            });
            if (match) {
              return await tryStorageUri(match.uri);
            }
          } catch (error) {
            attempts.push(
              `storage list error (${error instanceof Error ? error.message : String(error)})`
            );
          }
          return null;
        };
        for (const prefix of [bareId, ""]) {
          const bytes = await tryListing(prefix);
          if (bytes) {
            return { bytes, attempts };
          }
        }
      }
    }

    // HTTP fallback: the server streams bytes at `/api/storage/<key>`.
    let baseUrl =
      this.environment.NODETOOL_API_URL ??
      process.env.NODETOOL_API_URL ??
      "http://localhost:7777";
    while (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1);
    }
    for (const candidate of idCandidates) {
      if (!candidate.includes(".")) {
        continue; // the storage route is keyed by filename (`<id>.<ext>`)
      }
      const url = `${baseUrl}/api/storage/${encodeURIComponent(candidate)}`;
      try {
        const bytes = await this.downloadFile(url, {
          retry: { maxRetries: 1, backoffMs: 200 }
        });
        attempts.push(`downloaded: ${url}`);
        return { bytes, attempts };
      } catch (error) {
        attempts.push(
          `http miss: ${url} (${error instanceof Error ? error.message : String(error)})`
        );
      }
    }

    // Last resort: ask the asset API for metadata and follow its `get_url`.
    // Handles bare ids (no extension, so the storage route can't be addressed
    // directly) and backends that expose a single-asset metadata endpoint.
    for (const candidate of idCandidates) {
      try {
        const metaResponse = await this.httpGet(
          `${baseUrl}/api/assets/${encodeURIComponent(candidate)}`
        );
        const metadata = (await metaResponse.json()) as Record<string, unknown>;
        const getUrl = metadata.get_url;
        if (typeof getUrl === "string" && getUrl) {
          const downloadUrl = getUrl.startsWith("/")
            ? `${baseUrl}${getUrl}`
            : getUrl;
          const bytes = await this.downloadFile(downloadUrl, {
            retry: { maxRetries: 1, backoffMs: 200 }
          });
          attempts.push(`downloaded: ${downloadUrl}`);
          return { bytes, attempts };
        }
        const uri = metadata.uri;
        if (typeof uri === "string") {
          const bytes = await tryStorageUri(uri);
          if (bytes) {
            return { bytes, attempts };
          }
        }
      } catch (error) {
        attempts.push(
          `api lookup error for ${candidate}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return { bytes: null, attempts };
  }

  async assetToSandbox(assetId: string, path: string): Promise<string> {
    const outputPath = this.resolveSandboxFilePath(path);
    const { bytes, attempts } = await this.resolveAssetBytes(assetId);

    if (!bytes) {
      const details =
        attempts.length > 0 ? ` Attempts: ${attempts.join("; ")}` : "";
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
    const bytes = (await readFile(filePath)) as Uint8Array;
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
   * Retrieve raw bytes for a media URI referenced in message content. Handles
   * the `asset://<id>` reference scheme (via {@link resolveAssetBytes}) as well
   * as opaque storage URIs (memory/file/s3) via the storage adapter.
   */
  private async retrieveMediaBytes(uri: string): Promise<Uint8Array | null> {
    if (uri.startsWith("asset://")) {
      const { bytes } = await this.resolveAssetBytes(uri);
      return bytes;
    }
    return this.storage ? await this.storage.retrieve(uri) : null;
  }

  /**
   * Resolve non-data, non-http media URIs in message content to data URIs so
   * providers can consume them directly. Covers `/api/storage/` and other
   * storage URIs as well as the `asset://<id>` reference scheme (assets
   * mentioned inline in a prompt).
   */
  async resolveMessageMediaUris(messages: Message[]): Promise<Message[]> {
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
          const bytes = await this.retrieveMediaBytes(part.image.uri);
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
          const bytes = await this.retrieveMediaBytes(part.audio.uri);
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
        if (part.type === "text" && part.text.includes("asset://")) {
          // Inline any plain-text document mention (asset://doc.md, .txt, .csv …)
          // as its decoded contents. Resolved here, at call time, so the stored
          // thread message keeps the compact asset:// URI like media does.
          const inlined = await inlineTextAssetRefs(part.text, this);
          parts.push(inlined === part.text ? part : { type: "text", text: inlined });
          continue;
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
      case "upscale_image":
        return provider.upscaleImage(params.image as Uint8Array, {
          model: { id: req.model, name: req.model, provider: req.provider },
          scale: params.scale as number | undefined,
          prompt: params.prompt as string | undefined,
          creativity: params.creativity as number | undefined,
          seed: params.seed as number | undefined
        });
      case "remove_background":
        return provider.removeBackground(params.image as Uint8Array, {
          model: { id: req.model, name: req.model, provider: req.provider }
        });
      case "relight_image":
        return provider.relightImage(params.image as Uint8Array, {
          model: { id: req.model, name: req.model, provider: req.provider },
          prompt: params.prompt as string | undefined,
          negativePrompt: params.negative_prompt as string | undefined,
          seed: params.seed as number | undefined
        });
      case "vectorize_image":
        return provider.vectorizeImage(params.image as Uint8Array, {
          model: { id: req.model, name: req.model, provider: req.provider }
        });
      case "video_to_video":
        return provider.videoToVideo(params.video as Uint8Array, {
          model: { id: req.model, name: req.model, provider: req.provider },
          prompt: params.prompt as string | undefined,
          negativePrompt: params.negative_prompt as string | undefined,
          strength: params.strength as number | undefined,
          durationSeconds: params.duration_seconds as number | undefined,
          resolution: params.resolution as string | undefined,
          seed: params.seed as number | undefined
        });
      case "lip_sync":
        return provider.lipSync(params.video as Uint8Array, {
          model: { id: req.model, name: req.model, provider: req.provider },
          audio: params.audio as Uint8Array,
          seed: params.seed as number | undefined
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
    rawAsset: Record<string, unknown>,
    mode: AssetOutputMode
  ): Promise<Record<string, unknown>> {
    if (mode === "native" || mode === "raw") {
      // In-process consumers handle the raw asset as-is (incl. raw RGBA).
      return rawAsset;
    }

    // Raw in-flight RGBA → encode to PNG up front so every downstream mode
    // treats it as an ordinary image (correct mime, extension, and bytes).
    const asset = (await encodeRawImageRef(rawAsset)) as Record<string, unknown>;

    const bytes = await this.getAssetBytes(asset);
    if (!bytes) return asset;

    const mime = ProcessingContext.guessAssetMime(asset);

    if (mode === "data_uri") {
      const base64 = Buffer.from(bytes).toString("base64");
      return {
        ...asset,
        uri: `data:${mime};base64,${base64}`
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
