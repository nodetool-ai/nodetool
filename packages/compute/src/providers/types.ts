// Shared provider contract for the worker provisioning subsystem.
//
// A `WorkerProvider` is the per-target driver (RunPod pod, Vast.ai) that the
// `WorkerManager` delegates to. It deals only in provider-native handles
// (`providerRef`) and the attach handoff (`wsUrl` + optional `token`); all
// persistence and identity (profiles, instances) live above it in the manager.

/** Provisioning target a profile/spec runs on. */
export type WorkerTarget = "runpod" | "vast";

/**
 * Lifecycle status of a worker, shared by instances and provider results.
 * `provisioning` → `running` → `attached`, with `stopping`/`stopped` on
 * teardown and `error` on failure.
 */
export type WorkerStatus =
  | "provisioning"
  | "running"
  | "attached"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Declarative description of a worker to provision. Derived from a
 * `WorkerProfile` at provision time, with a per-instance `token` mixed in.
 */
export interface WorkerSpec {
  /** Profile/worker name, used for human-readable provider tagging. */
  name: string;
  /** Container image to run (`python -m nodetool.worker`, port 7777). */
  image: string;
  /** Provisioning target. */
  target: WorkerTarget;
  /** Provider-shaped GPU selector (e.g. "A40"). */
  gpu?: string;
  /** vCPU count. */
  vcpu?: number;
  /** Extra environment variables for the worker container. */
  env?: Record<string, string>;
  /** Bearer token the worker authenticates with, when generated/fixed. */
  token?: string;
}

/** Result of a successful `provision` — the attach handoff for an instance. */
export interface ProvisionResult {
  /** Provider-native handle (RunPod podId / Vast instance id). */
  providerRef: string;
  /** WebSocket URL the bridge re-points at to attach. */
  wsUrl: string;
  /** Bearer token for the worker, if one was set. */
  token?: string;
  /** Status at the moment provisioning returned (typically `running`). */
  status: WorkerStatus;
  /**
   * Estimated hourly cost (USD) of the provisioned worker, when the provider
   * reports it (RunPod `costPerHr`, Vast `dph_total`). Drives the cost guard's
   * reconcile aggregation and the workers-panel display; `undefined` when the
   * provider exposes no price.
   */
  costUsd?: number;
}

/** A live worker as reported by the provider, for orphan reconciliation. */
export interface ProviderInstance {
  /** Provider-native handle. */
  providerRef: string;
  /** Current status as mapped from the provider's native state. */
  status: WorkerStatus;
}

/**
 * Per-target driver the `WorkerManager` delegates to. Implementations do REAL
 * provider work — `stop` MUST tear down billed GPU resources.
 */
export interface WorkerProvider {
  /** Create the worker and return its attach handoff once running. */
  provision(spec: WorkerSpec): Promise<ProvisionResult>;
  /** Current status of the worker identified by `ref`. */
  status(ref: string): Promise<WorkerStatus>;
  /** Tear down the worker identified by `ref` (real teardown — non-negotiable). */
  stop(ref: string): Promise<void>;
  /** List the provider's live workers, for orphan reconciliation. */
  list(): Promise<ProviderInstance[]>;
}
