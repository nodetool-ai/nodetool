import useWorkflowRunsStore, { RunMeta } from "../WorkflowRunsStore";

const wf = "workflow-1";

const makeMeta = (jobId: string, overrides: Partial<RunMeta> = {}): RunMeta => ({
  jobId,
  workflowId: wf,
  state: "running",
  startedAt: 1,
  ...overrides
});

describe("WorkflowRunsStore", () => {
  beforeEach(() => {
    useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
  });

  describe("recordRun", () => {
    it("auto-focuses the first run for a workflow", () => {
      const { recordRun, getFocusedJob } = useWorkflowRunsStore.getState();
      const meta = makeMeta("job-1", { startedAt: 1 });
      recordRun(meta);
      expect(getFocusedJob(wf)).toBe("job-1");
    });

    it("moves focus to the newest run when the prior run is still running and not pinned", () => {
      const { recordRun, getFocusedJob } = useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1, state: "running" }));
      recordRun(makeMeta("job-2", { startedAt: 2, state: "running" }));
      expect(getFocusedJob(wf)).toBe("job-2");
    });

    it("does NOT steal focus when the user has pinned a job", () => {
      const { recordRun, setFocusedJob, getFocusedJob } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1 }));
      setFocusedJob(wf, "job-1");
      recordRun(makeMeta("job-2", { startedAt: 2 }));
      expect(getFocusedJob(wf)).toBe("job-1");
    });

    it("takes focus when the focused run is terminal (completed) and not pinned", () => {
      const { recordRun, updateRunState, getFocusedJob } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1, state: "running" }));
      // Focus is now job-1 (auto)
      updateRunState(wf, "job-1", "completed");
      // job-1 is now terminal; a new run should grab focus
      recordRun(makeMeta("job-2", { startedAt: 2, state: "running" }));
      expect(getFocusedJob(wf)).toBe("job-2");
    });

    it("takes focus when the focused run is terminal (error) and not pinned", () => {
      const { recordRun, updateRunState, getFocusedJob } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1, state: "running" }));
      updateRunState(wf, "job-1", "error");
      recordRun(makeMeta("job-2", { startedAt: 2, state: "running" }));
      expect(getFocusedJob(wf)).toBe("job-2");
    });

    it("takes focus when the focused run is terminal (cancelled) and not pinned", () => {
      const { recordRun, updateRunState, getFocusedJob } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1, state: "running" }));
      updateRunState(wf, "job-1", "cancelled");
      recordRun(makeMeta("job-2", { startedAt: 2, state: "running" }));
      expect(getFocusedJob(wf)).toBe("job-2");
    });
  });

  describe("setFocusedJob", () => {
    it("sets focus and pins it", () => {
      const { recordRun, setFocusedJob, getFocusedJob } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1 }));
      recordRun(makeMeta("job-2", { startedAt: 2 }));
      setFocusedJob(wf, "job-1");
      expect(getFocusedJob(wf)).toBe("job-1");
      expect(useWorkflowRunsStore.getState().pinned[wf]).toBe(true);
    });
  });

  describe("removeRun", () => {
    it("re-focuses to a remaining running run when the focused job is removed", () => {
      const { recordRun, getFocusedJob, removeRun } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1, state: "running" }));
      recordRun(makeMeta("job-2", { startedAt: 2, state: "running" }));
      // focus is job-2 (newest running)
      removeRun(wf, "job-2");
      // job-1 is still running and is now the only run
      expect(getFocusedJob(wf)).toBe("job-1");
    });

    it("re-focuses to the newest present run when no running runs remain", () => {
      const { recordRun, updateRunState, getFocusedJob, removeRun } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1, state: "running" }));
      recordRun(makeMeta("job-2", { startedAt: 2, state: "running" }));
      // mark job-1 completed so it's terminal
      updateRunState(wf, "job-1", "completed");
      // focus is job-2; remove it → only completed job-1 remains
      removeRun(wf, "job-2");
      expect(getFocusedJob(wf)).toBe("job-1");
    });

    it("clears focus when the last run is removed", () => {
      const { recordRun, getFocusedJob, removeRun } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1 }));
      removeRun(wf, "job-1");
      expect(getFocusedJob(wf)).toBeUndefined();
    });

    it("clears pinned when re-focusing after removal", () => {
      const { recordRun, setFocusedJob, removeRun } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1 }));
      recordRun(makeMeta("job-2", { startedAt: 2 }));
      setFocusedJob(wf, "job-2");
      removeRun(wf, "job-2");
      expect(useWorkflowRunsStore.getState().pinned[wf]).toBeFalsy();
    });

    it("does not change focus when a non-focused run is removed", () => {
      const { recordRun, getFocusedJob, removeRun } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1 }));
      recordRun(makeMeta("job-2", { startedAt: 2 }));
      // focus is job-2
      removeRun(wf, "job-1");
      expect(getFocusedJob(wf)).toBe("job-2");
    });
  });

  describe("getRuns / clearWorkflow", () => {
    it("getRuns returns all runs for the workflow", () => {
      const { recordRun, getRuns } = useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1 }));
      recordRun(makeMeta("job-2", { startedAt: 2 }));
      const runs = getRuns(wf);
      expect(runs).toHaveLength(2);
      expect(runs.map((r) => r.jobId).sort()).toEqual(["job-1", "job-2"]);
    });

    it("getRuns returns empty array for unknown workflow", () => {
      const { getRuns } = useWorkflowRunsStore.getState();
      expect(getRuns("no-such-workflow")).toEqual([]);
    });

    it("clearWorkflow removes runs, focusedJob, and pinned for the workflow", () => {
      const { recordRun, setFocusedJob, clearWorkflow, getRuns, getFocusedJob } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1 }));
      setFocusedJob(wf, "job-1");
      clearWorkflow(wf);
      expect(getRuns(wf)).toEqual([]);
      expect(getFocusedJob(wf)).toBeUndefined();
      expect(useWorkflowRunsStore.getState().pinned[wf]).toBeUndefined();
    });

    it("clearWorkflow does not affect other workflows", () => {
      const wf2 = "workflow-2";
      const { recordRun, clearWorkflow, getRuns } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1 }));
      recordRun({ ...makeMeta("job-a", { startedAt: 1 }), workflowId: wf2 });
      clearWorkflow(wf);
      expect(getRuns(wf)).toEqual([]);
      expect(getRuns(wf2)).toHaveLength(1);
    });
  });

  describe("updateRunState", () => {
    it("updates the state of a run", () => {
      const { recordRun, updateRunState, getRuns } =
        useWorkflowRunsStore.getState();
      recordRun(makeMeta("job-1", { startedAt: 1, state: "running" }));
      updateRunState(wf, "job-1", "completed");
      const run = getRuns(wf).find((r) => r.jobId === "job-1");
      expect(run?.state).toBe("completed");
    });

    it("is a no-op for unknown runs", () => {
      const { updateRunState } = useWorkflowRunsStore.getState();
      expect(() => updateRunState(wf, "no-such-job", "completed")).not.toThrow();
    });
  });
});
