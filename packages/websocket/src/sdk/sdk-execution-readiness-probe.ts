import type { SdkExecutionCapacitySnapshot } from "../unified-websocket-runner.js";
import type { SdkV1ExecutionReadiness } from "./sdk-static-preflight-service.js";

export interface SdkV1ExecutionTargetReadiness {
  id: string;
  name: string;
  ready: boolean;
  message?: string | null;
}

interface CreateNodeToolSdkV1ExecutionReadinessProbeOptions {
  getTargetReadiness?: () =>
    | Promise<SdkV1ExecutionTargetReadiness>
    | SdkV1ExecutionTargetReadiness;
  getCapacitySnapshot: () =>
    | Promise<SdkExecutionCapacitySnapshot>
    | SdkExecutionCapacitySnapshot;
}

/**
 * Reports execution target and queue pressure without reserving capacity,
 * provisioning a worker, or creating a job.
 */
export function createNodeToolSdkV1ExecutionReadinessProbe(
  options: CreateNodeToolSdkV1ExecutionReadinessProbeOptions
): () => Promise<SdkV1ExecutionReadiness> {
  return async () => {
    let target: SdkV1ExecutionTargetReadiness;
    try {
      target = options.getTargetReadiness
        ? await options.getTargetReadiness()
        : {
            id: "nodetool-server",
            name: "NodeTool server",
            ready: true,
            message: null
          };
    } catch {
      target = {
        id: "execution-target",
        name: "Execution target",
        ready: false,
        message: "Execution target readiness check failed."
      };
    }

    const result: SdkV1ExecutionReadiness = {
      requirements: [
        {
          kind: "worker",
          id: target.id,
          name: target.name,
          status: target.ready ? "available" : "unavailable",
          blocking: true,
          message:
            target.message ??
            (target.ready ? null : "Execution target is not ready.")
        }
      ],
      issues: []
    };

    try {
      const capacity = await options.getCapacitySnapshot();
      result.requirements.push({
        kind: "worker",
        id: "execution-capacity",
        name: "Execution capacity",
        status: "available",
        blocking: false,
        message: capacity.likelyQueued
          ? "The workflow is likely to be queued."
          : null,
        details: {
          in_flight_jobs: capacity.inFlightJobs,
          max_concurrent_jobs: capacity.maxConcurrentJobs,
          queued_jobs: capacity.queuedJobs,
          workflow_in_flight_jobs: capacity.workflowInFlightJobs,
          max_concurrent_runs_for_workflow:
            capacity.maxConcurrentRunsForWorkflow,
          likely_queued: capacity.likelyQueued
        }
      });
      if (capacity.likelyQueued) {
        result.issues.push({
          severity: "warning",
          code: "execution_likely_queued",
          message: "Current capacity suggests that this workflow will queue.",
          node_id: null,
          pin_name: null
        });
      }
    } catch {
      result.requirements.push({
        kind: "worker",
        id: "execution-capacity",
        name: "Execution capacity",
        status: "unknown",
        blocking: false,
        message: "Execution capacity check failed."
      });
      result.issues.push({
        severity: "warning",
        code: "execution_capacity_unknown",
        message: "Current execution capacity could not be determined.",
        node_id: null,
        pin_name: null
      });
    }

    return result;
  };
}
