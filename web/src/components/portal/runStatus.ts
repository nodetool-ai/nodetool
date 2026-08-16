import type { Job } from "../../stores/ApiTypes";

export type RunTone = "running" | "failed" | "done";

/** Jobs the backend has not settled yet. */
const RUNNING_STATUSES = new Set(["running", "starting", "queued", "pending"]);
const FAILED_STATUSES = new Set(["failed", "error", "cancelled"]);

export const toneFor = (status: string | null | undefined): RunTone => {
  const normalized = (status ?? "").toLowerCase();
  if (RUNNING_STATUSES.has(normalized)) {
    return "running";
  }
  if (FAILED_STATUSES.has(normalized)) {
    return "failed";
  }
  return "done";
};

/** Compact relative time: "now", "12m", "3h", "5d". */
export function shortAgo(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) {
    return "now";
  }
  if (mins < 60) {
    return `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

export interface WorkflowLastRun {
  tone: RunTone;
  label: string;
}

const runTime = (job: Job): string => job.started_at ?? job.finished_at ?? "";

/**
 * The most recent run per workflow. A running job always wins over a settled
 * one, so a card shows "running" while a run is in flight even if the job list
 * still carries a newer finished record for a different attempt.
 */
export function lastRunByWorkflow(
  jobs: Job[] | undefined
): Map<string, WorkflowLastRun> {
  const latest = new Map<string, Job>();
  for (const job of jobs ?? []) {
    const current = latest.get(job.workflow_id);
    if (!current) {
      latest.set(job.workflow_id, job);
      continue;
    }
    const jobRunning = toneFor(job.status) === "running";
    const currentRunning = toneFor(current.status) === "running";
    if (jobRunning && !currentRunning) {
      latest.set(job.workflow_id, job);
      continue;
    }
    if (jobRunning === currentRunning && runTime(job) > runTime(current)) {
      latest.set(job.workflow_id, job);
    }
  }

  const result = new Map<string, WorkflowLastRun>();
  for (const [workflowId, job] of latest) {
    const tone = toneFor(job.status);
    if (tone === "running") {
      result.set(workflowId, { tone, label: "running" });
      continue;
    }
    const verb = tone === "failed" ? "failed" : "ran";
    const when = shortAgo(job.finished_at ?? job.started_at);
    // shortAgo says "now" for anything under a minute, which does not take
    // an "ago".
    const label = !when
      ? verb
      : when === "now"
        ? `${verb} just now`
        : `${verb} ${when} ago`;
    result.set(workflowId, { tone, label });
  }
  return result;
}
