import { z } from "zod";

/**
 * Schemas for the agent-access surface: the MCP connection this server offers,
 * and the revocable tokens a person mints to reach it from another machine.
 */

// ── Tokens ────────────────────────────────────────────────────────

/** A token as it is safe to list: everything except the secret. */
export const accessTokenSummary = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable()
});
export type AccessTokenSummary = z.infer<typeof accessTokenSummary>;

export const listTokensOutput = z.object({
  tokens: z.array(accessTokenSummary)
});
export type ListTokensOutput = z.infer<typeof listTokensOutput>;

/** A year is the longest lifetime the UI offers; `null` never expires. */
export const createTokenInput = z.object({
  name: z.string().min(1).max(100),
  expires_in_days: z.number().int().min(1).max(365).nullable().optional()
});
export type CreateTokenInput = z.infer<typeof createTokenInput>;

export const createTokenOutput = z.object({
  /** The plaintext token. Returned once; the server keeps only a hash. */
  token: z.string(),
  record: accessTokenSummary
});
export type CreateTokenOutput = z.infer<typeof createTokenOutput>;

export const revokeTokenInput = z.object({ id: z.string().min(1) });
export type RevokeTokenInput = z.infer<typeof revokeTokenInput>;

export const revokeTokenOutput = z.object({ revoked: z.boolean() });
export type RevokeTokenOutput = z.infer<typeof revokeTokenOutput>;

// ── Connection ────────────────────────────────────────────────────

/**
 * How this server expects an agent to authenticate.
 *
 * - `token` — a minted access token in an `Authorization: Bearer` header.
 *   The answer in every mode where a credential is actually checked.
 * - `none` — the server trusts the caller's network and asks for nothing.
 *   Local mode reached over loopback or a trusted CIDR.
 */
export const mcpAuthMode = z.enum(["token", "none"]);
export type McpAuthMode = z.infer<typeof mcpAuthMode>;

export const mcpConnectionOutput = z.object({
  /** Whether the `/mcp` mount is registered on this server at all. */
  enabled: z.boolean(),
  /** The URL an external client points at, or null when the mount is off. */
  url: z.string().nullable(),
  auth_mode: mcpAuthMode,
  /**
   * The env var to set when the mount is off, so the UI can name the fix
   * rather than describing it. Null when the mount is on.
   */
  enable_flag: z.string().nullable()
});
export type McpConnectionOutput = z.infer<typeof mcpConnectionOutput>;

// ── OAuth consent + connected clients ────────────────────────────

/** A pending `/oauth/authorize` request, and every other OAuth procedure
 * that acts on one — all keyed by the same `request_id` the SPA carries in
 * its `/oauth/consent` query string. */
export const oauthRequestIdInput = z.object({
  request_id: z.string().min(1)
});
export type OauthRequestIdInput = z.infer<typeof oauthRequestIdInput>;

/** What the consent page shows: who is asking, where they redirect to, and
 * for what. `loopback_only` drives the impersonation warning — CIMD cannot
 * vouch for a client whose every registered redirect URI is localhost. */
export const oauthRequestSummary = z.object({
  client_name: z.string(),
  redirect_host: z.string(),
  scope: z.string(),
  loopback_only: z.boolean()
});
export type OauthRequestSummary = z.infer<typeof oauthRequestSummary>;

/** Null when the request_id is unknown or its 10-minute TTL has elapsed —
 * the consent page renders an "expired" state rather than an error. */
export const getOauthRequestOutput = oauthRequestSummary.nullable();
export type GetOauthRequestOutput = z.infer<typeof getOauthRequestOutput>;

/** Approve/deny both resolve to a redirect the SPA navigates the browser
 * to — the authorization code (or `error=access_denied`), the echoed
 * `state`, and `iss` are all encoded in this one URL. */
export const oauthRedirectOutput = z.object({
  redirect_url: z.string()
});
export type OauthRedirectOutput = z.infer<typeof oauthRedirectOutput>;

/** A grant as it is safe to list: everything a person needs to recognize
 * and revoke a connected client, no secret material. */
export const oauthGrantSummary = z.object({
  id: z.string(),
  client_name: z.string(),
  client_id: z.string(),
  created_at: z.string(),
  scope: z.string()
});
export type OauthGrantSummary = z.infer<typeof oauthGrantSummary>;

export const listOauthGrantsOutput = z.object({
  grants: z.array(oauthGrantSummary)
});
export type ListOauthGrantsOutput = z.infer<typeof listOauthGrantsOutput>;

export const revokeOauthGrantInput = z.object({
  grant_id: z.string().min(1)
});
export type RevokeOauthGrantInput = z.infer<typeof revokeOauthGrantInput>;

export const revokeOauthGrantOutput = z.object({ ok: z.boolean() });
export type RevokeOauthGrantOutput = z.infer<typeof revokeOauthGrantOutput>;
