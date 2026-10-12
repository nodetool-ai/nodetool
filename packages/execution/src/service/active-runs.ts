/**
 * Runs `runWorkflow` started in this process, by job id, so a cancel can stop
 * them.
 *
 * A background run (`start_background_job`, `render_timeline`, an MCP call)
 * has no WebSocket session, so the websocket package's `jobRunRegistry` never
 * sees it. Writing `cancelled` to the job row alone left such a run going:
 * a render kept encoding for hours, and its finish overwrote the cancel. The
 * cancel paths call {@link cancelActiveRuns} next to the row write, and the
 * run's own cancel aborts its context, which reaches every node's signal.
 */

interface ActiveRun {
  userId: string;
  cancel(): void;
}

const runs = new Map<string, ActiveRun>();

/**
 * Track a run until it settles. Returns the function that stops tracking it;
 * calling it again is harmless.
 */
export function registerActiveRun(
  jobId: string,
  userId: string,
  cancel: () => void
): () => void {
  const entry: ActiveRun = { userId, cancel };
  runs.set(jobId, entry);
  return () => {
    if (runs.get(jobId) === entry) runs.delete(jobId);
  };
}

/** Cancel the caller's own runs among `jobIds`. Returns how many were live. */
export function cancelActiveRuns(
  userId: string,
  jobIds: Iterable<string>
): number {
  let cancelled = 0;
  for (const jobId of jobIds) {
    const run = runs.get(jobId);
    if (!run || run.userId !== userId) continue;
    runs.delete(jobId);
    run.cancel();
    cancelled++;
  }
  return cancelled;
}

/** Whether a run with this job id is executing in this process. */
export function isActiveRun(jobId: string): boolean {
  return runs.has(jobId);
}
