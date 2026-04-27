import {
  type ParameterUpdateResult,
  WorkflowRunner,
  type RunJobRequest,
  type RunResult,
  type WorkflowGraphData,
  type WorkflowRunnerOptions
} from "./runner.js";
import type { RealtimeMetrics, RealtimeSessionInfo } from "@nodetool/protocol";
import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.kernel.realtime-runner");

export interface RealtimeRunnerOptions
  extends Omit<WorkflowRunnerOptions, "runMode"> {
  stopTimeoutMs?: number;
}

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
  private readonly stopTimeoutMs: number;

  constructor(jobId: string, options: RealtimeRunnerOptions) {
    const { stopTimeoutMs = 5_000, ...runnerOptions } = options;
    this.stopTimeoutMs = stopTimeoutMs;
    this.runner = new WorkflowRunner(jobId, {
      ...runnerOptions,
      runMode: "realtime"
    });
  }

  async startRealtimeMode(
    request: RunJobRequest,
    graphData: WorkflowGraphData,
    sessionInfo: RealtimeSessionInfo
  ): Promise<void> {
    await this.runner.initializeForRealtime(request, graphData);
    this.sessionInfo = sessionInfo;
    await this.runWarmStateHooks("start");
    await this.runner.startBackgroundProcessing(request.params ?? {});
    this.processingPromise = this.runner.waitForBackgroundProcessing();
  }

  async stopRealtimeMode(
    terminalStatus: RunResult["status"] = "completed"
  ): Promise<RunResult> {
    if (!this.sessionInfo) {
      return this.runner.snapshotRunResult(terminalStatus);
    }

    const failureMessages: string[] = [];

    try {
      for (const inputName of this.runner.getMediaAdapterInputNames()) {
        this.runner.finishInputStream(inputName);
      }
      await this.runner.dispatchControlEvent({
        event_type: "stop"
      });
      this.runner.finishControlStreams();

      if (this.processingPromise) {
        await this.waitForStop(this.processingPromise);
      }
    } catch (error) {
      this.appendFailureMessage(failureMessages, error);
    }

    try {
      await this.waitForStop(this.runWarmStateHooks("stop"));
    } catch (error) {
      this.appendFailureMessage(failureMessages, error);
    }

    const errorMessage =
      failureMessages.length > 0 ? failureMessages.join("; ") : undefined;

    return this.runner.snapshotRunResult(
      errorMessage ? "failed" : terminalStatus,
      errorMessage
    );
  }

  async pushParameter(
    name: string,
    value: unknown
  ): Promise<RealtimeParameterUpdateResult> {
    return this.runner.pushParameter(name, value);
  }

  updateMetrics(metrics: RealtimeMetrics): void {
    if (this.sessionInfo?.session_id === metrics.session_id) {
      this.sessionInfo.metrics = metrics;
    }
  }

  private async runWarmStateHooks(stage: "start" | "stop"): Promise<void> {
    const sessionInfo = this.sessionInfo;
    if (!sessionInfo) {
      return;
    }

    const warmNodes = this.runner
      .getNodes()
      .filter((node) => node.owns_warm_state);
    log.info("TEMP_LOG realtime warm-state hook candidates", {
      stage,
      sessionId: sessionInfo.session_id,
      workflowId: sessionInfo.workflow_id,
      nodes: warmNodes.map((node) => ({
        id: node.id,
        type: node.type,
        title: node.title,
        name: node.name
      }))
    });
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
        log.warn("TEMP_LOG realtime warm-state executor missing", {
          stage,
          sessionId: sessionInfo.session_id,
          nodeId: node.id,
          nodeType: node.type
        });
        continue;
      }

      if (stage === "start") {
        executor.resetWarmState?.();
        log.info("TEMP_LOG realtime onSessionStart begin", {
          sessionId: sessionInfo.session_id,
          nodeId: node.id,
          nodeType: node.type
        });
        await executor.onSessionStart?.(context, sessionInfo);
        log.info("TEMP_LOG realtime onSessionStart complete", {
          sessionId: sessionInfo.session_id,
          nodeId: node.id,
          nodeType: node.type
        });
      } else {
        log.info("TEMP_LOG realtime onSessionStop begin", {
          sessionId: sessionInfo.session_id,
          nodeId: node.id,
          nodeType: node.type
        });
        await executor.onSessionStop?.(context, sessionInfo);
        log.info("TEMP_LOG realtime onSessionStop complete", {
          sessionId: sessionInfo.session_id,
          nodeId: node.id,
          nodeType: node.type
        });
      }
    }
  }

  private appendFailureMessage(messages: string[], error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    messages.push(message);
  }

  private async waitForStop(promise: Promise<void>): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            this.runner.cancel();
            reject(
              new Error(
                `Realtime stop timed out after ${this.stopTimeoutMs}ms`
              )
            );
          }, this.stopTimeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
