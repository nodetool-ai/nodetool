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
   * (single-user `nodetool mcp serve`), "local-dev-http" (the non-production
   * /mcp mount), or "http-session" (the production mount behind
   * NODETOOL_ENABLE_MCP, which passes the user the auth hook resolved).
   */
  agentToolsScope?: {
    userId: string;
    source: "stdio-local" | "local-dev-http" | "http-session";
  };
  /**
   * `WWW-Authenticate` challenge to attach to a `scopeRefusal()` 401 (the
   * mount's own auth hook already computed it — see `server.ts`'s
   * `mcpBearerChallenge`). Undefined when the OAuth flow is unconfigured or
   * disabled, in which case the refusal carries no header, same as before.
   */
  unauthorizedChallenge?: string;
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

/**
 * How long an HTTP session may sit idle before it is closed. Every session
 * holds a transport, an `McpServer`, and that session's whole tool registry,
 * and `onclose` only fires when the transport is explicitly closed — normally
 * a DELETE. A client that simply goes away never sends one, so without this
 * sweep the maps grow for the life of the process.
 */
export const MCP_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
/** Concurrent sessions one user may hold; opening another closes their oldest. */
export const MCP_MAX_SESSIONS_PER_USER = 8;
/** Concurrent sessions across every user. A new one past this is refused. */
export const MCP_MAX_SESSIONS = 256;

// Per-session transport map for stateful HTTP MCP
const sessionTransports = new Map<
  string,
  WebStandardStreamableHTTPServerTransport
>();

// The user each HTTP session was initialized for. A multi-user mount hands out
// session ids over an authenticated channel, but the id alone must not be a
// bearer credential: every later request is checked against the owner recorded
// here.
const sessionOwners = new Map<string, string>();

// When each session was last used, for idle eviction and for picking a user's
// oldest session when they are over their cap.
const sessionLastSeen = new Map<string, number>();

function forgetSession(sessionId: string): void {
  sessionTransports.delete(sessionId);
  sessionOwners.delete(sessionId);
  sessionLastSeen.delete(sessionId);
}

function touchSession(sessionId: string, now: number = Date.now()): void {
  if (sessionTransports.has(sessionId)) sessionLastSeen.set(sessionId, now);
}

/**
 * Drop a session and close its transport, which releases the `McpServer`
 * behind it. `forgetSession` runs first so the transport's own `onclose`
 * finds nothing left to do.
 */
function closeSession(sessionId: string): void {
  const transport = sessionTransports.get(sessionId);
  forgetSession(sessionId);
  void transport?.close().catch((err: unknown) => {
    log.warn("Closing MCP session transport failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err)
    });
  });
}

/** Close every session idle for longer than the TTL. Lazy — runs per request,
 * so an idle process holds no timer. */
function sweepIdleSessions(now: number): void {
  for (const [sessionId, lastSeen] of sessionLastSeen) {
    if (now - lastSeen > MCP_SESSION_IDLE_TTL_MS) {
      log.debug("Evicting idle MCP session", { sessionId });
      closeSession(sessionId);
    }
  }
}

/** Close a user's oldest sessions until opening one more keeps them at the cap. */
function evictOverflowForUser(userId: string): void {
  const owned = [...sessionOwners]
    .filter(([, owner]) => owner === userId)
    .map(([sessionId]) => sessionId);
  const overflow = owned.length - (MCP_MAX_SESSIONS_PER_USER - 1);
  if (overflow <= 0) return;
  const oldestFirst = owned.sort(
    (a, b) => (sessionLastSeen.get(a) ?? 0) - (sessionLastSeen.get(b) ?? 0)
  );
  for (const sessionId of oldestFirst.slice(0, overflow)) {
    log.debug("Evicting oldest MCP session for user over cap", {
      userId,
      sessionId
    });
    closeSession(sessionId);
  }
}

/** Close every open HTTP session. For shutdown, and for tests that need a
 * clean process-wide session table. */
export function closeAllMcpHttpSessions(): void {
  for (const sessionId of [...sessionTransports.keys()]) {
    closeSession(sessionId);
  }
}

/**
 * True when the session exists and belongs to somebody other than the caller.
 * A session with no recorded owner (stdio, or a mount that predates the
 * binding) is left alone — the transport map is the authority there.
 */
function isForeignSession(
  sessionId: string,
  options?: McpServerOptions
): boolean {
  const owner = sessionOwners.get(sessionId);
  if (owner === undefined) return false;
  return owner !== options?.agentToolsScope?.userId;
}

/**
 * Answer as if the session did not exist. A 403 would confirm the id is real to
 * a caller who guessed it; a 404 tells them nothing.
 */
function sessionNotFound(): Response {
  return new Response("Session not found", { status: 404 });
}

/** Refusal for an initialize the mount has no room for. Retryable: an idle
 * session frees a slot on the next sweep. */
function sessionsExhausted(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32002,
        message:
          "This server is holding its maximum number of MCP sessions. " +
          "Close an existing session with DELETE /mcp, or retry later."
      }
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json",
        "retry-after": "60"
      }
    }
  );
}

export function getLocalMcpServerUrl(): string {
  const port = Number(process.env["PORT"] ?? 7777);
  const tlsEnabled = Boolean(process.env["TLS_CERT"] && process.env["TLS_KEY"]);
  const protocol = tlsEnabled ? "https" : "http";
  return `${protocol}://127.0.0.1:${port}/mcp`;
}

/** JSON-RPC refusal for an initialize the mount cannot scope to a user. */
function scopeRefusal(challenge?: string): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (challenge) headers.set("WWW-Authenticate", challenge);
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: MCP_SCOPE_REQUIRED_MESSAGE }
    }),
    { status: 401, headers }
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
  const now = Date.now();
  sweepIdleSessions(now);

  if (method === "POST") {
    // Check for existing session
    const sessionId = request.headers.get("mcp-session-id");
    if (sessionId && sessionTransports.has(sessionId)) {
      if (isForeignSession(sessionId, options)) return sessionNotFound();
      const transport = sessionTransports.get(sessionId)!;
      touchSession(sessionId, now);
      return transport.handleRequest(request);
    }
    // A session id that is present but unknown must NOT fall through to the
    // new-session path: that constructed a fresh transport + server per stale
    // request (leaking both). Reject it — only an initialize request without a
    // session id creates a new session.
    if (sessionId) {
      return sessionNotFound();
    }

    // A session this mount cannot bind to a user is refused here, at
    // initialize, rather than answering with an empty surface.
    if (!options?.agentToolsScope) {
      log.warn("Refusing MCP session: no authenticated user to bind");
      return scopeRefusal(options?.unauthorizedChallenge);
    }

    // New session — create transport and server
    const ownerUserId = options.agentToolsScope.userId;
    // One user's clients cannot crowd out everyone else's: their oldest
    // session goes first. The global cap is what is left after that, and it
    // refuses rather than evicting a stranger's live session.
    evictOverflowForUser(ownerUserId);
    if (sessionTransports.size >= MCP_MAX_SESSIONS) {
      log.warn("Refusing MCP session: server session cap reached", {
        cap: MCP_MAX_SESSIONS
      });
      return sessionsExhausted();
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessionTransports.set(id, transport);
        sessionOwners.set(id, ownerUserId);
        sessionLastSeen.set(id, Date.now());
      }
    });
    // Evict the session when the transport closes (client disconnect without an
    // explicit DELETE) so sessionTransports — and the McpServer each entry keeps
    // alive — does not grow unbounded over the process lifetime.
    transport.onclose = () => {
      if (transport.sessionId) forgetSession(transport.sessionId);
    };

    const server = createMcpServer(options);
    await server.connect(transport);
    return transport.handleRequest(request);
  }

  if (method === "GET") {
    const sessionId = request.headers.get("mcp-session-id");
    if (
      sessionId &&
      sessionTransports.has(sessionId) &&
      !isForeignSession(sessionId, options)
    ) {
      const transport = sessionTransports.get(sessionId)!;
      touchSession(sessionId, now);
      return transport.handleRequest(request);
    }
    return sessionNotFound();
  }

  if (method === "DELETE") {
    const sessionId = request.headers.get("mcp-session-id");
    if (
      sessionId &&
      sessionTransports.has(sessionId) &&
      !isForeignSession(sessionId, options)
    ) {
      const transport = sessionTransports.get(sessionId)!;
      const response = await transport.handleRequest(request);
      forgetSession(sessionId);
      return response;
    }
    return sessionNotFound();
  }

  return new Response("Method not allowed", { status: 405 });
}
