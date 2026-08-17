/**
 * Cancelling a run that is executing on another instance.
 *
 * {@link jobRunRegistry} is process-wide, so a `cancel_job` that lands on a
 * machine which does not hold the run has nothing local to stop. The job row is
 * what crosses the gap: the cancel is written there, and every instance
 * re-reads its *own* running runs on a slow timer
 * ({@link startJobCancelPoller}), cancelling any whose row now reads
 * `cancelled`. One indexed query per tick, bounded by that instance's
 * concurrency.
 *
 * So a cross-instance cancel is not instant — worst case it takes a poll
 * interval to land. That is the deliberate trade for having exactly one
 * transport: the durable one. A `NOTIFY` bus would shave those seconds off but
 * would need a direct (non-transaction-pooled) connection to be anything but a
 * silent no-op, and it could never be the signal of record anyway — the row
 * already is.
 *
 * A cancel on the machine that *does* hold the run never comes through here:
 * `cancelJob` reaches the session's hooks directly and is immediate.
 */

import { createLogger } from "@nodetool-ai/config";
import { Job } from "@nodetool-ai/models";

import { jobRunRegistry } from "./job-run-registry.js";
import { getInstanceId } from "./lib/instance-id.js";

const log = createLogger("nodetool.websocket.job-control");

/** How often an instance re-reads its own running runs. 0 disables the poll. */
function pollIntervalMs(): number {
  const raw = process.env["NODETOOL_JOB_CANCEL_POLL_MS"];
  if (raw === undefined) return 15_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 15_000;
}

interface RemoteCancelResult {
  cancelled: boolean;
  workflowId: string | null;
}

/**
 * Cancel a run this process does not hold, when another instance does.
 *
 * Scoped deliberately narrowly. Plenty of runs have no registry session
 * anywhere — an HTTP `POST /run`, a trigger firing, an MCP call — and their
 * rows carry no `runner_instance`. Flipping one of those to `cancelled` would
 * report a cancellation to the client while the run went on to complete, and
 * would leave a completed run recorded as cancelled. So a row is only treated
 * as remotely cancellable when it names an instance, and a different one than
 * this process; anything else keeps the caller's "not found" answer.
 *
 * The write is conditional on the row still being active, so losing the race
 * against the owner's terminal write leaves the owner's outcome standing — and
 * its result is the verdict returned here. The owner's poller does the rest.
 */
export async function requestRemoteJobCancel(
  userId: string,
  jobId: string
): Promise<RemoteCancelResult> {
  const miss: RemoteCancelResult = { cancelled: false, workflowId: null };
  const instanceId = getInstanceId();
  if (!instanceId) return miss;

  try {
    const job = await Job.find(userId, jobId);
    if (!job || job.isComplete()) return miss;
    if (!job.runner_instance || job.runner_instance === instanceId) return miss;
    if (!(await Job.markCancelledIfActive(jobId, userId))) return miss;
    log.info("Cancelled a run owned by another instance", {
      jobId,
      owner: job.runner_instance
    });
    return { cancelled: true, workflowId: job.workflow_id || null };
  } catch (err) {
    log.warn("Remote cancel could not reach the job row", {
      jobId,
      error: err instanceof Error ? err.message : String(err)
    });
    return miss;
  }
}

/**
 * Re-read this instance's own running runs and cancel the ones whose row says
 * they were cancelled elsewhere.
 *
 * Nothing running locally means no query at all, so an idle instance costs one
 * timer wakeup. Errors are logged and the tick is skipped: a database blip must
 * not stop the poller, and the next tick sees the same rows.
 */
export function startJobCancelPoller(): () => void {
  const intervalMs = pollIntervalMs();
  if (intervalMs === 0) return () => {};

  let stopped = false;
  let inFlight = false;

  const tick = async (): Promise<void> => {
    // Never overlap: a slow query would otherwise stack ticks behind it.
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      await pollCancelledJobsOnce();
    } catch (err) {
      log.warn("Job cancel poll failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  // The poller must not be why the process stays alive.
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * One poll pass: cancel every local run whose row now reads cancelled. Called
 * on the timer, and directly by tests — the interval is far too slow to await.
 */
export async function pollCancelledJobsOnce(): Promise<void> {
  const sessions = jobRunRegistry.runningSessions();
  if (sessions.length === 0) return;
  const cancelled = new Set(
    await Job.cancelledAmong(sessions.map((s) => s.jobId))
  );
  for (const session of sessions) {
    if (!cancelled.has(session.jobId) || session.status !== "running") continue;
    log.info("Cancelling a local run its row reports cancelled", {
      jobId: session.jobId
    });
    session.cancel();
  }
}
