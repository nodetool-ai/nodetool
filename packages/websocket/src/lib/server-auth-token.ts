/**
 * The static bearer token a `nodetool deploy` container is started with.
 *
 * The deploy tooling generates `SERVER_AUTH_TOKEN`, passes it to the container,
 * and sends it as `Authorization: Bearer <token>` from the CLI. In Local mode
 * the server accepts it as user "1", which is the user every other Local-mode
 * credential maps to. Supabase mode ignores it: a shared secret must never
 * stand in for a real login there.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** The configured token, or null when unset or blank. */
export function resolveServerAuthToken(
  envValue: string | undefined
): string | null {
  const token = envValue?.trim();
  return token ? token : null;
}

/**
 * Constant-time comparison of a presented bearer token with the configured
 * one. Both sides are hashed first so the comparison length does not reveal
 * the configured token's length.
 */
export function matchesServerAuthToken(
  presented: string | null | undefined,
  configured: string | null
): boolean {
  if (!configured || !presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}
