/**
 * HTTP MCP server that exposes NodeTool UI tools.
 *
 * Implements the MCP Streamable HTTP transport so any agent SDK
 * (Claude, Codex, OpenCode) can connect to it as an MCP server.
 *
 * Tool calls are forwarded to the Electron renderer process via IPC
 * for execution against the live workflow graph.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { logMessage } from "./logger";
import { uiToolSchemas } from "@nodetool/protocol";
import type { WebContents } from "electron";
import { ipcMain } from "electron";
import { IpcChannels } from "./types.d";
import { z, toJSONSchema } from "zod";

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
    required: jsonSchema.required as string[] | undefined
  };
}

function buildToolDefinitions(): McpToolDefinition[] {
  return Object.entries(uiToolSchemas).map(([name, schema]) => ({
    name,
    description: schema.description,
    inputSchema: zodShapeToJsonSchema(schema.parameters as Record<string, z.ZodTypeAny>),
  }));
}

// ---------------------------------------------------------------------------
// Tool execution via IPC
// ---------------------------------------------------------------------------

const TOOL_TIMEOUT_MS = 15000;

async function executeToolViaIpc(
  webContents: WebContents,
  toolName: string,
  args: unknown,
): Promise<unknown> {
  const requestId = randomUUID();
  const toolCallId = randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeListener(IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE, onResponse);
      reject(new Error(`Tool ${toolName} timed out after ${TOOL_TIMEOUT_MS}ms`));
    }, TOOL_TIMEOUT_MS);

    const onResponse = (
      event: Electron.IpcMainEvent,
      response: {
        requestId?: string;
        result?: { result: unknown; isError: boolean; error?: string };
      },
    ) => {
      if (event.sender !== webContents) return;
      if (!response || response.requestId !== requestId) return;

      clearTimeout(timeout);
      ipcMain.removeListener(IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE, onResponse);

      const toolResult = response.result;
      if (!toolResult) {
        reject(new Error(`No result from tool ${toolName}`));
        return;
      }
      if (toolResult.isError) {
        reject(new Error(toolResult.error ?? `Tool ${toolName} failed`));
        return;
      }
      resolve(toolResult.result);
    };

    ipcMain.on(IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE, onResponse);
    webContents.send(IpcChannels.FRONTEND_TOOLS_CALL_REQUEST, {
      requestId,
      sessionId: "mcp-server",
      toolCallId,
      name: toolName,
      args,
    });
  });
}

// ---------------------------------------------------------------------------
// MCP HTTP Server
// ---------------------------------------------------------------------------

let serverInstance: Server | null = null;
let serverPort: number | null = null;
let activeWebContents: WebContents | null = null;

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
  // CORS headers for local access
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

      if (!activeWebContents || activeWebContents.isDestroyed()) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: "Error: No active renderer — open a workflow in NodeTool first." }],
            isError: true,
          },
        };
      }

      try {
        const result = await executeToolViaIpc(activeWebContents, toolName, toolArgs ?? {});
        const text = typeof result === "string" ? result : JSON.stringify(result ?? null);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text }],
            isError: false,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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
 * If already running, returns the existing URL.
 */
export async function startMcpToolServer(webContents: WebContents): Promise<string> {
  activeWebContents = webContents;

  if (serverInstance && serverPort) {
    return `http://127.0.0.1:${serverPort}/mcp`;
  }

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handleMcpRequest(req, res).catch((err) => {
        logMessage(`MCP server error: ${err}`, "error");
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
      logMessage(`MCP tool server started at ${url}`);
      resolve(url);
    });

    server.on("error", (err) => {
      logMessage(`MCP tool server error: ${err}`, "error");
      reject(err);
    });
  });
}

/**
 * Update the active WebContents for tool execution.
 */
export function setMcpToolServerWebContents(webContents: WebContents): void {
  activeWebContents = webContents;
}

/**
 * Get the MCP server URL if running, or null.
 */
export function getMcpToolServerUrl(): string | null {
  if (serverInstance && serverPort) {
    return `http://127.0.0.1:${serverPort}/mcp`;
  }
  return null;
}

/**
 * Stop the MCP tool server.
 */
export function stopMcpToolServer(): void {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    serverPort = null;
    activeWebContents = null;
    logMessage("MCP tool server stopped");
  }
}
