/**
 * The two short-lived pieces of OAuth authorize-flow state: the pending
 * `/oauth/authorize` request parked while the user is on the consent page,
 * and the authorization code minted on approval. Both live 10 minutes.
 *
 * They are database rows (`OauthPending` in `@nodetool-ai/models`), not
 * process memory, because the consent and the token exchange may reach
 * different server processes. A sign-in whose two halves land on two
 * replicas failed while this store was a `Map`.
 */

import { OauthPending } from "@nodetool-ai/models";

export type OauthRequestScope = "mcp" | "native";

export interface PendingAuthorizeRequest {
  /** request_id handed to the SPA consent page. */
  id: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  scope: OauthRequestScope;
  resource: string;
  state?: string;
  /** Every registered redirect_uri for this client is loopback-only. */
  redirectHostIsLoopbackOnly: boolean;
  /** Native sign-in only: which app asked (`node-editor` or `timeline`). */
  appName?: string;
  /** Native sign-in only: the device name the app sent. */
  deviceName?: string;
  createdAt: number;
}

/** What a code redeems to: the request it was minted for, who approved it,
 * and whether it had already been spent. */
export interface CodeRedemption {
  request: PendingAuthorizeRequest;
  userId: string;
  grantId: string;
  consumedBefore: boolean;
}

interface StoredCode {
  request: PendingAuthorizeRequest;
  userId: string;
  grantId: string;
}

function asRequest(
  id: string,
  payload: Record<string, unknown> | null
): PendingAuthorizeRequest | null {
  if (!payload) return null;
  return { ...(payload as Omit<PendingAuthorizeRequest, "id">), id };
}

export class PendingStore {
  /** Park a validated `/oauth/authorize` request. Returns its request_id. */
  async putRequest(
    r: Omit<PendingAuthorizeRequest, "id" | "createdAt">
  ): Promise<string> {
    return OauthPending.putRequest({ ...r, createdAt: Date.now() });
  }

  /** Read a pending request without consuming it (renders the consent page). */
  async takeRequestForApproval(
    id: string
  ): Promise<PendingAuthorizeRequest | null> {
    return asRequest(id, await OauthPending.getRequest(id));
  }

  /** Consume a pending request — approve/deny each call this exactly once. */
  async consumeRequest(id: string): Promise<PendingAuthorizeRequest | null> {
    return asRequest(id, await OauthPending.consumeRequest(id));
  }

  /**
   * Mint an authorization code for an approved request. Returns the code.
   * `grantId` is the consent record the approval created — the token
   * endpoint mints tokens for exactly that grant, and revokes it on code
   * replay, so consent and redemption never produce two grant rows.
   */
  async putCode(input: StoredCode): Promise<string> {
    const stored: StoredCode = {
      request: input.request,
      userId: input.userId,
      grantId: input.grantId
    };
    return OauthPending.putCode(
      stored as unknown as Record<string, unknown>,
      input.userId
    );
  }

  /**
   * Read a code's entry without consuming it, so the token endpoint can check
   * every binding the code carries — client_id, redirect_uri, PKCE, resource —
   * before spending it. Redeeming first let anyone holding a leaked code burn
   * it with one bad exchange: the legitimate client's exchange then looked
   * like a replay and revoked the grant.
   */
  async peekCode(code: string): Promise<CodeRedemption | null> {
    const entry = await OauthPending.peekCode(code);
    return entry ? redemption(entry.payload, entry.consumedBefore) : null;
  }

  /**
   * Consume an authorization code at the token endpoint. `consumedBefore`
   * is true when this code was already consumed once — the OAuth 2.1 code
   * replay rule: the caller must revoke every token minted from this code.
   *
   * The replay signal lives only as long as the code row (10 minutes): a
   * replay arriving later returns plain null and revokes nothing. A leaked
   * code is valuable immediately or not at all.
   */
  async consumeCode(code: string): Promise<CodeRedemption | null> {
    const entry = await OauthPending.consumeCode(code);
    return entry ? redemption(entry.payload, entry.consumedBefore) : null;
  }
}

function redemption(
  payload: Record<string, unknown>,
  consumedBefore: boolean
): CodeRedemption {
  const stored = payload as unknown as StoredCode;
  return {
    request: stored.request,
    userId: stored.userId,
    grantId: stored.grantId,
    consumedBefore
  };
}

/** Module singleton. The state behind it is shared by every process. */
export const pendingStore = new PendingStore();
