/**
 * The cloud window's local store (D27, technical design, "Local data
 * scoping and durable drafts"; WP1.15).
 *
 * The cloud window runs in its own session, which carries no local client
 * token, so its page cannot call the local server. Its drafts and open state
 * go through here instead: main calls `cloudLocal.*` on the app's own server
 * with the token, and names the server key and account from the cloud
 * window's origin. The page cannot choose them, so it never reads another
 * account's rows.
 */
import { createHash } from "node:crypto";

import { isLoopbackHttpOrigin } from "./cloudRequests";
import { LOCAL_CLIENT_TOKEN_HEADER } from "./localClientToken";
import type { CloudLocalResult, CloudWindowOrigin } from "./types.d";

export type { CloudLocalResult } from "./types.d";

/** The procedures the cloud window may call. */
export const CLOUD_LOCAL_PROCEDURES = new Set([
  "cloudLocal.drafts.put",
  "cloudLocal.drafts.get",
  "cloudLocal.drafts.list",
  "cloudLocal.drafts.accept",
  "cloudLocal.drafts.markUnsent",
  "cloudLocal.drafts.discard",
  "cloudLocal.openState.record",
  "cloudLocal.openState.get",
]);

/** Upper bound on a call's input and on its answer, either way. */
export const MAX_CLOUD_LOCAL_BYTES = 16 * 1024 * 1024;

const CLOUD_LOCAL_TIMEOUT_MS = 30_000;

export interface CloudLocalDeps {
  /** The cloud window's origin when `webContentsId` is the cloud window. */
  originFor: (webContentsId: number) => CloudWindowOrigin | null;
  localOrigin: () => string | null;
  localClientToken: () => string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
}

/** The first 16 hex characters of the SHA-256 of a server origin, as native/account computes it. */
export function serverKeyOf(origin: string): string {
  return createHash("sha256").update(origin).digest("hex").slice(0, 16);
}

/**
 * Calls `procedure` on the local server for the cloud window `webContentsId`.
 * Any other window is refused. Never throws.
 */
export async function callCloudLocal(
  deps: CloudLocalDeps,
  webContentsId: number,
  procedure: string,
  input: Record<string, unknown>
): Promise<CloudLocalResult> {
  const origin = deps.originFor(webContentsId);
  const localOrigin = deps.localOrigin();
  if (!origin || !CLOUD_LOCAL_PROCEDURES.has(procedure)) {
    return { ok: false, error: "REFUSED" };
  }
  if (!localOrigin || !isLoopbackHttpOrigin(localOrigin)) {
    return { ok: false, error: "UNAVAILABLE" };
  }
  const body = JSON.stringify({ ...input, server_key: serverKeyOf(origin.server), account_id: origin.account });
  if (Buffer.byteLength(body) > MAX_CLOUD_LOCAL_BYTES) {
    return { ok: false, error: "REFUSED" };
  }
  try {
    const response = await deps.fetch(`${localOrigin}/trpc/${procedure}`, {
      method: "POST",
      headers: [
        ["content-type", "application/json"],
        [LOCAL_CLIENT_TOKEN_HEADER, deps.localClientToken()],
      ],
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(CLOUD_LOCAL_TIMEOUT_MS),
    });
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_CLOUD_LOCAL_BYTES) {
      return { ok: false, error: "FAILED" };
    }
    const answer: { result?: { data?: unknown }; error?: { message?: string } } = JSON.parse(text);
    if (!response.ok || !answer.result) {
      return { ok: false, error: "FAILED", message: answer.error?.message ?? "" };
    }
    return { ok: true, data: answer.result.data ?? null };
  } catch {
    return { ok: false, error: "UNAVAILABLE" };
  }
}
