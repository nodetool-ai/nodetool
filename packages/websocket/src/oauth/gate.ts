/**
 * The one gate that decides whether the MCP OAuth flow exists on this
 * server, and the `nta_` bearer decision built on it. `server.ts`'s auth
 * hook, the AS route plugin, and the integration test all import these, so
 * the challenge a 401 advertises, the routes the AS serves, and the tokens
 * the hook accepts cannot disagree.
 */

import { McpOauthToken } from "@nodetool-ai/models";
import { configuredMcpUrl, isMcpHttpEnabled } from "../lib/mcp-mount.js";
import { buildBearerChallenge } from "./www-authenticate.js";
import { canonicalResource } from "./validate.js";

export const MCP_OAUTH_DISABLE_ENV_VAR = "NODETOOL_DISABLE_MCP_OAUTH";

/**
 * The issuer base URL when the OAuth flow can actually complete, else null.
 * Four conditions, all here and nowhere else: the escape hatch is unset,
 * the `/mcp` mount is enabled (the AS must not issue for a resource that
 * is not mounted), a public URL is configured, and the issuer is HTTPS or
 * loopback (refused per request — there is no boot check).
 */
export function enabledPublicUrl(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (env[MCP_OAUTH_DISABLE_ENV_VAR] === "1") return null;
  if (!isMcpHttpEnabled(env)) return null;
  const mcpUrl = configuredMcpUrl(env);
  if (!mcpUrl) return null;
  const publicUrl = mcpUrl.slice(0, -"/mcp".length);
  try {
    const url = new URL(publicUrl);
    const loopback =
      url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !loopback) return null;
  } catch {
    return null;
  }
  return publicUrl;
}

/**
 * The `WWW-Authenticate` challenge for an unauthenticated or invalid `/mcp`
 * request — undefined whenever `enabledPublicUrl` says the flow cannot
 * complete, so the server never advertises discovery documents the AS
 * answers with 404.
 */
export function mcpBearerChallenge(
  error?: "invalid_token"
): string | undefined {
  const publicUrl = enabledPublicUrl();
  if (!publicUrl) return undefined;
  return buildBearerChallenge({ publicUrl, error });
}

/**
 * Decide an `nta_` bearer presentation. Grants only when the flow is
 * enabled, the token verifies, the request targets `/mcp`, and the token's
 * stored resource matches this deployment's canonical `/mcp` URI. Every
 * other outcome denies; the challenge is attached only on `/mcp` — the
 * design's "the `/mcp` path, and only it" rule.
 */
export async function authenticateMcpAccessToken(
  token: string,
  pathname: string
): Promise<
  | { ok: true; userId: string }
  | { ok: false; challenge: string | undefined }
> {
  const deny = {
    ok: false as const,
    challenge: pathname.startsWith("/mcp")
      ? mcpBearerChallenge("invalid_token")
      : undefined
  };
  const publicUrl = enabledPublicUrl();
  if (!publicUrl) return deny;
  const verified = await McpOauthToken.verifyAccess(token);
  if (
    !verified ||
    !pathname.startsWith("/mcp") ||
    verified.resource !== canonicalResource(publicUrl)
  ) {
    return deny;
  }
  return { ok: true, userId: verified.userId };
}
