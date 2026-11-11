import type { GenerationBatchItem } from "@nodetool-ai/protocol";

export interface GenerationBatchProgress {
  done: number;
  failed: number;
  total: number;
  /** 0–100, weighted by each request's expected run time. */
  percent: number;
  /** Seconds until the last request should finish, or null when all are done. */
  remainingSeconds: number | null;
}

/** A running request never counts as more than this share of its estimate. */
const RUNNING_CAP = 0.95;

const isSettled = (item: GenerationBatchItem): boolean =>
  item.status === "completed" || item.status === "failed";

/**
 * How far a batch is and when it should end. Running requests use their
 * elapsed time against their estimate. Queued requests are placed on the
 * free lane that empties first, `concurrency` lanes in all, as the server
 * runs them.
 */
export function generationBatchProgress(
  items: readonly GenerationBatchItem[],
  concurrency: number,
  now: number
): GenerationBatchProgress {
  const total = items.length;
  const done = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;
  let expected = 0;
  let achieved = 0;
  const lanes: number[] = [];
  for (const item of items) {
    const estimate = Math.max(1, item.estimate_seconds);
    expected += estimate;
    if (isSettled(item)) {
      achieved += estimate;
    } else if (item.status === "running") {
      const elapsed = item.started_at != null ? Math.max(0, (now - item.started_at) / 1000) : 0;
      achieved += Math.min(elapsed, estimate * RUNNING_CAP);
      lanes.push(Math.max(1, estimate - elapsed));
    }
  }
  const laneCount = Math.max(1, concurrency);
  while (lanes.length < laneCount) lanes.push(0);
  for (const item of items) {
    if (item.status !== "queued") continue;
    lanes.sort((a, b) => a - b);
    lanes[0] = lanes[0]! + Math.max(1, item.estimate_seconds);
  }
  const settled = done + failed === total;
  return {
    done,
    failed,
    total,
    percent: total === 0 ? 0 : settled ? 100 : Math.min(99, (achieved / expected) * 100),
    remainingSeconds: settled ? null : Math.round(Math.max(...lanes))
  };
}
