/**
 * Per-connection health limits for the long-lived `/ws` socket.
 *
 * Two failure modes these bound, both invisible to `close` handlers:
 *
 *   Half-open peer — a client that vanished without a close frame (laptop
 *   sleep, NAT rebind, killed browser). The socket stays "open" forever, and
 *   with it the runner, its observers, its timers and its running jobs. A
 *   protocol-level ping plus an idle deadline turns that into a real close.
 *
 *   Slow consumer — a client that reads slower than the server streams. `send`
 *   buffers in memory with no upper bound, so one stalled reader can grow the
 *   server's heap until it dies. Sends wait for the buffer to drain, and a peer
 *   that never drains is dropped.
 *
 * Tunable via:
 *
 *   NODETOOL_WS_HEALTH_DISABLED         Set truthy to disable ping/idle checks.
 *   NODETOOL_WS_PING_INTERVAL_MS        Ping cadence (default 20000).
 *   NODETOOL_WS_IDLE_TIMEOUT_MS         Silence before the peer is dropped (default 70000).
 *   NODETOOL_WS_MAX_BUFFERED_BYTES      Outbound buffer before sends wait (default 8388608).
 *   NODETOOL_WS_DRAIN_TIMEOUT_MS        How long a send waits for drain (default 30000).
 *   NODETOOL_WS_MAX_QUEUED_FRAMES       Undelivered inbound frames before close (default 2000).
 */
import { parseIntEnv, parseBoolEnv } from "./env-config.js";

export interface WsConnectionHealthConfig {
  enabled: boolean;
  pingIntervalMs: number;
  idleTimeoutMs: number;
  maxBufferedBytes: number;
  drainTimeoutMs: number;
  maxQueuedFrames: number;
}

export function getWsConnectionHealthConfig(): WsConnectionHealthConfig {
  return {
    enabled: !parseBoolEnv("NODETOOL_WS_HEALTH_DISABLED"),
    pingIntervalMs: parseIntEnv("NODETOOL_WS_PING_INTERVAL_MS", 20_000),
    // Above the client's own 45s silence threshold, so the client gets to
    // notice and reconnect on its own before the server gives up on it.
    idleTimeoutMs: parseIntEnv("NODETOOL_WS_IDLE_TIMEOUT_MS", 70_000),
    maxBufferedBytes: parseIntEnv("NODETOOL_WS_MAX_BUFFERED_BYTES", 8 * 1024 * 1024),
    drainTimeoutMs: parseIntEnv("NODETOOL_WS_DRAIN_TIMEOUT_MS", 30_000),
    maxQueuedFrames: parseIntEnv("NODETOOL_WS_MAX_QUEUED_FRAMES", 2000)
  };
}
