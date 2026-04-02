/**
 * Trigger workflow manager — lifecycle management for trigger workflows.
 *
 * Port of src/nodetool/workflows/trigger_workflow_manager.py.
 *
 * Manages trigger-based workflows: start, stop, restart, and health monitoring.
 * Uses a watchdog loop to detect and restart failed trigger workflows.
 */

import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.kernel.trigger-manager");

const DEFAULT_WATCHDOG_INTERVAL = 30_000; // 30 seconds in ms

/**
 * Represents a running trigger workflow job.
 */
export interface TriggerJob {
  /** Unique job identifier. */
  jobId: string;
  /** Workflow identifier. */
  workflowId: string;
  /** Current status. */
  status: "running" | "completed" | "failed" | "cancelled";
  /** Abort controller to cancel the job. */
  abortController: AbortController;
  /** Promise that resolves when the job finishes. */
  completion: Promise<void>;
  /** Metadata for restart. */
  metadata: {
    userId: string;
    workflowName?: string;
  };
}

/**
 * Function signature for starting a trigger workflow job.
 * Provided by the application layer (dependency injection).
 */
export type StartJobFn = (opts: {
  workflowId: string;
  userId: string;
  signal: AbortSignal;
}) => Promise<{ jobId: string; completion: Promise<void> }>;

/**
 * Function to check if a workflow has trigger nodes.
 */
export type HasTriggerNodesFn = (workflowId: string) => Promise<boolean>;

/**
 * Singleton manager for trigger-based workflows.
 *
 * Provides:
 * - Start/stop/restart lifecycle
 * - Health watchdog to auto-restart failed jobs
 * - Listing of active trigger workflows
 */
export class TriggerWorkflowManager {
  private static _instance: TriggerWorkflowManager | null = null;

  private _runningJobs = new Map<string, TriggerJob>();
  private _watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private _watchdogInterval: number;
  private _startJob: StartJobFn;
  private _hasTriggerNodes: HasTriggerNodesFn;

  constructor(opts: {
    startJob: StartJobFn;
    hasTriggerNodes: HasTriggerNodesFn;
    watchdogInterval?: number;
  }) {
    this._startJob = opts.startJob;
    this._hasTriggerNodes = opts.hasTriggerNodes;
    this._watchdogInterval = opts.watchdogInterval ?? DEFAULT_WATCHDOG_INTERVAL;
  }

  static getInstance(opts: {
    startJob: StartJobFn;
    hasTriggerNodes: HasTriggerNodesFn;
    watchdogInterval?: number;
  }): TriggerWorkflowManager {
    if (!TriggerWorkflowManager._instance) {
      TriggerWorkflowManager._instance = new TriggerWorkflowManager(opts);
    }
    return TriggerWorkflowManager._instance;
  }

  /** Reset singleton (for testing). */
  static resetInstance(): void {
    TriggerWorkflowManager._instance = null;
  }

  /**
   * Start a trigger workflow in the background.
   * Returns the TriggerJob if started, null if already running or not a trigger workflow.
   */
  async startTriggerWorkflow(
    workflowId: string,
    userId: string,
    workflowName?: string
  ): Promise<TriggerJob | null> {
    // Check if already running
    const existing = this._runningJobs.get(workflowId);
    if (existing && existing.status === "running") {
      log.info("Trigger workflow already running", { workflowId });
      return existing;
    }

    // Check if workflow has trigger nodes
    const hasTriggers = await this._hasTriggerNodes(workflowId);
    if (!hasTriggers) {
      log.warn("Workflow has no trigger nodes, not starting", { workflowId });
      return null;
    }

    log.info("Starting trigger workflow", { workflowId, workflowName });

    const abortController = new AbortController();

    try {
      const { jobId, completion } = await this._startJob({
        workflowId,
        userId,
        signal: abortController.signal
      });

      const job: TriggerJob = {
        jobId,
        workflowId,
        status: "running",
        abortController,
        completion,
        metadata: { userId, workflowName }
      };

      // Track completion
      completion
        .then(() => {
          job.status = "completed";
          log.warn("Trigger workflow completed unexpectedly", {
            workflowId,
            jobId
          });
        })
        .catch((err) => {
          if (err?.name === "AbortError") {
            job.status = "cancelled";
          } else {
            job.status = "failed";
            log.error("Trigger workflow failed", {
              workflowId,
              jobId,
              error: String(err)
            });
          }
        });

      this._runningJobs.set(workflowId, job);
      log.info("Started trigger workflow", { workflowId, jobId });

      return job;
    } catch (err) {
      log.error("Failed to start trigger workflow", {
        workflowId,
        error: String(err)
      });
      return null;
    }
  }

  /**
   * Stop a running trigger workflow.
   */
  async stopTriggerWorkflow(workflowId: string): Promise<boolean> {
    const job = this._runningJobs.get(workflowId);
    if (!job) {
      log.warn("Trigger workflow not found", { workflowId });
      return false;
    }

    try {
      job.abortController.abort();
      job.status = "cancelled";
      this._runningJobs.delete(workflowId);
      log.info("Stopped trigger workflow", { workflowId });
      return true;
    } catch (err) {
      log.error("Error stopping trigger workflow", {
        workflowId,
        error: String(err)
      });
      return false;
    }
  }

  /**
   * Check if a trigger workflow is running.
   */
  isWorkflowRunning(workflowId: string): boolean {
    const job = this._runningJobs.get(workflowId);
    return (job?.status ?? null) === "running";
  }

  /**
   * Get a running trigger job by workflow ID.
   */
  getRunningWorkflow(workflowId: string): TriggerJob | undefined {
    return this._runningJobs.get(workflowId);
  }

  /**
   * List all running trigger workflows.
   */
  listRunningWorkflows(): Map<string, TriggerJob> {
    return new Map(this._runningJobs);
  }

  /**
   * Start the watchdog that monitors job health and restarts failed jobs.
   */
  startWatchdog(interval?: number): void {
    if (this._watchdogTimer !== null) {
      log.info("Watchdog already running");
      return;
    }

    const ms = interval ?? this._watchdogInterval;
    log.info("Starting trigger workflow watchdog", { intervalMs: ms });

    this._watchdogTimer = setInterval(() => {
      this._watchdogCheck().catch((err) => {
        log.error("Error in watchdog check", { error: String(err) });
      });
    }, ms);
  }

  /**
   * Stop the watchdog.
   */
  stopWatchdog(): void {
    if (this._watchdogTimer !== null) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
      log.info("Trigger workflow watchdog stopped");
    }
  }

  /**
   * Stop all running trigger workflows and the watchdog.
   */
  async shutdown(): Promise<void> {
    log.info("Shutting down TriggerWorkflowManager");
    this.stopWatchdog();

    const workflowIds = [...this._runningJobs.keys()];
    let stopped = 0;
    for (const wfId of workflowIds) {
      if (await this.stopTriggerWorkflow(wfId)) stopped++;
    }

    log.info("TriggerWorkflowManager shutdown complete", { stopped });
  }

  private async _watchdogCheck(): Promise<void> {
    const toRestart: string[] = [];

    for (const [workflowId, job] of this._runningJobs) {
      if (job.status === "failed" || job.status === "completed") {
        log.warn("Trigger workflow needs restart", {
          workflowId,
          jobId: job.jobId,
          status: job.status
        });
        toRestart.push(workflowId);
      }
    }

    for (const workflowId of toRestart) {
      const job = this._runningJobs.get(workflowId);
      if (!job) continue;

      log.info("Attempting restart of trigger workflow", { workflowId });
      this._runningJobs.delete(workflowId);

      await this.startTriggerWorkflow(
        workflowId,
        job.metadata.userId,
        job.metadata.workflowName
      );
    }
  }
}
