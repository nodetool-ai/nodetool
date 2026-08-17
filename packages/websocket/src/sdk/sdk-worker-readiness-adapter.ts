import type { SdkV1ExecutionTargetReadiness } from "./sdk-execution-readiness-probe.js";

interface SdkV1RecordedWorker {
  id: string;
  profile_name: string;
  target: string;
  status: string;
}

interface CreateNodeToolSdkV1WorkerReadinessAdapterOptions {
  workerId: string;
  /**
   * Reads persisted worker rows only. Do not pass provider status,
   * reconciliation, attach, resume, or provision operations here.
   */
  listWorkers: () =>
    | Promise<readonly SdkV1RecordedWorker[]>
    | readonly SdkV1RecordedWorker[];
}

const READY_STATUSES = new Set(["running", "attached"]);

/**
 * Adapts the persisted worker registry to execution-target readiness without
 * contacting a compute provider or mutating the selected worker.
 */
export function createNodeToolSdkV1WorkerReadinessAdapter(
  options: CreateNodeToolSdkV1WorkerReadinessAdapterOptions
): () => Promise<SdkV1ExecutionTargetReadiness> {
  return async () => {
    const workers = await options.listWorkers();
    const worker = workers.find((candidate) => candidate.id === options.workerId);
    if (!worker) {
      return {
        id: options.workerId,
        name: "Remote worker",
        ready: false,
        message: "Selected execution worker was not found."
      };
    }

    const ready = READY_STATUSES.has(worker.status);
    return {
      id: worker.id,
      name: worker.profile_name || "Remote worker",
      ready,
      message: ready
        ? null
        : `Selected execution worker is ${worker.status || "not ready"}.`
    };
  };
}
