/** Explicit cancellation only. Disconnecting an HTTP reader leaves execution running. */
const cancellations = new Map<string, Map<string, () => void>>();

export function registerAppRunCancellation(
  userId: string,
  runId: string,
  cancel: () => void
): () => void {
  let runs = cancellations.get(userId);
  if (!runs) {
    runs = new Map();
    cancellations.set(userId, runs);
  }
  runs.set(runId, cancel);
  return () => {
    if (runs.get(runId) === cancel) {
      runs.delete(runId);
    }
    if (runs.size === 0) {
      cancellations.delete(userId);
    }
  };
}

/** The caller resolves the owner-scoped run id before reaching this local registry. */
export function cancelAppRun(userId: string, runId: string): boolean {
  const cancel = cancellations.get(userId)?.get(runId);
  if (!cancel) {
    return false;
  }
  cancel();
  return true;
}
