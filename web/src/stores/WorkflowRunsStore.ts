/**
 * WorkflowRunsStore — registry of concurrent runs per workflow plus a
 * per-workflow "focused job" lens.
 *
 * Responsibilities:
 * - Track every run (queued → running → terminal) keyed by workflowId + jobId.
 * - Maintain a focused job per workflow so the canvas knows which run to
 *   display node outputs for.
 * - Auto-follow new runs unless the user has explicitly pinned a job.
 */

import { create } from "zustand";
import useResultsStore from "./ResultsStore";
import useStatusStore from "./StatusStore";
import useErrorStore from "./ErrorStore";
import useExecutionTimeStore from "./ExecutionTimeStore";

/**
 * Finished runs kept per workflow. Older finished runs are evicted with their
 * job-keyed slices so a long-lived tab does not grow without bound. Runs still
 * in flight and the focused (or pinned) run are always kept on top of this.
 */
export const MAX_RETAINED_RUNS_PER_WORKFLOW = 20;

export type RunState =
  | "queued"
  | "running"
  | "completed"
  | "error"
  | "cancelled";

export interface RunMeta {
  jobId: string;
  workflowId: string;
  state: RunState;
  /** ms epoch when the run was recorded; caller supplies (Date.now()). */
  startedAt: number;
  /** Optional human label (e.g. distinguishing param); may be undefined. */
  label?: string;
  /** The job's own error text when it failed or timed out. */
  error?: string;
}

const TERMINAL: ReadonlySet<RunState> = new Set([
  "completed",
  "error",
  "cancelled"
]);

const isTerminal = (state: RunState): boolean => TERMINAL.has(state);

/** Drop a run's job-keyed slices from the run-state stores. */
const clearJobSlices = (wf: string, jobId: string): void => {
  useResultsStore.getState().clearJobResults(wf, jobId);
  useStatusStore.getState().clearJobStatuses(wf, jobId);
  useErrorStore.getState().clearJobErrors(wf, jobId);
  useExecutionTimeStore.getState().clearJobTimings(wf, jobId);
};

/**
 * The oldest finished runs beyond the retention cap, never the focused run or
 * one still in flight.
 */
const runsToEvict = (
  wfRuns: Record<string, RunMeta>,
  focused: string | undefined
): string[] => {
  const runs = Object.values(wfRuns);
  const excess = runs.length - MAX_RETAINED_RUNS_PER_WORKFLOW;
  if (excess <= 0) {
    return [];
  }
  return runs
    .filter((r) => isTerminal(r.state) && r.jobId !== focused)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(0, excess)
    .map((r) => r.jobId);
};

type WorkflowRunsState = {
  /** workflowId → jobId → RunMeta */
  runs: Record<string, Record<string, RunMeta>>;
  /** workflowId → focused jobId */
  focusedJob: Record<string, string>;
  /** workflowId → did the user explicitly pick the focus? */
  pinned: Record<string, boolean>;
};

type WorkflowRunsActions = {
  /**
   * Upsert a run. Auto-focuses the newest run (latest-run-wins) unless the user
   * has explicitly pinned a focus via setFocusedJob. Evicts the oldest finished
   * runs beyond MAX_RETAINED_RUNS_PER_WORKFLOW through removeRun.
   */
  recordRun: (meta: RunMeta) => void;
  /**
   * Update the RunState for an existing run, and the job's error when it
   * reported one. Focus is unchanged.
   */
  updateRunState: (
    wf: string,
    jobId: string,
    state: RunState,
    error?: string
  ) => void;
  /** Explicit user focus selection — also sets pinned[wf] = true. */
  setFocusedJob: (wf: string, jobId: string) => void;
  getFocusedJob: (wf: string) => string | undefined;
  /** Object.values of runs[wf] or []. */
  getRuns: (wf: string) => RunMeta[];
  /** Check if a specific run exists for a workflow. */
  hasRun: (wf: string, jobId: string) => boolean;
  /**
   * Remove a run and its job-keyed slices in the Results, Status, Error and
   * ExecutionTime stores. If it was the focused job, re-focus to the newest
   * still-present running run, then the newest present run, then clear focus.
   * Clears pinned[wf] when re-focusing this way.
   */
  removeRun: (wf: string, jobId: string) => void;
  /** Remove all runs, focus, and pinned entries for a workflow. */
  clearWorkflow: (wf: string) => void;
};

type WorkflowRunsStore = WorkflowRunsState & WorkflowRunsActions;

const useWorkflowRunsStore = create<WorkflowRunsStore>((set, get) => ({
  runs: {},
  focusedJob: {},
  pinned: {},

  recordRun: (meta: RunMeta) => {
    const { runs, focusedJob, pinned } = get();
    const wf = meta.workflowId;

    const wfRuns = { ...(runs[wf] ?? {}), [meta.jobId]: meta };

    // Auto-focus rule: latest-run-wins unless the user explicitly pinned a job.
    const shouldAutoFocus = !pinned[wf];

    const nextFocusedJob = shouldAutoFocus
      ? { ...focusedJob, [wf]: meta.jobId }
      : focusedJob;
    set({
      runs: { ...runs, [wf]: wfRuns },
      focusedJob: nextFocusedJob
    });

    for (const jobId of runsToEvict(wfRuns, nextFocusedJob[wf])) {
      get().removeRun(wf, jobId);
    }
  },

  updateRunState: (
    wf: string,
    jobId: string,
    state: RunState,
    error?: string
  ) => {
    const { runs } = get();
    const wfRuns = runs[wf];
    if (!wfRuns || !wfRuns[jobId]) return;

    set({
      runs: {
        ...runs,
        [wf]: {
          ...wfRuns,
          [jobId]:
            error === undefined
              ? { ...wfRuns[jobId], state }
              : { ...wfRuns[jobId], state, error }
        }
      }
    });
  },

  setFocusedJob: (wf: string, jobId: string) => {
    const { focusedJob, pinned } = get();
    set({
      focusedJob: { ...focusedJob, [wf]: jobId },
      pinned: { ...pinned, [wf]: true }
    });
  },

  getFocusedJob: (wf: string): string | undefined => {
    return get().focusedJob[wf];
  },

  getRuns: (wf: string): RunMeta[] => {
    return Object.values(get().runs[wf] ?? {});
  },

  hasRun: (wf: string, jobId: string): boolean => {
    const wfRuns = get().runs[wf];
    return wfRuns !== undefined && wfRuns[jobId] !== undefined;
  },

  removeRun: (wf: string, jobId: string) => {
    const { runs, focusedJob, pinned } = get();
    const wfRuns = runs[wf];
    if (!wfRuns) return;

    const newWfRuns = { ...wfRuns };
    delete newWfRuns[jobId];

    const wasFocused = focusedJob[wf] === jobId;
    let newFocusedJob = focusedJob;
    let newPinned = pinned;

    if (wasFocused) {
      // Find the newest running run, else the newest run overall.
      const remaining = Object.values(newWfRuns);
      const running = remaining
        .filter((r) => !isTerminal(r.state))
        .sort((a, b) => b.startedAt - a.startedAt);
      const all = remaining.sort((a, b) => b.startedAt - a.startedAt);

      const next = running[0] ?? all[0];
      newPinned = { ...pinned, [wf]: false };
      if (next) {
        newFocusedJob = { ...focusedJob, [wf]: next.jobId };
      } else {
        newFocusedJob = { ...focusedJob };
        delete newFocusedJob[wf];
      }
    }

    const newRuns = { ...runs, [wf]: newWfRuns };

    set({ runs: newRuns, focusedJob: newFocusedJob, pinned: newPinned });
    clearJobSlices(wf, jobId);
  },

  clearWorkflow: (wf: string) => {
    const { runs, focusedJob, pinned } = get();

    const newRuns = { ...runs };
    delete newRuns[wf];

    const newFocusedJob = { ...focusedJob };
    delete newFocusedJob[wf];

    const newPinned = { ...pinned };
    delete newPinned[wf];

    set({ runs: newRuns, focusedJob: newFocusedJob, pinned: newPinned });
  }
}));

export default useWorkflowRunsStore;
