/**
 * Accepting native device sessions: the `ntd_` access token decision the
 * auth hook makes, its 30-second validation cache, and the WebSocket
 * connections a session holds open.
 *
 * Revocation bound (technical design, "Authorization at acceptance"): a
 * revoked session stops authenticating new requests on the process that
 * revoked it at once, and on every other process when its cache entry
 * expires, at most 30 seconds later. Its open WebSockets close at once on the
 * revoking process, and within one sweep (30 seconds) elsewhere. Both stay
 * under the 60-second bound.
 */

import { createHash } from "node:crypto";
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
}

const checks = new Map<string, CachedCheck>();

function cacheKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type NativeTokenDecision =
  | { ok: true; userId: string; grantId: string }
  | { ok: false };

/**
 * Decide an `ntd_` bearer presentation. Refused on `/mcp` (the MCP audience
 * takes `nta_` only), when native sign-in is not enabled on this server, and
 * when the token, its expiry or its grant does not verify.
 */
export async function authenticateNativeAccessToken(
  token: string,
  pathname: string,
  now: number = Date.now()
): Promise<NativeTokenDecision> {
  if (pathname === "/mcp" || pathname.startsWith("/mcp/")) return { ok: false };
  if (nativeSignInState().state !== "enabled") return { ok: false };
  const key = cacheKey(token);
  const cached = checks.get(key);
  if (cached && now - cached.checkedAt < NATIVE_VALIDATION_TTL_MS) {
    return { ok: true, userId: cached.userId, grantId: cached.grantId };
  }
  checks.delete(key);
  const verified = await McpOauthToken.verifyNativeAccess(token);
  if (!verified) return { ok: false };
  checks.set(key, {
    userId: verified.userId,
    grantId: verified.grantId,
    checkedAt: now
  });
  void McpOauthGrant.touch(verified.grantId, now).catch((error: unknown) => {
    // "Last used" in Settings is informational; never fail the request.
    log.warn("Could not record device session use", {
      error: error instanceof Error ? error.message : String(error)
    });
  });
  return { ok: true, userId: verified.userId, grantId: verified.grantId };
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

const openSockets = new Map<string, Set<CloseSocket>>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Track one socket opened with a native session. Returns its untrack. */
export function trackNativeSessionSocket(
  grantId: string,
  close: CloseSocket
): () => void {
  let sockets = openSockets.get(grantId);
  if (!sockets) {
    sockets = new Set();
    openSockets.set(grantId, sockets);
  }
  sockets.add(close);
  startSweep();
  return () => {
    const current = openSockets.get(grantId);
    if (!current) return;
    current.delete(close);
    if (current.size === 0) openSockets.delete(grantId);
    if (openSockets.size === 0) stopSweep();
  };
}

function closeNativeSessionSockets(grantId: string): number {
  const sockets = openSockets.get(grantId);
  if (!sockets) return 0;
  openSockets.delete(grantId);
  if (openSockets.size === 0) stopSweep();
  for (const close of sockets) {
    try {
      close();
    } catch {
      // Already closed.
    }
  }
  return sockets.size;
}

/**
 * Re-check every grant with an open socket and close the ended ones. A
 * socket authenticated once at its handshake; this is what ends it when the
 * session was revoked on another process.
 */
export async function sweepNativeSessionSockets(): Promise<void> {
  const signInOn = nativeSignInState().state === "enabled";
  for (const grantId of [...openSockets.keys()]) {
    try {
      const grant = signInOn ? await McpOauthGrant.get(grantId) : null;
      if (!grant || grant.revoked_at) endNativeSessionLocally(grantId);
    } catch {
      // The database is unreachable; the next sweep tries again.
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

/** Test hook: forget every cached check and tracked socket. */
export function resetNativeSessionState(): void {
  checks.clear();
  openSockets.clear();
  stopSweep();
}
