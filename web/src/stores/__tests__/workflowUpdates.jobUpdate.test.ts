/**
 * Characterization tests for the `job_update` branch of handleUpdate: the
 * runner-state mapping, the queue-position and status-message writes, the
 * jobs-list refresh, and the failure notifications (validation issues vs a
 * plain error). Pins the behaviour so the branch can be reshaped safely.
 */
import type { JobUpdate, WorkflowAttributes } from "../ApiTypes";
import { stub } from "../../test-utils/doubles";
import { handleUpdate } from "../workflowUpdates";
import usePropertyValidationStore from "../PropertyValidationStore";
import useWorkflowRunsStore from "../WorkflowRunsStore";
import { markJobSilent, unmarkJobSilent } from "../previewJobs";
import { queryClient } from "../../queryClient";

const mockAddNotification = jest.fn();

const makeRunnerStore = (
  overrides: Partial<{ job_id: string | null; state: string }> = {}
) => ({
  getState: () => ({
    job_id: overrides.job_id ?? null,
    state: overrides.state ?? "idle",
    queuePosition: null,
    statusMessage: null,
    addNotification: mockAddNotification,
    dequeueNextPendingRun: jest.fn()
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
});

const mockWorkflow = {
  id: "wf",
  name: "WF"
} as WorkflowAttributes;

/** Merge every `setState` patch the handler wrote, in order. */
const writes = (runnerStore: { setState: jest.Mock }): Record<string, unknown> =>
  Object.assign({}, ...runnerStore.setState.mock.calls.map((c) => c[0]));

const send = (
  update: Partial<JobUpdate>,
  runnerStore: ReturnType<typeof makeRunnerStore>
) => {
  handleUpdate(
    mockWorkflow,
    stub<JobUpdate>({ type: "job_update", ...update }),
    runnerStore as never,
    () => undefined
  );
};

let invalidateQueries: jest.SpyInstance;

beforeEach(() => {
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
  usePropertyValidationStore.getState().clearWorkflow("wf");
  mockAddNotification.mockClear();
  invalidateQueries = jest
    .spyOn(queryClient, "invalidateQueries")
    .mockReturnValue(undefined as never);
});

afterEach(() => {
  invalidateQueries.mockRestore();
});

describe("handleUpdate job_update — runner state", () => {
  it.each([
    ["running", "running"],
    ["queued", "running"],
    ["suspended", "suspended"],
    ["paused", "paused"],
    ["completed", "idle"],
    ["cancelled", "cancelled"],
    ["failed", "error"],
    ["timed_out", "error"]
  ])("maps status %s to runner state %s", (status, expected) => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });
    send({ job_id: "A", status }, runnerStore);
    expect(writes(runnerStore).state).toBe(expected);
  });

  it("leaves the runner state alone for an unmapped status", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });
    send({ job_id: "A", status: "error" }, runnerStore);
    expect(writes(runnerStore)).not.toHaveProperty("state");
  });

  it("does not overwrite an error state with a stale running update", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "error" });
    send({ job_id: "A", status: "running" }, runnerStore);
    expect(writes(runnerStore)).not.toHaveProperty("state");
  });

  it("claims a fresh run's job_id while the runner is idle", () => {
    const runnerStore = makeRunnerStore({ job_id: null, state: "idle" });
    send({ job_id: "A", status: "running" }, runnerStore);
    expect(writes(runnerStore)).toMatchObject({
      state: "running",
      job_id: "A"
    });
  });

  it("ignores a concurrent inline job's update", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });
    send({ job_id: "B", status: "completed" }, runnerStore);
    expect(runnerStore.setState).not.toHaveBeenCalled();
  });

  it("ignores a silent preview job entirely", () => {
    markJobSilent("scrub-1");
    const runnerStore = makeRunnerStore({ job_id: null, state: "idle" });
    send({ job_id: "scrub-1", status: "running" }, runnerStore);
    unmarkJobSilent("scrub-1");
    expect(runnerStore.setState).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

describe("handleUpdate job_update — queue position and status message", () => {
  it("records the queue position and the queued status message", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "connecting" });
    send(
      { job_id: "A", status: "queued", queue_position: 3, message: "Waiting" },
      runnerStore
    );
    expect(writes(runnerStore)).toMatchObject({
      queuePosition: 3,
      statusMessage: "Waiting"
    });
  });

  it("falls back to the boot message when a queued update carries none", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "connecting" });
    send({ job_id: "A", status: "queued" }, runnerStore);
    expect(writes(runnerStore).statusMessage).toBe(
      "Worker is booting (may take a few seconds)..."
    );
  });

  it("clears the queue position and status message once running", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "connecting" });
    send({ job_id: "A", status: "running", queue_position: 3 }, runnerStore);
    expect(writes(runnerStore)).toMatchObject({
      queuePosition: null,
      statusMessage: null
    });
  });

  it("shows the suspension reason when a run suspends", () => {
    const runnerStore = makeRunnerStore({ job_id: "A", state: "running" });
    send(
      {
        job_id: "A",
        status: "suspended",
        run_state: { suspension_reason: "waiting for input" }
      },
      runnerStore
    );
    expect(writes(runnerStore).statusMessage).toBe("waiting for input");
    // The toast is separate from the status message: it prefers `message` and
    // otherwise says the generic line, never the suspension reason.
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        content: "Workflow suspended - waiting for external input"
      })
    );
  });
});

describe("handleUpdate job_update — jobs list refresh", () => {
  it.each([
    "queued",
    "running",
    "completed",
    "cancelled",
    "failed",
    "suspended",
    "paused"
  ])("refreshes the jobs list on %s", (status) => {
    send({ job_id: "A", status }, makeRunnerStore({ job_id: "A" }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["jobs"] });
  });

  it("does not refresh the jobs list on an unlisted status", () => {
    send({ job_id: "A", status: "timed_out" }, makeRunnerStore({ job_id: "A" }));
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["jobs"] });
  });

  it("refreshes the asset cache only when a job completes", () => {
    send({ job_id: "A", status: "completed" }, makeRunnerStore({ job_id: "A" }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["assets"] });
  });
});

describe("handleUpdate job_update — failure notifications", () => {
  const issue = {
    node_id: "n1",
    node_type: "nodetool.text.Concat",
    property: "a",
    message: "required"
  };

  it("names the offending property when one issue has one", () => {
    send(
      { job_id: "A", status: "failed", validation_issues: [issue] },
      makeRunnerStore({ job_id: "A" })
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: "Fix “a” on n1 before running."
      })
    );
    expect(usePropertyValidationStore.getState().getError("wf", "n1", "a")).toBe(
      "required"
    );
  });

  it("falls back to the message when the issue names no property", () => {
    send(
      {
        job_id: "A",
        status: "failed",
        validation_issues: [{ ...issue, property: "" }]
      },
      makeRunnerStore({ job_id: "A" })
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Fix “n1” before running: required"
      })
    );
  });

  it("counts the fields when several issues fail the run", () => {
    send(
      {
        job_id: "A",
        status: "failed",
        validation_issues: [issue, { ...issue, node_id: "n2", property: "b" }]
      },
      makeRunnerStore({ job_id: "A" })
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Fix 2 fields before running (starting at n1)."
      })
    );
  });

  it("reports the error text when the failure carries no issues", () => {
    send(
      { job_id: "A", status: "timed_out", error: "boom" },
      makeRunnerStore({ job_id: "A" })
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: "Job timed_out boom"
      })
    );
  });

  it("notifies on cancellation", () => {
    send(
      { job_id: "A", status: "cancelled" },
      makeRunnerStore({ job_id: "A", state: "running" })
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info", content: "Job cancelled" })
    );
  });
});
