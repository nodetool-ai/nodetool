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
 * The skeleton lives here so future realtime lifecycle behavior can grow in a
 * dedicated module without inflating runner.ts.
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
    throw new Error("RealtimeRunner.stopRealtimeMode is not implemented yet");
  }

  async pushParameter(
    _name: string,
    _value: unknown
  ): Promise<RealtimeParameterUpdateResult> {
    throw new Error("RealtimeRunner.pushParameter is not implemented yet");
  }
}
