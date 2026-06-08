import type { FastifyRequest } from "fastify";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { WorkerConnection, WorkerManager } from "@nodetool-ai/compute";
import type { HttpApiOptions } from "../http-api.js";

/**
 * Re-point the live Python bridge at a worker's `{wsUrl, token}` (attach) or
 * back at the env/stdio default (detach, `null`). The bootstrap wires this to
 * the bridge's `setTarget`; the worker router calls it after `attach`/`detach`.
 */
export type RepointPythonBridge = (target: WorkerConnection | null) => void;

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
}

export interface ContextFactoryInput {
  registry: NodeRegistry;
  apiOptions: HttpApiOptions;
  pythonBridge: PythonBridge;
  getPythonBridgeReady: () => boolean;
  workerManager?: WorkerManager;
  repointPythonBridge?: RepointPythonBridge;
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
    repointPythonBridge: deps.repointPythonBridge
  });
}
