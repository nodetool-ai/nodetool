/**
 * HTTP MCP server that exposes NodeTool UI tools.
 *
 * Implements the MCP Streamable HTTP transport so any agent SDK
 * (Claude, Codex, OpenCode) can connect to it as an MCP server.
 *
 * Tool calls are forwarded to the renderer whose session originated the
 * connection via the `AgentTransport` for execution against the live
 * workflow graph. The session identity is encoded in the URL path as
 * `/mcp/<sessionId>` so simultaneous sessions from different renderers
 * can't clobber each other's tool routing.
 */

import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createLogger } from "@nodetool-ai/config";
import { uiToolSchemas } from "@nodetool-ai/protocol";
import { z, toJSONSchema } from "zod";
import type { AgentTransport } from "./transport.js";

const log = createLogger("nodetool.websocket.agent.mcp");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

// ---------------------------------------------------------------------------
// Tool schema conversion
// ---------------------------------------------------------------------------

function zodShapeToJsonSchema(zodShape: Record<string, z.ZodTypeAny>): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  const schema = z.object(zodShape);
  const jsonSchema = toJSONSchema(schema) as Record<string, unknown>;
  // Remove $schema key — MCP inputSchema doesn't need it
  delete jsonSchema.$schema;
  return {
    type: "object",
    properties: (jsonSchema.properties ?? {}) as Record<string, unknown>,
    required: jsonSchema.required as string[] | undefined,
  };
}

function buildToolDefinitions(): McpToolDefinition[] {
  return Object.entries(uiToolSchemas).map(([name, schema]) => ({
    name,
    description: schema.description,
    inputSchema: zodShapeToJsonSchema(
      schema.parameters as Record<string, z.ZodTypeAny>,
    ),
  }));
}

// ---------------------------------------------------------------------------
// MCP HTTP Server (singleton)
// ---------------------------------------------------------------------------

let serverInstance: Server | null = null;
let serverPort: number | null = null;

/**
 * Session ID → transport mapping. Each agent session has its own entry so
 * tool calls are routed to the renderer that originated that session. This
 * replaces the earlier "active transport" global, which was unsafe when
 * multiple renderers were connected simultaneously.
 */
const sessionTransports = new Map<string, AgentTransport>();

/** Default CORS origins allowed to hit the MCP HTTP server. */
const DEFAULT_ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  // Electron renderer
  /^file:\/\//,
];

function isOriginAllowed(origin: string | undefined): boolean {
  // MCP SDK clients (Claude/Codex) typically don't send an Origin header.
  // In that case there's no browser enforcing CORS, so allow the request.
  if (!origin) return true;
  return DEFAULT_ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function extractSessionIdFromPath(path: string | undefined): string | null {
  if (!path) return null;
  // URL is `/mcp/<sessionId>` (optionally with a trailing slash or query).
  const match = /^\/mcp\/([^/?#]+)\/?/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const origin = req.headers.origin as string | undefined;
  if (isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const sessionId = extractSessionIdFromPath(req.url);
  if (!sessionId) {
    sendJson(res, 404, {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32601, message: "Session ID missing from MCP URL path" },
    });
    return;
  }

  let rpcRequest: McpJsonRpcRequest;
  try {
    const body = await readBody(req);
    rpcRequest = JSON.parse(body) as McpJsonRpcRequest;
  } catch {
    sendJson(res, 400, {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }

  const response = await handleRpcMethod(rpcRequest, sessionId);
  sendJson(res, 200, response);
}

async function handleRpcMethod(
  request: McpJsonRpcRequest,
  sessionId: string,
): Promise<McpJsonRpcResponse> {
  const { id, method, params } = request;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "nodetool-ui", version: "1.0.0" },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: buildToolDefinitions() },
      };

    case "tools/call": {
      const toolName = params?.name as string;
      const toolArgs = params?.arguments as Record<string, unknown> | undefined;

      if (!toolName || !uiToolSchemas[toolName]) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown tool: ${toolName}` },
        };
      }

      const transport = sessionTransports.get(sessionId);
      if (!transport || !transport.isAlive) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text:
                  "Error: No active renderer for this session — open a workflow in NodeTool first.",
              },
            ],
            isError: true,
          },
        };
      }

      try {
        const result = await transport.executeTool(
          sessionId,
          `mcp-${id}`,
          toolName,
          toolArgs ?? {},
        );
        const text =
          typeof result === "string"
            ? result
            : JSON.stringify(result ?? null);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text }],
            isError: false,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
          },
        };
      }
    }

    case "notifications/initialized":
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function ensureServerStarted(): Promise<void> {
  if (serverInstance && serverPort) return;

  await new Promise<void>((resolve, reject) => {
    const server = createServer((req, res) => {
      handleMcpRequest(req, res).catch((err) => {
        log.error(
          "MCP server error",
          err instanceof Error ? err : new Error(String(err)),
        );
        sendJson(res, 500, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: "Internal error" },
        });
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to get MCP server address"));
        return;
      }
      serverPort = addr.port;
      serverInstance = server;
      log.info(`MCP tool server listening at http://127.0.0.1:${serverPort}`);
      resolve();
    });

    server.on("error", (err) => {
      log.error("MCP tool server error", err);
      reject(err);
    });
  });
}

/**
 * Start (if needed) the MCP HTTP server and register `transport` as the
 * executor for `sessionId`. Returns the session-scoped MCP URL to hand to
 * the agent SDK.
 */
export async function startMcpToolServer(
  transport: AgentTransport,
  sessionId: string,
): Promise<string> {
  await ensureServerStarted();
  sessionTransports.set(sessionId, transport);
  return `http://127.0.0.1:${serverPort}/mcp/${encodeURIComponent(sessionId)}`;
}

/** Update the transport associated with an existing session. */
export function setMcpToolServerTransport(
  transport: AgentTransport,
  sessionId: string,
): void {
  sessionTransports.set(sessionId, transport);
}

/**
 * Remove all session→transport mappings pointing at the given transport.
 * Called when a renderer disconnects so we don't keep dead references.
 */
export function clearMcpToolServerTransport(transport: AgentTransport): void {
  for (const [sessionId, t] of sessionTransports.entries()) {
    if (t === transport) {
      sessionTransports.delete(sessionId);
    }
  }
}

/** Drop a single session's transport mapping. */
export function clearMcpToolServerSession(sessionId: string): void {
  sessionTransports.delete(sessionId);
}

/** Get the MCP server URL for an already-registered session, or null. */
export function getMcpToolServerUrl(sessionId: string): string | null {
  if (serverInstance && serverPort && sessionTransports.has(sessionId)) {
    return `http://127.0.0.1:${serverPort}/mcp/${encodeURIComponent(sessionId)}`;
  }
  return null;
}

/** Stop the MCP tool server. */
export function stopMcpToolServer(): void {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    serverPort = null;
    sessionTransports.clear();
    log.info("MCP tool server stopped");
  }
}
