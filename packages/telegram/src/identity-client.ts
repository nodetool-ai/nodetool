/**
 * IdentityClient — the bridge's half of the identity layer (design §5).
 *
 * The bridge holds exactly one credential: the service token that identifies
 * it to the NodeTool server. It never sees a user password, an OAuth code, or
 * a long-lived user token. To act as a linked user it exchanges the Telegram
 * user id for a short-lived delegated token, and caches that token until
 * shortly before it expires.
 *
 * Every route this module calls is `packages/websocket/src/routes/integrations.ts`.
 * All I/O goes through the injected `fetch`, so the whole flow is testable
 * without a server.
 */

/** How long before a token's stated expiry it stops being served from cache. */
import { trimTrailingSlashes } from "./strings.js";

export const TOKEN_EXPIRY_SLACK_MS = 5 * 60 * 1000;

/** The identity layer's provider column for this bridge. */
export const TELEGRAM_PROVIDER = "telegram";

export interface IdentityClientOptions {
  /** NodeTool server base URL, no trailing slash. */
  readonly apiUrl: string;
  /** `NODETOOL_INTEGRATION_TOKEN` — the bridge's service token. */
  readonly integrationToken: string;
  /** Injected so tests need no network. */
  readonly fetch: typeof fetch;
  /** Identity provider name. Defaults to `telegram`. */
  readonly provider?: string;
  /** Clock, in ms. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Cache slack before expiry. Defaults to {@link TOKEN_EXPIRY_SLACK_MS}. */
  readonly expirySlackMs?: number;
}

/** A delegated token good for acting as the linked NodeTool user. */
export interface LinkedIdentity {
  readonly unlinked: false;
  /** Bearer token for `/ws`, `/trpc` and asset URLs. */
  readonly token: string;
  /** The NodeTool user the token authenticates as. */
  readonly userId: string;
  /** Absolute expiry, in ms since the epoch. */
  readonly expiresAtMs: number;
}

/** Why no token could be minted. Both cases are answered in the chat, not thrown. */
export type UnlinkedReason =
  /** No `external_identities` row: the user must link first (HTTP 404). */
  | "not-linked"
  /** Server runs in local single-user trust mode (HTTP 409, design §9). */
  | "local-mode";

export interface UnlinkedIdentity {
  readonly unlinked: true;
  readonly reason: UnlinkedReason;
  /** The server's own explanation, for relaying to the user. */
  readonly message: string;
}

export type IdentityResolution = LinkedIdentity | UnlinkedIdentity;

/** A link code the user turns into an `external_identities` row in the browser. */
export interface LinkStart {
  readonly code: string;
  /** Confirmation page URL to send to the user. */
  readonly url: string;
  /** ISO timestamp the code stops working at, when the server reported one. */
  readonly expiresAt: string | null;
}

/**
 * Outcome of completing a `/start <code>` deep link.
 *
 * `unsupported` is the committed server's answer today: `/link/complete`
 * requires a `user_id` the bridge does not know, because the code it mints is
 * bound to an `external_id`, not to a user. See the module note below.
 */
export type DeepLinkResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "expired" | "mismatch" | "unsupported" | "server-error";
      readonly message: string;
    };

/** A transport or server failure the caller must surface rather than swallow. */
export class IdentityError extends Error {
  /** HTTP status, or null when the request never got a response. */
  readonly status: number | null;

  constructor(message: string, status: number | null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IdentityError";
    this.status = status;
  }
}

interface CacheEntry {
  readonly token: string;
  readonly userId: string;
  readonly expiresAtMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(body: unknown, field: string): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const value = body[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The server's `{error}` string, or a generic line naming the status. */
function errorMessage(body: unknown, status: number): string {
  return stringField(body, "error") ?? `NodeTool server answered ${status}`;
}

export class IdentityClient {
  private readonly apiUrl: string;
  private readonly integrationToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly provider: string;
  private readonly now: () => number;
  private readonly expirySlackMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: IdentityClientOptions) {
    this.apiUrl = trimTrailingSlashes(options.apiUrl);
    this.integrationToken = options.integrationToken;
    this.fetchImpl = options.fetch;
    this.provider = options.provider ?? TELEGRAM_PROVIDER;
    this.now = options.now ?? Date.now;
    this.expirySlackMs = options.expirySlackMs ?? TOKEN_EXPIRY_SLACK_MS;
  }

  /**
   * A delegated token for this Telegram user, from cache when one is still
   * comfortably valid.
   *
   * @throws {IdentityError} on transport failure or an unexpected status —
   * "not linked" and "local mode" are results, not errors.
   */
  async resolve(telegramUserId: string): Promise<IdentityResolution> {
    const cached = this.cache.get(telegramUserId);
    if (cached && cached.expiresAtMs - this.expirySlackMs > this.now()) {
      return {
        unlinked: false,
        token: cached.token,
        userId: cached.userId,
        expiresAtMs: cached.expiresAtMs
      };
    }
    this.cache.delete(telegramUserId);

    const { status, body } = await this.post("token", { external_id: telegramUserId });
    if (status === 404) {
      return { unlinked: true, reason: "not-linked", message: errorMessage(body, status) };
    }
    if (status === 409) {
      return { unlinked: true, reason: "local-mode", message: errorMessage(body, status) };
    }
    if (status !== 200) {
      throw new IdentityError(errorMessage(body, status), status);
    }

    const token = stringField(body, "token");
    const userId = stringField(body, "user_id");
    if (token === null || userId === null) {
      throw new IdentityError("Token response is missing `token` or `user_id`", status);
    }
    const expiresAt = stringField(body, "expires_at");
    const parsed = expiresAt === null ? Number.NaN : Date.parse(expiresAt);
    // A token whose expiry the server did not state is treated as expiring
    // immediately after the slack window, so it is re-minted rather than used
    // forever on a guess.
    const expiresAtMs = Number.isFinite(parsed) ? parsed : this.now() + this.expirySlackMs;

    this.cache.set(telegramUserId, { token, userId, expiresAtMs });
    return { unlinked: false, token, userId, expiresAtMs };
  }

  /**
   * Forget the cached token for a user. Called when the server rejects it
   * mid-session, so the next turn mints a fresh one instead of retrying a
   * token the server has already refused.
   */
  invalidate(telegramUserId: string): void {
    this.cache.delete(telegramUserId);
  }

  /** Mint a one-time link code and confirmation URL for the `/link` flow. */
  async linkStart(telegramUserId: string): Promise<LinkStart> {
    const { status, body } = await this.post("link/start", {
      external_id: telegramUserId
    });
    if (status !== 200) {
      throw new IdentityError(errorMessage(body, status), status);
    }
    const code = stringField(body, "code");
    const url = stringField(body, "url");
    if (code === null || url === null) {
      throw new IdentityError("Link response is missing `code` or `url`", status);
    }
    return { code, url, expiresAt: stringField(body, "expires_at") };
  }

  /**
   * Complete a link the *web* side started, from a `/start <code>` deep link.
   *
   * ROUTE GAP: against the *committed*
   * `packages/websocket/src/routes/integrations.ts` this direction does not
   * exist. `/link/start` binds a code to `(provider, external_id)` and
   * `/link/complete` requires a `user_id` in the body, so only the
   * bot-initiated direction closes — the bridge knows the Telegram id, never
   * the NodeTool user id. The direction needs the route to accept
   * `{external_id, code}` and read the user off a code the web side minted,
   * which is what the M1 T1.4 change to that route adds.
   *
   * So the call is made in exactly the shape that direction takes, and a 400
   * naming the missing `user_id` is reported as `unsupported` — which
   * `/start <code>` handling turns into the ordinary `/link` flow rather than
   * leaving the user holding a dead code.
   */
  async completeDeepLink(telegramUserId: string, code: string): Promise<DeepLinkResult> {
    const { status, body } = await this.post("link/complete", {
      external_id: telegramUserId,
      code
    });
    if (status === 200) {
      return { ok: true };
    }
    if (status === 410) {
      return { ok: false, reason: "expired", message: errorMessage(body, status) };
    }
    if (status === 400) {
      const message = errorMessage(body, status);
      const reason = message.includes("different account") ? "mismatch" : "unsupported";
      return { ok: false, reason, message };
    }
    return { ok: false, reason: "server-error", message: errorMessage(body, status) };
  }

  /** Delete the mapping for this Telegram user. Returns whether a row went. */
  async unlink(telegramUserId: string): Promise<boolean> {
    const { status, body } = await this.request("DELETE", "link", {
      external_id: telegramUserId
    });
    if (status !== 200) {
      throw new IdentityError(errorMessage(body, status), status);
    }
    this.cache.delete(telegramUserId);
    return isRecord(body) && body.unlinked === true;
  }

  private post(path: string, payload: Record<string, string>) {
    return this.request("POST", path, payload);
  }

  private async request(
    method: "POST" | "DELETE",
    path: string,
    payload: Record<string, string>
  ): Promise<{ status: number; body: unknown }> {
    const url = `${this.apiUrl}/api/integrations/${this.provider}/${path}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.integrationToken}`
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      throw new IdentityError(
        `Cannot reach the NodeTool server at ${this.apiUrl}: ${(err as Error).message}`,
        null,
        { cause: err }
      );
    }

    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        // A non-JSON body (a proxy's HTML error page) carries no field to
        // read; the status alone is what the caller reports.
        body = null;
      }
    }
    return { status: response.status, body };
  }
}
