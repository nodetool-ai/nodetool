/**
 * Recent failed provider calls, kept so a bug report can carry the call
 * itself — provider, model, HTTP status, the provider's request id, how long
 * it ran and the (redacted) request — instead of the one line of prose that
 * reaches the screen.
 *
 * Every `provider_call_failed` frame lands here, from any surface: a workflow
 * node, a chat turn, a direct media generation. `GlobalWebSocketManager`
 * records them centrally because the message carries no routing key of its
 * own on the chat path.
 */
import { create } from "zustand";
import type { ProviderCallFailed } from "@nodetool-ai/protocol";

/** A run rarely fails more than a handful of calls; older ones are noise. */
const MAX_FAILURES = 25;

/**
 * The frame plus when this browser saw it. `timestamp` is the server's clock;
 * freshness checks here need the client's, so a skewed server cannot make a
 * stale failure look current.
 */
export type RecordedProviderCallFailure = ProviderCallFailed & {
  receivedAt: number;
};

interface ProviderCallFailureState {
  /** Oldest first. */
  failures: RecordedProviderCallFailure[];
  record: (failure: ProviderCallFailed) => void;
  clear: () => void;
}

export const useProviderCallFailureStore = create<ProviderCallFailureState>(
  (set) => ({
    failures: [],
    record: (failure) =>
      set((state) => ({
        failures: [
          ...state.failures,
          { ...failure, receivedAt: Date.now() }
        ].slice(-MAX_FAILURES)
      })),
    clear: () => set({ failures: [] })
  })
);

/** Record from outside React — the websocket manager is not a component. */
export const recordProviderCallFailure = (
  failure: ProviderCallFailed
): void => {
  useProviderCallFailureStore.getState().record(failure);
};

/**
 * The failures belonging to one run, newest last. A call that failed before
 * the relay could stamp a job is matched on the workflow instead, so an
 * editor run still reports the call that broke it.
 */
export function failuresForRun(
  failures: RecordedProviderCallFailure[],
  run: { jobId?: string; workflowId?: string }
): RecordedProviderCallFailure[] {
  if (!run.jobId && !run.workflowId) return [];
  return failures.filter(
    (failure) =>
      (run.jobId !== undefined && failure.job_id === run.jobId) ||
      (run.workflowId !== undefined && failure.workflow_id === run.workflowId)
  );
}

/** How long a failure stays attachable to an error banner that names no run. */
const RECENT_WINDOW_MS = 5 * 60 * 1000;

/**
 * The last provider call to fail, if it failed recently enough to plausibly
 * be what the caller is looking at. Surfaces that show a bare error string —
 * the chat banner — have nothing else to key on.
 */
export function latestRecentFailure(
  failures: RecordedProviderCallFailure[],
  now = Date.now()
): RecordedProviderCallFailure | undefined {
  const last = failures[failures.length - 1];
  return last && now - last.receivedAt <= RECENT_WINDOW_MS ? last : undefined;
}
