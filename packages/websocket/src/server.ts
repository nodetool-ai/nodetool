#!/usr/bin/env node
/**
 * NodeTool WebSocket + HTTP server entry point.
 *
 * Uses real LLM providers resolved from environment variables / encrypted DB secrets.
 * Connect the CLI with: npm run chat -- --url ws://localhost:7777/ws
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import { createLogger } from "@nodetool/config";
import { WebSocketServer } from "ws";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool/node-sdk";
import { registerBaseNodes } from "@nodetool/base-nodes";
import { registerFalNodes } from "@nodetool/fal-nodes";
import { registerReplicateNodes } from "@nodetool/replicate-nodes";
import {
  AnthropicProvider,
  FakeProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  MistralProvider,
  GroqProvider,
  ReplicateProvider,
  setSecretResolver,
  PythonBridge,
  PythonNodeExecutor,
} from "@nodetool/runtime";
import { getSecret } from "@nodetool/security";
import { UnifiedWebSocketRunner, type WebSocketConnection } from "./unified-websocket-runner.js";
import { registerPythonProviders } from "./models-api.js";
import {
  Tool,
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool,
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool,
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool,
  BrowserTool,
  ScreenshotTool,
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  DownloadFileTool,
  HttpRequestTool,
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  CalculatorTool,
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool,
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool,
  SaveAssetTool,
  ReadAssetTool,
} from "@nodetool/agents";
import { handleNodeHttpRequest, type HttpApiOptions } from "./http-api.js";
import {
  SQLiteAdapterFactory,
  setGlobalAdapterResolver,
  Secret,
  Workflow,
  WorkflowVersion,
  Job,
  Message,
  Thread,
  Asset,
} from "@nodetool/models";

const log = createLogger("nodetool.websocket.server");

/** Resolve a secret: encrypted DB first (user "1"), then env var. */
async function resolveKey(key: string): Promise<string | undefined> {
  return (await getSecret(key, "1")) ?? undefined;
}

async function resolveProvider(providerId: string) {
  switch (providerId.toLowerCase()) {
    case "fake":
      return new FakeProvider();
    case "anthropic":
      return new AnthropicProvider({ ANTHROPIC_API_KEY: await resolveKey("ANTHROPIC_API_KEY") });
    case "openai":
      return new OpenAIProvider({ OPENAI_API_KEY: await resolveKey("OPENAI_API_KEY") });
    case "gemini":
      return new GeminiProvider({ GEMINI_API_KEY: await resolveKey("GEMINI_API_KEY") });
    case "mistral":
      return new MistralProvider({ MISTRAL_API_KEY: await resolveKey("MISTRAL_API_KEY") });
    case "groq":
      return new GroqProvider({ GROQ_API_KEY: await resolveKey("GROQ_API_KEY") });
    case "replicate":
      return new ReplicateProvider({ REPLICATE_API_TOKEN: await resolveKey("REPLICATE_API_TOKEN") });
    case "ollama":
    default:
      return new OllamaProvider({ OLLAMA_API_URL: await resolveKey("OLLAMA_API_URL") });
  }
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const dbPath = process.env["DB_PATH"] ?? join(homedir(), ".local", "share", "nodetool", "nodetool.sqlite3");
try {
  const factory = new SQLiteAdapterFactory(dbPath);
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
  await Promise.all([
    Workflow.createTable(),
    WorkflowVersion.createTable(),
    Job.createTable(),
    Message.createTable(),
    Thread.createTable(),
    Asset.createTable(),
    Secret.createTable(),
  ]);
  log.info("Database ready", { path: dbPath });

  // Wire up the provider registry so it can resolve secrets from the DB
  setSecretResolver((key) => getSecret(key, "1").then((v) => v ?? undefined));
} catch (err) {
  log.error("Database setup failed", err instanceof Error ? err : new Error(String(err)));
}

// ---------------------------------------------------------------------------
// Metadata root detection — find Python package_metadata directories
// ---------------------------------------------------------------------------

function hasMetadataLayout(root: string): boolean {
  return (
    existsSync(join(root, "src", "nodetool", "package_metadata")) ||
    existsSync(join(root, "nodetool", "package_metadata"))
  );
}

function detectMetadataRoots(): string[] {
  if (process.env["METADATA_ROOTS"]) {
    return process.env["METADATA_ROOTS"].split(":").filter(Boolean);
  }

  const candidates = new Set<string>();
  let cur = resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    candidates.add(cur);
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  // Also check siblings in the workspace root (e.g. nodetool-* repos)
  // Walk up from cwd to find the workspace root
  cur = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    try {
      for (const entry of readdirSync(cur, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.toLowerCase().startsWith("nodetool")) {
          candidates.add(join(cur, entry.name));
        }
      }
    } catch {
      // ignore
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  return [...candidates].filter(hasMetadataLayout);
}

const metadataRoots = detectMetadataRoots();
log.info("Metadata roots", { roots: metadataRoots });

// ---------------------------------------------------------------------------
// Node registry
// ---------------------------------------------------------------------------

const registry = new NodeRegistry();
registry.loadPythonMetadata({ roots: metadataRoots, maxDepth: 8 });
registerBaseNodes(registry);
registerFalNodes(registry);
registerReplicateNodes(registry);
const graphNodeTypeResolver = createGraphNodeTypeResolver(registry);

// ---------------------------------------------------------------------------
// Python bridge — connects to nodetool_worker for HF / MLX / other Python nodes
// ---------------------------------------------------------------------------

const pythonBridge = new PythonBridge({
  workerArgs: process.env["NODETOOL_WORKER_NAMESPACES"]
    ? ["--namespaces", process.env["NODETOOL_WORKER_NAMESPACES"]]
    : [],
});

let pythonBridgeReady = false;

pythonBridge.on("stderr", (msg: string) => {
  for (const line of msg.split("\n")) {
    if (line.trim()) log.debug(`[python-worker] ${line}`);
  }
});

pythonBridge.on("exit", (code: number) => {
  log.warn(`Python worker exited with code ${code}`);
  pythonBridgeReady = false;
});

// Bridge connection is awaited at server startup (see bottom of file)

// ---------------------------------------------------------------------------
// Built-in tool registry for chat tool execution
// ---------------------------------------------------------------------------

const builtinToolClasses: (new () => Tool)[] = [
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool,
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool,
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool,
  BrowserTool,
  ScreenshotTool,
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  DownloadFileTool,
  HttpRequestTool,
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  CalculatorTool,
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool,
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool,
  SaveAssetTool,
  ReadAssetTool,
];

const toolClassMap = new Map<string, new () => Tool>();
for (const cls of builtinToolClasses) {
  const instance = new cls();
  toolClassMap.set(instance.name, cls);
}

async function resolveTools(toolNames: string[]): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const name of toolNames) {
    const cls = toolClassMap.get(name);
    if (cls) {
      tools.push(new cls());
    }
  }
  return tools;
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------

const host = process.env["HOST"] ?? "127.0.0.1";
const port = Number(process.env["PORT"] ?? 7777);

const apiOptions: HttpApiOptions = { metadataRoots, registry };

// Adapter: bridge ws.WebSocket to WebSocketConnection interface
class WsAdapter implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";

  private queue: Array<{ type: string; bytes?: Uint8Array | null; text?: string | null }> = [];
  private waiters: Array<(frame: { type: string; bytes?: Uint8Array | null; text?: string | null }) => void> = [];

  constructor(private socket: any) {
    socket.on("message", (raw: any, isBinary: boolean) => {
      const frame = isBinary
        ? { type: "websocket.message", bytes: raw instanceof Uint8Array ? raw : new Uint8Array(raw as Buffer) }
        : { type: "websocket.message", text: raw.toString() };
      const waiter = this.waiters.shift();
      if (waiter) waiter(frame);
      else this.queue.push(frame);
    });

    socket.on("close", () => {
      this.clientState = "disconnected";
      this.applicationState = "disconnected";
      const waiter = this.waiters.shift();
      if (waiter) waiter({ type: "websocket.disconnect" });
    });
  }

  async accept(): Promise<void> {}

  async receive(): Promise<{ type: string; bytes?: Uint8Array | null; text?: string | null }> {
    const next = this.queue.shift();
    if (next) return next;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async sendBytes(data: Uint8Array): Promise<void> {
    this.socket.send(data);
  }

  async sendText(data: string): Promise<void> {
    this.socket.send(data);
  }

  async close(code?: number, reason?: string): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
    this.socket.close(code, reason);
  }
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (req.url?.startsWith("/api/") || req.url?.startsWith("/v1/") || req.url?.startsWith("/admin/")) {
    void handleNodeHttpRequest(req, res, apiOptions);
    return;
  }
  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ detail: "Not found" }));
});

const wss = new WebSocketServer({ noServer: true });

wss.on("error", (error: Error) => {
  log.error("WebSocketServer error", error);
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (url.pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws: any) => {
      ws.on("error", (error: Error) => {
        log.error("WebSocket client error", error);
      });
      const runner = new UnifiedWebSocketRunner({
        resolveExecutor: (node) => {
          // Try TS registry first — if we have a class, use it
          if (registry.has(node.type)) {
            return registry.resolve(node);
          }
          // No TS class — route through Python bridge
          if (pythonBridgeReady && pythonBridge.hasNodeType(node.type)) {
            const meta = pythonBridge
              .getNodeMetadata()
              .find((n) => n.node_type === node.type);
            const nodeRec = node as Record<string, unknown>;
            const props = (nodeRec.properties ?? nodeRec.data ?? {}) as Record<string, unknown>;
            return new PythonNodeExecutor(
              pythonBridge,
              node.type,
              props,
              Object.fromEntries(
                (meta?.outputs ?? []).map((o) => [o.name, o.type.type]),
              ),
              meta?.required_settings ?? [],
            );
          }
          // Node has metadata but no class and bridge not ready
          if (registry.getMetadata(node.type) && !registry.has(node.type)) {
            throw new Error(
              `Python node "${node.type}" cannot execute: Python worker is not connected. ` +
              `Ensure NODETOOL_PYTHON points to a Python with nodetool-core installed, ` +
              `or activate the conda nodetool environment before starting the server.`,
            );
          }
          return registry.resolve(node);
        },
        resolveNodeType: graphNodeTypeResolver,
        resolveProvider,
        resolveTools,
      });
      log.info("WebSocket client connected");
      void runner.run(new WsAdapter(ws)).catch((error) => {
        log.error("Runner crashed", error instanceof Error ? error : new Error(String(error)));
      });
    });
    return;
  }

  if (url.pathname === "/ws/terminal") {
    wss.handleUpgrade(request, socket, head, (ws: any) => {
      ws.on("error", (error: Error) => {
        log.error("Terminal WebSocket error", error);
      });
      log.info("Terminal WebSocket client connected");
      ws.send(JSON.stringify({ type: "output", data: "Terminal connected.\r\n" }));
      ws.on("message", (raw: any) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "input") {
            // Echo input back for now
            ws.send(JSON.stringify({ type: "output", data: msg.data }));
          }
        } catch {
          // ignore non-JSON messages
        }
      });
    });
    return;
  }

  if (url.pathname === "/ws/download") {
    wss.handleUpgrade(request, socket, head, (ws: any) => {
      ws.on("error", (error: Error) => {
        log.error("Download WebSocket error", error);
      });
      log.info("Download WebSocket client connected");

      // Lazy import to avoid circular deps at module level
      import("@nodetool/huggingface").then(({ getDownloadManager }) => {
        ws.on("message", async (raw: any) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.command === "start_download") {
              const manager = await getDownloadManager();
              await manager.startDownload(msg.repo_id ?? "", {
                path: msg.path ?? null,
                allowPatterns: msg.allow_patterns ?? null,
                ignorePatterns: msg.ignore_patterns ?? null,
                cacheDir: msg.cache_dir ?? null,
                modelType: msg.model_type ?? null,
                onProgress: (update) => {
                  try { ws.send(JSON.stringify(update)); } catch { /* client gone */ }
                },
              });
            } else if (msg.command === "cancel_download") {
              const manager = await getDownloadManager();
              manager.cancelDownload(msg.repo_id ?? msg.id ?? "");
            }
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            ws.send(JSON.stringify({ status: "error", error }));
          }
        });
      }).catch((err: unknown) => {
        log.error("Failed to load @nodetool/huggingface", err instanceof Error ? err : new Error(String(err)));
      });
    });
    return;
  }

  socket.destroy();
});

// Start Python bridge, then listen
pythonBridge
  .connect()
  .then(() => {
    pythonBridgeReady = true;
    const meta = pythonBridge.getNodeMetadata();
    log.info(`Python bridge connected — ${meta.length} Python nodes available`);

    // Register Python-only providers (HuggingFace Local, MLX) for model discovery.
    // Fire-and-forget — don't block server startup.
    registerPythonProviders(pythonBridge)
      .then((registered) => {
        if (registered.length > 0) {
          log.info(`Registered Python providers: ${registered.join(", ")}`);
        }
      })
      .catch((err) => {
        log.warn("Failed to register Python providers", err instanceof Error ? err : new Error(String(err)));
      });
  })
  .catch((err) => {
    log.warn(
      "Python bridge failed to start (Python nodes will not be available)",
      err instanceof Error ? err : new Error(String(err)),
    );
  })
  .finally(() => {
    server.listen(port, host, () => {
      log.info(`Server listening on http://${host}:${port}`);
      log.info(`WebSocket endpoint: ws://${host}:${port}/ws`);
    });
  });
