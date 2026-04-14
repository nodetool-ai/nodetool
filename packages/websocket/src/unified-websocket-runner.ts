import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { getSecret } from "@nodetool/security";
import { getSetting } from "./settings-api.js";
import { pack, unpack } from "msgpackr";
import {
  createLogger,
  getDefaultAssetsPath,
  buildAssetUrl
} from "@nodetool/config";
import { resolveContentUrls } from "./resolve-media-urls.js";
import {
  Graph,
  WorkflowRunner,
  type NodeExecutor,
  type NodeTypeResolver
} from "@nodetool/kernel";
import {
  Asset,
  Job,
  Message,
  ModelChangeEvent,
  ModelObserver,
  Prediction,
  Thread,
  Workflow,
  type DBModel
} from "@nodetool/models";
import type {
  ProviderTool,
  Message as ProviderMessage,
  MessageContent,
  BaseProvider,
  ProcessingContext,
  ToolCall as ProviderToolCall,
  ImageModel as ProviderImageModel,
  VideoModel as ProviderVideoModel,
  TextToImageParams,
  TextToVideoParams
} from "@nodetool/runtime";
import {
  FileStorageAdapter,
  ProcessingContext as RuntimeProcessingContext,
  executeComfy,
  type ComfyProgressEvent,
  type ComfyExecutionHandle
} from "@nodetool/runtime";
import type { Chunk } from "@nodetool/protocol";
import type {
  UnifiedCommandType,
  WebSocketCommandEnvelope,
  WebSocketMode
} from "@nodetool/protocol";
import { Tool } from "@nodetool/agents";
import type { NodeMetadata } from "@nodetool/node-sdk";

const log = createLogger("nodetool.websocket.runner");
const DATA_URI_PATTERN = /data:([^;,]+)?;base64,[A-Za-z0-9+/=\r\n]+/gi;
const MAX_ERROR_TEXT_LENGTH = 4000;

function sanitizeLargeText(
  text: string,
  maxLength = MAX_ERROR_TEXT_LENGTH
): string {
  const sanitized = text.replace(DATA_URI_PATTERN, (match, mimeType) => {
    const mime =
      typeof mimeType === "string" && mimeType !== "" ? mimeType : "data";
    return `[${mime} base64 omitted, ${match.length} chars]`;
  });

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  const truncatedChars = sanitized.length - maxLength;
  return `${sanitized.slice(0, maxLength)}... (truncated ${truncatedChars} chars)`;
}

function sanitizeErrorValue(
  value: unknown,
  seen = new WeakSet<object>()
): unknown {
  if (typeof value === "string") {
    return sanitizeLargeText(value);
  }

  if (value instanceof Error) {
    return sanitizeLargeText(value.message);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeErrorValue(item, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      result[key] = sanitizeErrorValue(nested, seen);
    }
    return result;
  }

  return value;
}

function formatSanitizedError(error: unknown): string {
  if (typeof error === "string") {
    return sanitizeLargeText(error);
  }

  if (error instanceof Error) {
    return sanitizeLargeText(error.message);
  }

  const sanitized = sanitizeErrorValue(error);
  if (typeof sanitized === "string") {
    return sanitized;
  }

  try {
    return sanitizeLargeText(JSON.stringify(sanitized));
  } catch {
    return sanitizeLargeText(String(error));
  }
}

function getAssetStoragePath(): string {
  return getDefaultAssetsPath();
}

// ---------------------------------------------------------------------------
// Auto-save assets — persists generated media as Asset records
// ---------------------------------------------------------------------------

const ASSET_MEDIA_TYPES = new Set(["image", "audio", "video"]);

const ASSET_TYPE_MIME: Record<string, string> = {
  image: "image/png",
  audio: "audio/wav",
  video: "video/mp4"
};

const ASSET_TYPE_EXT: Record<string, string> = {
  image: "png",
  audio: "wav",
  video: "mp4"
};

function isAssetLikeValue(
  value: unknown
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    ASSET_MEDIA_TYPES.has(v.type as string) &&
    ("data" in v || "uri" in v)
  );
}

function decodeAssetBytes(data: unknown): Uint8Array | null {
  if (data === null || data === undefined) return null;
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (Array.isArray(data) && data.every((v) => Number.isInteger(v))) {
    return new Uint8Array(data as number[]);
  }
  if (typeof data === "string") {
    return Uint8Array.from(Buffer.from(data, "base64"));
  }
  return null;
}

async function readBytesFromUri(uri: string): Promise<Uint8Array | null> {
  if (!uri) return null;
  try {
    if (uri.startsWith("file://")) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      return new Uint8Array(await readFile(fileURLToPath(uri)));
    }
    if (uri.startsWith("data:")) {
      const commaIdx = uri.indexOf(",");
      if (commaIdx < 0) return null;
      return Uint8Array.from(Buffer.from(uri.slice(commaIdx + 1), "base64"));
    }
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      const resp = await fetch(uri);
      if (!resp.ok) return null;
      return new Uint8Array(await resp.arrayBuffer());
    }
  } catch {
    // Failed to read bytes — non-fatal
  }
  return null;
}

/**
 * Recursively find asset-like values in a result object and persist them as
 * Asset records in the database + on disk.
 *
 * Mutates the result in-place: sets `asset_id` and updates `uri` to
 * `asset://{id}.{ext}`.
 */
async function autoSaveAssets(
  result: Record<string, unknown>,
  opts: {
    userId: string;
    workflowId: string | null;
    jobId: string;
    nodeId: string;
    storagePath: string;
  }
): Promise<void> {
  const { join } = await import("node:path");
  const { writeFile, mkdir } = await import("node:fs/promises");

  const queue: Record<string, unknown>[] = [];

  // Collect all asset-like values from the result (may be nested)
  function collect(value: unknown): void {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (isAssetLikeValue(value)) {
      queue.push(value);
      return;
    }
    if (typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) {
        collect(v);
      }
    }
  }
  collect(result);

  for (const assetValue of queue) {
    // Skip if already saved
    if (assetValue.asset_id) continue;

    const assetType = String(assetValue.type);

    // Get bytes from inline data or URI
    let bytes = decodeAssetBytes(assetValue.data);
    if (!bytes && typeof assetValue.uri === "string") {
      bytes = await readBytesFromUri(assetValue.uri as string);
    }
    if (!bytes) continue;

    // Determine mime/ext, preferring explicit content_type
    const explicitMime = assetValue.mime_type ?? assetValue.content_type;
    const contentType =
      typeof explicitMime === "string" && explicitMime
        ? explicitMime
        : (ASSET_TYPE_MIME[assetType] ?? "application/octet-stream");

    const ext = ASSET_TYPE_EXT[assetType] ?? "bin";

    // Create Asset record
    const asset = new Asset({
      user_id: opts.userId,
      workflow_id: opts.workflowId ?? null,
      node_id: opts.nodeId,
      job_id: opts.jobId,
      name: `${assetType}_${opts.nodeId.slice(0, 8)}`,
      content_type: contentType,
      parent_id: null
    });

    const fileName = `${asset.id}.${ext}`;
    try {
      await mkdir(opts.storagePath, { recursive: true });
      await writeFile(join(opts.storagePath, fileName), bytes);
      asset.size = bytes.length;
      await asset.save();

      // Mutate the result value in-place
      assetValue.asset_id = asset.id;
      assetValue.uri = `asset://${fileName}`;
    } catch (err) {
      log.warn("Auto-save asset failed", {
        nodeId: opts.nodeId,
        error: String(err)
      });
    }
  }
}

/**
 * Returns true if every node in the graph has a type starting with "comfy.".
 */
function isComfyGraph(graph: {
  nodes: Array<Record<string, unknown>>;
}): boolean {
  return (
    graph.nodes.length > 0 &&
    graph.nodes.every(
      (n) =>
        typeof n.type === "string" && (n.type as string).startsWith("comfy.")
    )
  );
}

/**
 * Converts a NodeTool graph (with comfy.* nodes) into a ComfyUI API prompt dict.
 */
function graphToComfyPrompt(graph: {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const prompt: Record<
    string,
    { class_type: string; inputs: Record<string, unknown> }
  > = {};

  for (const node of graph.nodes) {
    const id = String(node.id);
    const classType = (node.type as string).replace(/^comfy\./, "");
    const props: Record<string, unknown> =
      (node.properties as Record<string, unknown>) ??
      (node.data as Record<string, unknown>) ??
      {};
    const inputs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith("_") || key === "workflow_id") continue;
      // MsgPack may decode large integers as BigInt; ComfyUI expects plain numbers
      inputs[key] = typeof value === "bigint" ? Number(value) : value;
    }
    prompt[id] = { class_type: classType, inputs };
  }

  // Wire edges: set inputs to [sourceId, slotIndex]
  for (const edge of graph.edges) {
    const sourceId = String(edge.source);
    const targetId = String(edge.target);
    const sourceHandle = edge.sourceHandle as string;
    const targetHandle = edge.targetHandle as string;

    if (!prompt[targetId]) continue;

    // Determine output slot index from source handle name.
    // Handles may be "output_0", "output_1", etc. (generic indexed format)
    // or named like "MODEL", "CLIP", "VAE" (resolved via _comfy_metadata).
    let slotIndex = 0;
    const outputMatch = /^output_(\d+)$/.exec(sourceHandle);
    if (outputMatch) {
      slotIndex = parseInt(outputMatch[1], 10);
    } else {
      const sourceNode = graph.nodes.find((n) => String(n.id) === sourceId);
      if (sourceNode) {
        const nodeProps =
          (sourceNode.properties as Record<string, unknown>) ??
          (sourceNode.data as Record<string, unknown>) ??
          {};
        const meta = (nodeProps._comfy_metadata ??
          sourceNode._comfy_metadata) as { outputs?: string[] } | undefined;
        if (meta?.outputs) {
          const idx = meta.outputs.indexOf(sourceHandle);
          if (idx >= 0) slotIndex = idx;
        }
      }
    }

    prompt[targetId].inputs[targetHandle] = [sourceId, slotIndex];
  }

  return prompt;
}

function createRuntimeContext(opts: {
  jobId: string;
  workflowId?: string | null;
  userId: string;
  workspaceDir: string | null;
  assetOutputMode?:
    | "python"
    | "data_uri"
    | "temp_url"
    | "storage_url"
    | "workspace"
    | "raw";
}): RuntimeProcessingContext {
  const storagePath = getAssetStoragePath();
  const storage = new FileStorageAdapter(storagePath);
  const ctx = new RuntimeProcessingContext({
    ...opts,
    secretResolver: getSecret,
    storage,
    tempUrlResolver: (fileUri: string) => {
      // Convert file:///path/to/storage/temp/uuid.png → public asset URL.
      // When ASSET_DOMAIN / TEMP_DOMAIN are configured the result uses those
      // domains; otherwise it falls back to /api/storage/temp/uuid.png.
      const prefix = pathToFileURL(storagePath).toString();
      if (fileUri.startsWith(prefix)) {
        return buildAssetUrl(fileUri.slice(prefix.length + 1));
      }
      return fileUri;
    }
  });

  const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "image/bmp": "bmp", "image/svg+xml": "svg",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
    "audio/ogg": "ogg", "video/mp4": "mp4", "video/webm": "webm",
    "application/pdf": "pdf", "text/plain": "txt", "text/html": "html",
    "model/gltf-binary": "glb"
  };

  ctx.setModelInterfaces({
    createAsset: async (args) => {
      const { join } = await import("node:path");
      const { writeFile, mkdir } = await import("node:fs/promises");
      const asset = new Asset({
        user_id: args.userId,
        workflow_id: args.workflowId ?? null,
        node_id: args.nodeId ?? null,
        job_id: args.jobId ?? null,
        name: args.name,
        content_type: args.contentType,
        parent_id: args.parentId ?? null
      });
      if (args.content) {
        const ext = MIME_TO_EXT[args.contentType] ?? "bin";
        const fileName = `${asset.id}.${ext}`;
        await mkdir(storagePath, { recursive: true });
        await writeFile(join(storagePath, fileName), args.content);
        asset.size = args.content.length;
      }
      await asset.save();
      return asset;
    }
  });

  return ctx;
}

/**
 * Default system prompt for regular chat — matches Python's REGULAR_SYSTEM_PROMPT.
 */
const REGULAR_SYSTEM_PROMPT = `You are a helpful assistant.

# IMAGE TOOLS
When using image tools, you will get an image url as result.
ALWAYS EMBED THE IMAGE AS MARKDOWN IMAGE TAG.

# File types
References to documents, images, videos or audio files are objects with following structure:
- type: either document, image, video, audio
- uri: either local "file:///path/to/file" or "http://"
`;

export interface WebSocketReceiveFrame {
  type: string;
  bytes?: Uint8Array | null;
  text?: string | null;
}

export interface WebSocketConnection {
  accept(): Promise<void>;
  receive(): Promise<WebSocketReceiveFrame>;
  sendBytes(data: Uint8Array): Promise<void>;
  sendText(data: string): Promise<void>;
  close(code?: number, reason?: string): Promise<void>;
  clientState?: "connected" | "disconnected";
  applicationState?: "connected" | "disconnected";
}

export interface RunJobRequest {
  job_id?: string;
  workflow_id?: string;
  user_id?: string;
  auth_token?: string;
  params?: Record<string, unknown>;
  graph?: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
  explicit_types?: boolean;
  settings?: Record<string, unknown>;
}

interface ActiveJob {
  jobId: string;
  workflowId: string | null;
  context: ProcessingContext;
  runner: WorkflowRunner;
  graph: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
  finished: boolean;
  status: "running" | "completed" | "failed" | "cancelled";
  error?: string;
  streamTask?: Promise<void>;
  /** For ComfyUI jobs: handle to cancel the underlying execution. */
  comfyHandle?: ComfyExecutionHandle;
}

class ToolBridge {
  private waiters = new Map<
    string,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (reason: Error) => void;
    }
  >();

  createWaiter(
    toolCallId: string,
    timeoutMs = 300_000
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.waiters.delete(toolCallId);
      };
      const wrappedResolve = (value: Record<string, unknown>) => {
        cleanup();
        resolve(value);
      };
      const wrappedReject = (reason: Error) => {
        cleanup();
        reject(reason);
      };
      this.waiters.set(toolCallId, {
        resolve: wrappedResolve,
        reject: wrappedReject
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (this.waiters.has(toolCallId)) {
            wrappedReject(
              new Error(
                `Tool call ${toolCallId} timed out after ${timeoutMs}ms`
              )
            );
          }
        }, timeoutMs);
      }
    });
  }

  resolveResult(toolCallId: string, payload: Record<string, unknown>): void {
    const waiter = this.waiters.get(toolCallId);
    if (!waiter) return;
    waiter.resolve(payload);
  }

  cancelAll(): void {
    const error = new Error("All pending tool calls cancelled");
    for (const waiter of this.waiters.values()) {
      waiter.reject(error);
    }
    this.waiters.clear();
  }
}

/**
 * Proxy tool that forwards execution to the frontend via ToolBridge.
 * Mirrors Python's UIToolProxy from messaging/ui_tool_proxy.py.
 */
class UIToolProxy extends Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;

  private bridge: ToolBridge;
  private sendMsg: (msg: Record<string, unknown>) => Promise<void>;

  constructor(
    manifest: Record<string, unknown>,
    bridge: ToolBridge,
    sendMsg: (msg: Record<string, unknown>) => Promise<void>
  ) {
    super();
    this.name = typeof manifest.name === "string" ? manifest.name : "";
    this.description =
      typeof manifest.description === "string"
        ? manifest.description
        : "UI tool";
    this.inputSchema =
      typeof manifest.parameters === "object" && manifest.parameters !== null
        ? (manifest.parameters as Record<string, unknown>)
        : {};
    this.bridge = bridge;
    this.sendMsg = sendMsg;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const toolCallId = randomUUID();
    await this.sendMsg({
      type: "tool_call",
      tool_call_id: toolCallId,
      name: this.name,
      args: params
    });

    try {
      const payload = await this.bridge.createWaiter(toolCallId, 60_000);
      if ((payload as Record<string, unknown>).ok) {
        return (payload as Record<string, unknown>).result ?? {};
      }
      return {
        error: `Frontend tool execution failed: ${(payload as Record<string, unknown>).error ?? "Unknown error"}`
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  userMessage(_params: Record<string, unknown>): string {
    return `Executing frontend tool: ${this.name}`;
  }
}

export interface UnifiedWebSocketRunnerOptions {
  userId?: string;
  authToken?: string;
  defaultModel?: string;
  defaultProvider?: string;
  resolveExecutor: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => NodeExecutor;
  resolveNodeType?: NodeTypeResolver;
  resolveProvider?: (
    providerId: string,
    userId: string
  ) => Promise<BaseProvider>;
  /** Resolve server-side Tool instances by name (for tool execution in chat). */
  resolveTools?: (toolNames: string[], userId: string) => Promise<Tool[]>;
  getSystemStats?: () => Record<string, unknown>;
  workspaceResolver?: (
    workflowId: string,
    userId: string
  ) => Promise<string | null>;
  /** Called before a workflow job starts — used to lazily connect the Python bridge. */
  beforeRunJob?: (graph: {
    nodes: Array<Record<string, unknown>>;
  }) => Promise<void>;
  /** Resolve node metadata by type — used for auto_save_asset detection. */
  getNodeMetadata?: (nodeType: string) => NodeMetadata | undefined;
}

export class UnifiedWebSocketRunner {
  websocket: WebSocketConnection | null = null;
  mode: WebSocketMode = "binary";
  userId: string | null;
  authToken: string | null;

  private defaultModel: string;
  private defaultProvider: string;
  private resolveExecutor: UnifiedWebSocketRunnerOptions["resolveExecutor"];
  private resolveNodeType?: UnifiedWebSocketRunnerOptions["resolveNodeType"];
  private resolveProvider?: UnifiedWebSocketRunnerOptions["resolveProvider"];
  private resolveTools?: UnifiedWebSocketRunnerOptions["resolveTools"];
  private getSystemStats: () => Record<string, unknown>;
  private workspaceResolver?: UnifiedWebSocketRunnerOptions["workspaceResolver"];
  private beforeRunJob?: UnifiedWebSocketRunnerOptions["beforeRunJob"];
  private getNodeMetadata?: UnifiedWebSocketRunnerOptions["getNodeMetadata"];

  private sendLock: Promise<void> = Promise.resolve();
  private activeJobs = new Map<string, ActiveJob>();
  private currentTask: Promise<void> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private chatRequestSeq = 0;
  private clientToolsManifest: Record<string, Record<string, unknown>> = {};
  private toolBridge = new ToolBridge();
  private observerRegistered = false;

  private logError(context: string, error: unknown): void {
    log.error(context, formatSanitizedError(error));
  }

  /**
   * Extract text from message content that may be a string or array of content items.
   * Mirrors Python's _extract_query_text / _extract_objective / _extract_text_content.
   */
  private extractTextContent(content: unknown, fallback = ""): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const texts = (content as Array<Record<string, unknown>>)
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string);
      return texts.length > 0 ? texts.join(" ") : fallback;
    }
    return fallback;
  }

  /**
   * Run one final LLM call to present structured agent results as readable
   * markdown. Falls back to formatted JSON if the call fails.
   */
  private async presentStructuredResults(
    provider: BaseProvider,
    model: string,
    objective: string,
    resultsJson: string,
    threadId: string
  ): Promise<string> {
    const messages: ProviderMessage[] = [
      {
        role: "user",
        content: `You completed the following task:\n"${objective}"\n\nHere are the structured results:\n\`\`\`json\n${resultsJson}\n\`\`\`\n\nPresent these results to the user in clear, well-formatted markdown. Be concise — do not repeat the raw JSON. Focus on readability.`
      }
    ];

    try {
      let content = "";
      for await (const item of provider.generateMessagesTraced({
        messages,
        model
      })) {
        if ("type" in item && item.type === "chunk") {
          const chunk = item as { content?: string };
          content += chunk.content ?? "";
          // Stream chunks to client so the user sees the response forming
          await this.sendMessage({
            type: "chunk",
            content: chunk.content ?? "",
            done: false,
            thread_id: threadId
          });
        }
      }
      return content || resultsJson;
    } catch (err) {
      log.warn("Failed to present structured results via LLM, using JSON fallback", {
        error: err instanceof Error ? err.message : String(err)
      });
      return resultsJson;
    }
  }

  private inferOutputType(value: unknown): string {
    if (value === null || value === undefined) return "any";
    if (typeof value === "string") return "str";
    if (typeof value === "number")
      return Number.isInteger(value) ? "int" : "float";
    if (typeof value === "boolean") return "bool";
    if (Array.isArray(value)) return "list";
    if (value && typeof value === "object") return "dict";
    return "any";
  }

  private resolveOutputNodeForKey(
    active: ActiveJob,
    outputKey: string
  ): { id: string; name: string } | null {
    let fallback: { id: string; name: string } | null = null;
    for (const raw of active.graph.nodes) {
      const node = raw as { id?: unknown; name?: unknown; type?: unknown };
      const id = typeof node.id === "string" ? node.id : null;
      if (!id) continue;
      const name = typeof node.name === "string" ? node.name : id;
      const type = typeof node.type === "string" ? node.type : "";
      if (name === outputKey || id === outputKey) return { id, name };
      if (type === "nodetool.output.Output" && !fallback)
        fallback = { id, name };
    }
    return fallback;
  }

  private async sendOutputUpdates(
    active: ActiveJob,
    outputs: Record<string, unknown[]>
  ): Promise<void> {
    for (const [outputKey, values] of Object.entries(outputs)) {
      const nodeRef = this.resolveOutputNodeForKey(active, outputKey) ?? {
        id: outputKey,
        name: outputKey
      };
      const seq = Array.isArray(values) ? values : [];
      for (const rawValue of seq) {
        const value = await active.context.normalizeOutputValue(rawValue);
        await this.sendMessage({
          type: "output_update",
          node_id: nodeRef.id,
          node_name: nodeRef.name,
          output_name: "output",
          value,
          output_type: this.inferOutputType(value),
          metadata: {},
          workflow_id: active.workflowId,
          job_id: active.jobId
        });
      }
    }
  }

  constructor(options: UnifiedWebSocketRunnerOptions) {
    this.userId = options.userId ?? null;
    this.authToken = options.authToken ?? null;
    this.defaultModel = options.defaultModel ?? "gpt-oss:20b";
    this.defaultProvider = options.defaultProvider ?? "ollama";
    this.resolveExecutor = options.resolveExecutor;
    this.resolveNodeType = options.resolveNodeType;
    this.resolveProvider = options.resolveProvider;
    this.resolveTools = options.resolveTools;
    this.workspaceResolver = options.workspaceResolver;
    this.beforeRunJob = options.beforeRunJob;
    this.getNodeMetadata = options.getNodeMetadata;
    this.getSystemStats =
      options.getSystemStats ??
      (() => ({
        timestamp: Date.now(),
        process_uptime_sec: process.uptime(),
        memory: process.memoryUsage()
      }));
  }

  async connect(
    websocket: WebSocketConnection,
    userId?: string,
    authToken?: string
  ): Promise<void> {
    if (userId) this.userId = userId;
    if (authToken) this.authToken = authToken;
    this.userId = this.userId ?? "1";

    await websocket.accept();
    this.websocket = websocket;
    log.info("Client connected", { userId: this.userId });

    this.startHeartbeat();
    this.startStatsBroadcast();
    this.registerObserver();
  }

  async disconnect(): Promise<void> {
    log.info("Client disconnected");
    this.stopHeartbeat();
    this.stopStatsBroadcast();
    this.unregisterObserver();
    this.toolBridge.cancelAll();

    this.currentTask = null;
    for (const [jobId, job] of this.activeJobs) {
      if (job.comfyHandle) {
        job.comfyHandle.cancel();
      } else if (job.runner) {
        job.runner.cancel();
      }
      this.activeJobs.delete(jobId);
    }

    if (this.websocket) {
      try {
        await this.websocket.close();
      } catch (error) {
        this.logError("disconnect websocket.close failed", error);
      }
    }
    this.websocket = null;
  }

  private serializeForJson(value: unknown): unknown {
    if (value instanceof Uint8Array) return Array.from(value);
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.serializeForJson(v));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.serializeForJson(v);
      }
      return out;
    }
    return value;
  }

  async sendMessage(message: Record<string, unknown>): Promise<void> {
    if (!this.websocket) return;
    if (
      this.websocket.clientState === "disconnected" ||
      this.websocket.applicationState === "disconnected"
    ) {
      return;
    }

    // Resolve storage keys in content to browser-accessible URLs before
    // sending over the wire.  This keeps DB storage URL-agnostic while
    // delivering ready-to-use URLs to the client.
    if (Array.isArray(message.content)) {
      message = {
        ...message,
        content: resolveContentUrls(message.content as unknown[])
      };
    }

    const payload =
      this.mode === "text"
        ? (this.serializeForJson(message) as Record<string, unknown>)
        : message;

    const prev = this.sendLock;
    let release!: () => void;
    this.sendLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev;
    try {
      if (this.mode === "binary") {
        await this.websocket.sendBytes(pack(payload));
      } else {
        await this.websocket.sendText(JSON.stringify(payload));
      }
    } finally {
      release();
    }
  }

  async receiveMessage(): Promise<Record<string, unknown> | null> {
    if (!this.websocket) {
      throw new Error("WebSocket is not connected");
    }

    const message = await this.websocket.receive();
    if (message.type === "websocket.disconnect") return null;

    if (message.bytes) {
      return unpack(message.bytes) as Record<string, unknown>;
    }
    if (message.text) {
      return JSON.parse(message.text) as Record<string, unknown>;
    }
    return null;
  }

  /**
   * Normalize a raw graph so that the kernel's NodeDescriptor contract is met.
   * The web-UI / Python serialisation stores node properties under `data`;
   * the kernel expects them under `properties`.
   */
  private normalizeGraph(graph: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }): {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  } {
    const nodes = graph.nodes.map((n) => {
      if (n.properties === undefined && n.data !== undefined) {
        const { data, ...rest } = n;
        return { ...rest, properties: data };
      }
      return n;
    });
    const edges = graph.edges.map((edge) => {
      const rawEdgeType = edge.edge_type ?? edge.type;
      const edge_type = rawEdgeType === "control" ? "control" : "data";
      const { type, ...rest } = edge;
      return { ...rest, edge_type };
    });
    return { nodes, edges };
  }

  private async hydrateGraph(graph: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }): Promise<{
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }> {
    const normalized = this.normalizeGraph(graph);
    if (!this.resolveNodeType) {
      return normalized;
    }

    const hydrated = await Graph.loadFromDict(normalized, {
      resolver: this.resolveNodeType
    });
    return {
      nodes: [...hydrated.nodes] as unknown as Array<Record<string, unknown>>,
      edges: [...hydrated.edges] as unknown as Array<Record<string, unknown>>
    };
  }

  private getRawGraph(req: RunJobRequest):
    | Promise<{
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      }>
    | {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      } {
    if (req.graph) {
      return this.normalizeGraph(req.graph);
    }
    if (req.workflow_id && this.userId) {
      const userId = this.userId;
      const workflowId = req.workflow_id;
      return (async () => {
        const workflow = await Workflow.find(userId, workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        return this.normalizeGraph(
          workflow.graph as {
            nodes: Array<Record<string, unknown>>;
            edges: Array<Record<string, unknown>>;
          }
        );
      })();
    }
    throw new Error("workflow_id or graph is required");
  }

  async runJob(req: RunJobRequest): Promise<void> {
    const userId = req.user_id ?? this.userId ?? "1";
    const workflowId = req.workflow_id ?? null;
    const jobId = req.job_id ?? randomUUID();

    // Get the normalized (but not hydrated) graph first so we can check
    // for comfy nodes before hydration strips unregistered node types.
    const rawGraph = await this.getRawGraph(req);

    // Route ComfyUI workflows to the dedicated comfy executor
    if (isComfyGraph(rawGraph)) {
      if (this.beforeRunJob) {
        await this.beforeRunJob(rawGraph);
      }
      await this.runComfyJob(
        jobId,
        workflowId,
        userId,
        rawGraph,
        req.settings ?? {}
      );
      return;
    }

    // Hydrate non-comfy graphs (resolves node types from the registry)
    const graph = await this.hydrateGraph(rawGraph);

    if (this.beforeRunJob) {
      await this.beforeRunJob(graph);
    }

    const workspaceDir =
      workflowId && this.workspaceResolver
        ? await this.workspaceResolver(workflowId, userId)
        : null;

    const context = createRuntimeContext({
      jobId,
      workflowId,
      userId,
      workspaceDir,
      assetOutputMode: this.mode === "text" ? "data_uri" : "temp_url"
    });

    // Expose executor/node-type resolution on the context so that
    // sub-workflow nodes (WorkflowNode) can create child runners.
    context.setResolveExecutor((node) => this.resolveExecutor(node));
    if (this.resolveNodeType) {
      const resolverObj =
        typeof this.resolveNodeType === "function"
          ? { resolveNodeType: this.resolveNodeType }
          : this.resolveNodeType;
      context.setResolveNodeType(
        (nodeType) =>
          resolverObj.resolveNodeType(nodeType) as Promise<{
            nodeType: string;
            propertyTypes?: Record<string, string>;
            outputs?: Record<string, string>;
            isDynamic?: boolean;
            descriptorDefaults?: Record<string, unknown>;
          } | null>
      );
    }

    const runner = new WorkflowRunner(jobId, {
      resolveExecutor: (node) =>
        this.resolveExecutor(
          node as { id: string; type: string; [key: string]: unknown }
        ),
      executionContext: context
    });

    const active: ActiveJob = {
      jobId,
      workflowId,
      context,
      runner,
      graph,
      finished: false,
      status: "running"
    };
    this.activeJobs.set(jobId, active);
    log.info("Job started", { jobId, workflowId });

    try {
      const existing = await Job.get(jobId);
      if (!existing) {
        await Job.create({
          id: jobId,
          workflow_id: workflowId ?? "",
          user_id: userId,
          status: "running",
          params: req.params ?? {},
          graph
        });
      }
    } catch (error) {
      this.logError("runJob persistence failed", error);
      // Persistence is best-effort in TS runtime mode.
    }

    const executePromise = runner.run(
      {
        job_id: jobId,
        workflow_id: workflowId ?? undefined,
        params: req.params ?? {}
      },
      graph as unknown as {
        nodes: Array<{ id: string; type: string; [key: string]: unknown }>;
        edges: Array<{
          id?: string | null;
          source: string;
          target: string;
          sourceHandle: string;
          targetHandle: string;
          edge_type: "data" | "control";
        }>;
      }
    );

    active.streamTask = this.streamJobMessages(active, executePromise);
  }

  /**
   * Execute a ComfyUI workflow via the comfy executor (local or RunPod).
   */
  private async runComfyJob(
    jobId: string,
    workflowId: string | null,
    _userId: string,
    graph: {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    },
    _settings: Record<string, unknown>
  ): Promise<void> {
    const active: ActiveJob = {
      jobId,
      workflowId,
      context: null as unknown as ProcessingContext,
      runner: null as unknown as WorkflowRunner,
      graph,
      finished: false,
      status: "running"
    };
    this.activeJobs.set(jobId, active);

    // Build node metadata lookup for status messages
    const nodeLookup = new Map<string, { name: string; type: string }>();
    for (const node of graph.nodes) {
      const id = String(node.id);
      const type = (node.type as string) ?? "comfy.unknown";
      const props = (node.properties ?? node.data ?? {}) as Record<
        string,
        unknown
      >;
      const name = (props.title as string) ?? type;
      nodeLookup.set(id, { name, type });
    }
    const getNode = (id: string) =>
      nodeLookup.get(id) ?? { name: `Node ${id}`, type: "comfy.unknown" };

    try {
      await this.sendMessage({
        type: "job_update",
        status: "running",
        job_id: jobId,
        workflow_id: workflowId
      });

      const prompt = graphToComfyPrompt(graph);
      const host = await getSetting("COMFYUI_ADDR");
      if (!host) {
        throw new Error("COMFYUI_ADDR is not configured. Set it in Settings.");
      }

      // Track active node so we can mark it completed when the next one starts
      let activeNodeId: string | null = null;
      const completeNode = (nodeId: string) => {
        const n = getNode(nodeId);
        void this.sendMessage({
          type: "node_update",
          node_id: nodeId,
          node_name: n.name,
          node_type: n.type,
          status: "completed",
          workflow_id: workflowId
        });
      };

      const onProgress = (event: ComfyProgressEvent) => {
        switch (event.type) {
          case "executing": {
            // When a new node starts, the previous one is implicitly done
            if (activeNodeId && activeNodeId !== event.node) {
              completeNode(activeNodeId);
              activeNodeId = null;
            }
            if (event.node) {
              activeNodeId = event.node;
              const n = getNode(event.node);
              void this.sendMessage({
                type: "node_update",
                node_id: event.node,
                node_name: n.name,
                node_type: n.type,
                status: "running",
                workflow_id: workflowId
              });
            } else {
              // null node = execution finished, complete any lingering active node
              if (activeNodeId) {
                completeNode(activeNodeId);
                activeNodeId = null;
              }
            }
            break;
          }
          case "progress":
            if (event.node) {
              void this.sendMessage({
                type: "node_progress",
                node_id: event.node,
                progress: event.progress ?? 0,
                total: event.total ?? 1,
                workflow_id: workflowId
              });
            }
            break;
          case "executed":
            if (event.node) {
              // Explicit completion with output — mark done and clear active
              if (activeNodeId === event.node) activeNodeId = null;
              const n = getNode(event.node);
              void this.sendMessage({
                type: "node_update",
                node_id: event.node,
                node_name: n.name,
                node_type: n.type,
                status: "completed",
                result: event.output ?? null,
                workflow_id: workflowId
              });
            }
            break;
          case "execution_cached":
            if (event.cached_nodes) {
              for (const nodeId of event.cached_nodes) {
                completeNode(nodeId);
              }
            }
            break;
          case "execution_error":
            if (event.node) {
              activeNodeId = null;
              const n = getNode(event.node);
              void this.sendMessage({
                type: "node_update",
                node_id: event.node,
                node_name: n.name,
                node_type: n.type,
                status: "error",
                error: event.error ?? "Execution error",
                workflow_id: workflowId
              });
            }
            break;
        }
      };

      const handle = executeComfy(prompt, host, onProgress);
      active.comfyHandle = handle;
      const result = await handle.result;

      if (result.status === "completed") {
        if (result.images && result.images.length > 0) {
          await this.sendMessage({
            type: "output_update",
            job_id: jobId,
            workflow_id: workflowId,
            result: { images: result.images }
          });
        }
        active.status = "completed";
        active.finished = true;
        await this.sendMessage({
          type: "job_update",
          status: "completed",
          job_id: jobId,
          workflow_id: workflowId
        });
      } else {
        throw new Error(result.error ?? "ComfyUI execution failed");
      }
    } catch (err) {
      active.status = "failed";
      active.finished = true;
      active.error = err instanceof Error ? err.message : String(err);
      log.error("ComfyUI job failed", { jobId, error: active.error });
      await this.sendMessage({
        type: "job_update",
        status: "failed",
        job_id: jobId,
        workflow_id: workflowId,
        error: active.error
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async streamJobMessages(
    active: ActiveJob,
    executePromise: Promise<{
      status: "completed" | "failed" | "cancelled";
      error?: string;
      outputs?: Record<string, unknown[]>;
    }>
  ): Promise<void> {
    let terminalSeen = false;
    let terminalWithResultSeen = false;
    let outputUpdateSeen = false;
    let finalOutputs: Record<string, unknown[]> = {};
    await this.sendMessage({
      type: "job_update",
      status: "running",
      job_id: active.jobId,
      workflow_id: active.workflowId
    });

    void executePromise
      .then((result) => {
        active.status = result.status;
        active.error = result.error;
        finalOutputs = result.outputs ?? {};
      })
      .catch((err) => {
        this.logError("job execution failed", err);
        active.status = "failed";
        active.error = formatSanitizedError(err);
      })
      .finally(() => {
        active.finished = true;
      });

    while (!active.finished || active.context.hasMessages()) {
      while (active.context.hasMessages()) {
        const msg = active.context.popMessage();
        if (!msg) break;
        const outbound: Record<string, unknown> = {
          ...(msg as unknown as Record<string, unknown>),
          job_id:
            (msg as unknown as Record<string, unknown>).job_id ?? active.jobId,
          workflow_id:
            (msg as unknown as Record<string, unknown>).workflow_id ??
            active.workflowId
        };
        if (outbound.error !== undefined) {
          outbound.error = formatSanitizedError(outbound.error);
        }
        if (
          outbound.type === "notification" &&
          typeof outbound.content === "string"
        ) {
          outbound.content = sanitizeLargeText(outbound.content);
        }
        if (outbound.type === "node_update" && outbound.status === "error") {
          log.error("Node error", {
            jobId: active.jobId,
            nodeId: outbound.node_id,
            error: outbound.error
          });
        } else if (
          outbound.type === "job_update" &&
          outbound.status === "failed"
        ) {
          log.error("Job failed", {
            jobId: active.jobId,
            error: outbound.error
          });
        }

        // Skip messages for constant/input nodes — they produce trivial
        // outputs that don't need to be relayed to the frontend.
        if (
          outbound.type === "output_update" ||
          outbound.type === "node_update"
        ) {
          const nodeId = String(outbound.node_id ?? "");
          const graphNodes =
            (
              active.graph as {
                nodes?: Array<{ id?: unknown; type?: unknown }>;
              }
            ).nodes ?? [];
          const node = graphNodes.find((n) => n.id === nodeId);
          const nodeType = typeof node?.type === "string" ? node.type : "";

          // Skip constant and input nodes entirely
          if (
            nodeType.startsWith("nodetool.constant.") ||
            nodeType.startsWith("nodetool.input.")
          ) {
            continue;
          }

          // Only relay output_update for Output-type nodes
          if (outbound.type === "output_update") {
            if (!nodeType.includes("Output")) continue;
            outputUpdateSeen = true;
          }

          // Auto-save generated assets before normalization strips inline data
          if (
            outbound.type === "node_update" &&
            outbound.status === "completed" &&
            outbound.result != null &&
            this.getNodeMetadata
          ) {
            const meta = this.getNodeMetadata(nodeType);
            if (meta?.auto_save_asset) {
              try {
                await autoSaveAssets(
                  outbound.result as Record<string, unknown>,
                  {
                    userId: this.userId ?? "1",
                    workflowId: active.workflowId,
                    jobId: active.jobId,
                    nodeId: String(outbound.node_id ?? ""),
                    storagePath: getAssetStoragePath()
                  }
                );
              } catch (err) {
                log.warn("autoSaveAssets error", { error: String(err) });
              }
            }
          }

          // Materialize binary assets to temp URLs before sending over WebSocket
          if (outbound.type === "node_update" && outbound.result != null) {
            outbound.result = await active.context.normalizeOutputValue(
              outbound.result
            );
          }
          if (outbound.type === "output_update" && outbound.value != null) {
            outbound.value = await active.context.normalizeOutputValue(
              outbound.value
            );
          }
        }
        await this.sendMessage(outbound);
        if (outbound.type === "job_update") {
          const status = String(outbound.status ?? "");
          if (
            ["completed", "failed", "cancelled", "error", "suspended"].includes(
              status
            )
          ) {
            terminalSeen = true;
            if (outbound.result !== undefined) {
              terminalWithResultSeen = true;
            }
          }
        }
      }
      if (!active.finished) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    if (!outputUpdateSeen && Object.keys(finalOutputs).length > 0) {
      await this.sendOutputUpdates(active, finalOutputs);
    }

    log.info("Job completed", { jobId: active.jobId, status: active.status });

    if (
      !terminalSeen ||
      (!terminalWithResultSeen && Object.keys(finalOutputs).length > 0)
    ) {
      await this.sendMessage({
        type: "job_update",
        status: active.status,
        job_id: active.jobId,
        workflow_id: active.workflowId,
        error: active.error,
        result: { outputs: finalOutputs }
      });
    }

    // Persist final job status
    try {
      const job = (await Job.get(active.jobId)) as Job | null;
      if (job) {
        if (active.status === "completed") {
          job.markCompleted();
        } else if (active.status === "failed") {
          job.markFailed(active.error ?? "Unknown error");
        } else if (active.status === "cancelled") {
          job.markCancelled();
        }
        await job.save();
      }
    } catch (error) {
      this.logError("job persistence (final status) failed", error);
    }

    this.activeJobs.delete(active.jobId);
  }

  async reconnectJob(jobId: string, workflowId?: string): Promise<void> {
    const active = this.activeJobs.get(jobId);
    if (!active) {
      throw new Error(`Job ${jobId} not found`);
    }

    await this.sendMessage({
      type: "job_update",
      status: active.status,
      job_id: jobId,
      workflow_id: workflowId ?? active.workflowId
    });

    for (const status of Object.values(active.context.getNodeStatuses())) {
      await this.sendMessage({
        ...(status as unknown as Record<string, unknown>),
        job_id: jobId,
        workflow_id: workflowId ?? active.workflowId
      });
    }
    for (const status of Object.values(active.context.getEdgeStatuses())) {
      await this.sendMessage({
        ...(status as unknown as Record<string, unknown>),
        job_id: jobId,
        workflow_id: workflowId ?? active.workflowId
      });
    }
  }

  async resumeJob(jobId: string, workflowId?: string): Promise<void> {
    await this.reconnectJob(jobId, workflowId);
  }

  async cancelJob(
    jobId: string,
    workflowId?: string
  ): Promise<Record<string, unknown>> {
    if (!jobId) {
      return { error: "No job_id provided" };
    }

    const active = this.activeJobs.get(jobId);
    if (!active) {
      return {
        error: "Job not found or already completed",
        job_id: jobId,
        workflow_id: workflowId ?? ""
      };
    }

    if (active.comfyHandle) {
      active.comfyHandle.cancel();
    } else if (active.runner) {
      active.runner.cancel();
    }
    active.status = "cancelled";
    // Do NOT set active.finished = true here. Let the runner's cancellation
    // propagate through executePromise's .finally() callback so that
    // streamJobMessages can drain remaining messages and persist job state.
    return {
      message: "Job cancellation requested",
      job_id: jobId,
      workflow_id: workflowId ?? active.workflowId ?? ""
    };
  }

  getStatus(jobId?: string): Record<string, unknown> {
    if (jobId) {
      const active = this.activeJobs.get(jobId);
      if (!active) {
        return { status: "not_found", job_id: jobId };
      }
      return {
        status: active.status,
        job_id: active.jobId,
        workflow_id: active.workflowId
      };
    }

    return {
      active_jobs: Array.from(this.activeJobs.values()).map((job) => ({
        job_id: job.jobId,
        workflow_id: job.workflowId,
        status: job.status
      }))
    };
  }

  async clearModels(): Promise<Record<string, unknown>> {
    return {
      message:
        "Model clearing is managed by provider implementations in TS runtime"
    };
  }

  private async ensureThreadExists(threadId?: string): Promise<string> {
    const userId = this.userId ?? "1";
    if (!threadId) {
      const thread = await Thread.create({ user_id: userId, title: "" });
      return thread.id;
    }
    const existing = await Thread.find(userId, threadId);
    if (existing) return existing.id;
    const thread = await Thread.create({
      id: threadId,
      user_id: userId,
      title: ""
    });
    return thread.id;
  }

  private dbMessageToProviderMessage(m: Message): ProviderMessage | null {
    const role = m.role as ProviderMessage["role"];
    // Filter out non-standard roles (e.g. "agent_execution") that providers can't handle
    if (!role || !["user", "assistant", "system", "tool"].includes(role)) {
      return null;
    }
    return {
      role,
      content:
        (Array.isArray(m.content)
          ? (m.content as MessageContent[])
          : (m.content as string | null)) ?? "",
      toolCallId: typeof m.tool_call_id === "string" ? m.tool_call_id : null,
      toolCalls: Array.isArray(m.tool_calls)
        ? (m.tool_calls as Array<{
            id: string;
            name: string;
            args: Record<string, unknown>;
          }>)
        : null,
      threadId: m.thread_id
    };
  }

  /**
   * Save a message dict to the database.
   * Mirrors Python's _save_message_to_db_async: pops id, type, user_id before create.
   */
  private async saveMessageToDb(
    messageData: Record<string, unknown>
  ): Promise<void> {
    const data = { ...messageData };
    delete data.id;
    delete data.type;
    const threadId = typeof data.thread_id === "string" ? data.thread_id : "";
    delete data.thread_id;
    const userId = this.userId ?? "1";
    delete data.user_id;

    await Message.create({
      thread_id: threadId,
      user_id: userId,
      ...data
    });
  }

  /**
   * Recursively process tool results, handling asset-like objects.
   * Mirrors Python's RegularChatProcessor._process_tool_result().
   *
   * - Asset-like objects (have type + uri/data): materialized via storage
   * - Date/datetime: converted to ISO string
   * - Arrays/objects: recursed into
   * - Primitives: returned as-is
   */
  private async processToolResult(
    obj: unknown,
    ctx: ProcessingContext
  ): Promise<unknown> {
    if (obj === null || obj === undefined) return obj;

    // Asset-like objects: { type: "image"|"audio"|"video"|..., uri?: string, data?: ... }
    if (typeof obj === "object" && !Array.isArray(obj)) {
      const record = obj as Record<string, unknown>;

      // Check if it's an asset-like object (has type + uri or data)
      if (
        "type" in record &&
        ("uri" in record || "data" in record || "asset_id" in record)
      ) {
        // Use ProcessingContext's normalizeOutputValue to handle asset materialization
        return ctx.normalizeOutputValue(record, "storage_url");
      }

      // Date objects
      if (obj instanceof Date) {
        return obj.toISOString();
      }

      // Regular objects — recurse into values
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        result[key] = await this.processToolResult(value, ctx);
      }
      return result;
    }

    // Arrays — recurse into items
    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.processToolResult(item, ctx)));
    }

    // Uint8Array/Buffer — store as asset
    if (obj instanceof Uint8Array) {
      if (!ctx.storage) return obj;
      const key = `assets/${randomUUID()}.bin`;
      const uri = await ctx.storage.store(key, obj);
      return { type: "asset", uri };
    }

    // Primitives
    return obj;
  }

  /**
   * Query vector store collections and return concatenated context string.
   * Mirrors Python's RegularChatProcessor._query_collections().
   */
  private async queryCollections(
    collections: string[],
    queryText: string,
    nResults = 5
  ): Promise<string> {
    if (!collections.length || !queryText) return "";

    try {
      const { getVecStore } = await import("@nodetool/vectorstore");
      const store = await getVecStore();

      const allResults: string[] = [];

      for (const collectionName of collections) {
        try {
          const collection = await store.getCollection({
            name: collectionName
          });
          const results = await collection.query({
            queryTexts: [queryText],
            nResults,
            include: ["documents", "metadatas"]
          });

          if (results.documents?.[0]?.length) {
            let collectionResults = `\n\n### Results from ${collectionName}:\n`;
            for (const doc of results.documents[0]) {
              if (!doc) continue;
              const preview =
                doc.length > 200 ? `${doc.slice(0, 200)}...` : doc;
              collectionResults += `\n- ${preview}`;
            }
            allResults.push(collectionResults);
          }
        } catch (err) {
          log.warn("Collection query failed", {
            collection: collectionName,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      return allResults.join("\n");
    } catch (err) {
      log.warn("Vector store init failed", {
        error: err instanceof Error ? err.message : String(err)
      });
      return "";
    }
  }

  /**
   * Add collection context as a system message before the last user message.
   * Mirrors Python's RegularChatProcessor._add_collection_context().
   */
  private addCollectionContext(
    messages: ProviderMessage[],
    collectionContext: string
  ): ProviderMessage[] {
    // Find the last user message index
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex >= 0) {
      const contextMessage: ProviderMessage = {
        role: "system",
        content: `Context from knowledge base:\n${collectionContext}`,
        toolCallId: null,
        toolCalls: null,
        threadId: null
      };
      return [
        ...messages.slice(0, lastUserIndex),
        contextMessage,
        ...messages.slice(lastUserIndex)
      ];
    }
    return messages;
  }

  /**
   * Handle an incoming chat message.
   *
   * Mirrors Python's full 3-layer flow:
   *   handle_chat_message → handle_message_impl → process_messages
   *     → _run_processor + RegularChatProcessor.process()
   *
   * The processor sends messages to a queue. _run_processor reads them:
   *   - type === "message" → persist to DB AND forward to client
   *   - anything else → forward to client only
   *
   * RegularChatProcessor.process():
   *   1. Prepend system prompt if first message isn't system role
   *   2. while True: messages_to_send = chat_history + unprocessed_messages
   *   3. Stream chunks (type: "chunk") — forwarded to client (not persisted)
   *   4. On tool call: build assistant Message + tool result Message (type: "message")
   *      → persisted to DB AND forwarded to client
   *   5. If unprocessed_messages empty, break
   *   6. Send done chunk + final assistant Message
   */
  async handleChatMessage(
    data: Record<string, unknown>,
    requestSeq?: number
  ): Promise<void> {
    const threadId = await this.ensureThreadExists(
      typeof data.thread_id === "string" ? data.thread_id : undefined
    );
    data.thread_id = threadId;

    // Apply defaults — matches Python's handle_chat_message
    if (!data.model) data.model = this.defaultModel;
    if (!data.provider) data.provider = this.defaultProvider;

    const providerId = data.provider as string;
    const model = data.model as string;
    const workflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : null;
    const userId = this.userId ?? "1";
    log.debug("Chat message", { threadId, model, provider: providerId });

    // Save user message to DB — matches Python's _save_message_to_db_async(data)
    await this.saveMessageToDb(data);

    if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq) return;

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured",
        thread_id: threadId
      });
      return;
    }

    // Route to workflow processor when workflow_target or workflow_id is set — matches Python's handle_message_impl
    // This check comes BEFORE agent_mode, matching Python's routing priority.
    const workflowTarget =
      typeof data.workflow_target === "string" ? data.workflow_target : null;
    if (workflowTarget === "workflow" || workflowId) {
      await this.handleWorkflowMessage(data, requestSeq);
      return;
    }

    // Route to media generation when the client requests a text-to-image or
    // text-to-video turn. The composer attaches a `media_generation` field
    // with mode + params; when mode is a media mode we invoke the provider's
    // textToImage / textToVideo instead of a regular LLM round and return an
    // assistant message containing MessageImageContent / MessageVideoContent.
    const mediaGeneration =
      data.media_generation && typeof data.media_generation === "object"
        ? (data.media_generation as Record<string, unknown>)
        : null;
    if (
      mediaGeneration &&
      typeof mediaGeneration.mode === "string" &&
      mediaGeneration.mode !== "chat"
    ) {
      await this.handleMediaGenerationMessage(
        data,
        mediaGeneration,
        requestSeq
      );
      return;
    }

    // Route to agent mode if requested — matches Python's handle_message_impl
    const agentMode = data.agent_mode === true || data.agent_mode === "true";
    if (agentMode) {
      await this.handleAgentMessage(data, requestSeq);
      return;
    }

    // Load history from DB, filter out agent_execution — matches Python's get_chat_history_from_db
    const [dbMessages] = await Message.paginate(threadId, { limit: 1000 });
    const chatHistory: ProviderMessage[] = [];
    for (const m of dbMessages) {
      const pm = this.dbMessageToProviderMessage(m);
      if (pm) chatHistory.push(pm);
    }

    const provider = await this.resolveProvider(providerId, userId);

    // Extract tool names from raw tool data — supports both string[] and object[]
    const rawTools = Array.isArray(data.tools) ? data.tools : [];
    const toolNames: string[] = rawTools
      .map((t) => {
        if (typeof t === "string") return t;
        const tool = t as Record<string, unknown>;
        return typeof tool.name === "string" ? tool.name : "";
      })
      .filter((n) => n.length > 0);
    log.info("Chat tools from client", {
      rawToolCount: rawTools.length,
      rawToolTypes: rawTools.map((t) => typeof t),
      toolNames
    });

    // Resolve server-side Tool instances for execution
    let serverTools: Tool[] = [];
    if (toolNames.length > 0 && this.resolveTools) {
      serverTools = await this.resolveTools(toolNames, userId);
    }
    const serverToolMap = new Map(serverTools.map((t) => [t.name, t]));
    log.info("Resolved server tools", {
      requested: toolNames,
      resolved: serverTools.map((t) => t.name),
      hasResolveTools: !!this.resolveTools
    });

    // Build provider-format tool schemas from resolved Tool instances + client tools
    const providerToolSchemas: ProviderTool[] = serverTools.map((t) =>
      t.toProviderTool()
    );
    // Only include client tools (ui_*) when a workflow is active
    const clientToolNames = workflowId
      ? Object.keys(this.clientToolsManifest)
      : [];
    if (workflowId) {
      for (const [name, manifest] of Object.entries(this.clientToolsManifest)) {
        providerToolSchemas.push({
          name,
          description:
            typeof manifest.description === "string"
              ? manifest.description
              : undefined,
          inputSchema:
            typeof manifest.inputSchema === "object"
              ? (manifest.inputSchema as Record<string, unknown>)
              : undefined
        });
      }
    }
    log.info("Provider tool schemas", {
      serverToolCount: serverTools.length,
      clientToolCount: clientToolNames.length,
      clientTools: clientToolNames,
      totalSchemas: providerToolSchemas.length,
      schemaNames: providerToolSchemas.map((t) => t.name)
    });

    // Create a processing context for tool execution
    const chatWorkspaceDir =
      workflowId && this.workspaceResolver
        ? await this.workspaceResolver(workflowId, userId)
        : tmpdir();
    const ctx = createRuntimeContext({
      jobId: randomUUID(),
      userId,
      workspaceDir: chatWorkspaceDir
    });

    // Prepend system prompt if first message isn't system role — matches Python
    if (chatHistory.length === 0 || chatHistory[0].role !== "system") {
      chatHistory.unshift({
        role: "system",
        content: REGULAR_SYSTEM_PROMPT,
        toolCallId: null,
        toolCalls: null,
        threadId: null
      });
    }

    // Query collections for RAG context — matches Python's _query_collections()
    const collections = Array.isArray(data.collections)
      ? (data.collections as string[]).filter((c) => typeof c === "string")
      : [];
    const userContent = this.extractTextContent(data.content);
    let collectionContext = "";
    if (collections.length > 0 && userContent) {
      collectionContext = await this.queryCollections(collections, userContent);
      if (collectionContext) {
        log.debug("Retrieved collection context", {
          chars: collectionContext.length
        });
      }
    }

    let content = "";
    let unprocessedMessages: ProviderMessage[] = [];

    // Tool execution loop — mirrors Python's RegularChatProcessor.process()
    const MAX_TOOL_ROUNDS = 10;
    let toolRound = 0;
    const shouldIncludeTools = true;
    try {
      while (true) {
        if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
          return;

        let messagesToSend = [...chatHistory, ...unprocessedMessages];
        unprocessedMessages = [];

        // Add collection context on first iteration — matches Python
        if (collectionContext) {
          messagesToSend = this.addCollectionContext(
            messagesToSend,
            collectionContext
          );
          collectionContext = ""; // Clear after first use
        }

        const stream = provider.generateMessagesTraced({
          messages: messagesToSend,
          model,
          tools:
            shouldIncludeTools && providerToolSchemas.length > 0
              ? providerToolSchemas
              : undefined,
          threadId,
          onToolCall:
            shouldIncludeTools && providerToolSchemas.length > 0
              ? async (name: string, args: Record<string, unknown>) => {
                  let toolResult: unknown;
                  const serverTool = serverToolMap.get(name);
                  if (serverTool) {
                    try {
                      toolResult = await serverTool.process(ctx, args);
                    } catch (err) {
                      const errMsg =
                        err instanceof Error ? err.message : String(err);
                      toolResult = { error: errMsg };
                    }
                  } else if (this.clientToolsManifest[name]) {
                    // Client-side tool — send to UI via ToolBridge
                    const callId = `call_${Date.now()}`;
                    await this.sendMessage({
                      type: "tool_call",
                      thread_id: threadId,
                      tool_call_id: callId,
                      name,
                      args
                    });
                    const clientResult = await this.toolBridge.createWaiter(
                      callId,
                      300_000
                    );
                    toolResult =
                      clientResult.result ?? clientResult.content ?? clientResult;
                  } else {
                    toolResult = { error: `Tool "${name}" not available` };
                  }
                  const processed = await this.processToolResult(
                    toolResult,
                    ctx
                  );
                  return typeof processed === "string"
                    ? processed
                    : JSON.stringify(processed);
                }
              : undefined
        });

        // Phase 1: Stream chunks and collect tool calls
        interface PendingToolCall {
          tc: ProviderToolCall;
        }
        const pendingToolCalls: PendingToolCall[] = [];

        for await (const item of stream) {
          if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
            return;

          if ("type" in item && (item as Chunk).type === "chunk") {
            // --- Text chunk --- forward to client (not persisted)
            const chunk = item as Chunk;
            const text = chunk.content ?? "";
            content += text;
            // Set thread_id if not already set — matches Python
            if (!chunk.thread_id) chunk.thread_id = threadId;
            await this.sendMessage({ ...chunk });
          } else if ("name" in item && "id" in item) {
            // --- Tool call from provider (collect, don't execute yet) ---
            const tc = item as ProviderToolCall;
            log.info("Tool call", { tool: tc.name, args: tc.args });
            pendingToolCalls.push({ tc });
          }
        }

        // Build ONE assistant message with ALL tool calls (OpenAI requires this)
        if (pendingToolCalls.length > 0) {
          const allToolCalls = pendingToolCalls.map(({ tc }) => ({
            id: tc.id,
            name: tc.name,
            args: tc.args,
            result: null
          }));
          const assistantMsgData: Record<string, unknown> = {
            type: "message",
            role: "assistant",
            content: content || null,
            tool_calls: allToolCalls,
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model
          };
          await this.saveMessageToDb(assistantMsgData);
          await this.sendMessage(assistantMsgData);

          unprocessedMessages.push({
            role: "assistant",
            content: content || null,
            toolCalls: pendingToolCalls.map(({ tc }) => ({
              id: tc.id,
              name: tc.name,
              args: tc.args
            })),
            toolCallId: null,
            threadId
          });
        }

        // Phase 2: Execute all collected tool calls in parallel
        if (pendingToolCalls.length > 0) {
          const executeOne = async ({ tc }: PendingToolCall) => {
            try {
              let toolResult: unknown;
              const serverTool = serverToolMap.get(tc.name);
              if (serverTool) {
                try {
                  toolResult = await serverTool.process(ctx, tc.args);
                } catch (err) {
                  const errMsg =
                    err instanceof Error ? err.message : String(err);
                  log.error("Tool execution failed", {
                    tool: tc.name,
                    error: errMsg
                  });
                  toolResult = { error: errMsg };
                }
              } else if (this.clientToolsManifest[tc.name]) {
                // Client-side tool via ToolBridge
                await this.sendMessage({
                  type: "tool_call",
                  thread_id: threadId,
                  tool_call_id: tc.id,
                  name: tc.name,
                  args: tc.args
                });
                const clientResult = await this.toolBridge.createWaiter(
                  tc.id,
                  300_000
                );
                toolResult =
                  clientResult.result ?? clientResult.content ?? clientResult;
              } else {
                toolResult = { error: `Tool "${tc.name}" not available` };
              }

              // Process tool result — handle asset-like objects, dates, etc.
              const processedResult = await this.processToolResult(
                toolResult,
                ctx
              );
              const toolResultJson = JSON.stringify(processedResult);

              return { tc, toolResultJson };
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              log.error("Tool executeOne failed", {
                tool: tc.name,
                error: errMsg
              });
              return { tc, toolResultJson: JSON.stringify({ error: errMsg }) };
            }
          };

          const results = await Promise.all(pendingToolCalls.map(executeOne));

          for (const { tc, toolResultJson } of results) {
            // Build tool result Message
            const toolMsgData: Record<string, unknown> = {
              type: "message",
              role: "tool",
              tool_call_id: tc.id,
              name: tc.name,
              content: toolResultJson,
              thread_id: threadId,
              workflow_id: workflowId,
              provider: providerId,
              model
            };
            await this.saveMessageToDb(toolMsgData);
            await this.sendMessage(toolMsgData);

            // Add tool result to unprocessed for next provider round
            unprocessedMessages.push({
              role: "tool",
              content: toolResultJson,
              toolCallId: tc.id,
              toolCalls: null,
              threadId
            });
          }
        }

        // If no unprocessed messages, generation is complete — matches Python's break condition
        if (unprocessedMessages.length === 0) {
          break;
        }
        // Reset content for next tool round so the final message only contains
        // text from the last generation pass (prior rounds were already streamed).
        content = "";
        toolRound++;
        if (toolRound >= MAX_TOOL_ROUNDS) {
          log.warn("Max tool rounds reached, stopping tool loop", {
            rounds: toolRound
          });
          break;
        }
        log.debug("Unprocessed messages", {
          count: unprocessedMessages.length,
          round: toolRound
        });
      }

      // Log provider call for cost tracking — matches Python's _log_provider_call()
      await this._logProviderCall(
        userId,
        provider,
        providerId,
        model,
        workflowId
      );

      // Signal completion — matches Python's done chunk + final assistant Message
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId
      });

      // Final assistant message — persisted and forwarded (type: "message")
      const finalMsgData: Record<string, unknown> = {
        type: "message",
        role: "assistant",
        content: content || null,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      };
      await this.saveMessageToDb(finalMsgData);
      await this.sendMessage(finalMsgData);

      log.debug("Chat complete", { threadId, chars: content.length });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Chat processing error", { threadId, error: errMsg });

      // Detect error type — matches Python's separate ConnectError / HTTPStatusError handlers
      let errorType = "error";
      let statusCode: number | undefined;
      let formattedMsg = errMsg;

      // Connection errors (ECONNREFUSED, ENOTFOUND, etc.)
      if (
        errMsg.includes("ECONNREFUSED") ||
        errMsg.includes("ENOTFOUND") ||
        errMsg.includes("fetch failed") ||
        errMsg.includes("nodename nor servname")
      ) {
        errorType = "connection_error";
        if (
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("nodename nor servname")
        ) {
          formattedMsg =
            "Connection error: Unable to resolve hostname. Please check your network connection and API endpoint configuration.";
        } else {
          formattedMsg = `Connection error: ${errMsg}`;
        }
      }
      // HTTP status errors — check for status code in error
      else if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status;
        errorType = "http_status_error";
        statusCode = status;

        // Try to extract error message from response body
        let bodyMsg: string | null = null;
        try {
          if ("body" in err || "response" in err) {
            const body = (err as any).body ?? (err as any).response;
            if (body && typeof body === "object" && "error" in body) {
              const errorDetail = body.error;
              if (
                typeof errorDetail === "object" &&
                errorDetail &&
                "message" in errorDetail
              ) {
                bodyMsg = String(errorDetail.message);
              }
            }
          }
        } catch {
          // Intentional: best-effort extraction of error message from response body
        }

        if (bodyMsg) {
          formattedMsg = bodyMsg;
        } else if (status === 400) {
          formattedMsg = `Bad request: ${errMsg}`;
        } else if (status === 401) {
          formattedMsg = "Authentication failed: Invalid API key or token";
        } else if (status === 403) {
          formattedMsg =
            "Access forbidden: You don't have permission for this resource";
        } else if (status === 404) {
          formattedMsg = "Not found: The requested resource was not found";
        } else if (status === 429) {
          formattedMsg = "Rate limited: Too many requests, please slow down";
        } else if (status >= 500) {
          formattedMsg = `Server error (${status}): The service is temporarily unavailable`;
        } else {
          formattedMsg = `HTTP error (${status}): ${errMsg}`;
        }
      }

      await this.sendMessage({
        type: "error",
        message: formattedMsg,
        error_type: errorType,
        ...(statusCode !== undefined ? { status_code: statusCode } : {}),
        thread_id: threadId,
        workflow_id: workflowId
      });
      // Signal completion even on error — matches Python
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId
      });
      const errorMsgData: Record<string, unknown> = {
        type: "message",
        role: "assistant",
        content:
          errorType === "connection_error"
            ? `I encountered a connection error: ${formattedMsg}. Please check your network connection and try again.`
            : errorType === "http_status_error"
              ? `I encountered an API error (HTTP ${statusCode}): ${formattedMsg}`
              : `I encountered an error: ${formattedMsg}`,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      };
      await this.saveMessageToDb(errorMsgData);
      await this.sendMessage(errorMsgData);
    }
  }

  /**
   * Log a provider call for cost tracking — mirrors Python's _log_provider_call().
   * Best-effort: never throws, logs warnings on failure.
   */
  private async _logProviderCall(
    userId: string,
    provider: BaseProvider,
    providerId: string,
    model: string,
    workflowId: string | null
  ): Promise<void> {
    if (!providerId || !model) {
      log.warn("Cannot log provider call: missing provider or model");
      return;
    }
    try {
      const cost = provider.cost;
      await Prediction.create({
        user_id: userId,
        provider: providerId,
        model,
        cost,
        workflow_id: workflowId,
        status: "completed",
        node_id: ""
      });
      log.debug("Logged provider call", { provider: providerId, model, cost });
    } catch (err) {
      if (err instanceof TypeError || err instanceof ReferenceError) {
        log.warn("Failed to log provider call due to invalid data", {
          error: err instanceof Error ? err.message : String(err)
        });
      } else {
        log.error("Unexpected error logging provider call", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  /**
   * Detect message input node names from a workflow graph.
   * Mirrors Python's WorkflowMessageProcessor._detect_message_input_names().
   *
   * Scans graph nodes for types ending in .MessageInput / .MessageListInput
   * and returns their data.name values.
   */
  private detectMessageInputNames(graph: {
    nodes: Array<Record<string, unknown>>;
    edges: unknown[];
  }): { messageName: string | null; messagesName: string | null } {
    let messageName: string | null = null;
    let messagesName: string | null = null;

    for (const node of graph.nodes) {
      const nodeType = typeof node.type === "string" ? node.type : "";
      const data =
        typeof node.data === "object" && node.data !== null
          ? (node.data as Record<string, unknown>)
          : {};
      const nodeName = typeof data.name === "string" ? data.name.trim() : "";
      if (!nodeName) continue;

      if (
        messageName === null &&
        (nodeType === "nodetool.input.MessageInput" ||
          nodeType.endsWith(".MessageInput"))
      ) {
        messageName = nodeName;
      }
      if (
        messagesName === null &&
        (nodeType === "nodetool.input.MessageListInput" ||
          nodeType.endsWith(".MessageListInput"))
      ) {
        messagesName = nodeName;
      }
    }

    return { messageName, messagesName };
  }

  /**
   * Convert workflow result dict into a response message with typed content.
   * Mirrors Python's WorkflowMessageProcessor._create_response_message().
   *
   * Converts outputs to MessageContent items:
   *  - string → { type: "text", text }
   *  - list → { type: "text", text: joined }
   *  - dict with type "image"/"video"/"audio" → media content
   *  - other → { type: "text", text: stringified }
   */
  private createWorkflowResponseContent(
    result: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    const content: Array<Record<string, unknown>> = [];

    for (const [, value] of Object.entries(result)) {
      if (value === null || value === undefined) continue;

      if (typeof value === "string") {
        content.push({ type: "text", text: value });
      } else if (Array.isArray(value)) {
        content.push({ type: "text", text: value.map(String).join(" ") });
      } else if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const assetType = typeof obj.type === "string" ? obj.type : "";
        if (assetType === "image") {
          content.push({
            type: "image",
            image: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else if (assetType === "video") {
          content.push({
            type: "video",
            video: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else if (assetType === "audio") {
          content.push({
            type: "audio",
            audio: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else {
          content.push({ type: "text", text: JSON.stringify(obj) });
        }
      } else {
        content.push({ type: "text", text: String(value) });
      }
    }

    if (content.length === 0) {
      content.push({ type: "text", text: "Workflow completed successfully." });
    }

    return content;
  }

  /**
   * Handle a chat message that targets a workflow.
   *
   * Mirrors Python's process_messages_for_workflow → WorkflowMessageProcessor/
   * ChatWorkflowMessageProcessor flow:
   *   1. Load workflow from DB
   *   2. Detect message input node names from graph
   *   3. Prepare params (serialized message + history)
   *   4. Run workflow via WorkflowRunner
   *   5. Stream events (job_update, node_update, output_update)
   *   6. Collect output_update results
   *   7. Send done chunk + response message with typed content
   */
  /**
   * Handle a chat_message with a `media_generation` payload by invoking the
   * selected provider's textToImage / textToVideo API, storing the resulting
   * asset(s), and returning them to the client as an assistant `Message`
   * whose `content` is an array of `MessageImageContent` / `MessageVideoContent`
   * blocks.
   *
   * The generated bytes are persisted via `ctx.storage.store()` so each
   * output receives a stable URI the client can resolve as a server asset.
   * The `media_generation` echo on the assistant message lets the UI render
   * the generation header (model, variation count, resolution, etc.) in the
   * conversation stream.
   */
  private async handleMediaGenerationMessage(
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    requestSeq?: number
  ): Promise<void> {
    const threadId =
      typeof data.thread_id === "string" ? data.thread_id : "";
    const workflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : null;
    const userId = this.userId ?? "1";
    const mode = String(mediaGeneration.mode ?? "");
    const providerId = String(
      mediaGeneration.provider ?? data.provider ?? this.defaultProvider
    );
    const modelId = String(
      mediaGeneration.model ?? data.model ?? this.defaultModel
    );
    const prompt = this.extractTextContent(data.content);

    log.info("Media generation", {
      threadId,
      mode,
      provider: providerId,
      model: modelId,
      promptLen: prompt.length
    });

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured",
        thread_id: threadId
      });
      return;
    }

    if (!modelId || modelId === "undefined") {
      await this.sendMessage({
        type: "error",
        message: `Please select a ${mode} model before generating`,
        thread_id: threadId
      });
      return;
    }

    if (!prompt) {
      await this.sendMessage({
        type: "error",
        message: "Please enter a prompt",
        thread_id: threadId
      });
      return;
    }

    // Persist the user message first — mirrors handleChatMessage behaviour so
    // the generation request is recorded in the thread history.
    await this.saveMessageToDb(data);

    if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq) return;

    const provider = await this.resolveProvider(providerId, userId);

    // Store generated media as a proper Asset record and return the
    // asset ID.  The DB message stores only `asset_id` — URLs are
    // resolved at serve time by resolveContentUrls / sendMessage.
    const storagePath = getAssetStoragePath();
    const storeMediaAsset = async (
      bytes: Uint8Array,
      contentType: string,
      ext: string
    ): Promise<string> => {
      const { join } = await import("node:path");
      const { writeFile: fsWrite, mkdir: fsMkdir } = await import(
        "node:fs/promises"
      );
      const asset = new Asset({
        user_id: userId,
        workflow_id: workflowId ?? null,
        name: `${mode}_${Date.now()}`,
        content_type: contentType,
        parent_id: null
      });
      const fileName = `${asset.id}.${ext}`;
      await fsMkdir(storagePath, { recursive: true });
      await fsWrite(join(storagePath, fileName), bytes);
      asset.size = bytes.length;
      await asset.save();
      return asset.id;
    };

    try {
      if (mode === "image") {
        const variations = Math.max(
          1,
          Math.min(Number(mediaGeneration.variations ?? 1), 8)
        );
        const width =
          typeof mediaGeneration.width === "number"
            ? mediaGeneration.width
            : undefined;
        const height =
          typeof mediaGeneration.height === "number"
            ? mediaGeneration.height
            : undefined;
        const imageModel: ProviderImageModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };
        const params: TextToImageParams = {
          model: imageModel,
          prompt,
          width,
          height
        };

        // Surface a progress chunk so the UI can show the request flight
        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        const imageContents: Array<Record<string, unknown>> = [];
        for (let i = 0; i < variations; i++) {
          if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
            return;
          const bytes = await provider.textToImage(params);
          const assetId = await storeMediaAsset(bytes, "image/png", "png");
          imageContents.push({
            type: "image_url",
            image: { type: "image", asset_id: assetId, mimeType: "image/png" }
          });
        }

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: imageContents,
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      if (mode === "video") {
        const aspectRatio =
          typeof mediaGeneration.aspect_ratio === "string"
            ? (mediaGeneration.aspect_ratio as string)
            : null;
        const resolution =
          typeof mediaGeneration.resolution === "string"
            ? (mediaGeneration.resolution as string)
            : null;
        const duration =
          typeof mediaGeneration.duration === "number"
            ? (mediaGeneration.duration as number)
            : null;
        const videoModel: ProviderVideoModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };
        const params: TextToVideoParams = {
          model: videoModel,
          prompt,
          aspectRatio,
          resolution,
          numFrames: duration ? duration * 24 : null
        };

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        const bytes = await provider.textToVideo(params);
        const assetId = await storeMediaAsset(bytes, "video/mp4", "mp4");

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "video",
              video: {
                type: "video",
                asset_id: assetId,
                format: "mp4",
                duration: duration
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      // Modes not yet implemented on the backend — fall back to an informative
      // error so the client can render the unsupported state cleanly.
      await this.sendMessage({
        type: "error",
        message: `Media generation mode "${mode}" is not yet supported`,
        thread_id: threadId
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Media generation error", { threadId, mode, error: errMsg });
      await this.sendMessage({
        type: "error",
        message: `Generation failed: ${errMsg}`,
        thread_id: threadId
      });
    }
  }

  private async handleWorkflowMessage(
    data: Record<string, unknown>,
    _requestSeq?: number
  ): Promise<void> {
    const threadId = typeof data.thread_id === "string" ? data.thread_id : "";
    const workflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : null;
    const providerId =
      typeof data.provider === "string" ? data.provider : this.defaultProvider;
    const model =
      typeof data.model === "string" ? data.model : this.defaultModel;
    const userId = this.userId ?? "1";
    const jobId = randomUUID();

    log.info("Workflow message", { threadId, workflowId, jobId });

    try {
      if (!workflowId) {
        throw new Error("workflow_id is required for workflow processing");
      }

      // Load workflow from DB
      const workflow = await Workflow.find(userId, workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const rawGraph = workflow.graph as {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      };

      if (this.beforeRunJob) {
        await this.beforeRunJob(rawGraph);
      }

      // Detect message input names from raw graph (reads node.data) — matches Python
      const { messageName, messagesName } =
        this.detectMessageInputNames(rawGraph);
      const graph = await this.hydrateGraph(rawGraph);
      const messageInputName =
        (typeof data.workflow_message_input_name === "string"
          ? data.workflow_message_input_name
          : null) ??
        messageName ??
        "message";
      const messagesInputName =
        (typeof data.workflow_messages_input_name === "string"
          ? data.workflow_messages_input_name
          : null) ??
        messagesName ??
        "messages";

      // Build chat history for params — matches Python
      const [dbMessages] = await Message.paginate(threadId, { limit: 1000 });
      const chatHistorySerialized = dbMessages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        thread_id: m.thread_id
      }));

      // Serialize current message
      const currentMessage = {
        role: typeof data.role === "string" ? data.role : "user",
        content: data.content,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      };

      // Prepare params — matches Python's WorkflowMessageProcessor
      const params: Record<string, unknown> = {
        [messageInputName]: currentMessage,
        [messagesInputName]: [...chatHistorySerialized, currentMessage],
        ...(typeof data.params === "object" && data.params !== null
          ? (data.params as Record<string, unknown>)
          : {})
      };

      // If chat workflow, add legacy params — matches Python's ChatWorkflowMessageProcessor
      if (workflow.run_mode === "chat") {
        const legacyChatInput = chatHistorySerialized.map((m) => ({
          role: m.role,
          content: this.extractTextContent(m.content),
          created_at: m.created_at
        }));
        params["chat_input"] = legacyChatInput;
        if (messagesInputName !== "messages") {
          params["messages"] = legacyChatInput;
        }
      }

      // Create processing context
      const workspaceDir = this.workspaceResolver
        ? await this.workspaceResolver(workflowId, userId)
        : null;
      const context = createRuntimeContext({
        jobId,
        workflowId,
        userId,
        workspaceDir,
        assetOutputMode: this.mode === "text" ? "data_uri" : "temp_url"
      });

      // Expose executor/node-type resolution for sub-workflow nodes
      context.setResolveExecutor((node) => this.resolveExecutor(node));
      if (this.resolveNodeType) {
        const resolverObj =
          typeof this.resolveNodeType === "function"
            ? { resolveNodeType: this.resolveNodeType }
            : this.resolveNodeType;
        context.setResolveNodeType(
          (nodeType) =>
            resolverObj.resolveNodeType(nodeType) as Promise<{
              nodeType: string;
              propertyTypes?: Record<string, string>;
              outputs?: Record<string, string>;
              isDynamic?: boolean;
              descriptorDefaults?: Record<string, unknown>;
            } | null>
        );
      }

      // Create and run workflow
      const runner = new WorkflowRunner(jobId, {
        resolveExecutor: (node) =>
          this.resolveExecutor(
            node as { id: string; type: string; [key: string]: unknown }
          ),
        executionContext: context
      });

      const active: ActiveJob = {
        jobId,
        workflowId,
        context,
        runner,
        graph,
        finished: false,
        status: "running"
      };
      this.activeJobs.set(jobId, active);

      // Persist job to DB (best-effort)
      try {
        await Job.create({
          id: jobId,
          workflow_id: workflowId,
          user_id: userId,
          status: "running",
          params,
          graph
        });
      } catch (error) {
        this.logError("workflow job persistence failed", error);
      }

      // Execute workflow and stream messages
      const executePromise = runner.run(
        { job_id: jobId, workflow_id: workflowId, params },
        graph as unknown as {
          nodes: Array<{ id: string; type: string; [key: string]: unknown }>;
          edges: Array<{
            id?: string | null;
            source: string;
            target: string;
            sourceHandle: string;
            targetHandle: string;
            edge_type: "data" | "control";
          }>;
        }
      );

      // Stream events, collect output_update results
      const result: Record<string, unknown> = {};
      await this.sendMessage({
        type: "job_update",
        status: "running",
        job_id: jobId,
        workflow_id: workflowId
      });

      let finalOutputs: Record<string, unknown[]> = {};
      void executePromise
        .then((r) => {
          active.status = r.status;
          active.error = r.error;
          finalOutputs = r.outputs ?? {};
        })
        .catch((err) => {
          active.status = "failed";
          active.error = err instanceof Error ? err.message : String(err);
        })
        .finally(() => {
          active.finished = true;
        });

      while (!active.finished || active.context.hasMessages()) {
        while (active.context.hasMessages()) {
          const msg = active.context.popMessage();
          if (!msg) break;
          const outbound: Record<string, unknown> = {
            ...(msg as unknown as Record<string, unknown>),
            job_id: (msg as unknown as Record<string, unknown>).job_id ?? jobId,
            workflow_id:
              (msg as unknown as Record<string, unknown>).workflow_id ??
              workflowId
          };

          // Capture output_update values for the response message
          if (outbound.type === "output_update") {
            const nodeId = String(outbound.node_id ?? "");
            const graphNodes = graph.nodes ?? [];
            const node = graphNodes.find((n) => n.id === nodeId);
            const nodeType = typeof node?.type === "string" ? node.type : "";
            if (nodeType.includes("Output")) {
              const nodeName =
                typeof outbound.node_name === "string"
                  ? outbound.node_name
                  : nodeType;
              result[nodeName] = outbound.value;
            } else {
              continue; // Skip non-output node output_updates
            }
          }

          await this.sendMessage(outbound);
        }
        if (!active.finished) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Collect any outputs from the runner result — only Output-type nodes
      // The kernel considers all leaf nodes as "output nodes", but for the
      // response message we only want nodes whose type includes "Output"
      // (matching Python's WorkflowMessageProcessor behavior).
      for (const [nodeType, values] of Object.entries(finalOutputs)) {
        if (!nodeType.includes("Output")) continue;
        if (!result[nodeType] && Array.isArray(values) && values.length > 0) {
          result[nodeType] = values.length === 1 ? values[0] : values;
        }
      }

      // Send terminal job_update if not already sent
      await this.sendMessage({
        type: "job_update",
        status: active.status,
        job_id: jobId,
        workflow_id: workflowId,
        error: active.error,
        result: { outputs: finalOutputs }
      });

      // Persist final job status
      try {
        const job = (await Job.get(jobId)) as Job | null;
        if (job) {
          if (active.status === "completed") job.markCompleted();
          else if (active.status === "failed")
            job.markFailed(active.error ?? "Unknown error");
          else if (active.status === "cancelled") job.markCancelled();
          await job.save();
        }
      } catch (error) {
        this.logError("workflow job persistence (final) failed", error);
      }

      this.activeJobs.delete(jobId);

      // Signal completion — done chunk with job_id + workflow_id
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });

      // Create response message from workflow outputs — matches Python's _create_response_message
      const responseContent = this.createWorkflowResponseContent(result);
      const responseMsg: Record<string, unknown> = {
        type: "message",
        role: "assistant",
        content: responseContent,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model,
        job_id: jobId
      };
      await this.saveMessageToDb(responseMsg);
      await this.sendMessage(responseMsg);

      log.debug("Workflow message complete", { threadId, workflowId, jobId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Workflow message error", {
        threadId,
        workflowId,
        error: errMsg
      });

      await this.sendMessage({
        type: "error",
        message: `Error processing workflow: ${errMsg}`,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });

      // Send done chunk even on error — matches Python
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });
    }
  }

  /**
   * Handle agent mode messages.
   * Mirrors Python's AgentMessageProcessor.process().
   *
   * Creates an Agent with the user's objective and streams execution events
   * (Chunk, ToolCallUpdate, TaskUpdate, PlanningUpdate, LogUpdate, StepResult)
   * to the client. Messages with type "message" are persisted to DB.
   */
  private async handleAgentMessage(
    data: Record<string, unknown>,
    requestSeq?: number
  ): Promise<void> {
    const threadId = typeof data.thread_id === "string" ? data.thread_id : "";
    const providerId = data.provider as string;
    const model = data.model as string;
    const workflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : null;
    const userId = this.userId ?? "1";

    const provider = await this.resolveProvider!(providerId, userId);

    // Extract objective from content
    const objective = this.extractTextContent(
      data.content,
      "Complete the requested task"
    );

    // Generate unique execution ID — matches Python
    const agentExecutionId = randomUUID();

    // Resolve tools — matches Python's tool resolution
    const {
      Agent,
      ReadFileTool,
      WriteFileTool,
      BrowserTool,
      GoogleSearchTool,
      getAllMcpTools,
      resolveTool
    } = await import("@nodetool/agents");

    let selectedTools: Tool[] = [];
    const rawToolNames = Array.isArray(data.tools)
      ? (data.tools as string[]).filter((t) => typeof t === "string")
      : [];

    if (rawToolNames.length > 0) {
      // User explicitly specified tools — resolve by name
      for (const name of rawToolNames) {
        const tool = resolveTool(name);
        if (tool) selectedTools.push(tool);
      }
      log.debug("Selected tools for agent", {
        tools: selectedTools.map((t) => t.name)
      });
    } else {
      // No tools specified — use defaults + MCP tools for omnipotent mode
      selectedTools = [
        new ReadFileTool(),
        new WriteFileTool(),
        new BrowserTool(),
        new GoogleSearchTool(),
        ...getAllMcpTools()
      ];
      log.debug("Using default + MCP tools for agent", {
        count: selectedTools.length
      });
    }

    // Server-side tools from resolveTools option
    if (rawToolNames.length > 0 && this.resolveTools) {
      const serverTools = await this.resolveTools(rawToolNames, userId);
      for (const st of serverTools) {
        if (!selectedTools.find((t) => t.name === st.name)) {
          selectedTools.push(st);
        }
      }
    }

    // Include UI proxy tools if client provided a manifest via tool bridge — matches Python
    if (Object.keys(this.clientToolsManifest).length > 0) {
      const sendMsg = this.sendMessage.bind(this);
      for (const [, manifest] of Object.entries(this.clientToolsManifest)) {
        try {
          selectedTools.push(
            new UIToolProxy(manifest, this.toolBridge, sendMsg)
          );
        } catch (err) {
          log.warn("Failed to register UI tool proxy", {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      log.debug("Added UI tool proxies to agent", {
        count: Object.keys(this.clientToolsManifest).length
      });
    }

    // Create ProcessingContext for agent execution
    const agentWorkspaceDir =
      workflowId && this.workspaceResolver
        ? await this.workspaceResolver(workflowId, userId)
        : tmpdir();
    const ctx = createRuntimeContext({
      jobId: randomUUID(),
      userId,
      workspaceDir: agentWorkspaceDir
    });

    try {
      const agent = new Agent({
        name: "Assistant",
        objective,
        provider,
        model,
        tools: selectedTools,
        outputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "string",
              description: "The markdown content of the response"
            }
          },
          required: ["markdown"]
        }
      });

      for await (const item of agent.execute(ctx)) {
        if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
          return;

        const msgType = (item as { type?: string }).type;

        if (msgType === "chunk") {
          // Stream text chunks to client
          const chunk = item as {
            type: string;
            content?: string;
            done?: boolean;
            thinking?: boolean;
            thread_id?: string;
          };
          await this.sendMessage({
            type: "chunk",
            content: chunk.content ?? "",
            done: chunk.done ?? false,
            thinking: chunk.thinking ?? false,
            thread_id: chunk.thread_id ?? threadId
          });
        } else if (msgType === "tool_call_update") {
          // Forward tool call updates
          const tc = item as {
            name: string;
            args: Record<string, unknown>;
            tool_call_id?: string;
            step_id?: string;
          };
          await this.sendMessage({
            type: "tool_call_update",
            thread_id: threadId,
            workflow_id: workflowId,
            tool_call_id: tc.tool_call_id ?? null,
            name: tc.name,
            message: `Calling ${tc.name}...`,
            args: tc.args,
            step_id: tc.step_id ?? null,
            agent_execution_id: agentExecutionId
          });
        } else if (msgType === "task_update") {
          // Send task update as agent_execution message — persisted by _run_processor pattern
          const tu = item as { task?: unknown; step?: unknown; event?: string };
          const contentDict = {
            type: "task_update",
            event: tu.event,
            task: tu.task ?? null,
            step: tu.step ?? null
          };
          const msg: Record<string, unknown> = {
            type: "message",
            role: "agent_execution",
            execution_event_type: "task_update",
            agent_execution_id: agentExecutionId,
            content: contentDict,
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model,
            agent_mode: true
          };
          await this.saveMessageToDb(msg);
          await this.sendMessage(msg);
        } else if (msgType === "planning_update") {
          // Send planning update as agent_execution message
          const pu = item as {
            phase?: string;
            status?: string;
            content?: string;
            node_id?: string;
          };
          const contentDict = {
            type: "planning_update",
            phase: pu.phase,
            status: pu.status,
            content: pu.content,
            node_id: pu.node_id
          };
          const msg: Record<string, unknown> = {
            type: "message",
            role: "agent_execution",
            execution_event_type: "planning_update",
            agent_execution_id: agentExecutionId,
            content: contentDict,
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model,
            agent_mode: true
          };
          await this.saveMessageToDb(msg);
          await this.sendMessage(msg);

          // Also send persistent LogUpdate for completed phases — matches Python
          if (pu.status === "Success" || pu.status === "Failed") {
            const logMsg: Record<string, unknown> = {
              type: "message",
              role: "agent_execution",
              execution_event_type: "log_update",
              agent_execution_id: agentExecutionId,
              content: {
                type: "log_update",
                node_id: pu.node_id ?? "agent",
                node_name: "Agent",
                content: `${pu.phase}: ${pu.content ?? ""}`,
                severity: pu.status === "Failed" ? "error" : "info"
              },
              thread_id: threadId,
              workflow_id: workflowId,
              provider: providerId,
              model,
              agent_mode: true
            };
            await this.saveMessageToDb(logMsg);
            await this.sendMessage(logMsg);
          }
        } else if (msgType === "log_update") {
          // Forward log updates as agent_execution messages
          const lu = item as {
            node_id?: string;
            node_name?: string;
            content?: string;
            severity?: string;
          };
          const msg: Record<string, unknown> = {
            type: "message",
            role: "agent_execution",
            execution_event_type: "log_update",
            agent_execution_id: agentExecutionId,
            content: {
              type: "log_update",
              node_id: lu.node_id,
              node_name: lu.node_name,
              content: lu.content,
              severity: lu.severity
            },
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model,
            agent_mode: true
          };
          await this.saveMessageToDb(msg);
          await this.sendMessage(msg);
        } else if (msgType === "step_result") {
          const sr = item as {
            step?: unknown;
            result?: unknown;
            error?: string;
            is_task_result?: boolean;
          };
          // Only forward non-task step results — task result handled via agent.results
          if (!sr.is_task_result) {
            const contentDict = {
              type: "step_result",
              result: sr.result,
              step: sr.step ?? null,
              error: sr.error,
              is_task_result: sr.is_task_result
            };
            const msg: Record<string, unknown> = {
              type: "message",
              role: "agent_execution",
              execution_event_type: "step_result",
              agent_execution_id: agentExecutionId,
              content: contentDict,
              thread_id: threadId,
              workflow_id: workflowId,
              provider: providerId,
              model,
              agent_mode: true
            };
            await this.saveMessageToDb(msg);
            await this.sendMessage(msg);
          }
        }
      }

      // Normalize final agent output — matches Python
      const results = agent.getResults();
      let content: string;
      if (typeof results === "string") {
        content = results;
      } else if (
        results &&
        typeof results === "object" &&
        "markdown" in results
      ) {
        const md = (results as Record<string, unknown>).markdown;
        content = typeof md === "string" ? md : String(results);
      } else if (results != null && typeof results === "object") {
        // Structured result — run one more LLM call to present it
        const resultsJson = JSON.stringify(results, null, 2);
        content = await this.presentStructuredResults(
          provider,
          model,
          objective,
          resultsJson,
          threadId
        );
      } else {
        content = results != null ? String(results) : "";
      }

      // Send final assistant message — persisted
      const finalMsg: Record<string, unknown> = {
        type: "message",
        role: "assistant",
        content,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model,
        agent_mode: true
      };
      await this.saveMessageToDb(finalMsg);
      await this.sendMessage(finalMsg);

      // Signal completion
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId,
        workflow_id: workflowId
      });

      log.debug("Agent execution complete", { threadId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Agent execution error", { threadId, error: errMsg });

      await this.sendMessage({
        type: "error",
        message: `Agent execution error: ${errMsg}`,
        error_type: "agent_error",
        thread_id: threadId,
        workflow_id: workflowId
      });

      // Signal completion even on error
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId,
        workflow_id: workflowId
      });

      // Return error assistant message
      const errorFinalMsg: Record<string, unknown> = {
        type: "message",
        role: "assistant",
        content: `Agent execution error: ${errMsg}`,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model,
        agent_mode: true
      };
      await this.saveMessageToDb(errorFinalMsg);
      await this.sendMessage(errorFinalMsg);
    }
  }

  async handleInference(
    data: Record<string, unknown>,
    requestSeq: number
  ): Promise<void> {
    const providerId =
      typeof data.provider === "string" ? data.provider : this.defaultProvider;
    const model =
      typeof data.model === "string" ? data.model : this.defaultModel;
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];
    log.debug("Inference request", {
      model,
      provider: providerId,
      messages: rawMessages.length
    });

    const messages: ProviderMessage[] = rawMessages.map((m) => {
      const msg = m as Record<string, unknown>;
      return {
        role: (typeof msg.role === "string"
          ? msg.role
          : "user") as ProviderMessage["role"],
        content:
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? (msg.content as MessageContent[])
              : "",
        toolCallId: typeof msg.toolCallId === "string" ? msg.toolCallId : null,
        toolCalls: Array.isArray(msg.toolCalls)
          ? (msg.toolCalls as Array<{
              id: string;
              name: string;
              args: Record<string, unknown>;
            }>)
          : null,
        threadId: null
      };
    });

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured"
      });
      return;
    }

    const rawTools = Array.isArray(data.tools) ? data.tools : [];
    const tools: ProviderTool[] = rawTools
      .map((t) => {
        const tool = t as Record<string, unknown>;
        return {
          name: typeof tool.name === "string" ? tool.name : "",
          description:
            typeof tool.description === "string" ? tool.description : undefined,
          inputSchema:
            typeof tool.inputSchema === "object"
              ? (tool.inputSchema as Record<string, unknown>)
              : undefined
        };
      })
      .filter((t) => t.name.length > 0);

    const provider = await this.resolveProvider(providerId, this.userId ?? "1");
    for await (const item of provider.generateMessagesTraced({
      messages,
      model,
      tools: tools.length > 0 ? tools : undefined
    })) {
      if (requestSeq !== this.chatRequestSeq) break; // cancelled
      if ("type" in item && item.type === "chunk") {
        await this.sendMessage({
          ...(item as unknown as Record<string, unknown>),
          seq: requestSeq
        });
      } else if ("name" in item) {
        const toolItem = item as {
          id: string;
          name: string;
          args: Record<string, unknown>;
        };
        log.info("Tool call", { tool: toolItem.name, args: toolItem.args });
        await this.sendMessage({
          type: "tool_call",
          id: toolItem.id,
          name: toolItem.name,
          args: toolItem.args,
          seq: requestSeq
        });
      }
    }

    if (requestSeq === this.chatRequestSeq) {
      log.debug("Inference complete");
      await this.sendMessage({ type: "inference_done", seq: requestSeq });
    }
  }

  async handleCommand(
    command: WebSocketCommandEnvelope
  ): Promise<Record<string, unknown>> {
    const data = command.data ?? {};
    const jobId = typeof data.job_id === "string" ? data.job_id : undefined;
    const workflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : undefined;
    log.debug("Command", { command: command.command });

    switch (command.command as UnifiedCommandType) {
      case "clear_models":
        return this.clearModels();
      case "run_job":
        await this.runJob(data as unknown as RunJobRequest);
        return { message: "Job started", workflow_id: workflowId ?? null };
      case "reconnect_job":
        if (!jobId) return { error: "job_id is required" };
        void this.reconnectJob(jobId, workflowId);
        return {
          message: `Reconnecting to job ${jobId}`,
          job_id: jobId,
          workflow_id: workflowId ?? null
        };
      case "resume_job":
        if (!jobId) return { error: "job_id is required" };
        void this.resumeJob(jobId, workflowId);
        return {
          message: `Resumption initiated for job ${jobId}`,
          job_id: jobId,
          workflow_id: workflowId ?? null
        };
      case "stream_input":
        if (!jobId) return { error: "job_id is required" };
        {
          const active = this.activeJobs.get(jobId);
          log.info("stream_input command", {
            jobId,
            hasActive: !!active,
            inputName: data.input,
            handle: data.handle,
            hasValue: data.value !== undefined,
            activeJobIds: [...this.activeJobs.keys()]
          });
          if (!active) return { error: "No active job/context" };
          const inputName = typeof data.input === "string" ? data.input : "";
          if (!inputName.trim()) return { error: "Invalid input name" };
          const value = data.value;
          const handle =
            typeof data.handle === "string" ? data.handle : undefined;
          try {
            await active.runner.pushInputValue(inputName, value, handle);
            return {
              message: "Input item streamed",
              job_id: jobId,
              workflow_id: workflowId ?? active.workflowId
            };
          } catch (err) {
            log.error("stream_input failed", {
              error: err instanceof Error ? err.message : String(err)
            });
            return {
              error: err instanceof Error ? err.message : String(err),
              job_id: jobId,
              workflow_id: workflowId ?? active.workflowId
            };
          }
        }
      case "end_input_stream":
        if (!jobId) return { error: "job_id is required" };
        {
          const active = this.activeJobs.get(jobId);
          if (!active) return { error: "No active job/context" };
          const inputName = typeof data.input === "string" ? data.input : "";
          if (!inputName.trim()) return { error: "Invalid input name" };
          const handle =
            typeof data.handle === "string" ? data.handle : undefined;
          try {
            active.runner.finishInputStream(inputName, handle);
            return {
              message: "Input stream ended",
              job_id: jobId,
              workflow_id: workflowId ?? active.workflowId
            };
          } catch (err) {
            return {
              error: err instanceof Error ? err.message : String(err),
              job_id: jobId,
              workflow_id: workflowId ?? active.workflowId
            };
          }
        }
      case "cancel_job":
        if (!jobId) return { error: "job_id is required" };
        return this.cancelJob(jobId, workflowId);
      case "get_status":
        return this.getStatus(jobId);
      case "set_mode": {
        const mode = data.mode;
        if (mode !== "binary" && mode !== "text") {
          return { error: "mode must be binary or text" };
        }
        this.mode = mode;
        return { message: `Mode set to ${mode}` };
      }
      case "chat_message": {
        const threadId = data.thread_id;
        if (typeof threadId !== "string" || threadId.length === 0) {
          return { error: "thread_id is required for chat_message command" };
        }
        this.chatRequestSeq += 1;
        const seq = this.chatRequestSeq;
        this.currentTask = this.handleChatMessage(data, seq);
        void this.currentTask.catch(async (err) => {
          this.logError("chat_message processing failed", err);
          await this.sendMessage({
            type: "error",
            message: err instanceof Error ? err.message : String(err)
          });
        });
        return {
          message: "Chat message processing started",
          thread_id: threadId
        };
      }
      case "inference": {
        this.chatRequestSeq += 1;
        const seq = this.chatRequestSeq;
        this.currentTask = this.handleInference(data, seq);
        void this.currentTask.catch(async (err) => {
          this.logError("inference processing failed", err);
          await this.sendMessage({
            type: "error",
            message: err instanceof Error ? err.message : String(err)
          });
        });
        return { message: "Inference started" };
      }
      case "stop": {
        const threadId =
          typeof data.thread_id === "string" ? data.thread_id : undefined;
        // Always increment seq to cancel any in-progress chat or inference
        this.chatRequestSeq += 1;
        this.currentTask = null;
        if (jobId) {
          const active = this.activeJobs.get(jobId);
          if (active) {
            active.runner.cancel();
            active.finished = true;
            active.status = "cancelled";
          }
        }
        this.toolBridge.cancelAll();
        await this.sendMessage({
          type: "generation_stopped",
          message: "Generation stopped by user",
          job_id: jobId ?? null,
          thread_id: threadId ?? null
        });
        return {
          message: "Stop command processed",
          job_id: jobId ?? null,
          thread_id: threadId ?? null
        };
      }
      default:
        return { error: "Unknown command" };
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({ type: "ping", ts: Date.now() / 1000 }).catch((err) => {
        log.warn("Failed to send heartbeat ping", { error: String(err) });
      });
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startStatsBroadcast(): void {
    this.stopStatsBroadcast();
    this.statsTimer = setInterval(() => {
      this.sendMessage({
        type: "system_stats",
        stats: this.getSystemStats()
      }).catch((err) => {
        log.warn("Failed to send system stats", { error: String(err) });
      });
    }, 1_000);
  }

  private stopStatsBroadcast(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private registerObserver(): void {
    if (this.observerRegistered) return;
    ModelObserver.subscribe(this.onModelChange);
    this.observerRegistered = true;
  }

  private unregisterObserver(): void {
    if (!this.observerRegistered) return;
    ModelObserver.unsubscribe(this.onModelChange);
    this.observerRegistered = false;
  }

  private onModelChange = (
    instance: DBModel,
    event: ModelChangeEvent
  ): void => {
    if (!this.websocket) return;
    void this.sendMessage({
      type: "resource_change",
      event,
      resource_type: instance.constructor.name.toLowerCase(),
      resource: {
        id: instance.partitionValue(),
        etag: instance.getEtag()
      }
    });
  };

  async run(websocket: WebSocketConnection): Promise<void> {
    await this.connect(
      websocket,
      this.userId ?? undefined,
      this.authToken ?? undefined
    );
    try {
      await this.receiveMessages();
    } finally {
      await this.disconnect();
    }
  }

  async receiveMessages(): Promise<void> {
    while (true) {
      const data = await this.receiveMessage();
      if (data === null) break;

      const msgType = typeof data.type === "string" ? data.type : null;
      if (msgType === "client_tools_manifest") {
        const tools = Array.isArray(data.tools) ? data.tools : [];
        this.clientToolsManifest = {};
        for (const tool of tools) {
          if (
            tool &&
            typeof tool === "object" &&
            typeof (tool as Record<string, unknown>).name === "string"
          ) {
            const name = (tool as Record<string, unknown>).name as string;
            this.clientToolsManifest[name] = tool as Record<string, unknown>;
          }
        }
        continue;
      }

      if (msgType === "tool_result") {
        const toolCallId =
          typeof data.tool_call_id === "string" ? data.tool_call_id : null;
        if (toolCallId) {
          this.toolBridge.resolveResult(toolCallId, data);
        }
        continue;
      }

      if (msgType === "ping") {
        await this.sendMessage({ type: "pong", ts: Date.now() / 1000 });
        continue;
      }

      if (typeof data.command === "string") {
        try {
          const command = data as unknown as WebSocketCommandEnvelope;
          const response = await this.handleCommand(command);
          await this.sendMessage(response);
        } catch (err) {
          this.logError("invalid_command handling failed", err);
          await this.sendMessage({
            error: "invalid_command",
            details: err instanceof Error ? err.message : String(err)
          });
        }
        continue;
      }

      await this.sendMessage({
        error: "invalid_message",
        message:
          "All messages must include a 'command' field. Use 'chat_message' command for chat."
      });
    }
  }
}
