import type { SdkV1ExecutionTarget } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type { SdkV1ExecutionTargetReadiness } from "./sdk-execution-readiness-probe.js";

interface SdkV1ActiveWorker {
  id: string;
}

interface CreateSdkV1ExecutionTargetReadinessOptions {
  getActiveWorker: () =>
    | Promise<SdkV1ActiveWorker | null | undefined>
    | SdkV1ActiveWorker
    | null
    | undefined;
}

/**
 * Resolves the explicit preflight target without attaching, provisioning, or
 * falling back to a different worker. An omitted target remains local.
 */
export function createSdkV1ExecutionTargetReadiness(
  options: CreateSdkV1ExecutionTargetReadinessOptions
): (
  target: SdkV1ExecutionTarget | null | undefined
) => Promise<SdkV1ExecutionTargetReadiness> {
  return async (target) => {
    if (!target || target.kind === "local") {
      return {
        id: "nodetool-server",
        name: "NodeTool server",
        ready: true,
        message: null
      };
    }
    if (target.kind === "runner") {
      return {
        id: target.runner_id,
        name: "Live runner",
        ready: false,
        message: "Selected live runner is not available."
      };
    }

    try {
      const active = await options.getActiveWorker();
      if (!active || active.id !== target.worker_id) {
        return {
          id: target.worker_id,
          name: "Remote worker",
          ready: false,
          message: "Selected execution worker is not attached."
        };
      }
      return {
        id: active.id,
        name: "Remote worker",
        ready: true,
        message: null
      };
    } catch {
      return {
        id: target.worker_id,
        name: "Remote worker",
        ready: false,
        message: "Selected execution worker readiness check failed."
      };
    }
  };
}
