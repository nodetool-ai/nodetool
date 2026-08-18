/**
 * One-time link codes for the external-identity flow, shared by the two
 * surfaces that mint and consume them.
 *
 * A link always writes the same `external_identities` row, but it can start
 * from either end, and the half the code carries is the half the starter
 * already knows:
 *
 * - **Bot-minted** (`POST /api/integrations/:provider/link/start`, service
 *   token): the bridge knows the external account, not the NodeTool user. The
 *   code carries `externalId` and is redeemed by a signed-in browser, which
 *   supplies the user.
 * - **Web-minted** (`integrations.createLinkCode` over tRPC, user session): the
 *   browser knows the user, not the external account. The code carries
 *   `userId`, goes into a `t.me/<bot>?start=<code>` deep link, and is redeemed
 *   by the bridge's `/link/complete`, which supplies the external id.
 *
 * Both halves are therefore always present at redemption, and neither surface
 * ever accepts the half it did not mint on the caller's word: a browser cannot
 * name an external account, and the bridge cannot name a user.
 *
 * Storage is in-memory on purpose (design §5): a code lives ten minutes, and
 * losing one on restart costs a second `/link`, not data.
 */

import { randomBytes } from "node:crypto";

/** How long a link code stays usable. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** A code the bridge minted, waiting for a signed-in user to claim it. */
export interface BotMintedLinkCode {
  kind: "external";
  provider: string;
  externalId: string;
  expiresAtMs: number;
}

/** A code a signed-in user minted, waiting for an external account to claim it. */
export interface WebMintedLinkCode {
  kind: "user";
  provider: string;
  userId: string;
  expiresAtMs: number;
}

export type LinkCode = BotMintedLinkCode | WebMintedLinkCode;

export interface MintedLinkCode {
  code: string;
  expiresAtMs: number;
}

export interface LinkCodeStoreOptions {
  /** Injected clock, so expiry is testable without waiting. */
  now?: () => number;
  ttlMs?: number;
}

export class LinkCodeStore {
  private readonly codes = new Map<string, LinkCode>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: LinkCodeStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? LINK_CODE_TTL_MS;
  }

  /** Mint a code bound to an external account, awaiting a NodeTool user. */
  mintForExternalAccount(provider: string, externalId: string): MintedLinkCode {
    return this.mint({
      kind: "external",
      provider,
      externalId,
      expiresAtMs: this.now() + this.ttlMs
    });
  }

  /** Mint a code bound to a NodeTool user, awaiting an external account. */
  mintForUser(provider: string, userId: string): MintedLinkCode {
    return this.mint({
      kind: "user",
      provider,
      userId,
      expiresAtMs: this.now() + this.ttlMs
    });
  }

  /**
   * Read a code without spending it, so a confirmation page can name the
   * account it is about to link. An expired code reads as absent.
   */
  peek(code: string): LinkCode | null {
    this.prune();
    return this.codes.get(code) ?? null;
  }

  /**
   * Spend a code. Single use: it is removed whether or not the caller goes on
   * to accept it, so a guessed code cannot be probed against several accounts.
   */
  consume(code: string): LinkCode | null {
    this.prune();
    const entry = this.codes.get(code);
    if (!entry) return null;
    this.codes.delete(code);
    return entry;
  }

  /** Codes currently outstanding — for tests and diagnostics. */
  get size(): number {
    this.prune();
    return this.codes.size;
  }

  private mint(entry: LinkCode): MintedLinkCode {
    this.prune();
    const code = randomBytes(24).toString("base64url");
    this.codes.set(code, entry);
    return { code, expiresAtMs: entry.expiresAtMs };
  }

  private prune(): void {
    const cutoff = this.now();
    for (const [code, entry] of this.codes) {
      if (entry.expiresAtMs <= cutoff) this.codes.delete(code);
    }
  }
}

/**
 * The process-wide store. Both directions must see one another's codes — a
 * deep link minted in the browser is redeemed by the bridge, and vice versa —
 * so the service routes and the tRPC router share this instance. Tests inject
 * their own.
 */
export const sharedLinkCodes = new LinkCodeStore();
