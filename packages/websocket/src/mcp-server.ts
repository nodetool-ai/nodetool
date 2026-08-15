/**
 * MCP (Model Context Protocol) server for NodeTool.
 *
 * The mount exposes the CodeAct action, direct image/discovery tools, and
 * renderer steering tools on the CodeAct belt. A connected editor is reached
 * through the shared `/ws` renderer registry.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MCP_GUEST_CONTRACT } from "@nodetool-ai/agents";
import { createLogger } from "@nodetool-ai/config";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { FrontendRendererService } from "./frontend-renderer-registry.js";
import { registerAgentMcpTools } from "./mcp-agent-tools.js";

export interface McpServerOptions {
  metadataRoots?: string[];
  metadataMaxDepth?: number;
  registry?: NodeRegistry;
  frontendRendererRegistry?: FrontendRendererService;
  /** Static example workflows directory — same as HttpApiOptions.examplesDir. */
  examplesDir?: string;
  /**
   * User scope for the session. Required: every capability runs against one
   * user's secrets and assets, so a session that cannot name a user has no
   * surface at all. `source` documents why the binding is safe: "stdio-local"
   * (single-user `nodetool mcp serve`) or "local-dev-http" (the non-production
   * /mcp mount). An authenticated multi-user mount must pass the session's real
   * userId here.
   */
  agentToolsScope?: {
    userId: string;
    source: "stdio-local" | "local-dev-http" | "http-session";
  };
}

/**
 * Refusal message for a session that cannot be bound to a user. Names the fix,
 * because the caller cannot see which mount answered them.
 */
export const MCP_SCOPE_REQUIRED_MESSAGE =
  "NodeTool MCP sessions must be bound to a user. This mount could not " +
  "authenticate one. Fix: sign in so the mount can bind the session's user id, " +
  "or run `nodetool mcp serve` for a single-user stdio mount.";

const log = createLogger("nodetool.websocket.mcp-server");

/**
 * Create a configured MCP server: `execute_code`, `view_image`, the
 * capabilities and sandbox resources, and the guest-contract instructions.
 *
 * Throws when `agentToolsScope` is missing — a session with no user binding
 * would hold zero tools, which is a server that answers and cannot act.
 */
export function createMcpServer(options?: McpServerOptions): McpServer {
  if (!options?.agentToolsScope) {
    throw new Error(MCP_SCOPE_REQUIRED_MESSAGE);
  }

  const server = new McpServer(
    {
      name: "NodeTool API Server",
      version: "1.0.0"
    },
    { instructions: MCP_GUEST_CONTRACT }
  );

  registerAgentMcpTools(server, options);

  return server;
}

/**
 * Create a stdio transport for CLI mode.
 */
export function createMcpStdioTransport(): StdioServerTransport {
  return new StdioServerTransport();
}

// Per-session transport map for stateful HTTP MCP
const sessionTransports = new Map<
  string,
  WebStandardStreamableHTTPServerTransport
>();

export function getLocalMcpServerUrl(): string {
  const port = Number(process.env["PORT"] ?? 7777);
  const tlsEnabled = Boolean(process.env["TLS_CERT"] && process.env["TLS_KEY"]);
  const protocol = tlsEnabled ? "https" : "http";
  return `${protocol}://127.0.0.1:${port}/mcp`;
}

/** JSON-RPC refusal for an initialize the mount cannot scope to a user. */
function scopeRefusal(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: MCP_SCOPE_REQUIRED_MESSAGE }
    }),
    { status: 401, headers: { "content-type": "application/json" } }
  );
}

/**
 * Handle an MCP HTTP request at the /mcp path.
 * Uses WebStandardStreamableHTTPServerTransport for stateful sessions.
 */
export async function handleMcpHttpRequest(
  request: Request,
  options?: McpServerOptions
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/mcp")) return null;

  const method = request.method;

  if (method === "POST") {
    // Check for existing session
    const sessionId = request.headers.get("mcp-session-id");
    if (sessionId && sessionTransports.has(sessionId)) {
      const transport = sessionTransports.get(sessionId)!;
      return transport.handleRequest(request);
    }
    // A session id that is present but unknown must NOT fall through to the
    // new-session path: that constructed a fresh transport + server per stale
    // request (leaking both). Reject it — only an initialize request without a
    // session id creates a new session.
    if (sessionId) {
      return new Response("Session not found", { status: 404 });
    }

    // A session this mount cannot bind to a user is refused here, at
    // initialize, rather than answering with an empty surface.
    if (!options?.agentToolsScope) {
      log.warn("Refusing MCP session: no authenticated user to bind");
      return scopeRefusal();
    }

    // New session — create transport and server
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessionTransports.set(id, transport);
      }
    });
    // Evict the session when the transport closes (client disconnect without an
    // explicit DELETE) so sessionTransports — and the McpServer each entry keeps
    // alive — does not grow unbounded over the process lifetime.
    transport.onclose = () => {
      if (transport.sessionId) sessionTransports.delete(transport.sessionId);
    };

    const server = createMcpServer(options);
    await server.connect(transport);
    return transport.handleRequest(request);
  }

  if (method === "GET") {
    const sessionId = request.headers.get("mcp-session-id");
    if (sessionId && sessionTransports.has(sessionId)) {
      const transport = sessionTransports.get(sessionId)!;
      return transport.handleRequest(request);
    }
    return new Response("Session not found", { status: 404 });
  }

  if (method === "DELETE") {
    const sessionId = request.headers.get("mcp-session-id");
    if (sessionId && sessionTransports.has(sessionId)) {
      const transport = sessionTransports.get(sessionId)!;
      const response = await transport.handleRequest(request);
      sessionTransports.delete(sessionId);
      return response;
    }
    return new Response("Session not found", { status: 404 });
  }

  return new Response("Method not allowed", { status: 405 });
}
