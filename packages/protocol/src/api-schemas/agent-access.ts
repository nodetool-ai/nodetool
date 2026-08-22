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
