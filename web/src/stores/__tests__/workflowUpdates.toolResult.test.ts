import type { ToolResultUpdate, WorkflowAttributes } from "../ApiTypes";
import { stub } from "../../test-utils/doubles";
import useResultsStore from "../ResultsStore";
import { nodeKey } from "../nodeKey";
import { handleUpdate } from "../workflowUpdates";

/**
 * The backend stamps a job id onto every frame it sends; the protocol update
 * types do not declare it, and `handleUpdate` reads it back off the message.
 */
type StampedUpdate<T> = T & { job_id: string };

const mockRunnerStore = {
  getState: () => ({
    job_id: "job-1",
    state: "running",
    addNotification: jest.fn(),
    dequeueNextPendingRun: jest.fn()
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
};

const mockWorkflow = {
  id: "workflow-1",
  name: "Workflow 1"
} as WorkflowAttributes;

beforeEach(() => {
  useResultsStore.setState({
    outputResults: {},
    liveGenerations: {},
    toolResults: {}
  } as never);
  mockRunnerStore.setState.mockClear();
});

const toolResultUpdate = (result: Record<string, unknown>): ToolResultUpdate =>
  stub<StampedUpdate<ToolResultUpdate>>({
    type: "tool_result_update",
    node_id: "agent-1",
    name: "search",
    result,
    job_id: "job-1"
  });

describe("handleUpdate tool_result_update → artifact channel", () => {
  it("appends each tool result into the toolResults artifact channel", () => {
    handleUpdate(
      mockWorkflow,
      toolResultUpdate({ a: 1 }),
      mockRunnerStore as never,
      () => undefined
    );
    handleUpdate(
      mockWorkflow,
      toolResultUpdate({ b: 2 }),
      mockRunnerStore as never,
      () => undefined
    );

    const results =
      useResultsStore.getState().toolResults[
        nodeKey("workflow-1", "job-1", "agent-1")
      ];
    expect(results).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("does not write to the output-node stream buffer", () => {
    handleUpdate(
      mockWorkflow,
      toolResultUpdate({ a: 1 }),
      mockRunnerStore as never,
      () => undefined
    );

    const output = useResultsStore
      .getState()
      .getOutputResult("workflow-1", "job-1", "agent-1");
    expect(output).toBeUndefined();
  });

  it("does not create or modify a live generation", () => {
    handleUpdate(
      mockWorkflow,
      toolResultUpdate({ a: 1 }),
      mockRunnerStore as never,
      () => undefined
    );

    const generations = useResultsStore
      .getState()
      .getLiveGenerations("workflow-1", "agent-1");
    expect(generations).toHaveLength(0);
  });
});
