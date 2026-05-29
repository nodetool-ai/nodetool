import { create } from "zustand";

/**
 * Tracks how many jobs are running per workflow so the toolbar can show the
 * count. There is at most one "full" run (the Run Workflow / Run Selected /
 * instant-update job, which the per-workflow runner gates to one at a time)
 * plus any number of concurrent "node" runs (per-node "Run From Here" and
 * generative nodes). All in-flight jobs for a workflow are counted here.
 *
 * Maintained centrally from `job_update` messages in `workflowUpdates`, which
 * sees every job for the workflow (all are tagged with its `workflow_id`).
 */
interface RunningJobsState {
  /** workflowId -> set of running job ids */
  jobs: Record<string, string[]>;
  start: (workflowId: string, jobId: string) => void;
  end: (workflowId: string, jobId: string) => void;
  clearWorkflow: (workflowId: string) => void;
}

export const useRunningJobsStore = create<RunningJobsState>((set) => ({
  jobs: {},
  start: (workflowId, jobId) =>
    set((state) => {
      const current = state.jobs[workflowId] ?? [];
      if (current.includes(jobId)) {
        return state;
      }
      return {
        jobs: { ...state.jobs, [workflowId]: [...current, jobId] }
      };
    }),
  end: (workflowId, jobId) =>
    set((state) => {
      const current = state.jobs[workflowId];
      if (!current || !current.includes(jobId)) {
        return state;
      }
      const next = current.filter((id) => id !== jobId);
      const jobs = { ...state.jobs };
      if (next.length > 0) {
        jobs[workflowId] = next;
      } else {
        delete jobs[workflowId];
      }
      return { jobs };
    }),
  clearWorkflow: (workflowId) =>
    set((state) => {
      if (!(workflowId in state.jobs)) {
        return state;
      }
      const jobs = { ...state.jobs };
      delete jobs[workflowId];
      return { jobs };
    })
}));

/** Number of jobs currently running for a workflow. */
export const useRunningJobCount = (workflowId: string | undefined): number =>
  useRunningJobsStore((state) =>
    workflowId ? (state.jobs[workflowId]?.length ?? 0) : 0
  );

export default useRunningJobsStore;
