/**
 * Whether this server offers `/mcp`, and where.
 *
 * The mount's production gate is read in two places — `server.ts` registers
 * the route by it, and the agent-access router reports it to the settings UI
 * — so it lives here rather than as the same expression written twice. A UI
 * that says "connected" over a route that was never registered is worse than
 * no UI.
 */

/**
 * The `/mcp` streamable-HTTP mount carries the full agent toolbelt, so it is
 * off in production unless the operator opts in.
 */
export function isMcpHttpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["NODETOOL_ENV"] !== "production" || env["NODETOOL_ENABLE_MCP"] === "1";
}

/** The env var that turns the mount on, named so the UI and the boot log agree. */
export const MCP_ENABLE_FLAG = "NODETOOL_ENABLE_MCP";

/**
 * The absolute `/mcp` URL, when the operator configured a public address.
 *
 * Null otherwise — the server behind a proxy cannot know the address a
 * browser reached it at, so the client falls back to its own origin, which is
 * by construction an address that works.
 */
export function configuredMcpUrl(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const base = env["NODETOOL_PUBLIC_URL"]?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/mcp`;
}

/** What decides whether an HTTP `/mcp` request is the machine owner's own. */
export interface McpLocalSessionRequest {
  isProduction: boolean;
  /** Supabase or SSO sign-in is enforced. */
  enforceAuth: boolean;
  /** The user the auth hook resolved, or null. */
  userId: string | null;
  /** True when the socket peer is a loopback address. */
  fromLoopback: boolean;
}

/**
 * Whether an HTTP `/mcp` request gets the local-session tools: server file
 * paths in `upload_asset`, `download_asset` and `view_image`, and pack
 * management. Those read and write the server's disk, so they belong to the
 * single local user of a Local-mode server, never to a signed-in account.
 *
 * A loopback peer alone is not enough. Behind a reverse proxy on the same
 * machine every request arrives from loopback, so that test handed server
 * file access to every account that could reach `/mcp`.
 */
export function isLocalMcpSession(request: McpLocalSessionRequest): boolean {
  return (
    !request.isProduction &&
    !request.enforceAuth &&
    request.userId === "1" &&
    request.fromLoopback
  );
}
