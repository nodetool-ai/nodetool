/**
 * How this server is deployed — one answer, read from the environment.
 *
 * `NODE_ENV` does not answer it: the desktop backend (`electron/src/server.ts`)
 * and the Docker image both set `NODE_ENV=production` while serving one user on
 * their own machine. What separates a shared deployment from a local install is
 * whether a remote identity provider is configured, so that is what this asks.
 */
import { safeProcessEnv } from "./node-import.js";

/**
 * True when Supabase auth is configured (`SUPABASE_URL` + `SUPABASE_KEY`).
 */
export function isSupabaseAuthConfigured(
  env: Record<string, string | undefined> = safeProcessEnv()
): boolean {
  return Boolean(env["SUPABASE_URL"]?.trim() && env["SUPABASE_KEY"]?.trim());
}

/**
 * True when OpenID Connect single sign-on is configured (`OIDC_ISSUER` +
 * `OIDC_CLIENT_ID`), the self-hosted alternative to Supabase auth.
 */
export function isOidcAuthConfigured(
  env: Record<string, string | undefined> = safeProcessEnv()
): boolean {
  return Boolean(env["OIDC_ISSUER"]?.trim() && env["OIDC_CLIENT_ID"]?.trim());
}

/**
 * True when the server enforces authentication — a remote identity provider
 * (Supabase, or an OIDC provider for SSO) is configured, so every request
 * carries a user token and the host is shared. False for a local install,
 * where loopback is trusted and the machine belongs to the person using it.
 */
export function isAuthEnforced(
  env: Record<string, string | undefined> = safeProcessEnv()
): boolean {
  return isSupabaseAuthConfigured(env) || isOidcAuthConfigured(env);
}

/**
 * Names the absolute maximum age, in days, of a desktop sign-in or MCP grant.
 * Refreshing a grant never extends it past this age.
 */
export const OAUTH_GRANT_MAX_AGE_ENV = "NODETOOL_OAUTH_GRANT_MAX_AGE_DAYS";
/**
 * The maximum grant age under SSO when the operator sets none. Group
 * membership at the identity provider is checked at sign-in only, so a grant
 * created from an SSO session must end on its own. 30 days matches the
 * longest `OIDC_SESSION_TTL_SECONDS` and the MCP refresh chain.
 */
export const DEFAULT_SSO_OAUTH_GRANT_MAX_AGE_DAYS = 30;
const MAX_OAUTH_GRANT_MAX_AGE_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The absolute maximum age of an OAuth grant in milliseconds, or null for no
 * maximum. `NODETOOL_OAUTH_GRANT_MAX_AGE_DAYS` sets it: a whole number of
 * days from 1 to 3650, or 0 for no maximum. Unset, it is 30 days under SSO
 * and no maximum otherwise. Throws on any other value, so the server refuses
 * to start with a typo in it.
 */
export function oauthGrantMaxAgeMs(
  env: Record<string, string | undefined> = safeProcessEnv()
): number | null {
  const raw = env[OAUTH_GRANT_MAX_AGE_ENV]?.trim();
  if (!raw) {
    return isOidcAuthConfigured(env)
      ? DEFAULT_SSO_OAUTH_GRANT_MAX_AGE_DAYS * DAY_MS
      : null;
  }
  const days = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(days) || days > MAX_OAUTH_GRANT_MAX_AGE_DAYS) {
    throw new Error(
      `${OAUTH_GRANT_MAX_AGE_ENV} must be a whole number of days between 0 ` +
        `and ${MAX_OAUTH_GRANT_MAX_AGE_DAYS}, got "${raw.slice(0, 32)}"`
    );
  }
  return days === 0 ? null : days * DAY_MS;
}
