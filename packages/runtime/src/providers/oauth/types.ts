/**
 * Shared types for the OpenAI OAuth subsystem.
 *
 * Everything here is plain data — no behaviour, no I/O — so it can be imported
 * freely by every layer (PKCE, client, stores, provider) without creating
 * cycles.
 */

/** PKCE code-challenge method. NodeTool only supports the secure S256 variant. */
export type CodeChallengeMethod = "S256";

/** A PKCE verifier/challenge pair plus the method used to derive the challenge. */
export interface PkcePair {
  /** High-entropy random string kept secret on the client. */
  readonly verifier: string;
  /** BASE64URL(SHA-256(verifier)) sent in the authorization request. */
  readonly challenge: string;
  readonly method: CodeChallengeMethod;
}

/**
 * A normalized OAuth token set. Timestamps are epoch milliseconds so they are
 * trivially comparable against `Date.now()` and survive JSON round-trips.
 */
export interface OAuthTokens {
  readonly accessToken: string;
  /** May be absent — some providers omit it on refresh and reuse the old one. */
  readonly refreshToken: string | null;
  readonly tokenType: string;
  readonly scope: string | null;
  /** Absolute expiry in epoch ms, or null when the provider sends no expiry. */
  readonly expiresAt: number | null;
  /** When this set was minted (epoch ms). */
  readonly receivedAt: number;
}

/** Static configuration for talking to an OAuth 2.0 authorization server. */
export interface OAuthClientConfig {
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  /** RFC 7009 revocation endpoint. Optional — not every server exposes one. */
  readonly revocationEndpoint?: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  /** Optional `audience` parameter required by some providers. */
  readonly audience?: string;
  /** Extra static query params merged into the authorization URL. */
  readonly extraAuthParams?: Readonly<Record<string, string>>;
}

/** Parameters needed to build a single authorization URL. */
export interface AuthorizationUrlParams {
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: CodeChallengeMethod;
}

/** The authorization code returned to the redirect URI by the browser. */
export interface AuthorizationResult {
  readonly code: string;
  readonly state: string;
}

/** Injectable clock so tests can control expiry math without real time. */
export interface Clock {
  now(): number;
}

/** Default wall-clock implementation. */
export const systemClock: Clock = {
  now: () => Date.now()
};
