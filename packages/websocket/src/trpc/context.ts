import type { FastifyRequest } from "fastify";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { WorkerConnection, WorkerManager } from "@nodetool-ai/compute";
import type { HttpApiOptions } from "../http-api.js";

/**
 * Re-point the live Python bridge at a worker's `{wsUrl, token}` (attach) or
 * back at the local bridge (detach, `null`). The bootstrap implements this as a
 * `SwappableBridge.swap`; the worker router calls it after `attach`/`detach`
 * (attach awaits the worker connect).
 */
export type RepointPythonBridge = (
  target: WorkerConnection | null
) => void | Promise<void>;

/** Result of a worker health probe — did the worker answer the bridge handshake. */
export interface WorkerHealth {
  /** True once the worker accepted the WS connection AND answered `discover`. */
  healthy: boolean;
  /** Bridge protocol version the worker reported, when healthy. */
  protocolVersion?: number;
  /** Reason the probe failed (worker still booting, unreachable, …). */
  error?: string;
}

/**
 * Probe a worker's `{wsUrl, token}` by opening a transient bridge connection —
 * the SAME handshake attach performs — and reporting whether it answered. Lets
 * the UI show a `running` worker's true readiness before attaching. The
 * bootstrap implements this (it owns the runtime bridge); the router stays free
 * of any runtime dependency.
 */
export type ProbeWorkerHealth = (
  target: WorkerConnection
) => Promise<WorkerHealth>;

export interface Context {
  userId: string | null;
  registry: NodeRegistry;
  apiOptions: HttpApiOptions;
  pythonBridge: PythonBridge;
  getPythonBridgeReady: () => boolean;
  /** Worker provisioning orchestrator (present when the server is wired). */
  workerManager?: WorkerManager;
  /** Re-point the Python bridge for worker attach/detach. */
  repointPythonBridge?: RepointPythonBridge;
  /** Probe a `running` worker's readiness without attaching. */
  probeWorkerHealth?: ProbeWorkerHealth;
}

export interface ContextFactoryInput {
  registry: NodeRegistry;
  apiOptions: HttpApiOptions;
  /**
   * The stable bridge reference. It is a SwappableBridge whose target follows
   * an attached worker, so a single captured reference stays correct across
   * attach/detach — no per-request re-read needed.
   */
  pythonBridge: PythonBridge;
  getPythonBridgeReady: () => boolean;
  workerManager?: WorkerManager;
  repointPythonBridge?: RepointPythonBridge;
  probeWorkerHealth?: ProbeWorkerHealth;
}

export function createContextFactory(
  deps: ContextFactoryInput
): (opts: { req: FastifyRequest }) => Context {
  return ({ req }) => ({
    userId: (req as FastifyRequest & { userId?: string | null }).userId ?? null,
    registry: deps.registry,
    apiOptions: deps.apiOptions,
    pythonBridge: deps.pythonBridge,
    getPythonBridgeReady: deps.getPythonBridgeReady,
    workerManager: deps.workerManager,
    repointPythonBridge: deps.repointPythonBridge,
    probeWorkerHealth: deps.probeWorkerHealth
  });
}
