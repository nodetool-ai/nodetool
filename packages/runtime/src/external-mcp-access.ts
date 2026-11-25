import type { JsonSchema } from "@nodetool-ai/protocol/zod-schema";

/**
 * A user's external MCP servers, as a workflow run sees them.
 *
 * The servers are configured per user and connected by the host that owns the
 * settings store and the SSRF and stdio policy (`@nodetool-ai/websocket`).
 * Nodes and the Code node cannot import that host, so it installs a resolver
 * here once, the same way it installs the sandbox module catalog. A host that
 * installs none (`nodetool run`, the lean server) offers no external tools, and
 * every consumer reports that instead of guessing.
 */

/** One remote tool as its server advertised it. */
export interface ExternalMcpToolInfo {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
  /** The server's own `readOnlyHint` annotation. A hint, never a guarantee. */
  readOnly: boolean;
}

/** A remote tool's answer. `text` and `structured` are already redacted. */
export interface ExternalMcpCallResult {
  text: string;
  isError: boolean;
  images: Array<{ data: string; mimeType: string }>;
  links: Array<{ uri: string; name?: string; mimeType?: string }>;
  structured?: unknown;
}

export interface ExternalMcpServerInfo {
  id: string;
  name: string;
}

/**
 * What one user's servers offer a run. Only servers that are enabled and that
 * this deployment lets the user connect to (no stdio on a cloud or multi-user
 * host) are visible, so a consumer cannot name a server the host refuses.
 */
export interface ExternalMcpAccess {
  servers(): Promise<ExternalMcpServerInfo[]>;
  /** Throws when the server is unknown, disabled or not answering. */
  tools(serverId: string): Promise<ExternalMcpToolInfo[]>;
  call(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ExternalMcpCallResult>;
}

export type ExternalMcpResolver = (userId: string) => ExternalMcpAccess | null;

/** A context variable a host or a test may set to hand one run its own access. */
export const EXTERNAL_MCP_CONTEXT_KEY = "nodetool_external_mcp";

let processResolver: ExternalMcpResolver | null = null;

/** Install the process-wide resolver. `null` removes it. */
export function setExternalMcpResolver(
  resolver: ExternalMcpResolver | null
): void {
  processResolver = resolver;
}

interface ExternalMcpContext {
  userId?: string;
  get?<T = unknown>(key: string, defaultValue?: T): T;
}

/**
 * The access for this run's user, or `null` when the host offers none. A value
 * on the context wins over the process resolver. The user is the context's own,
 * never one a graph names, so a run can reach only its owner's servers.
 */
export function externalMcpAccessFor(
  context: ExternalMcpContext | undefined | null
): ExternalMcpAccess | null {
  const set = context?.get?.<ExternalMcpAccess | undefined>(
    EXTERNAL_MCP_CONTEXT_KEY
  );
  if (set !== undefined) return set;
  const userId = context?.userId;
  if (processResolver === null || !userId) return null;
  return processResolver(userId);
}
