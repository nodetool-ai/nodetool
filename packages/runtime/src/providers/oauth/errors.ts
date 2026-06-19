/**
 * Typed error hierarchy for the OAuth subsystem.
 *
 * Every failure mode in the spec maps to a concrete subclass so callers can
 * branch on `instanceof` (or on the stable `code`) rather than string-matching
 * messages. Error messages NEVER contain token material — see `redaction.ts`.
 */

export type OAuthErrorCode =
  | "invalid_refresh_token"
  | "session_expired"
  | "browser_launch_failed"
  | "callback_timeout"
  | "network_error"
  | "credentials_revoked"
  | "state_mismatch"
  | "authorization_denied"
  | "token_exchange_failed"
  | "not_authenticated";

/** Base class for everything thrown by the OAuth subsystem. */
export class OAuthError extends Error {
  readonly code: OAuthErrorCode;

  constructor(code: OAuthErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
    // Restore prototype chain for transpiled `extends Error`.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The stored refresh token was rejected by the server (invalid_grant). */
export class InvalidRefreshTokenError extends OAuthError {
  constructor(message = "Refresh token is invalid or expired", options?: ErrorOptions) {
    super("invalid_refresh_token", message, options);
  }
}

/** No usable credentials in the store / access token expired with no refresh. */
export class SessionExpiredError extends OAuthError {
  constructor(message = "Session expired; re-authentication required", options?: ErrorOptions) {
    super("session_expired", message, options);
  }
}

/** The default browser could not be launched for the authorization request. */
export class BrowserLaunchError extends OAuthError {
  constructor(message = "Failed to open the browser for authentication", options?: ErrorOptions) {
    super("browser_launch_failed", message, options);
  }
}

/** The user did not complete the browser flow within the allotted time. */
export class CallbackTimeoutError extends OAuthError {
  constructor(message = "Timed out waiting for the OAuth callback", options?: ErrorOptions) {
    super("callback_timeout", message, options);
  }
}

/** A network-level failure (DNS, TLS, connection reset) talking to the server. */
export class OAuthNetworkError extends OAuthError {
  constructor(message = "Network error during OAuth request", options?: ErrorOptions) {
    super("network_error", message, options);
  }
}

/** The credentials were revoked server-side (access_denied / revoked grant). */
export class CredentialsRevokedError extends OAuthError {
  constructor(message = "Credentials were revoked", options?: ErrorOptions) {
    super("credentials_revoked", message, options);
  }
}

/** CSRF guard: the `state` returned to the callback did not match. */
export class StateMismatchError extends OAuthError {
  constructor(message = "OAuth state mismatch — possible CSRF", options?: ErrorOptions) {
    super("state_mismatch", message, options);
  }
}

/** The user denied the authorization request in the browser. */
export class AuthorizationDeniedError extends OAuthError {
  constructor(message = "Authorization was denied", options?: ErrorOptions) {
    super("authorization_denied", message, options);
  }
}

/** The authorization-code → token exchange failed for a non-network reason. */
export class TokenExchangeError extends OAuthError {
  constructor(message = "Failed to exchange authorization code for tokens", options?: ErrorOptions) {
    super("token_exchange_failed", message, options);
  }
}

/** A request requiring authentication was made before login completed. */
export class NotAuthenticatedError extends OAuthError {
  constructor(message = "Not authenticated; call login() first", options?: ErrorOptions) {
    super("not_authenticated", message, options);
  }
}
