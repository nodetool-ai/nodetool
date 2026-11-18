/**
 * The cloud server origin a native app hands its bundled local server, and
 * the fetch that keeps the access token on that origin
 * (docs/plans/native-cloud-sync/technical-design.md, SR3, K9).
 *
 * The origin is the server the person signed in to. A self-hosted server can
 * sit on the LAN, so private addresses are allowed. Plain http is allowed only
 * to a loopback host, for a developer's own server. The fetch refuses any URL
 * on another origin and never follows a redirect, so the bearer token reaches
 * no other host.
 */
import { createHash } from "node:crypto";

/** The origin is not one the transfer client sends a token to. */
export class CloudOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudOriginError";
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Checks that `origin` is a bare https origin, or http to a loopback host,
 * and returns it unchanged. A path, query, fragment or user info is refused,
 * because the server key is the hash of the exact origin string.
 */
export function normalizeCloudOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new CloudOriginError("The cloud server origin is not a URL");
  }
  if (url.origin !== origin) {
    throw new CloudOriginError("The cloud server origin must have no path, query or user info");
  }
  if (url.protocol === "https:") return origin;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return origin;
  throw new CloudOriginError("The cloud server origin must use https");
}

/** The first 16 hex characters of the SHA-256 of the origin, as `native/account` computes it. */
export function cloudServerKey(origin: string): string {
  return createHash("sha256").update(normalizeCloudOrigin(origin)).digest("hex").slice(0, 16);
}

/**
 * A fetch that sends only to `origin` and hands a redirect back as the
 * response, which the transport reports as a refusal.
 */
export function cloudOriginFetch(
  origin: string,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch
): (url: string, init: RequestInit) => Promise<Response> {
  const allowed = normalizeCloudOrigin(origin);
  return async (url, init) => {
    if (new URL(url).origin !== allowed) {
      throw new CloudOriginError("The transfer client sends only to the signed-in cloud server");
    }
    return fetchImpl(url, { ...init, redirect: "manual" });
  };
}
