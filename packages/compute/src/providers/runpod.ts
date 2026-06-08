// RunPod pod-backed `WorkerProvider`.
//
// Delegates to the RunPod REST transport (`runpod-rest.ts`) to create a
// persistent pod running the NodeTool worker image, poll it to RUNNING, and
// derive the `wss://` proxy URL the bridge attaches to. `stop` is a REAL pod
// deletion — GPU pods bill continuously, so teardown is non-negotiable.
//
// The API key is injected via the constructor (sourced from the secret store /
// env by the `WorkerManager`); this provider never reads `process.env`.

import {
  deletePod,
  deployWorkerPod,
  getPod,
  listPods,
  type RunpodPod,
} from "./runpod-rest.js";
import type {
  ProviderInstance,
  ProvisionResult,
  WorkerProvider,
  WorkerSpec,
  WorkerStatus,
} from "./types.js";

/** Internal port the worker serves on. */
const WORKER_PORT = 7777;

/** Map a RunPod pod's `desiredStatus` to the shared `WorkerStatus`. */
function mapPodStatus(pod: RunpodPod): WorkerStatus {
  switch (pod.desiredStatus) {
    case "RUNNING":
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
    const { podId, wsUrl } = await deployWorkerPod(this.apiKey, {
      name: spec.name,
      image: spec.image,
      workerToken: spec.token,
      internalPort: WORKER_PORT,
      exposure: "http",
      computeType: useGpu ? "GPU" : "CPU",
      gpuTypeIds: spec.gpu ? [spec.gpu] : undefined,
      vcpuCount: spec.vcpu,
      env: spec.env,
    });
    return {
      providerRef: podId,
      wsUrl,
      token: spec.token,
      status: "running",
    };
  }

  async status(ref: string): Promise<WorkerStatus> {
    const pod = await getPod(this.apiKey, ref);
    return mapPodStatus(pod);
  }

  async stop(ref: string): Promise<void> {
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
