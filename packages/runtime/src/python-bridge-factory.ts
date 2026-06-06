/**
 * Factory that selects the right Python worker bridge transport.
 *
 * Centralizes the one decision every server entry point would otherwise
 * duplicate: spawn a local Python subprocess, or attach to an already-running
 * remote worker over WebSocket?
 *
 * The selector is the `NODETOOL_WORKER_URL` environment variable:
 *
 * - When set, it must be the full WebSocket URL of a running worker — a
 *   `ws://` or `wss://` address (e.g. the Docker container's port, such as
 *   `ws://127.0.0.1:7777`). The remote {@link WebsocketPythonBridge} is used.
 *   That bridge never spawns a process and is allowed to connect in production,
 *   unlike the local stdio bridge.
 * - When unset (or blank), the local {@link PythonStdioBridge} is used — it
 *   spawns `python -m nodetool.worker` as a subprocess and is gated to
 *   non-production environments (unless explicitly overridden).
 *
 * `options.wsUrl` takes precedence over the env var, so programmatic and test
 * callers can force the WebSocket transport without mutating the environment.
 */

import { PythonStdioBridge } from "./python-stdio-bridge.js";
import { WebsocketPythonBridge } from "./python-websocket-bridge.js";
import type { PythonBridgeBase } from "./python-bridge-base.js";
import type { PythonBridgeOptions } from "./python-bridge-types.js";

/**
 * Create the appropriate Python worker bridge for the current environment.
 *
 * Returns a {@link WebsocketPythonBridge} when a WebSocket URL is supplied via
 * `options.wsUrl` or the `NODETOOL_WORKER_URL` env var; otherwise returns a
 * local {@link PythonStdioBridge}. See the module doc for the full contract.
 */
export function createPythonBridge(
  options: PythonBridgeOptions = {}
): PythonBridgeBase {
  const wsUrl = options.wsUrl ?? process.env["NODETOOL_WORKER_URL"];
  if (wsUrl && wsUrl.trim()) {
    return new WebsocketPythonBridge({ ...options, wsUrl: wsUrl.trim() });
  }
  return new PythonStdioBridge(options);
}
