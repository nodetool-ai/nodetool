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
  getOauthRequestOutput,
  listOauthGrantsOutput,
  listTokensOutput,
  mcpConnectionOutput,
  oauthRedirectOutput,
  oauthRequestIdInput,
  revokeOauthGrantInput,
  revokeOauthGrantOutput,
  revokeTokenInput,
  revokeTokenOutput,
  type AccessTokenSummary
} from "@nodetool-ai/protocol/api-schemas/agent-access.js";
import { AccessToken, McpOauthGrant } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  configuredMcpUrl,
  isMcpHttpEnabled,
  MCP_ENABLE_FLAG
} from "../../lib/mcp-mount.js";
import { pendingStore } from "../../oauth/pending-store.js";

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

/**
 * The issuer this AS puts in `iss` on every authorization response — the
 * origin `configuredMcpUrl()` resolves to, not the `/mcp` path itself. A
 * pending request only exists because `/oauth/authorize` already required a
 * configured public URL, so its absence here is a server misconfiguration,
 * not a client error.
 */
function issuerOrigin(): string {
  const mcpUrl = configuredMcpUrl();
  if (!mcpUrl) {
    throwApiError(
      ApiErrorCode.INTERNAL_ERROR,
      "MCP public URL is not configured."
    );
  }
  return new URL(mcpUrl).origin;
}

/** Append the authorize-response query params onto a registered redirect
 * URI, `state` only when the client sent one. `URL` handles the encoding. */
function buildRedirectUrl(
  redirectUri: string,
  params: Record<string, string | undefined>
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

const OAUTH_REQUEST_NOT_FOUND =
  "This authorization request has expired or was already used.";

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
    }),

  /**
   * What the consent page renders for a pending `/oauth/authorize` request.
   * Reads without consuming — the page can be refreshed, and consuming only
   * happens on Approve/Deny.
   */
  getOauthRequest: protectedProcedure
    .input(oauthRequestIdInput)
    .output(getOauthRequestOutput)
    .query(({ input }) => {
      const request = pendingStore.takeRequestForApproval(input.request_id);
      if (!request) {
        return null;
      }
      return {
        client_name: request.clientName,
        redirect_host: new URL(request.redirectUri).host,
        scope: request.scope,
        loopback_only: request.redirectHostIsLoopbackOnly
      };
    }),

  /**
   * Approve a pending request: record the consent as a grant owned by the
   * signed-in user, mint an authorization code for it, and hand back the
   * redirect the SPA sends the browser to.
   */
  approveOauthRequest: protectedProcedure
    .input(oauthRequestIdInput)
    .output(oauthRedirectOutput)
    .mutation(async ({ ctx, input }) => {
      const request = pendingStore.consumeRequest(input.request_id);
      if (!request) {
        throwApiError(ApiErrorCode.NOT_FOUND, OAUTH_REQUEST_NOT_FOUND);
      }
      await McpOauthGrant.create({
        user_id: ctx.userId,
        client_id: request.clientId,
        client_name: request.clientName,
        scope: request.scope,
        resource: request.resource
      });
      const code = pendingStore.putCode({ request, userId: ctx.userId });
      return {
        redirect_url: buildRedirectUrl(request.redirectUri, {
          code,
          state: request.state,
          iss: issuerOrigin()
        })
      };
    }),

  /** Deny a pending request: consume it (Approve/Deny each get one shot at
   * it) and redirect with the OAuth 2.1 `access_denied` error. */
  denyOauthRequest: protectedProcedure
    .input(oauthRequestIdInput)
    .output(oauthRedirectOutput)
    .mutation(({ input }) => {
      const request = pendingStore.consumeRequest(input.request_id);
      if (!request) {
        throwApiError(ApiErrorCode.NOT_FOUND, OAUTH_REQUEST_NOT_FOUND);
      }
      return {
        redirect_url: buildRedirectUrl(request.redirectUri, {
          error: "access_denied",
          state: request.state,
          iss: issuerOrigin()
        })
      };
    }),

  /** The signed-in user's active MCP client connections — what the
   * "Connected MCP clients" list in settings reads. */
  listOauthGrants: protectedProcedure
    .output(listOauthGrantsOutput)
    .query(async ({ ctx }) => {
      const grants = await McpOauthGrant.listForUser(ctx.userId);
      return {
        grants: grants.map((grant) => ({
          id: grant.id,
          client_name: grant.client_name,
          client_id: grant.client_id,
          created_at: grant.created_at.toISOString(),
          scope: grant.scope
        }))
      };
    }),

  /** Revoke a connected client. Deletes its tokens too, so the credential
   * dies immediately rather than lingering until it next expires. */
  revokeOauthGrant: protectedProcedure
    .input(revokeOauthGrantInput)
    .output(revokeOauthGrantOutput)
    .mutation(async ({ ctx, input }) => {
      return { ok: await McpOauthGrant.revoke(ctx.userId, input.grant_id) };
    })
});
