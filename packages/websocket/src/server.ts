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
import {
  AnthropicProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  MistralProvider,
  GroqProvider,
} from "@nodetool/runtime";
import { getSecret } from "@nodetool/security";
import { UnifiedWebSocketRunner, type WebSocketConnection } from "./unified-websocket-runner.js";
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
const graphNodeTypeResolver = createGraphNodeTypeResolver(registry);

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
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws: any) => {
    ws.on("error", (error: Error) => {
      log.error("WebSocket client error", error);
    });
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => registry.resolve(node),
      resolveNodeType: graphNodeTypeResolver,
      resolveProvider,
      resolveTools,
    });
    log.info("WebSocket client connected");
    void runner.run(new WsAdapter(ws)).catch((error) => {
      log.error("Runner crashed", error instanceof Error ? error : new Error(String(error)));
    });
  });
});

server.listen(port, host, () => {
  log.info(`Server listening on http://${host}:${port}`);
  log.info(`WebSocket endpoint: ws://${host}:${port}/ws`);
});
