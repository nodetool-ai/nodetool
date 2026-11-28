import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { WorkerConnection, WorkerManager } from "@nodetool-ai/compute";
import type { HttpApiOptions } from "../http-api.js";
import * as sync from "@nodetool-ai/protocol/api-schemas/sync.js";
import type { AuthKind } from "../auth-kind.js";

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
  /**
   * The protocol version the client named in the `x-nodetool-protocol`
   * header. Null or absent when it sent none, as callers inside the server
   * do. See `sync.ts` in the protocol package.
   */
  clientProtocol?: number | null;
  /**
   * The device session id when the caller authenticated with a native
   * access token. Procedures that create credentials refuse it.
   */
  nativeSessionId?: string | null;
  /**
   * Which credential authenticated the caller. Procedures that create
   * credentials accept only an interactive sign-in. Null or absent for a
   * caller the auth hook did not resolve, such as a server-side caller.
   */
  authKind?: AuthKind | null;
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

/**
 * The request fields the context reads. Both `FastifyRequest` (with the
 * `userId` the auth plugin attaches) and the plain `IncomingMessage` the
 * test-UI server serves satisfy it.
 */
interface ContextRequest {
  userId?: string | null;
  headers?: Record<string, string | string[] | undefined>;
  nativeSessionId?: string | null;
  authKind?: AuthKind | null;
}

export function createContextFactory(
  deps: ContextFactoryInput
): (opts: { req: ContextRequest }) => Context {
  return ({ req }) => ({
    userId: req.userId ?? null,
    clientProtocol: sync.clientProtocolVersion(
      req.headers?.[sync.SYNC_PROTOCOL_HEADER]
    ),
    nativeSessionId: req.nativeSessionId ?? null,
    authKind: req.authKind ?? null,
    registry: deps.registry,
    apiOptions: deps.apiOptions,
    pythonBridge: deps.pythonBridge,
    getPythonBridgeReady: deps.getPythonBridgeReady,
    workerManager: deps.workerManager,
    repointPythonBridge: deps.repointPythonBridge,
    probeWorkerHealth: deps.probeWorkerHealth
  });
}
