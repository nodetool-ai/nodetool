import {
  type ParameterUpdateResult,
  WorkflowRunner,
  type RunJobRequest,
  type RunResult,
  type WorkflowGraphData,
  type WorkflowRunnerOptions
} from "./runner.js";
import type { RealtimeSessionInfo } from "@nodetool/protocol";
import type { ProcessingContext } from "@nodetool/runtime";

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
  private processingPromise: Promise<void> | null = null;
  private sessionInfo: RealtimeSessionInfo | null = null;

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
    this.sessionInfo = this.buildSessionInfo(request);
    await this.runWarmStateHooks("start");
    await this.runner.startBackgroundProcessing(request.params ?? {});
    this.processingPromise = this.runner.waitForBackgroundProcessing();
  }

  async stopRealtimeMode(): Promise<RunResult> {
    if (!this.sessionInfo) {
      return this.runner.snapshotRunResult("completed");
    }

    let errorMessage: string | undefined;

    try {
      for (const inputName of this.runner.getMediaAdapterInputNames()) {
        this.runner.finishInputStream(inputName);
      }

      if (this.processingPromise) {
        await this.processingPromise;
      }
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : String(error);
    }

    try {
      await this.runWarmStateHooks("stop");
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : String(error);
    }

    return this.runner.snapshotRunResult(
      errorMessage ? "failed" : "completed",
      errorMessage
    );
  }

  async pushParameter(
    name: string,
    value: unknown
  ): Promise<RealtimeParameterUpdateResult> {
    return this.runner.pushParameter(name, value);
  }

  private buildSessionInfo(request: RunJobRequest): RealtimeSessionInfo {
    const now = new Date().toISOString();
    return {
      session_id: request.job_id,
      workflow_id: request.workflow_id ?? null,
      job_id: request.job_id,
      status: "running",
      transport: "websocket",
      parameters: { ...(request.params ?? {}) },
      media_tracks: [],
      signaling: { status: "idle" },
      created_at: now,
      updated_at: now
    };
  }

  private async runWarmStateHooks(stage: "start" | "stop"): Promise<void> {
    const sessionInfo = this.sessionInfo;
    if (!sessionInfo) {
      return;
    }

    const warmNodes = this.runner
      .getNodes()
      .filter((node) => node.owns_warm_state);
    if (warmNodes.length === 0) {
      return;
    }

    const context = this.runner.getExecutionContext();
    if (!context) {
      throw new Error(
        "RealtimeRunner requires an executionContext for warm-state hooks"
      );
    }

    for (const node of warmNodes) {
      const executor = this.runner.getExecutor(node.id);
      if (!executor) {
        continue;
      }

      if (stage === "start") {
        executor.resetWarmState?.();
        await executor.onSessionStart?.(context, sessionInfo);
      } else {
        await executor.onSessionStop?.(context, sessionInfo);
      }
    }
  }
}
