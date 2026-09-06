import type { ProcessingMessage } from "@nodetool-ai/protocol";

/**
 * Job progress on the job row.
 *
 * A node posts `node_progress` while it works — a render posts one per frame —
 * and until now that message reached only the debug collector, which exists
 * for a finished run. So `get_job` on a background render in its third minute
 * answered "running" and nothing else, which is exactly the moment the caller
 * needs a number. This folds the latest message onto the row.
 *
 * Throttled, because a 25fps two-minute render posts three thousand of them
 * and each write is a database round trip: at most one write every
 * `minIntervalMs`, with a jump of `minPercentStep` or the final frame going
 * through immediately.
 */

/** The shape read off a `node_progress` message. */
export interface JobProgress {
  node_id: string;
  progress: number;
  total: number;
  updated_at: string;
}

export interface JobProgressRecorderOptions {
  /** Persist one progress value. Rejections are swallowed, not thrown. */
  write: (progress: JobProgress) => Promise<void>;
  /** Injected so the throttle is tested against a clock rather than a wait. */
  now?: () => number;
  minIntervalMs?: number;
  /** Percent of `total` that goes through regardless of the interval. */
  minPercentStep?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 2000;
const DEFAULT_MIN_PERCENT_STEP = 5;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A message listener that keeps the job row's progress current.
 *
 * Synchronous on purpose: it is called from the message bus, so it starts the
 * write and returns. A write that fails is dropped — progress is a courtesy,
 * and a database blip must not fail the run it is reporting on.
 */
export function createJobProgressRecorder(
  options: JobProgressRecorderOptions
): (message: ProcessingMessage) => void {
  const now = options.now ?? Date.now;
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const minPercentStep = options.minPercentStep ?? DEFAULT_MIN_PERCENT_STEP;
  let lastWriteAt = Number.NEGATIVE_INFINITY;
  let lastProgress: number | null = null;

  return (message: ProcessingMessage): void => {
    if (message.type !== "node_progress") return;
    const nodeId = message.node_id;
    const progress = num(message.progress);
    const total = num(message.total);
    if (typeof nodeId !== "string" || progress === null || total === null) {
      return;
    }

    const at = now();
    const stepPercent =
      total > 0 && lastProgress !== null
        ? ((progress - lastProgress) / total) * 100
        : Number.POSITIVE_INFINITY;
    const finished = total > 0 && progress >= total;
    const due =
      lastProgress === null ||
      finished ||
      at - lastWriteAt >= minIntervalMs ||
      stepPercent >= minPercentStep;
    if (!due) return;

    lastWriteAt = at;
    lastProgress = progress;
    void options
      .write({
        node_id: nodeId,
        progress,
        total,
        updated_at: new Date(at).toISOString()
      })
      .catch(() => {
        // Progress is a courtesy: a failed write must not fail the run.
      });
  };
}
