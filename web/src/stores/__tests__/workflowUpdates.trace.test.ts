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
    useTraceStore.getState().startRun(new Date().toISOString());
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

  it("tracks trace runs per workflow so concurrent runs don't restart each other's trace", () => {
    const wfA = { id: "wf-a", name: "A" } as WorkflowAttributes;
    const wfB = { id: "wf-b", name: "B" } as WorkflowAttributes;
    const runnerA = makeRunner("job-a");
    const runnerB = makeRunner("job-b");

    const runningUpdate = (jobId: string) =>
      ({ type: "job_update", status: "running", job_id: jobId }) as never;

    handleUpdate(wfA, runningUpdate("job-a"), runnerA as never, () => undefined);
    handleUpdate(wfB, runningUpdate("job-b"), runnerB as never, () => undefined);

    // Record an event, then deliver more running heartbeats for both jobs.
    // With a shared (non-per-workflow) trace job id, each alternating
    // heartbeat would call startRun again and wipe the recorded events.
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
        timestamp: new Date().toISOString()
      } as never,
      runnerA as never,
      () => undefined
    );
    handleUpdate(wfA, runningUpdate("job-a"), runnerA as never, () => undefined);
    handleUpdate(wfB, runningUpdate("job-b"), runnerB as never, () => undefined);

    expect(useTraceStore.getState().events).toHaveLength(1);
    expect(useTraceStore.getState().isRecording).toBe(true);
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
