/**
 * Link an external cancellation signal to a locally-owned AbortController.
 *
 * Planners and executors own a private controller they fire for their own
 * reasons (validation gave up, the step finished). Cancellation from outside —
 * a user pressing Stop — has to reach that same controller, otherwise the
 * provider call underneath it keeps running.
 *
 * Returns an unlink function; call it when the local controller's work is done
 * so a long-lived external signal doesn't retain finished executors.
 */
export function linkAbort(
  local: AbortController,
  external?: AbortSignal
): () => void {
  if (!external) return () => {};
  if (external.aborted) {
    local.abort();
    return () => {};
  }
  const onAbort = () => local.abort();
  external.addEventListener("abort", onAbort, { once: true });
  return () => external.removeEventListener("abort", onAbort);
}
