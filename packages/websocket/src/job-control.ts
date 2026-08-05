/**
 * Cancelling a run that is executing on another instance.
 *
 * {@link jobRunRegistry} is process-wide, so a `cancel_job` that lands on a
 * machine which does not hold the run has nothing local to stop. The cancel is
 * written to the job row — the durable signal — and the verb also goes onto the
 * job control bus, which every instance listens on: the one holding the session
 * recognises the job and cancels it through the session's hooks, exactly as a
 * local `cancel_job` would.
 *
 * The bus is fast but not guaranteed. Behind a transaction pooler `LISTEN` may
 * never deliver at all, and a subscription re-establishing after a network blip
 * drops whatever was published meanwhile. {@link startJobCancelPoller} closes
 * that hole from the other end: each instance re-reads its *own* running runs'
 * rows on a slow timer and cancels any that now read `cancelled`. One indexed
 * query per tick, bounded by that instance's concurrency — and it makes the row
 * the cancel signal of record rather than a hopeful second copy.
 *
 * Under SQLite the bus is in-process and this whole path collapses to what the
 * local registry lookup already did, one redundant hop later.
 */

import { createLogger } from "@nodetool-ai/config";
import {
  Job,
  publishJobControl,
  subscribeJobControl
} from "@nodetool-ai/models";

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

export interface RemoteCancelResult {
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
 * against the owner's terminal write leaves the owner's outcome standing.
 * Publishing never throws: a lost message leaves the run to the owner's poller.
 */
export async function requestRemoteJobCancel(
  userId: string,
  jobId: string
): Promise<RemoteCancelResult> {
  const miss: RemoteCancelResult = { cancelled: false, workflowId: null };
  const instanceId = getInstanceId();
  if (!instanceId) return miss;

  let workflowId: string | null = null;
  try {
    const job = await Job.find(userId, jobId);
    if (!job || job.isComplete()) return miss;
    if (!job.runner_instance || job.runner_instance === instanceId) return miss;
    workflowId = job.workflow_id || null;
    if (!(await Job.markCancelledIfActive(jobId, userId))) return miss;
  } catch (err) {
    log.warn("Remote cancel could not read the job row", {
      jobId,
      error: err instanceof Error ? err.message : String(err)
    });
    return miss;
  }

  await publishJobControl({
    job_id: jobId,
    user_id: userId,
    action: "cancel",
    origin: instanceId
  });
  return { cancelled: true, workflowId };
}

/**
 * Listen for control verbs addressed at runs this process holds. One
 * subscription per process — every instance receives every message, and the
 * ones that do not hold the job ignore it. Cancel is idempotent, so a repeat
 * (a re-established subscription overlapping the old one) is harmless.
 */
export async function startJobControlSubscription(): Promise<() => void> {
  return subscribeJobControl((message) => {
    if (message.action !== "cancel") return;
    const session = jobRunRegistry.get(message.user_id, message.job_id);
    if (!session || session.status !== "running") return;
    log.info("Cancelling a local run on a bus request", {
      jobId: message.job_id,
      origin: message.origin
    });
    session.cancel();
  });
}

/**
 * Re-read this instance's own running runs and cancel the ones whose row says
 * they were cancelled elsewhere. The backstop for a bus that did not deliver.
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
