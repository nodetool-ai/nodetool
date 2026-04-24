import {
  type ParameterUpdateResult,
  WorkflowRunner,
  type RunJobRequest,
  type RunResult,
  type WorkflowGraphData,
  type WorkflowRunnerOptions
} from "./runner.js";

export interface RealtimeRunnerOptions
  extends Omit<WorkflowRunnerOptions, "runMode"> {}

export type RealtimeParameterUpdateResult = ParameterUpdateResult;

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
    name: string,
    value: unknown
  ): Promise<RealtimeParameterUpdateResult> {
    return this.runner.pushParameter(name, value);
  }
}
