/**
 * Per-IP HTTP request rate limiting configuration for the Fastify server.
 *
 * Backs `@fastify/rate-limit` to blunt brute-force (e.g. repeated auth attempts)
 * and crude HTTP flooding. Tunable via environment variables:
 *
 *   NODETOOL_RATE_LIMIT_DISABLED      Set truthy to turn the limiter off.
 *   NODETOOL_RATE_LIMIT_MAX           Max requests per window per IP (default 1000).
 *   NODETOOL_RATE_LIMIT_WINDOW_MS     Window length in ms (default 60000).
 *   NODETOOL_RATE_LIMIT_TRUST_PROXY   Key by X-Forwarded-For (req.ip) instead of
 *                                     the socket address. Only enable behind a
 *                                     trusted proxy that sets the header.
 *
 * Localhost is always exempt so local/Electron usage is never throttled — the
 * same posture the auth hook takes.
 */
import { parseIntEnv, parseBoolEnv } from "./env-config.js";

export interface HttpRateLimitConfig {
  enabled: boolean;
  max: number;
  /** Window length in milliseconds. */
  timeWindow: number;
  /**
   * When true, derive the client key from req.ip (X-Forwarded-For aware). Only
   * safe behind a trusted proxy — otherwise clients can spoof the header to mint
   * unlimited fresh buckets.
   */
  trustProxy: boolean;
}

export function getHttpRateLimitConfig(): HttpRateLimitConfig {
  return {
    enabled: !parseBoolEnv("NODETOOL_RATE_LIMIT_DISABLED"),
    max: parseIntEnv("NODETOOL_RATE_LIMIT_MAX", 1000),
    timeWindow: parseIntEnv("NODETOOL_RATE_LIMIT_WINDOW_MS", 60_000),
    trustProxy: parseBoolEnv("NODETOOL_RATE_LIMIT_TRUST_PROXY")
  };
}

interface KeyableRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
}

/**
 * Derive the rate-limit bucket key for a request.
 *
 * Defaults to the raw socket address rather than req.ip: with `trustProxy` on at
 * the Fastify level, req.ip reflects the (spoofable) X-Forwarded-For header, so a
 * client could mint unlimited fresh buckets and bypass the limit entirely. Set
 * `trustProxy` only when a trusted reverse proxy populates the header.
 */
export function rateLimitKey(req: KeyableRequest, trustProxy: boolean): string {
  if (trustProxy) {
    return req.ip ?? req.socket?.remoteAddress ?? "unknown";
  }
  return req.socket?.remoteAddress ?? req.ip ?? "unknown";
}

/** Localhost is never rate limited (mirrors the auth hook's localhost bypass). */
export function isRateLimitExempt(key: string): boolean {
  return (
    key === "127.0.0.1" ||
    key === "::1" ||
    key === "::ffff:127.0.0.1" ||
    key === "localhost"
  );
}
