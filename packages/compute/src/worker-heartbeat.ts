// Worker idle-clock heartbeat.
//
// The reaper pauses an instance after `idle_timeout_minutes` of inactivity,
// measured from `last_activity_at`. That column only moves when something
// touches it, and the only thing that can is a host with database access that
// is watching the Python bridge. This module is that wiring, kept out of any
// single host so every DB-having host — the websocket server, the CLI —
// installs the same behaviour instead of each reimplementing it.
//
// The bridge is taken structurally (an event emitter with an `"activity"`
// event) so `@nodetool-ai/compute` stays free of a `@nodetool-ai/runtime`
// dependency, the same way `WorkerManager` does.

import {
  touchWorkerInstance,
  type WorkerInstance,
} from "@nodetool-ai/models";

import { WorkerManager } from "./manager.js";

/**
 * The slice of a Python bridge the heartbeat needs: the `"activity"` event the
 * remote WebSocket bridge emits on every frame it sends or receives. A local
 * stdio bridge never emits it, so attaching to one is inert.
 */
export interface WorkerActivitySource {
  on(event: "activity", listener: () => void): void;
  off?(event: "activity", listener: () => void): void;
}

/**
 * How often a burst of bridge traffic is allowed to become a DB write. The
 * reaper runs once a minute and its windows are measured in minutes, so
 * second-level freshness is ample and one write per frame is waste.
 */
const TOUCH_THROTTLE_MS = 10_000;

/** Options for {@link attachWorkerActivityHeartbeat}. */
export interface WorkerActivityHeartbeatOptions {
  /**
   * Resolve the instance whose clock this bridge's traffic belongs to.
   * Returning null skips the touch (no worker attached).
   */
  resolveInstanceId: () => Promise<string | null>;
  /** Write the timestamp. Injected for tests; defaults to the model accessor. */
  touch?: (id: string) => Promise<WorkerInstance | void>;
  /** Current epoch ms. Injected for tests. */
  now?: () => number;
  /** Throttle window in ms. Injected for tests. */
  throttleMs?: number;
}

/**
 * Keep a worker's `last_activity_at` fresh from real bridge traffic.
 *
 * Returns a function that detaches the listener. Every touch is best-effort:
 * a rejected resolve or write is swallowed, because keeping a cost-guard clock
 * fresh must never break the execution it is observing.
 */
export function attachWorkerActivityHeartbeat(
  bridge: WorkerActivitySource,
  options: WorkerActivityHeartbeatOptions
): () => void {
  const now = options.now ?? Date.now;
  const touch = options.touch ?? touchWorkerInstance;
  const throttleMs = options.throttleMs ?? TOUCH_THROTTLE_MS;

  // -Infinity, not 0: the first beat must fire whatever the clock reads.
  let lastTouchAt = Number.NEGATIVE_INFINITY;
  const listener = (): void => {
    const nowMs = now();
    if (nowMs - lastTouchAt < throttleMs) return;
    lastTouchAt = nowMs;
    void options
      .resolveInstanceId()
      .then((id) => (id ? touch(id) : undefined))
      .catch(() => {
        // best-effort: the idle clock must not crash the run it measures
      });
  };

  bridge.on("activity", listener);
  return () => bridge.off?.("activity", listener);
}

/**
 * A host's hook for observing every Python bridge it creates —
 * `onPythonBridgeCreated` from `@nodetool-ai/runtime`. Taken as a parameter so
 * this package keeps no runtime dependency.
 */
export type BridgeCreationRegistrar = (
  observer: (bridge: WorkerActivitySource) => void
) => () => void;

/**
 * Install the heartbeat on every bridge the host creates from now on, resolving
 * the attached worker through a lazily-built {@link WorkerManager}. Returns a
 * function that uninstalls it.
 *
 * This is what a host without its own long-lived bridge — the CLI — calls once
 * at startup. It opens no database and builds no bridge; the manager appears
 * only when a bridge first reports traffic.
 */
export function installWorkerActivityHeartbeat(
  register: BridgeCreationRegistrar,
  overrides: Partial<WorkerActivityHeartbeatOptions> = {}
): () => void {
  let manager: WorkerManager | null = null;
  const resolveInstanceId = async (): Promise<string | null> => {
    manager ??= new WorkerManager();
    return (await manager.getActiveWorker())?.id ?? null;
  };
  return register((bridge) => {
    attachWorkerActivityHeartbeat(bridge, { resolveInstanceId, ...overrides });
  });
}
