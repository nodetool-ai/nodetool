/**
 * TokenStore — the token-shaped persistence layer.
 *
 * Sits between the provider (which thinks in `OAuthTokens`) and the
 * `SecureCredentialStore` (which thinks in opaque strings). Keeping this seam
 * explicit is what satisfies "separate token storage from provider
 * implementation": the provider depends only on the `TokenStore` interface and
 * never learns where bytes actually live.
 */

import type { Logger } from "@nodetool-ai/config";
import type { OAuthTokens } from "./types.js";
import type { SecureCredentialStore } from "./secure-credential-store.js";
import { isNumber, isObjectLike, isString } from "../../type-predicates.js";

/** Load / persist / clear a single account's OAuth token set. */
export interface TokenStore {
  /** Return the persisted tokens, or null if the account has none. */
  load(): Promise<OAuthTokens | null>;
  /** Persist the given token set, replacing any previous one. */
  save(tokens: OAuthTokens): Promise<void>;
  /** Remove all persisted tokens for this account. */
  clear(): Promise<void>;
}

/** Runtime shape used to validate untrusted JSON read back from storage. */
function parseTokens(raw: string): OAuthTokens | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObjectLike(value)) return null;
  const v = value as Record<string, unknown>;
  if (!isString(v.accessToken)) return null;
  return {
    accessToken: v.accessToken,
    refreshToken: isString(v.refreshToken) ? v.refreshToken : null,
    tokenType: isString(v.tokenType) ? v.tokenType : "Bearer",
    scope: isString(v.scope) ? v.scope : null,
    expiresAt: isNumber(v.expiresAt) ? v.expiresAt : null,
    receivedAt: isNumber(v.receivedAt) ? v.receivedAt : Date.now()
  };
}

export interface SecureTokenStoreOptions {
  /** Backing secret store (e.g. OS keychain). */
  readonly credentialStore: SecureCredentialStore;
  /** Provider id, e.g. "openai" — part of the storage key. */
  readonly provider: string;
  /** Account identifier (user id / login) — part of the storage key. */
  readonly accountId: string;
  readonly logger?: Logger;
}

/**
 * `TokenStore` that serializes the token set to JSON and hands it to a
 * `SecureCredentialStore`. The full set — including the refresh token — is
 * written only through the secure backend, never to a plaintext config file.
 */
export class SecureTokenStore implements TokenStore {
  private readonly credentialStore: SecureCredentialStore;
  private readonly key: string;
  private readonly logger?: Logger;

  constructor(options: SecureTokenStoreOptions) {
    this.credentialStore = options.credentialStore;
    this.key = `${options.provider}:${options.accountId}`;
    this.logger = options.logger;
  }

  async load(): Promise<OAuthTokens | null> {
    const raw = await this.credentialStore.get(this.key);
    if (!raw) return null;
    const tokens = parseTokens(raw);
    if (!tokens) {
      this.logger?.warn("Discarding unparseable stored credential", { key: this.key });
    }
    return tokens;
  }

  async save(tokens: OAuthTokens): Promise<void> {
    await this.credentialStore.set(this.key, JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    await this.credentialStore.delete(this.key);
  }
}

/** Volatile `TokenStore` for tests — keeps a single token set in memory. */
export class InMemoryTokenStore implements TokenStore {
  private tokens: OAuthTokens | null = null;

  async load(): Promise<OAuthTokens | null> {
    return this.tokens;
  }

  async save(tokens: OAuthTokens): Promise<void> {
    this.tokens = tokens;
  }

  async clear(): Promise<void> {
    this.tokens = null;
  }
}
