import {
  WorkflowRunner,
  type RunJobRequest,
  type RunResult,
  type WorkflowGraphData,
  type WorkflowRunnerOptions
} from "./runner.js";

export interface RealtimeRunnerOptions
  extends Omit<WorkflowRunnerOptions, "runMode"> {}

export interface RealtimeParameterUpdateResult {
  routed: boolean;
  nodeIds: string[];
}

/**
 * RealtimeRunner is a composition shell around WorkflowRunner.
 *
 * Its long-term role is owning long-lived realtime session behavior — warm
 * node lifecycle, parameter streaming, and media-adapter orchestration —
 * while leaving the shared DAG execution primitives in runner.ts.
 */
export class RealtimeRunner {
  readonly runner: WorkflowRunner;

  constructor(jobId: string, options: RealtimeRunnerOptions) {
    this.runner = new WorkflowRunner(jobId, {
      ...options,
      runMode: "realtime"
    });
  }

  async startRealtimeMode(
    request: RunJobRequest,
    graphData: WorkflowGraphData
  ): Promise<void> {
    await this.runner.initializeForRealtime(request, graphData);
  }

  async stopRealtimeMode(): Promise<RunResult> {
    // TODO(PLAN-REALTIME step 6): finish media-source teardown and return the
    // held runner's collected outputs/messages after long-lived realtime mode lands.
    throw new Error("RealtimeRunner.stopRealtimeMode is not implemented yet");
  }

  async pushParameter(
    _name: string,
    _value: unknown
  ): Promise<RealtimeParameterUpdateResult> {
    // TODO(PLAN-REALTIME step 6 / follow-up 347): route control-plane updates
    // through dedicated realtime parameter handling instead of throwing.
    throw new Error("RealtimeRunner.pushParameter is not implemented yet");
  }
}
