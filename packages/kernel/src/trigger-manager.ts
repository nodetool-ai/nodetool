/**
 * Trigger workflow manager — lifecycle management for trigger workflows.
 *
 * Port of src/nodetool/workflows/trigger_workflow_manager.py.
 *
 * Manages trigger-based workflows: start, stop, restart, and health monitoring.
 * Uses a watchdog loop to detect and restart failed trigger workflows.
 */

import { createLogger } from "@nodetool-ai/config";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
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
  /** In-flight start attempts, used to dedupe concurrent starts. */
  private _startingJobs = new Map<string, Promise<TriggerJob | null>>();
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
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.info("Trigger workflow already running", { workflowId });
      return existing;
    }

    // Dedupe concurrent starts: the running-check above and the job
    // registration below are separated by awaits, so two overlapping calls
    // would otherwise both start a job and leak the first one untracked.
    const inFlight = this._startingJobs.get(workflowId);
    if (inFlight) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.info("Trigger workflow start already in flight", { workflowId });
      return inFlight;
    }

    const startPromise = this._startTriggerWorkflowImpl(
      workflowId,
      userId,
      workflowName
    ).finally(() => {
      this._startingJobs.delete(workflowId);
    });
    this._startingJobs.set(workflowId, startPromise);
    return startPromise;
  }

  private async _startTriggerWorkflowImpl(
    workflowId: string,
    userId: string,
    workflowName?: string
  ): Promise<TriggerJob | null> {
    // Check if workflow has trigger nodes
    const hasTriggers = await this._hasTriggerNodes(workflowId);
    if (!hasTriggers) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.warn("Workflow has no trigger nodes, not starting", { workflowId });
      // Drop any stale finished entry so the watchdog stops retrying a
      // workflow that no longer has triggers.
      const stale = this._runningJobs.get(workflowId);
      if (stale && stale.status !== "running") {
        this._runningJobs.delete(workflowId);
      }
      return null;
    }

    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
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
          // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
          log.warn("Trigger workflow completed unexpectedly", {
            workflowId,
            jobId
          });
        })
        .catch((err) => {
          // Stryker disable next-line OptionalChaining: err is always an Error from a rejected completion; the ?. is defensive
          if (err?.name === "AbortError") {
            job.status = "cancelled";
          } else {
            job.status = "failed";
            // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
            log.error("Trigger workflow failed", {
              workflowId,
              jobId,
              error: String(err)
            });
          }
        });

      this._runningJobs.set(workflowId, job);
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.info("Started trigger workflow", { workflowId, jobId });

      return job;
    } catch (err) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
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
    // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — when the job is missing, falling through dereferences undefined and the try/catch below also returns false
    if (!job) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.warn("Trigger workflow not found", { workflowId });
      return false;
    }

    try {
      job.abortController.abort();
      job.status = "cancelled";
      this._runningJobs.delete(workflowId);
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.info("Stopped trigger workflow", { workflowId });
      return true;
    } catch (err) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
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
      // Stryker disable next-line StringLiteral: diagnostic log message only
      log.info("Watchdog already running");
      return;
    }

    const ms = interval ?? this._watchdogInterval;
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
    log.info("Starting trigger workflow watchdog", { intervalMs: ms });

    this._watchdogTimer = setInterval(() => {
      // Stryker disable next-line BlockStatement: defensive error handler — _watchdogCheck swallows its own errors, so this catch only logs and is unreachable in practice
      this._watchdogCheck().catch((err) => {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.error("Error in watchdog check", { error: String(err) });
      });
    }, ms);
  }

  /**
   * Stop the watchdog.
   */
  stopWatchdog(): void {
    // Stryker disable next-line ConditionalExpression: the true-direction is equivalent — clearInterval(null) and re-nulling are no-ops; the boundary/false cases are covered via the EqualityOperator and BlockStatement mutants
    if (this._watchdogTimer !== null) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
      // Stryker disable next-line StringLiteral: diagnostic log message only
      log.info("Trigger workflow watchdog stopped");
    }
  }

  /**
   * Stop all running trigger workflows and the watchdog.
   */
  async shutdown(): Promise<void> {
    // Stryker disable next-line StringLiteral: diagnostic log message only
    log.info("Shutting down TriggerWorkflowManager");
    this.stopWatchdog();

    const workflowIds = [...this._runningJobs.keys()];
    let stopped = 0;
    for (const wfId of workflowIds) {
      // Stryker disable next-line UpdateOperator: `stopped` is only used in the diagnostic log below
      if (await this.stopTriggerWorkflow(wfId)) stopped++;
    }

    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
    log.info("TriggerWorkflowManager shutdown complete", { stopped });
  }

  private async _watchdogCheck(): Promise<void> {
    // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus workflowId is skipped by the `if (!job) continue` guard below
    const toRestart: string[] = [];

    for (const [workflowId, job] of this._runningJobs) {
      if (job.status === "failed" || job.status === "completed") {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
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
      // Stryker disable next-line ConditionalExpression: equivalent — workflowId comes from toRestart built moments earlier from _runningJobs and nothing deletes in between, so job is always present; the guard is defensive
      if (!job) continue;

      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.info("Attempting restart of trigger workflow", { workflowId });

      // Keep the stale entry until the restart succeeds: a successful start
      // overwrites it, while a transient failure leaves it in place so the
      // next watchdog tick retries instead of dropping the workflow forever.
      await this.startTriggerWorkflow(
        workflowId,
        job.metadata.userId,
        job.metadata.workflowName
      );
    }
  }
}
