/**
 * HTTP MCP server that exposes NodeTool UI tools.
 *
 * Implements the MCP Streamable HTTP transport so any agent SDK
 * (Claude, Codex, OpenCode) can connect to it as an MCP server.
 *
 * Tool calls are forwarded to the active renderer via the
 * `AgentTransport` for execution against the live workflow graph.
 */

import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createLogger } from "@nodetool/config";
import { uiToolSchemas } from "@nodetool/protocol";
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
 * The currently-active transport that should receive tool calls coming in
 * over MCP. Last writer wins — the most recently connected renderer becomes
 * the tool executor for incoming MCP requests.
 */
let activeTransport: AgentTransport | null = null;

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

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
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

  const response = await handleRpcMethod(rpcRequest);
  sendJson(res, 200, response);
}

async function handleRpcMethod(
  request: McpJsonRpcRequest,
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

      if (!activeTransport || !activeTransport.isAlive) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text:
                  "Error: No active renderer — open a workflow in NodeTool first.",
              },
            ],
            isError: true,
          },
        };
      }

      try {
        const result = await activeTransport.executeTool(
          "mcp-server",
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

/**
 * Start the MCP HTTP server. Returns the URL to connect to.
 * If already running, returns the existing URL and updates the active
 * transport.
 */
export async function startMcpToolServer(
  transport: AgentTransport,
): Promise<string> {
  activeTransport = transport;

  if (serverInstance && serverPort) {
    return `http://127.0.0.1:${serverPort}/mcp`;
  }

  return new Promise((resolve, reject) => {
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
      const url = `http://127.0.0.1:${serverPort}/mcp`;
      log.info(`MCP tool server started at ${url}`);
      resolve(url);
    });

    server.on("error", (err) => {
      log.error("MCP tool server error", err);
      reject(err);
    });
  });
}

/** Update the active transport for tool execution. */
export function setMcpToolServerTransport(transport: AgentTransport): void {
  activeTransport = transport;
}

/**
 * Clear the transport reference if it matches the given one. Used when a
 * client disconnects so we don't keep a dead reference around.
 */
export function clearMcpToolServerTransport(transport: AgentTransport): void {
  if (activeTransport === transport) {
    activeTransport = null;
  }
}

/** Get the MCP server URL if running, or null. */
export function getMcpToolServerUrl(): string | null {
  if (serverInstance && serverPort) {
    return `http://127.0.0.1:${serverPort}/mcp`;
  }
  return null;
}

/** Stop the MCP tool server. */
export function stopMcpToolServer(): void {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    serverPort = null;
    activeTransport = null;
    log.info("MCP tool server stopped");
  }
}
