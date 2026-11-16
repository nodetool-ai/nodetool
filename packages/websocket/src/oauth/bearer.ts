/**
 * The auth hook's decision for every bearer credential this server's OAuth
 * flow issues, by prefix. `server.ts` calls it before the `ntk_`, app session
 * and provider checks, and the tests call it directly, so the rules tested
 * are the rules served.
 *
 * - `nta_` (MCP access): `/mcp` only, `authenticateMcpAccessToken`.
 * - `ntd_` (native access): every route except `/mcp`.
 * - `ntr_` (refresh) and `nth_` (native revocation handle): never a bearer
 *   credential, refused everywhere.
 *
 * A token with one of these prefixes that fails is refused as itself. It is
 * never passed on to the checks below it, so an audience-scoped credential
 * cannot be probed against the rest of the API.
 */

import {
  MCP_OAUTH_ACCESS_TOKEN_PREFIX,
  MCP_OAUTH_REFRESH_TOKEN_PREFIX,
  NATIVE_ACCESS_TOKEN_PREFIX,
  NATIVE_REVOCATION_HANDLE_PREFIX
} from "@nodetool-ai/models";
import { authenticateMcpAccessToken } from "./gate.js";
import { authenticateNativeAccessToken } from "./native-session.js";

export type OauthBearerDecision =
  /** Not one of the OAuth prefixes: the next check decides. */
  | { kind: "not_oauth" }
  | { kind: "grant"; userId: string; nativeSessionId: string | null }
  | { kind: "deny"; challenge: string | undefined };

export async function decideOauthBearer(
  token: string,
  pathname: string
): Promise<OauthBearerDecision> {
  if (token.startsWith(MCP_OAUTH_ACCESS_TOKEN_PREFIX)) {
    const decision = await authenticateMcpAccessToken(token, pathname);
    return decision.ok
      ? { kind: "grant", userId: decision.userId, nativeSessionId: null }
      : { kind: "deny", challenge: decision.challenge };
  }
  if (token.startsWith(NATIVE_ACCESS_TOKEN_PREFIX)) {
    const decision = await authenticateNativeAccessToken(token, pathname);
    return decision.ok
      ? { kind: "grant", userId: decision.userId, nativeSessionId: decision.grantId }
      : { kind: "deny", challenge: undefined };
  }
  if (
    token.startsWith(MCP_OAUTH_REFRESH_TOKEN_PREFIX) ||
    token.startsWith(NATIVE_REVOCATION_HANDLE_PREFIX)
  ) {
    return { kind: "deny", challenge: undefined };
  }
  return { kind: "not_oauth" };
}
