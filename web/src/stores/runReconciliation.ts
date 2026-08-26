/**
 * Reload-time run reconciliation.
 *
 * A server run outlives its socket: on disconnect the JobRunSession detaches
 * and keeps executing, buffering seq-stamped frames for the detach grace
 * window (packages/websocket/src/job-run-registry.ts). A mid-session socket
 * drop is already covered — `resumeInFlightJob` (workflowUpdates.ts) replays
 * from the in-memory cursor — but a page reload wipes every store, so nothing
 * remembered the job: the run kept executing server-side while the client came
 * back blank, and the grace timer eventually cancelled it as abandoned.
 *
 * This module closes that gap. When a workflow is opened and its runner is
 * idle, it asks the server for the workflow's in-flight jobs and reattaches:
 * the newest one through the runner store (`reconnectWithWorkflow`, so the
 * Stop/pause controls and `job_resumed` settling apply as usual), any
 * concurrent siblings through a bare `reconnect_job`. Every reattach replays
 * from `last_seq: 0`, so the run's whole buffered stream flows back through
 * `handleUpdate` and rebuilds the per-node state (statuses, results, progress,
 * edges) the reload discarded — the client reconciles from the server instead
 * of restarting.
 */
import type { Job, WorkflowAttributes } from "./ApiTypes";
import type { WorkflowRunnerStore } from "./WorkflowRunner";
import { trpcClient } from "../trpc/client";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import { useAuth } from "./useAuth";
import { isAuthRequired } from "../lib/runtimeConfig";
import { setPendingResumeJobId } from "./resumeJobHint";

/** Row statuses that can still have a live run behind them. */
const IN_FLIGHT_JOB_STATUSES: ReadonlySet<string> = new Set([
  "scheduled",
  "queued",
  "running"
]);

/** How many recent jobs to inspect for in-flight runs of one workflow. */
const RECONCILE_JOB_LIMIT = 20;

const reconciliations = new Map<string, () => void>();

/**
 * Discover and reattach this workflow's in-flight server runs. Runs once per
 * call; a repeat call for the same workflow cancels the previous attempt.
 * Does nothing when the runner already tracks a job.
 */
export const startRunReconciliation = (
  workflowId: string,
  workflow: WorkflowAttributes,
  runnerStore: WorkflowRunnerStore
): void => {
  stopRunReconciliation(workflowId);

  let cancelled = false;
  let unsubscribeAuth: (() => void) | null = null;
  reconciliations.set(workflowId, () => {
    cancelled = true;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  });

  const runnerIsIdle = (): boolean => {
    const { job_id, state } = runnerStore.getState();
    return job_id === null && state === "idle";
  };

  const reconcile = async (): Promise<void> => {
    if (cancelled || !runnerIsIdle()) {
      return;
    }

    let jobs: Job[];
    try {
      const result = await trpcClient.jobs.list.query({
        workflow_id: workflowId,
        limit: RECONCILE_JOB_LIMIT
      });
      jobs = result.jobs ?? [];
    } catch (error) {
      console.warn(
        `[runReconciliation] Failed to list jobs for ${workflowId}`,
        error
      );
      return;
    }

    // A run may have started, or the workflow closed, while the list was in
    // flight — the fresh run owns the runner now.
    if (cancelled || !runnerIsIdle()) {
      return;
    }

    const inFlight = jobs.filter(
      (job) => job.status != null && IN_FLIGHT_JOB_STATUSES.has(job.status)
    );
    if (inFlight.length === 0) {
      return;
    }

    // jobs.list is newest-first; the head is the run the runner tracks. Park
    // its id as the handshake hint so a multi-instance server routes the
    // connection at the instance holding the run's replay buffer.
    const [primary, ...siblings] = inFlight;
    console.info(
      `[runReconciliation] Reattaching ${inFlight.length} in-flight run(s) for workflow ${workflowId}`,
      { jobId: primary.id }
    );
    setPendingResumeJobId(primary.id);
    try {
      await runnerStore.getState().reconnectWithWorkflow(primary.id, workflow);
    } catch (error) {
      console.warn(
        `[runReconciliation] Failed to reattach job ${primary.id}`,
        error
      );
      return;
    } finally {
      // The handshake (if one was needed) has read the hint by now; from here
      // on the runner store itself names the resumable job.
      setPendingResumeJobId(null);
    }

    // Concurrent siblings reattach without claiming the runner: their replayed
    // frames land in their own per-job slices, and the reattach clears the
    // server's detach-grace timer so they aren't cancelled as abandoned.
    for (const job of siblings) {
      globalWebSocketManager
        .send({
          type: "reconnect_job",
          command: "reconnect_job",
          data: { job_id: job.id, workflow_id: workflowId, last_seq: 0 }
        })
        .catch((error) =>
          console.warn(
            `[runReconciliation] Failed to reattach job ${job.id}`,
            error
          )
        );
    }
  };

  const authState = useAuth.getState().state;
  if (!isAuthRequired() || authState === "logged_in") {
    void reconcile();
  } else if (authState === "init" || authState === "loading") {
    // Auth is still settling (Supabase restoring the session right after the
    // reload). Wait for the outcome; anything but logged_in means the jobs
    // list cannot be read.
    unsubscribeAuth = useAuth.subscribe((auth) => {
      if (auth.state === "logged_in") {
        unsubscribeAuth?.();
        unsubscribeAuth = null;
        void reconcile();
      } else if (auth.state === "logged_out" || auth.state === "error") {
        unsubscribeAuth?.();
        unsubscribeAuth = null;
      }
    });
  }
};

/** Cancel a pending reconciliation (workflow closed or resubscribed). */
export const stopRunReconciliation = (workflowId: string): void => {
  const cancel = reconciliations.get(workflowId);
  if (cancel) {
    reconciliations.delete(workflowId);
    cancel();
  }
};
