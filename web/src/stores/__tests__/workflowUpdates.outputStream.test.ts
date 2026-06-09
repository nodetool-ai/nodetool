import type { OutputUpdate, WorkflowAttributes } from "../ApiTypes";
import useResultsStore from "../ResultsStore";
import { handleUpdate } from "../workflowUpdates";

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
    liveGenerations: {}
  } as never);
  mockRunnerStore.setState.mockClear();
});

const outputUpdate = (value: unknown): OutputUpdate =>
  ({
    type: "output_update",
    node_id: "out-1",
    node_name: "Output Node",
    output_name: "output",
    output_type: "string",
    value,
    metadata: {},
    // job_id is stamped by the backend on every message but is not part of the
    // protocol type; cast below carries it through to messageJobId.
    job_id: "job-1"
  } as unknown as OutputUpdate);

describe("handleUpdate output_update → output-node stream buffer", () => {
  it("appends each output_update value into the output-stream channel", () => {
    handleUpdate(
      mockWorkflow,
      outputUpdate("hello "),
      mockRunnerStore as never,
      () => undefined
    );
    handleUpdate(
      mockWorkflow,
      outputUpdate("world"),
      mockRunnerStore as never,
      () => undefined
    );

    const accumulated = useResultsStore
      .getState()
      .getOutputResult("workflow-1", "job-1", "out-1");
    expect(accumulated).toEqual(["hello ", "world"]);
  });

  it("does not create or modify a live generation", () => {
    handleUpdate(
      mockWorkflow,
      outputUpdate("hello"),
      mockRunnerStore as never,
      () => undefined
    );

    const generations = useResultsStore
      .getState()
      .getLiveGenerations("workflow-1", "out-1");
    expect(generations).toHaveLength(0);
  });
});
