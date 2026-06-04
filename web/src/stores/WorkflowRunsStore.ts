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
}

const TERMINAL: ReadonlySet<RunState> = new Set([
  "completed",
  "error",
  "cancelled"
]);

const isTerminal = (state: RunState): boolean => TERMINAL.has(state);

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
   * has explicitly pinned a focus via setFocusedJob.
   */
  recordRun: (meta: RunMeta) => void;
  /** Update the RunState for an existing run. Focus is unchanged. */
  updateRunState: (wf: string, jobId: string, state: RunState) => void;
  /** Explicit user focus selection — also sets pinned[wf] = true. */
  setFocusedJob: (wf: string, jobId: string) => void;
  getFocusedJob: (wf: string) => string | undefined;
  /** Object.values of runs[wf] or []. */
  getRuns: (wf: string) => RunMeta[];
  /**
   * Remove a run. If it was the focused job, re-focus to the newest still-
   * present running run, then the newest present run, then clear focus.
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

    set({
      runs: { ...runs, [wf]: wfRuns },
      focusedJob: shouldAutoFocus
        ? { ...focusedJob, [wf]: meta.jobId }
        : focusedJob
    });
  },

  updateRunState: (wf: string, jobId: string, state: RunState) => {
    const { runs } = get();
    const wfRuns = runs[wf];
    if (!wfRuns || !wfRuns[jobId]) return;

    set({
      runs: {
        ...runs,
        [wf]: {
          ...wfRuns,
          [jobId]: { ...wfRuns[jobId], state }
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
