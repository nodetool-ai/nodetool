/**
 * Request-time checks against the user directory (`nodetool_user_accounts`).
 *
 * An SSO session is a signed token that stays valid until it expires, so the
 * auth hook asks here whether an admin has disabled the account behind it.
 * The answer is cached per process for {@link ACCOUNT_STATUS_TTL_MS}: a change
 * made on this process applies at once (`forgetAccountStatus`), and one made on
 * another replica applies within the TTL.
 *
 * An id with no directory row is allowed. Rows exist only for SSO sign-ins,
 * and access tokens, API users and the Local-mode user predate the directory.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { createLogger } from "@nodetool-ai/config";
import { getUserAccount, touchUserLastSeen } from "@nodetool-ai/models";

import { denyWithStatus } from "./ws-upgrade.js";

const log = createLogger("nodetool.websocket.user-directory");

export const ACCOUNT_STATUS_TTL_MS = 30_000;
/** How often one user's `last_seen_at` is written at most. */
export const LAST_SEEN_INTERVAL_MS = 5 * 60_000;

export type AccountAccess = "allowed" | "disabled";

interface CachedStatus {
  access: AccountAccess;
  at: number;
}

const statusCache = new Map<string, CachedStatus>();
const lastSeenWrites = new Map<string, number>();

/** The Local-mode owner. Never stored in the directory, never disabled. */
const LOCAL_OWNER_ID = "1";

/**
 * Whether `userId` may use the server. Throws when the directory cannot be
 * read, so the caller decides how to fail.
 */
export async function accountAccess(
  userId: string,
  now: number = Date.now()
): Promise<AccountAccess> {
  if (userId === LOCAL_OWNER_ID) return "allowed";
  const cached = statusCache.get(userId);
  if (cached && now - cached.at < ACCOUNT_STATUS_TTL_MS) {
    return cached.access;
  }
  const account = await getUserAccount(userId);
  const access: AccountAccess =
    account && account.status !== "active" ? "disabled" : "allowed";
  statusCache.set(userId, { access, at: now });
  if (account && access === "allowed") recordActivity(userId, now);
  return access;
}

/**
 * `onRequest` hook, registered after the auth hook: refuse a request whose
 * user is disabled with 403 `account_disabled`. App-session visitors act as
 * the app's owner, so a disabled owner's apps stop too. When the directory
 * cannot be read the request is refused with 503 rather than let through.
 */
export async function enforceAccountStatus(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!req.userId || reply.sent) return;
  try {
    if ((await accountAccess(req.userId)) === "disabled") {
      denyWithStatus(req, reply, 403, { error: "account_disabled" });
    }
  } catch (error) {
    log.error("Could not read the user directory", {
      error: error instanceof Error ? error.message : String(error)
    });
    denyWithStatus(req, reply, 503, { error: "user_directory_unavailable" });
  }
}

/** Drop the cached status so the next request reads the directory. */
export function forgetAccountStatus(userId: string): void {
  statusCache.delete(userId);
}

/** Test hook: forget every cached status and activity write. */
export function resetUserDirectoryCache(): void {
  statusCache.clear();
  lastSeenWrites.clear();
  openSockets.clear();
  stopSweep();
}

function recordActivity(userId: string, now: number): void {
  const last = lastSeenWrites.get(userId);
  if (last !== undefined && now - last < LAST_SEEN_INTERVAL_MS) return;
  lastSeenWrites.set(userId, now);
  void touchUserLastSeen(userId, new Date(now)).catch((error: unknown) => {
    // Last-seen is shown to admins; a failed write must not fail a request.
    log.warn("Could not record user activity", {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

// ── Open WebSocket connections ────────────────────────────────────────
// The status check above runs at the handshake, so a socket opened before an
// account was disabled would otherwise stay usable. Sockets are tracked per
// user; disabling closes them on this process at once, and a sweep closes
// them on every other replica within the status TTL.

/** WebSocket close code for a connection whose account was disabled. */
export const ACCOUNT_DISABLED_CLOSE_CODE = 4403;

type CloseSocket = () => void;

const openSockets = new Map<string, Set<CloseSocket>>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Track one open socket for `userId`. Returns the function to call when the
 * socket closes on its own.
 */
export function trackUserSocket(userId: string, close: CloseSocket): () => void {
  if (userId === LOCAL_OWNER_ID) return () => {};
  let sockets = openSockets.get(userId);
  if (!sockets) {
    sockets = new Set();
    openSockets.set(userId, sockets);
  }
  sockets.add(close);
  startSweep();
  return () => {
    const current = openSockets.get(userId);
    if (!current) return;
    current.delete(close);
    if (current.size === 0) openSockets.delete(userId);
    if (openSockets.size === 0) stopSweep();
  };
}

/** Close every tracked socket of `userId` on this process. */
export function closeUserSockets(userId: string): number {
  const sockets = openSockets.get(userId);
  if (!sockets) return 0;
  openSockets.delete(userId);
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

/** Re-check every user with an open socket and close disabled ones. */
export async function sweepDisabledSockets(now: number = Date.now()): Promise<void> {
  for (const userId of [...openSockets.keys()]) {
    try {
      if ((await accountAccess(userId, now)) === "disabled") {
        closeUserSockets(userId);
      }
    } catch {
      // The directory is unreachable; the next sweep tries again.
    }
  }
}

function startSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void sweepDisabledSockets();
  }, ACCOUNT_STATUS_TTL_MS);
  sweepTimer.unref?.();
}

function stopSweep(): void {
  if (!sweepTimer) return;
  clearInterval(sweepTimer);
  sweepTimer = null;
}
