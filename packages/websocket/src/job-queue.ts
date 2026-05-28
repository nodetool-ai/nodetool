/**
 * FIFO queue for run-job requests that arrive while a client already has the
 * maximum number of concurrent runs in flight.
 *
 * The {@link UnifiedWebSocketRunner} is per-connection, so this queue is
 * per-client: it caps how many workflow runs one client can execute at once
 * (configurable via the `MAX_CONCURRENT_JOBS` setting) and holds the rest
 * until a running job finishes. This prevents a single click on "Run
 * Workflow" — or a burst of clicks across tabs — from firing dozens of jobs
 * at a provider/API simultaneously.
 *
 * The logic is intentionally kept here, separate from the runner, so it can be
 * unit-tested in isolation.
 */
import type { RunJobRequest } from "@nodetool-ai/protocol";

export interface QueuedPosition {
  jobId: string;
  workflowId: string | null;
  /** 1-based position in the pending queue (1 = starts next). */
  position: number;
}

export class JobConcurrencyQueue {
  private pending: RunJobRequest[] = [];

  /** Number of runs waiting to start. */
  get size(): number {
    return this.pending.length;
  }

  /** Append a request and return its 1-based position in the queue. */
  enqueue(req: RunJobRequest): number {
    this.pending.push(req);
    return this.pending.length;
  }

  /** Remove and return the next request to run (FIFO), or undefined if empty. */
  dequeue(): RunJobRequest | undefined {
    return this.pending.shift();
  }

  /**
   * Remove a still-queued request by job id (e.g. the user cancelled it before
   * it started). Returns the removed request, or undefined if it was not
   * queued (already running or unknown).
   */
  remove(jobId: string): RunJobRequest | undefined {
    const index = this.pending.findIndex((r) => r.job_id === jobId);
    if (index === -1) return undefined;
    return this.pending.splice(index, 1)[0];
  }

  /** Current queued jobs with their (recomputed) 1-based positions. */
  positions(): QueuedPosition[] {
    return this.pending.map((req, index) => ({
      jobId: req.job_id ?? "",
      workflowId: req.workflow_id ?? null,
      position: index + 1
    }));
  }
}
