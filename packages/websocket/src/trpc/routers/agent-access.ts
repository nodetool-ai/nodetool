/**
 * Agent-access router — connecting an external MCP client to this server.
 *
 * The `mcpConfig` router next door writes MCP config files on the machine the
 * server runs on, which is why it is local-only: on a shared host those files
 * belong to nobody. This router is the remote half and works in production.
 * It answers two questions a person has when they open Claude Code on their
 * laptop and want it to reach their NodeTool: what URL, and what credential.
 *
 * The credential is an `access_tokens` row (`@nodetool-ai/models`). Every
 * procedure reads the user from the session and scopes to it, so a token id
 * learned elsewhere buys nothing.
 */

import {
  createTokenInput,
  createTokenOutput,
  listTokensOutput,
  mcpConnectionOutput,
  revokeTokenInput,
  revokeTokenOutput,
  type AccessTokenSummary
} from "@nodetool-ai/protocol/api-schemas/agent-access.js";
import { AccessToken } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  configuredMcpUrl,
  isMcpHttpEnabled,
  MCP_ENABLE_FLAG
} from "../../lib/mcp-mount.js";

/** The listable half of a token: everything the row holds but the hash. */
function summarize(token: AccessToken): AccessTokenSummary {
  return {
    id: token.id,
    name: token.name,
    created_at: token.created_at,
    expires_at: token.expires_at,
    last_used_at: token.last_used_at
  };
}

/** How many tokens one user may hold. A person wiring up a handful of agents
 * stays well under it; a loop that mints on every render does not. */
const MAX_TOKENS_PER_USER = 25;

export const agentAccessRouter = router({
  /**
   * What an external agent needs to know to connect. Reported rather than
   * assumed: a UI that offers a connection over an unregistered route sends
   * people to debug a 404.
   */
  mcpConnection: protectedProcedure
    .output(mcpConnectionOutput)
    .query(() => {
      const enabled = isMcpHttpEnabled();
      // A server with no identity provider checks no credential — it trusts
      // loopback and whatever CIDRs it was told to. Saying "token" there
      // would be describing a check that does not happen.
      const enforcesAuth = Boolean(
        process.env["SUPABASE_URL"] && process.env["SUPABASE_KEY"]
      );
      return {
        enabled,
        url: enabled ? configuredMcpUrl() : null,
        auth_mode: enforcesAuth ? ("token" as const) : ("none" as const),
        enable_flag: enabled ? null : MCP_ENABLE_FLAG
      };
    }),

  /** The signed-in user's tokens. Never the secrets — those are unrecoverable. */
  listTokens: protectedProcedure
    .output(listTokensOutput)
    .query(async ({ ctx }) => {
      const tokens = await AccessToken.listForUser(ctx.userId);
      return { tokens: tokens.map(summarize) };
    }),

  /**
   * Mint a token. The plaintext is in this response and nowhere else, so a
   * client that loses it revokes and mints again.
   */
  createToken: protectedProcedure
    .input(createTokenInput)
    .output(createTokenOutput)
    .mutation(async ({ ctx, input }) => {
      const existing = await AccessToken.listForUser(ctx.userId);
      if (existing.length >= MAX_TOKENS_PER_USER) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          `You already hold ${MAX_TOKENS_PER_USER} access tokens. Revoke one before minting another.`
        );
      }
      const { record, token } = await AccessToken.mint({
        userId: ctx.userId,
        name: input.name.trim(),
        expiresInDays: input.expires_in_days ?? null
      });
      return { token, record: summarize(record) };
    }),

  /** Revoke a token. The row is deleted, so the credential dies immediately. */
  revokeToken: protectedProcedure
    .input(revokeTokenInput)
    .output(revokeTokenOutput)
    .mutation(async ({ ctx, input }) => {
      return { revoked: await AccessToken.revoke(ctx.userId, input.id) };
    })
});
