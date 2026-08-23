/**
 * In-memory, TTL-swept store for the two short-lived, non-durable pieces of
 * OAuth authorize-flow state: the pending `/oauth/authorize` request parked
 * while the user is on the consent page, and the authorization code minted
 * on approval. Models `oauthStateStore` in `../oauth-api.ts` — same
 * lazy-prune-on-access pattern, no timer.
 *
 * Losing this store on restart costs one browser round-trip; nothing here
 * is durable and nothing needs a migration.
 */

import { randomBytes } from "node:crypto";

const REQUEST_TTL_MS = 600_000; // 10 minutes
const CODE_TTL_MS = 600_000; // 10 minutes

export interface PendingAuthorizeRequest {
  /** request_id handed to the SPA consent page. */
  id: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  scope: "mcp";
  resource: string;
  state?: string;
  /** Every registered redirect_uri for this client is loopback-only. */
  redirectHostIsLoopbackOnly: boolean;
  createdAt: number;
}

interface CodeEntry {
  request: PendingAuthorizeRequest;
  userId: string;
  createdAt: number;
  consumed: boolean;
}

export class PendingStore {
  private readonly requests = new Map<string, PendingAuthorizeRequest>();
  private readonly codes = new Map<string, CodeEntry>();

  private pruneRequests(): void {
    const now = Date.now();
    for (const [id, request] of this.requests) {
      if (now - request.createdAt > REQUEST_TTL_MS) {
        this.requests.delete(id);
      }
    }
  }

  private pruneCodes(): void {
    const now = Date.now();
    for (const [code, entry] of this.codes) {
      if (now - entry.createdAt > CODE_TTL_MS) {
        this.codes.delete(code);
      }
    }
  }

  /** Park a validated `/oauth/authorize` request. Returns its request_id. */
  putRequest(r: Omit<PendingAuthorizeRequest, "id" | "createdAt">): string {
    this.pruneRequests();
    const id = randomBytes(16).toString("hex");
    this.requests.set(id, { ...r, id, createdAt: Date.now() });
    return id;
  }

  /** Read a pending request without consuming it (renders the consent page). */
  takeRequestForApproval(id: string): PendingAuthorizeRequest | null {
    this.pruneRequests();
    const request = this.requests.get(id) ?? null;
    if (!request) {
      return null;
    }
    if (Date.now() - request.createdAt > REQUEST_TTL_MS) {
      this.requests.delete(id);
      return null;
    }
    return request;
  }

  /** Consume a pending request — approve/deny each call this exactly once. */
  consumeRequest(id: string): PendingAuthorizeRequest | null {
    const request = this.takeRequestForApproval(id);
    if (request) {
      this.requests.delete(id);
    }
    return request;
  }

  /** Mint an authorization code for an approved request. Returns the code. */
  putCode(input: { request: PendingAuthorizeRequest; userId: string }): string {
    this.pruneCodes();
    const code = randomBytes(32).toString("base64url");
    this.codes.set(code, {
      request: input.request,
      userId: input.userId,
      createdAt: Date.now(),
      consumed: false
    });
    return code;
  }

  /**
   * Consume an authorization code at the token endpoint. `consumedBefore`
   * is true when this code was already consumed once — the OAuth 2.1 code
   * replay rule: the caller must revoke every token minted from this code.
   */
  consumeCode(
    code: string
  ): { request: PendingAuthorizeRequest; userId: string; consumedBefore: boolean } | null {
    this.pruneCodes();
    const entry = this.codes.get(code);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.createdAt > CODE_TTL_MS) {
      this.codes.delete(code);
      return null;
    }
    const consumedBefore = entry.consumed;
    entry.consumed = true;
    return { request: entry.request, userId: entry.userId, consumedBefore };
  }
}

/** Module singleton — one process, one AS. */
export const pendingStore = new PendingStore();
