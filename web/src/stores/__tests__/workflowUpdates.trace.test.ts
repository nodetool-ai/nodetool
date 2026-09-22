import type { WorkflowAttributes } from "../ApiTypes";
import useTraceStore from "../TraceStore";
import { handleUpdate } from "../workflowUpdates";

const mockWorkflow = {
  id: "workflow-1",
  name: "Workflow 1"
} as WorkflowAttributes;

const makeRunner = (jobId: string | null, state = "running") => ({
  getState: () => ({
    job_id: jobId,
    state,
    queuePosition: null,
    addNotification: jest.fn(),
    dequeueNextPendingRun: jest.fn()
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
});

beforeEach(() => {
  useTraceStore.getState().clear();
});

describe("handleUpdate → TraceStore wiring", () => {
  it("starts a fresh trace run on the runner's own job_update(running)", () => {
    const runner = makeRunner("trace-job-1");
    handleUpdate(
      mockWorkflow,
      { type: "job_update", status: "running", job_id: "trace-job-1" } as never,
      runner as never,
      () => undefined
    );
    expect(useTraceStore.getState().isRecording).toBe(true);
  });

  it("records llm_call, tool_call and tool_result events while recording", () => {
    useTraceStore.getState().startRun(new Date().toISOString(), {
      workflowId: mockWorkflow.id,
      workflowName: mockWorkflow.name,
      jobId: "job-1"
    });
    const runner = makeRunner("job-1");

    handleUpdate(
      mockWorkflow,
      {
        type: "llm_call",
        node_id: "agent-1",
        node_name: "Agent",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
        response: "hello",
        tokens_input: 10,
        tokens_output: 5,
        duration_ms: 123,
        job_id: "job-1",
        timestamp: new Date().toISOString()
      } as never,
      runner as never,
      () => undefined
    );

    handleUpdate(
      mockWorkflow,
      {
        type: "tool_call_update",
        node_id: "agent-1",
        name: "search",
        args: {},
        job_id: "job-1"
      } as never,
      runner as never,
      () => undefined
    );

    handleUpdate(
      mockWorkflow,
      {
        type: "tool_result_update",
        node_id: "agent-1",
        name: "search",
        result: { ok: true },
        is_error: false,
        job_id: "job-1"
      } as never,
      runner as never,
      () => undefined
    );

    const events = useTraceStore.getState().events;
    expect(events.map((e) => e.type)).toEqual([
      "llm_call",
      "tool_call",
      "tool_result"
    ]);
    expect(events[0].summary).toContain("anthropic/claude-sonnet-4-6");
    expect(events[0].detail).toMatchObject({
      tokens_input: 10,
      tokens_output: 5
    });
  });

  it("keeps concurrent workflow events out of the visible run trace", () => {
    const wfA = { id: "wf-a", name: "A" } as WorkflowAttributes;
    const wfB = { id: "wf-b", name: "B" } as WorkflowAttributes;
    const runnerA = makeRunner("job-a");
    const runnerB = makeRunner("job-b");

    const runningUpdate = (jobId: string) =>
      ({ type: "job_update", status: "running", job_id: jobId }) as never;

    handleUpdate(wfA, runningUpdate("job-a"), runnerA as never, () => undefined);
    handleUpdate(wfB, runningUpdate("job-b"), runnerB as never, () => undefined);

    // The last started run is B, so an event from A must not appear under B's
    // visible Workflow → Run context.
    handleUpdate(
      wfA,
      {
        type: "llm_call",
        node_id: "agent-1",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        messages: [],
        response: "",
        duration_ms: 1,
        job_id: "job-a",
        timestamp: new Date().toISOString()
      } as never,
      runnerA as never,
      () => undefined
    );
    handleUpdate(wfA, runningUpdate("job-a"), runnerA as never, () => undefined);
    handleUpdate(wfB, runningUpdate("job-b"), runnerB as never, () => undefined);

    expect(useTraceStore.getState().events).toHaveLength(0);
    expect(useTraceStore.getState().runContext).toEqual({
      workflowId: "wf-b",
      workflowName: "B",
      jobId: "job-b"
    });
    expect(useTraceStore.getState().isRecording).toBe(true);

    const runA = useTraceStore
      .getState()
      .runs.find((run) => run.context?.jobId === "job-a");
    expect(runA).toBeDefined();
    useTraceStore.getState().selectRun(runA!.id);
    expect(useTraceStore.getState().events).toEqual([
      expect.objectContaining({ type: "llm_call" })
    ]);
  });

  it("retains separate traces for concurrent jobs in the same workflow", () => {
    const runner = makeRunner("job-a");
    const jobUpdate = (jobId: string, status: "queued" | "running") =>
      ({ type: "job_update", status, job_id: jobId }) as never;
    const llmCall = (jobId: string, model: string) =>
      ({
        type: "llm_call",
        node_id: "agent-1",
        node_name: "Agent",
        provider: "openai",
        model,
        messages: [],
        response: "",
        duration_ms: 1,
        job_id: jobId,
        timestamp: new Date().toISOString()
      }) as never;

    handleUpdate(
      mockWorkflow,
      jobUpdate("job-a", "running"),
      runner as never,
      () => undefined
    );
    const selectedRunId = useTraceStore.getState().selectedRunId;

    handleUpdate(
      mockWorkflow,
      jobUpdate("job-b", "queued"),
      runner as never,
      () => undefined
    );
    handleUpdate(
      mockWorkflow,
      jobUpdate("job-b", "running"),
      runner as never,
      () => undefined
    );

    const traceState = useTraceStore.getState();
    expect(traceState.runs).toHaveLength(2);
    expect(traceState.selectedRunId).toBe(selectedRunId);
    expect(
      traceState.runs.find((run) => run.id === traceState.activeRunId)?.context
        ?.jobId
    ).toBe("job-b");

    handleUpdate(
      mockWorkflow,
      llmCall("job-b", "background-model"),
      runner as never,
      () => undefined
    );
    handleUpdate(
      mockWorkflow,
      llmCall("job-a", "foreground-model"),
      runner as never,
      () => undefined
    );

    const runA = useTraceStore
      .getState()
      .runs.find((run) => run.context?.jobId === "job-a");
    const runB = useTraceStore
      .getState()
      .runs.find((run) => run.context?.jobId === "job-b");
    expect(runA?.events).toEqual([
      expect.objectContaining({
        type: "llm_call",
        summary: expect.stringContaining("foreground-model")
      })
    ]);
    expect(runB?.events).toEqual([
      expect.objectContaining({
        type: "llm_call",
        summary: expect.stringContaining("background-model")
      })
    ]);
  });

  it("does not record events when no run is active", () => {
    // store cleared in beforeEach → isRecording is false
    const runner = makeRunner("job-1");
    handleUpdate(
      mockWorkflow,
      {
        type: "llm_call",
        node_id: "agent-1",
        provider: "openai",
        model: "gpt-5.4-mini",
        messages: [],
        response: "",
        duration_ms: 1,
        timestamp: new Date().toISOString()
      } as never,
      runner as never,
      () => undefined
    );
    expect(useTraceStore.getState().events).toHaveLength(0);
  });
});
