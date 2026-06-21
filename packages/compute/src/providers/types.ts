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
  // Paused: compute released, volume (and its model cache) retained. Resumable.
  | "stopped"
  // Destroyed: pod AND volume deleted. NOT resumable — a tombstone row.
  | "terminated"
  | "error";

/**
 * Persistent-volume conventions shared by all providers. The volume survives a
 * stop/resume (only a terminate deletes it), so HF model downloads cached under
 * `WORKER_HF_HOME` persist across pauses — that's the whole point of feature.
 */
export const WORKER_VOLUME_MOUNT = "/workspace";
export const WORKER_HF_HOME = `${WORKER_VOLUME_MOUNT}/huggingface`;
/** Default persistent volume size — big enough for several HF image models. */
export const DEFAULT_VOLUME_GB = 100;
/** Default ephemeral container disk (image + temp); not persisted. */
export const DEFAULT_CONTAINER_DISK_GB = 30;

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
  /** Number of GPUs to request (GPU targets only). Defaults to 1. */
  gpuCount?: number;
  /** vCPU count. */
  vcpu?: number;
  /**
   * Persistent volume size in GB, mounted at `WORKER_VOLUME_MOUNT`. Holds the
   * HF model cache and survives stop/resume. Defaults to `DEFAULT_VOLUME_GB`.
   */
  disk?: number;
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
 * provider work — `terminate` MUST destroy billed GPU + volume resources.
 */
export interface WorkerProvider {
  /** Create the worker and return its attach handoff once running. */
  provision(spec: WorkerSpec): Promise<ProvisionResult>;
  /** Current status of the worker identified by `ref`. */
  status(ref: string): Promise<WorkerStatus>;
  /**
   * Pause the worker: release the GPU compute but KEEP its volume (and its
   * cached models) so it can be `resume`d. The provider still bills a small
   * amount for retained volume storage while paused.
   */
  stop(ref: string): Promise<void>;
  /**
   * Resume a previously-stopped worker: bring it back to running and return its
   * fresh attach handoff (the URL/cost may differ). May fail if the provider
   * cannot re-allocate a GPU (e.g. RunPod capacity changed).
   */
  resume(ref: string): Promise<ProvisionResult>;
  /**
   * Destroy the worker AND its volume (real teardown — non-negotiable). Stops
   * all billing; the cached models are gone for good.
   */
  terminate(ref: string): Promise<void>;
  /** List the provider's live workers, for orphan reconciliation. */
  list(): Promise<ProviderInstance[]>;
}
