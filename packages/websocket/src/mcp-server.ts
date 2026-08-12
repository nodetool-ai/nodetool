/**
 * MCP (Model Context Protocol) server for NodeTool.
 *
 * The mount exposes exactly two tools: `execute_code` — the CodeAct action the
 * in-app chat agent runs on — and `view_image`, which is direct because pixels
 * cannot ride a sandbox action's JSON observation envelope. Everything else
 * NodeTool can do is reached from inside an action, through the belt and the
 * `nodetool.*` object model, and is catalogued on `nodetool://capabilities`
 * and `nodetool://sandbox`.
 *
 * This file used to hand-build a second product surface here: native
 * `run_workflow` / `get_asset` / `get_node_info` / collection tools, a flat
 * `ui_*` renderer bridge, and seven MCP App HTML views. All of it is gone; what
 * remains is session plumbing plus the renderer transport map the bridged
 * `ui_*` belt entries route through.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MCP_GUEST_CONTRACT } from "@nodetool-ai/agents";
import { createLogger } from "@nodetool-ai/config";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { AgentTransport } from "./agent/transport.js";
import { registerAgentMcpTools } from "./mcp-agent-tools.js";

export interface McpServerOptions {
  metadataRoots?: string[];
  metadataMaxDepth?: number;
  registry?: NodeRegistry;
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
 * Renderer transports keyed by `transport.id`. Each connected NodeTool editor
 * registers here on connect (see the agent WebSocket route), so the shared
 * `/mcp` endpoint can route `ui_*` belt calls to a specific live editor.
 * `activeFrontendRendererId` tracks the most-recently-active renderer, used
 * when a caller doesn't name one.
 */
const frontendTransports = new Map<string, AgentTransport>();
let activeFrontendRendererId: string | null = null;

function resolveFrontendTransport(
  rendererId?: string | null
): AgentTransport | null {
  if (rendererId) {
    const target = frontendTransports.get(rendererId);
    return target && target.isAlive ? target : null;
  }
  if (activeFrontendRendererId) {
    const active = frontendTransports.get(activeFrontendRendererId);
    if (active && active.isAlive) return active;
  }
  // Fall back to any live renderer so single-editor setups need no id.
  const alive = [...frontendTransports.values()].filter((t) => t.isAlive);
  return alive[alive.length - 1] ?? null;
}

function listFrontendRenderers(): { renderer_id: string; active: boolean }[] {
  return [...frontendTransports.values()]
    .filter((t) => t.isAlive)
    .map((t) => ({
      renderer_id: t.id,
      active: t.id === activeFrontendRendererId
    }));
}

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

  registerAgentMcpTools(server, options, {
    execute: async (toolName, args) => {
      const { renderer_id, ...toolArgs } = args;
      const rendererId =
        typeof renderer_id === "string" ? renderer_id : undefined;
      const transport = resolveFrontendTransport(rendererId);
      if (!transport || !transport.isAlive) return { handled: false };
      const result = await transport.executeTool(
        transport.id,
        `mcp-ui-${toolName}-${crypto.randomUUID()}`,
        toolName,
        toolArgs
      );
      return { handled: true, result };
    },
    listRenderers: listFrontendRenderers
  });

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

/**
 * Register a renderer as available for `ui_*` routing and mark it active.
 * Called when an editor's agent WebSocket connects, so an action can steer a
 * connected editor over the shared `/mcp` endpoint without first priming an
 * in-app agent turn.
 */
export function registerMcpFrontendTransport(transport: AgentTransport): void {
  frontendTransports.set(transport.id, transport);
  activeFrontendRendererId = transport.id;
}

/** Promote an already-registered renderer to be the active default. */
export function setActiveMcpFrontendRenderer(transport: AgentTransport): void {
  if (frontendTransports.has(transport.id)) {
    activeFrontendRendererId = transport.id;
  }
}

/** Drop a renderer on disconnect, promoting another if it was the active one. */
export function unregisterMcpFrontendTransport(
  transport: AgentTransport
): void {
  frontendTransports.delete(transport.id);
  if (activeFrontendRendererId === transport.id) {
    const remaining = [...frontendTransports.keys()];
    activeFrontendRendererId = remaining[remaining.length - 1] ?? null;
  }
}

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
