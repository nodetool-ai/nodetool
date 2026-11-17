/**
 * Accepting native device sessions: the `ntd_` access token decision the
 * auth hook makes, its 30-second validation cache, and the WebSocket
 * connections a session holds open.
 *
 * Revocation bound (technical design, "Authorization at acceptance"): a
 * revoked session stops authenticating writes at once on every process,
 * since a write is never answered from the cache. Reads stop on the process
 * that revoked it at once, and on every other process when its cache entry
 * expires, at most 30 seconds later. Its open WebSockets close at once on the
 * revoking process, and within one sweep (30 seconds) elsewhere. Both stay
 * under the 60-second bound.
 *
 * Expiry: no cache entry outlives its token, and a socket closes when the
 * token that opened it expires, so a socket never outlives its credential.
 */

import { McpOauthGrant, McpOauthToken } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";
import { nativeSignInState } from "./native-gate.js";

const log = createLogger("nodetool.websocket.native-session");

/** How long a positive token check is reused, and the WebSocket sweep period. */
export const NATIVE_VALIDATION_TTL_MS = 30_000;

/** WebSocket close code for a connection whose device session ended. */
export const SESSION_REVOKED_CLOSE_CODE = 4401;

interface CachedCheck {
  userId: string;
  grantId: string;
  checkedAt: number;
  /** When the token itself expires, in milliseconds since the epoch. */
  expiresAt: number;
}

function cacheValid(entry: CachedCheck, now: number): boolean {
  return now - entry.checkedAt < NATIVE_VALIDATION_TTL_MS && now < entry.expiresAt;
}

/**
 * Keyed by the token itself. The map lives only in this process, which reads
 * the token from the request anyway, and an entry is gone 30 seconds after
 * its check.
 */
const checks = new Map<string, CachedCheck>();

/** Drop every entry older than the cache lifetime. */
function pruneChecks(now: number): void {
  for (const [key, entry] of checks) {
    if (!cacheValid(entry, now)) checks.delete(key);
  }
}

export type NativeTokenDecision =
  | { ok: true; userId: string; grantId: string; expiresAt: number }
  | { ok: false };

/**
 * Decide an `ntd_` bearer presentation. Refused on `/mcp` (the MCP audience
 * takes `nta_` only), when native sign-in is not enabled on this server, and
 * when the token, its expiry or its grant does not verify.
 */
export async function authenticateNativeAccessToken(
  token: string,
  pathname: string,
  now: number = Date.now(),
  options: { write?: boolean } = {}
): Promise<NativeTokenDecision> {
  if (pathname === "/mcp" || pathname.startsWith("/mcp/")) return { ok: false };
  if (nativeSignInState().state !== "enabled") return { ok: false };
  const cached = checks.get(token);
  // A write reads the grant from the database every time: a revocation
  // processed on another replica must refuse it at once (PRD, revocation).
  if (cached && !options.write && cacheValid(cached, now)) {
    return { ok: true, userId: cached.userId, grantId: cached.grantId, expiresAt: cached.expiresAt };
  }
  pruneChecks(now);
  const verified = await McpOauthToken.verifyNativeAccess(token);
  if (!verified) {
    checks.delete(token);
    return { ok: false };
  }
  const expiresAt = verified.expiresAt.getTime();
  if (now >= expiresAt) {
    checks.delete(token);
    return { ok: false };
  }
  checks.set(token, {
    userId: verified.userId,
    grantId: verified.grantId,
    checkedAt: now,
    expiresAt
  });
  void McpOauthGrant.touch(verified.grantId, now).catch((error: unknown) => {
    // "Last used" in Settings is informational; never fail the request.
    log.warn("Could not record device session use", {
      error: error instanceof Error ? error.message : String(error)
    });
  });
  return { ok: true, userId: verified.userId, grantId: verified.grantId, expiresAt };
}

/**
 * Forget every cached check of a grant and close its sockets on this
 * process. Call after any write that ends a native grant.
 */
export function endNativeSessionLocally(grantId: string): void {
  for (const [key, entry] of checks) {
    if (entry.grantId === grantId) checks.delete(key);
  }
  closeNativeSessionSockets(grantId);
}

// ── Open WebSocket connections ────────────────────────────────────────

type CloseSocket = () => void;

/** One socket and the credential that opened it. */
interface TrackedSocket {
  close: CloseSocket;
  token: string;
  /** Closes the socket when its token expires. */
  expiryTimer: ReturnType<typeof setTimeout>;
}

const openSockets = new Map<string, Set<TrackedSocket>>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Track one socket opened with a native session: its grant, the token it
 * presented and when that token expires. The socket closes at the expiry, at
 * a revocation on this process, or at the first sweep after its token stops
 * verifying. Returns its untrack.
 */
export function trackNativeSessionSocket(
  grantId: string,
  token: string,
  expiresAt: number,
  close: CloseSocket,
  now: number = Date.now()
): () => void {
  let sockets = openSockets.get(grantId);
  if (!sockets) {
    sockets = new Set();
    openSockets.set(grantId, sockets);
  }
  const tracked: TrackedSocket = {
    close,
    token,
    expiryTimer: setTimeout(() => closeTrackedSocket(grantId, tracked), Math.max(0, expiresAt - now))
  };
  tracked.expiryTimer.unref?.();
  sockets.add(tracked);
  startSweep();
  return () => untrackSocket(grantId, tracked);
}

function untrackSocket(grantId: string, tracked: TrackedSocket): void {
  clearTimeout(tracked.expiryTimer);
  const current = openSockets.get(grantId);
  if (!current) return;
  current.delete(tracked);
  if (current.size === 0) openSockets.delete(grantId);
  if (openSockets.size === 0) stopSweep();
}

function closeTrackedSocket(grantId: string, tracked: TrackedSocket): void {
  untrackSocket(grantId, tracked);
  try {
    tracked.close();
  } catch {
    // Already closed.
  }
}

function closeNativeSessionSockets(grantId: string): number {
  const sockets = openSockets.get(grantId);
  if (!sockets) return 0;
  const closing = [...sockets];
  for (const tracked of closing) closeTrackedSocket(grantId, tracked);
  return closing.length;
}

/**
 * Verify the token of every open socket again and close the sockets whose
 * token no longer verifies: revoked on another process, deleted, or expired.
 * A socket authenticated once at its handshake; this is what ends it when its
 * session ended elsewhere.
 */
export async function sweepNativeSessionSockets(): Promise<void> {
  const signInOn = nativeSignInState().state === "enabled";
  for (const [grantId, sockets] of [...openSockets]) {
    for (const tracked of [...sockets]) {
      try {
        const verified = signInOn ? await McpOauthToken.verifyNativeAccess(tracked.token) : null;
        if (!verified || verified.grantId !== grantId || Date.now() >= verified.expiresAt.getTime()) {
          closeTrackedSocket(grantId, tracked);
        }
      } catch {
        // The database is unreachable; the next sweep tries again.
      }
    }
  }
}

function startSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void sweepNativeSessionSockets();
  }, NATIVE_VALIDATION_TTL_MS);
  sweepTimer.unref?.();
}

function stopSweep(): void {
  if (!sweepTimer) return;
  clearInterval(sweepTimer);
  sweepTimer = null;
}

/** Test hook: how many token checks are cached. */
export function nativeValidationCacheSize(): number {
  return checks.size;
}

/** Test hook: forget every cached check and tracked socket. */
export function resetNativeSessionState(): void {
  checks.clear();
  for (const sockets of openSockets.values()) {
    for (const tracked of sockets) clearTimeout(tracked.expiryTimer);
  }
  openSockets.clear();
  stopSweep();
}
