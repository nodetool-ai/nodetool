/**
 * Per-connection WebSocket message rate cap.
 *
 * Bounds how fast a single client can push inbound frames at the server, blunting
 * message-flood DoS on the long-lived /ws socket (which sits past the one-time
 * HTTP handshake the per-IP HTTP limiter sees). Tunable via:
 *
 *   NODETOOL_WS_RATE_LIMIT_DISABLED    Set truthy to turn the cap off.
 *   NODETOOL_WS_RATE_LIMIT_MAX         Max inbound messages per window (default 200).
 *   NODETOOL_WS_RATE_LIMIT_WINDOW_MS   Window length in ms (default 1000).
 */
import { parseIntEnv, parseBoolEnv } from "./env-config.js";

export interface WsRateLimitConfig {
  enabled: boolean;
  maxMessages: number;
  windowMs: number;
}

export function getWsRateLimitConfig(): WsRateLimitConfig {
  return {
    enabled: !parseBoolEnv("NODETOOL_WS_RATE_LIMIT_DISABLED"),
    maxMessages: parseIntEnv("NODETOOL_WS_RATE_LIMIT_MAX", 200),
    windowMs: parseIntEnv("NODETOOL_WS_RATE_LIMIT_WINDOW_MS", 1000)
  };
}

/**
 * Fixed-window message counter. O(1) per check, one instance per connection.
 */
export class WsMessageRateLimiter {
  private windowStart = 0;
  private count = 0;

  constructor(
    private readonly config: WsRateLimitConfig = getWsRateLimitConfig()
  ) {}

  /**
   * Record one inbound message. Returns false once the cap for the current
   * window is exceeded, signalling the caller to drop or close the connection.
   */
  allow(now: number = Date.now()): boolean {
    if (!this.config.enabled) return true;
    if (now - this.windowStart >= this.config.windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count += 1;
    return this.count <= this.config.maxMessages;
  }
}
