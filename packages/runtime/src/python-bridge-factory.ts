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
 *
 * Auth: the WebSocket bridge's shared-secret bearer token is sourced the same
 * way — `options.workerToken ?? process.env.NODETOOL_WORKER_TOKEN`. When set,
 * the bridge sends `Authorization: Bearer <token>` on connect and every
 * reconnect; when unset/empty, no header is sent.
 */

import { PythonStdioBridge } from "./python-stdio-bridge.js";
import { WebsocketPythonBridge } from "./python-websocket-bridge.js";
import type { PythonBridgeBase } from "./python-bridge-base.js";
import type { PythonBridgeOptions } from "./python-bridge-types.js";

/**
 * Called with every bridge {@link createPythonBridge} builds.
 *
 * The hook exists so a host can attach cross-cutting wiring to bridges it
 * never sees constructed — the worker idle-clock heartbeat, whose listener
 * needs database access this package does not have. Registering is what makes
 * a host a heartbeat source; a host that registers nothing is unaffected.
 */
export type PythonBridgeObserver = (bridge: PythonBridgeBase) => void;

const bridgeObservers = new Set<PythonBridgeObserver>();

/**
 * Register an observer for every bridge created from now on. Returns a
 * function that unregisters it. An observer that throws is ignored: bridge
 * creation must not fail because a bystander did.
 */
export function onPythonBridgeCreated(
  observer: PythonBridgeObserver
): () => void {
  bridgeObservers.add(observer);
  return () => bridgeObservers.delete(observer);
}

function notifyBridgeObservers(bridge: PythonBridgeBase): PythonBridgeBase {
  for (const observer of bridgeObservers) {
    try {
      observer(bridge);
    } catch {
      // best-effort: an observer must not break the bridge it observes
    }
  }
  return bridge;
}

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
    const workerToken =
      options.workerToken ?? process.env["NODETOOL_WORKER_TOKEN"];
    return notifyBridgeObservers(
      new WebsocketPythonBridge({
        ...options,
        wsUrl: wsUrl.trim(),
        workerToken
      })
    );
  }
  return notifyBridgeObservers(new PythonStdioBridge(options));
}
