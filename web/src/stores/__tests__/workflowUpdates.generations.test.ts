import type { NodeUpdate, WorkflowAttributes } from "../ApiTypes";
import useResultsStore from "../ResultsStore";
import { handleUpdate } from "../workflowUpdates";

const mockAddNotification = jest.fn();
const mockDequeueNextPendingRun = jest.fn();

const mockRunnerStore = {
  getState: () => ({
    job_id: "job-1",
    state: "running",
    addNotification: mockAddNotification,
    dequeueNextPendingRun: mockDequeueNextPendingRun
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
};

const mockWorkflow = {
  id: "workflow-1",
  name: "Workflow 1"
} as WorkflowAttributes;

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  mockRunnerStore.setState.mockClear();
  mockAddNotification.mockClear();
  mockDequeueNextPendingRun.mockClear();
});

describe("handleUpdate live generations", () => {
  it("creates one finalized generation from running -> completed node_update", () => {
    const running = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "test.Node",
      status: "running",
      job_id: "j1"
    } as unknown as NodeUpdate;

    const completed = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "test.Node",
      status: "completed",
      result: { output: 7 },
      provider_cost: undefined,
      job_id: "j1"
    } as unknown as NodeUpdate;

    handleUpdate(mockWorkflow, running, mockRunnerStore as never, () => undefined);
    handleUpdate(
      mockWorkflow,
      completed,
      mockRunnerStore as never,
      () => undefined
    );

    const list = useResultsStore
      .getState()
      .getLiveGenerations("workflow-1", "n1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId: "j1",
      status: "completed",
      outputs: { output: 7 }
    });
  });

  it("records an error generation on a failed node_update", () => {
    const errored = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "test.Node",
      status: "error",
      error: "boom",
      job_id: "j1"
    } as unknown as NodeUpdate;

    handleUpdate(mockWorkflow, errored, mockRunnerStore as never, () => undefined);

    const list = useResultsStore
      .getState()
      .getLiveGenerations("workflow-1", "n1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId: "j1",
      status: "error",
      error: "boom"
    });
  });
});
