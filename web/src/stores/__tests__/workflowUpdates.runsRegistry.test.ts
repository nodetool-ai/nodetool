/**
 * Tests that handleUpdate populates WorkflowRunsStore from job_update messages.
 * Behaviour-neutral: no other handleUpdate side-effects are tested here.
 */
import type { JobUpdate, WorkflowAttributes } from "../ApiTypes";
import { handleUpdate } from "../workflowUpdates";
import useWorkflowRunsStore from "../WorkflowRunsStore";

// Minimal runner store mock — mirrors the shape used in workflowUpdates.handlers.test.ts.
const mockAddNotification = jest.fn();
const mockDequeueNextPendingRun = jest.fn();

const makeRunnerStore = (overrides: Partial<{ job_id: string | null; state: string }> = {}) => ({
  getState: () => ({
    job_id: overrides.job_id ?? null,
    state: overrides.state ?? "idle",
    queuePosition: null,
    statusMessage: null,
    addNotification: mockAddNotification,
    dequeueNextPendingRun: mockDequeueNextPendingRun
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
});

const mockWorkflow: WorkflowAttributes = {
  id: "wf",
  name: "WF"
} as WorkflowAttributes;

beforeEach(() => {
  // Reset the global runs registry before every test.
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
  mockAddNotification.mockClear();
  mockDequeueNextPendingRun.mockClear();
});

describe("handleUpdate — WorkflowRunsStore registry population", () => {
  it("records a new run and auto-focuses it on first job_update (running)", () => {
    const runnerStore = makeRunnerStore();

    const update: JobUpdate = {
      type: "job_update",
      job_id: "A",
      workflow_id: "wf",
      status: "running"
    };

    handleUpdate(mockWorkflow, update, runnerStore as never, () => undefined);

    const runs = useWorkflowRunsStore.getState().getRuns("wf");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ jobId: "A", state: "running" });
    expect(useWorkflowRunsStore.getState().getFocusedJob("wf")).toBe("A");
  });

  it("updates an existing run's state without duplicating it", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });

    const firstUpdate: JobUpdate = {
      type: "job_update",
      job_id: "A",
      workflow_id: "wf",
      status: "running"
    };

    const secondUpdate: JobUpdate = {
      type: "job_update",
      job_id: "A",
      workflow_id: "wf",
      status: "completed"
    };

    handleUpdate(mockWorkflow, firstUpdate, runnerStore as never, () => undefined);
    handleUpdate(mockWorkflow, secondUpdate, runnerStore as never, () => undefined);

    const runs = useWorkflowRunsStore.getState().getRuns("wf");
    // Still exactly one run for job A.
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ jobId: "A", state: "completed" });
  });

  it("maps queued → queued RunState", () => {
    const runnerStore = makeRunnerStore();
    const update: JobUpdate = { type: "job_update", job_id: "B", workflow_id: "wf", status: "queued" };

    handleUpdate(mockWorkflow, update, runnerStore as never, () => undefined);

    const run = useWorkflowRunsStore.getState().getRuns("wf").find((r) => r.jobId === "B");
    expect(run?.state).toBe("queued");
  });

  it("maps failed → error RunState", () => {
    const runnerStore = makeRunnerStore();
    const update: JobUpdate = { type: "job_update", job_id: "C", workflow_id: "wf", status: "failed" };

    handleUpdate(mockWorkflow, update, runnerStore as never, () => undefined);

    const run = useWorkflowRunsStore.getState().getRuns("wf").find((r) => r.jobId === "C");
    expect(run?.state).toBe("error");
  });

  it("maps cancelled → cancelled RunState", () => {
    const runnerStore = makeRunnerStore({ job_id: "D", state: "running" });
    // Seed the run first.
    const first: JobUpdate = { type: "job_update", job_id: "D", workflow_id: "wf", status: "running" };
    const second: JobUpdate = { type: "job_update", job_id: "D", workflow_id: "wf", status: "cancelled" };

    handleUpdate(mockWorkflow, first, runnerStore as never, () => undefined);
    handleUpdate(mockWorkflow, second, runnerStore as never, () => undefined);

    const run = useWorkflowRunsStore.getState().getRuns("wf").find((r) => r.jobId === "D");
    expect(run?.state).toBe("cancelled");
  });

  it("skips registry update when job_id is falsy", () => {
    const runnerStore = makeRunnerStore();
    const update: JobUpdate = { type: "job_update", status: "running" };

    handleUpdate(mockWorkflow, update, runnerStore as never, () => undefined);

    expect(useWorkflowRunsStore.getState().getRuns("wf")).toHaveLength(0);
  });

  it("does not duplicate entries across multiple running updates for the same job", () => {
    const runnerStore = makeRunnerStore({ job_id: "E", state: "running" });

    for (let i = 0; i < 3; i++) {
      const update: JobUpdate = { type: "job_update", job_id: "E", workflow_id: "wf", status: "running" };
      handleUpdate(mockWorkflow, update, runnerStore as never, () => undefined);
    }

    expect(useWorkflowRunsStore.getState().getRuns("wf")).toHaveLength(1);
  });
});
