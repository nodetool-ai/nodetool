import type { WorkflowAttributes } from "../ApiTypes";
import useTraceStore from "../TraceStore";
import { nodeKey } from "../nodeKey";
import useResultsStore from "../ResultsStore";
import { handleUpdate } from "../workflowUpdates";

const workflow = { id: "workflow-1", name: "Workflow 1" } as WorkflowAttributes;
const runner = {
  getState: () => ({
    job_id: "job-a", state: "running", queuePosition: null,
    addNotification: jest.fn(), dequeueNextPendingRun: jest.fn()
  }),
  setState: jest.fn(), subscribe: jest.fn()
};

beforeEach(() => {
  useTraceStore.getState().clear();
  useResultsStore.getState().clearResults(workflow.id);
});

describe("processing messages and durable trace separation", () => {
  it("does not create local trace records or steal focus for either concurrent job", () => {
    useTraceStore.getState().openInspection({ runId: "a".repeat(32), spanId: "b".repeat(16) });
    const before = useTraceStore.getState();
    for (const jobId of ["job-a", "job-b"]) {
      for (const type of ["job_update", "llm_call", "step_result", "todo_update"]) {
        handleUpdate(workflow, {
          type, job_id: jobId, status: "running", provider: "openai", model: "fixture",
          messages: [], response: "owner content", step: { id: "s" }, todos: []
        } as never, runner as never, () => undefined);
      }
    }
    expect(useTraceStore.getState()).toBe(before);
  });

  it("continues folding tool messages into each job's widget state", () => {
    for (const jobId of ["job-a", "job-b"]) {
      handleUpdate(workflow, { type: "tool_call_update", job_id: jobId, node_id: "agent", name: "search", args: { jobId } } as never, runner as never, () => undefined);
      handleUpdate(workflow, { type: "tool_result_update", job_id: jobId, node_id: "agent", name: "search", result: { jobId } } as never, runner as never, () => undefined);
    }
    expect(useResultsStore.getState().toolResults[nodeKey(workflow.id, "job-a", "agent")]).toEqual([{ jobId: "job-a" }]);
    expect(useResultsStore.getState().toolResults[nodeKey(workflow.id, "job-b", "agent")]).toEqual([{ jobId: "job-b" }]);
    expect(useTraceStore.getState().selectedRunId).toBeNull();
  });
});
