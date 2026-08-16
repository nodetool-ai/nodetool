/**
 * Resilient-run resume: the `job_seq` replay cursor, the `job_resumed` reply,
 * and the reconnect_job sent when the socket comes back up.
 */
import type { JobUpdate, WorkflowAttributes } from "../ApiTypes";
import {
  handleUpdate,
  subscribeToWorkflowUpdates,
  type JobResumedUpdate
} from "../workflowUpdates";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    subscribeEvent: jest.fn().mockReturnValue(jest.fn()),
    setResumeJobIdProvider: jest.fn()
  }
}));

jest.mock("../../lib/workflow/browserWorkflowRunner", () => ({
  preloadBrowserRunner: jest.fn()
}));

const mockAddNotification = jest.fn();

type RunnerState = {
  job_id: string | null;
  jobReplayCursor: number;
  state: string;
  isBrowserRun: boolean;
  queuePosition: number | null;
  statusMessage: string | null;
};

/** Minimal runner store stand-in whose setState mutates the tracked state. */
const makeRunnerStore = (overrides: Partial<RunnerState> = {}) => {
  const state: RunnerState = {
    job_id: null,
    jobReplayCursor: 0,
    state: "idle",
    isBrowserRun: false,
    queuePosition: null,
    statusMessage: null,
    ...overrides
  };
  return {
    state,
    getState: () => ({ ...state, addNotification: mockAddNotification }),
    setState: jest.fn((patch: Partial<RunnerState>) => {
      Object.assign(state, patch);
    }),
    subscribe: jest.fn().mockReturnValue(jest.fn())
  };
};

const mockWorkflow: WorkflowAttributes = {
  id: "wf",
  name: "WF"
} as WorkflowAttributes;

const jobResumed = (
  overrides: Partial<JobResumedUpdate> = {}
): JobResumedUpdate => ({
  type: "job_resumed",
  job_id: "A",
  workflow_id: "wf",
  status: "running",
  last_seq: 4,
  replay_count: 2,
  replay_incomplete: false,
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("job_seq replay cursor", () => {
  it("tracks the high-water mark for the runner's own job", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });

    handleUpdate(
      mockWorkflow,
      { type: "job_update", job_id: "A", workflow_id: "wf", status: "running", job_seq: 3 } as JobUpdate,
      runnerStore as never,
      () => undefined
    );

    expect(runnerStore.state.jobReplayCursor).toBe(3);
  });

  it("never moves the cursor backwards", () => {
    const runnerStore = makeRunnerStore({
      job_id: "A",
      state: "running",
      jobReplayCursor: 7
    });

    handleUpdate(
      mockWorkflow,
      { type: "job_update", job_id: "A", workflow_id: "wf", status: "running", job_seq: 2 } as JobUpdate,
      runnerStore as never,
      () => undefined
    );

    expect(runnerStore.state.jobReplayCursor).toBe(7);
  });

  it("ignores frames of a concurrent job", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });

    handleUpdate(
      mockWorkflow,
      { type: "job_update", job_id: "B", workflow_id: "wf", status: "running", job_seq: 9 } as JobUpdate,
      runnerStore as never,
      () => undefined
    );

    expect(runnerStore.state.jobReplayCursor).toBe(0);
  });
});

describe("job_resumed", () => {
  it("restores running and clears the reconnect status message", () => {
    const runnerStore = makeRunnerStore({
      job_id: "A",
      state: "connecting",
      statusMessage: "Reconnecting to running job..."
    });

    handleUpdate(mockWorkflow, jobResumed(), runnerStore as never, () => undefined);

    expect(runnerStore.state.state).toBe("running");
    expect(runnerStore.state.statusMessage).toBeNull();
  });

  it("leaves a run the user cancelled during the gap cancelled", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "cancelled" });

    handleUpdate(mockWorkflow, jobResumed(), runnerStore as never, () => undefined);

    expect(runnerStore.state.state).toBe("cancelled");
  });

  it("leaves a finished run with replayed frames to its terminal job_update", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });

    handleUpdate(
      mockWorkflow,
      jobResumed({ status: "finished", replay_count: 2 }),
      runnerStore as never,
      () => undefined
    );

    expect(runnerStore.setState).not.toHaveBeenCalled();
    expect(runnerStore.state.state).toBe("running");
  });

  it("settles a finished run that has nothing left to replay", () => {
    // Our last_seq already covered the terminal frame (e.g. a duplicated
    // reconnect), so no job_update is coming to end the run.
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });

    handleUpdate(
      mockWorkflow,
      jobResumed({ status: "finished", replay_count: 0 }),
      runnerStore as never,
      () => undefined
    );

    expect(runnerStore.state.state).toBe("idle");
    expect(runnerStore.state.queuePosition).toBeNull();
    expect(runnerStore.state.statusMessage).toBeNull();
    // Finishing normally is not an error — no toast.
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it("does not reopen a run that already settled", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "cancelled" });

    handleUpdate(
      mockWorkflow,
      jobResumed({ status: "finished", replay_count: 0 }),
      runnerStore as never,
      () => undefined
    );

    expect(runnerStore.state.state).toBe("cancelled");
  });

  it("settles an unknown run instead of hanging in running", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });

    handleUpdate(
      mockWorkflow,
      jobResumed({ status: "unknown", replay_count: 0 }),
      runnerStore as never,
      () => undefined
    );

    expect(runnerStore.state.state).toBe("idle");
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning" })
    );
  });

  it("warns when the replay was incomplete", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });

    handleUpdate(
      mockWorkflow,
      jobResumed({ replay_incomplete: true }),
      runnerStore as never,
      () => undefined
    );

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning" })
    );
    expect(runnerStore.state.state).toBe("running");
  });

  it("ignores a frame for another job", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });

    handleUpdate(
      mockWorkflow,
      jobResumed({ job_id: "B", status: "unknown" }),
      runnerStore as never,
      () => undefined
    );

    expect(runnerStore.state.state).toBe("running");
  });
});

describe("reconnect on socket open", () => {
  /** Invoke the "open" listener subscribeToWorkflowUpdates registered. */
  const fireOpen = () => {
    const call = jest.mocked(globalWebSocketManager.subscribeEvent).mock.calls
      .filter(([event]) => event === "open")
      .pop();
    expect(call).toBeDefined();
    (call?.[1] as () => void)();
  };

  it("resumes a running job from its cursor", () => {
    const runnerStore = makeRunnerStore({
      job_id: "A",
      state: "running",
      jobReplayCursor: 5
    });

    subscribeToWorkflowUpdates("wf", mockWorkflow, runnerStore as never, () => undefined);
    fireOpen();

    expect(globalWebSocketManager.send).toHaveBeenCalledWith({
      type: "reconnect_job",
      command: "reconnect_job",
      data: { job_id: "A", workflow_id: "wf", last_seq: 5 }
    });
  });

  it("sends nothing for an idle runner or an in-browser run", () => {
    const idle = makeRunnerStore({ job_id: null, state: "idle" });
    subscribeToWorkflowUpdates("wf", mockWorkflow, idle as never, () => undefined);
    fireOpen();
    expect(globalWebSocketManager.send).not.toHaveBeenCalled();

    const browser = makeRunnerStore({
      job_id: "A",
      state: "running",
      isBrowserRun: true
    });
    subscribeToWorkflowUpdates("wf", mockWorkflow, browser as never, () => undefined);
    fireOpen();
    expect(globalWebSocketManager.send).not.toHaveBeenCalled();
  });
});
