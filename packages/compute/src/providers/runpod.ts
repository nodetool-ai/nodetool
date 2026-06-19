// RunPod pod-backed `WorkerProvider`.
//
// Delegates to the RunPod REST transport (`runpod-rest.ts`) to create a
// persistent pod running the NodeTool worker image, poll it to RUNNING, and
// derive the `wss://` proxy URL the bridge attaches to.
//
// Lifecycle: `stop` PAUSES the pod (releases the GPU, keeps the volume so the
// HF model cache survives) and `resume` brings it back; `terminate` DELETES the
// pod and its volume — that's the real teardown that stops all billing.
//
// The API key is injected via the constructor (sourced from the secret store /
// env by the `WorkerManager`); this provider never reads `process.env`.

import {
  deletePod,
  deployWorkerPod,
  getPod,
  listPods,
  startPod,
  stopPod,
  waitForPodEndpoint,
  type RunpodPod,
} from "./runpod-rest.js";
import {
  DEFAULT_VOLUME_GB,
  DEFAULT_CONTAINER_DISK_GB,
  WORKER_HF_HOME,
  WORKER_VOLUME_MOUNT,
  type ProviderInstance,
  type ProvisionResult,
  type WorkerProvider,
  type WorkerSpec,
  type WorkerStatus,
} from "./types.js";

/** Internal port the worker serves on. */
const WORKER_PORT = 7777;
/** Worker is exposed via the RunPod HTTP proxy as a wss:// endpoint. */
const EXPOSURE = "http" as const;

/** Map a RunPod pod's `desiredStatus` to the shared `WorkerStatus`. */
function mapPodStatus(pod: RunpodPod): WorkerStatus {
  switch (pod.desiredStatus) {
    case "RUNNING":
    case "READYT": // RunPod's "ready to run" transitional state
      return "running";
    case "EXITED":
    case "TERMINATED":
      return "stopped";
    default:
      return "provisioning";
  }
}

export class RunpodPodProvider implements WorkerProvider {
  constructor(private readonly apiKey: string) {}

  async provision(spec: WorkerSpec): Promise<ProvisionResult> {
    const useGpu = Boolean(spec.gpu);
    const { podId, wsUrl, pod } = await deployWorkerPod(this.apiKey, {
      name: spec.name,
      image: spec.image,
      workerToken: spec.token,
      internalPort: WORKER_PORT,
      exposure: EXPOSURE,
      computeType: useGpu ? "GPU" : "CPU",
      gpuTypeIds: spec.gpu ? [spec.gpu] : undefined,
      gpuCount: spec.gpuCount,
      vcpuCount: spec.vcpu,
      // Point HF model downloads at the persistent volume so they survive a
      // stop/resume; merge over any caller env (caller wins on conflict? no —
      // we own HF_HOME, so it goes last).
      env: { ...spec.env, HF_HOME: WORKER_HF_HOME },
      containerDiskInGb: DEFAULT_CONTAINER_DISK_GB,
      volumeInGb: spec.disk ?? DEFAULT_VOLUME_GB,
      volumeMountPath: WORKER_VOLUME_MOUNT,
    });
    return {
      providerRef: podId,
      wsUrl,
      token: spec.token,
      status: "running",
      costUsd: pod.costPerHr,
    };
  }

  async status(ref: string): Promise<WorkerStatus> {
    const pod = await getPod(this.apiKey, ref);
    return mapPodStatus(pod);
  }

  /** Pause: release the GPU, keep the volume (and its model cache). */
  async stop(ref: string): Promise<void> {
    await stopPod(this.apiKey, ref);
  }

  /** Resume a paused pod and re-derive its (possibly new) attach endpoint. */
  async resume(ref: string): Promise<ProvisionResult> {
    await startPod(this.apiKey, ref);
    const { pod, wsUrl } = await waitForPodEndpoint(this.apiKey, ref, {
      internalPort: WORKER_PORT,
      exposure: EXPOSURE,
    });
    return {
      providerRef: ref,
      wsUrl,
      status: "running",
      costUsd: pod.costPerHr,
    };
  }

  /** Destroy the pod and its volume — real teardown, stops all billing. */
  async terminate(ref: string): Promise<void> {
    await deletePod(this.apiKey, ref);
  }

  async list(): Promise<ProviderInstance[]> {
    const pods = await listPods(this.apiKey);
    return pods.map((pod) => ({
      providerRef: pod.id,
      status: mapPodStatus(pod),
    }));
  }
}
