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
