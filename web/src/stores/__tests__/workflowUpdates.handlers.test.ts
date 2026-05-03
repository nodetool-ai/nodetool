import type {
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  OutputUpdate,
  LogUpdate,
  WorkflowAttributes
} from "../ApiTypes";
import useResultsStore from "../ResultsStore";
import useStatusStore from "../StatusStore";
import useLogsStore from "../LogStore";
import useErrorStore from "../ErrorStore";
import { handleUpdate } from "../workflowUpdates";

const mockAddNotification = jest.fn();

const mockRunnerStore = {
  getState: () => ({
    job_id: "job-1",
    state: "running",
    addNotification: mockAddNotification
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
    results: {},
    outputResults: {},
    progress: {},
    edges: {},
    chunks: {},
    tasks: {},
    toolCalls: {},
    planningUpdates: {},
    previews: {}
  });
  useStatusStore.setState({ statuses: {} });
  useLogsStore.setState({ logs: [], logsByNode: {} });
  useErrorStore.setState({ errors: {} });
  mockRunnerStore.setState.mockClear();
  mockAddNotification.mockClear();
});

describe("handleUpdate", () => {
  it("appends a log entry on log_update", () => {
    const logUpdate: LogUpdate = {
      type: "log_update",
      node_id: "n1",
      node_name: "Node 1",
      content: "processing",
      severity: "info"
    };

    handleUpdate(mockWorkflow, logUpdate, mockRunnerStore as never, () => undefined);

    const logs = useLogsStore.getState().getLogs("workflow-1", "n1");
    expect(logs.length).toBe(1);
    expect(logs[0].content).toBe("processing");
    expect(logs[0].severity).toBe("info");
    expect(logs[0].nodeId).toBe("n1");
  });

  it("stores progress on node_progress", () => {
    const progress: NodeProgress = {
      type: "node_progress",
      node_id: "n1",
      progress: 5,
      total: 10
    };

    handleUpdate(mockWorkflow, progress, mockRunnerStore as never, () => undefined);

    const stored = useResultsStore.getState().getProgress("workflow-1", "n1");
    expect(stored).toMatchObject({ progress: 5, total: 10 });
  });

  it("stores error on node_update with error", () => {
    const update: NodeUpdate = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "test.Node",
      status: "error",
      error: "something failed"
    };

    handleUpdate(mockWorkflow, update, mockRunnerStore as never, () => undefined);

    const error = useErrorStore.getState().getError("workflow-1", "n1");
    expect(error).toBe("something failed");
    expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
  });

  it("stores output result on output_update", () => {
    const output: OutputUpdate = {
      type: "output_update",
      node_id: "n1",
      node_name: "Out",
      output_name: "output",
      output_type: "string",
      value: "result",
      metadata: {}
    };

    handleUpdate(mockWorkflow, output, mockRunnerStore as never, () => undefined);

    const stored = useResultsStore.getState().getOutputResult("workflow-1", "n1");
    expect(stored).toBe("result");
  });

  it("updates runner state and clears progress on job_update completed", () => {
    useResultsStore.getState().setProgress("workflow-1", "n1", 5, 10);

    const jobUpdate: JobUpdate = {
      type: "job_update",
      job_id: "job-1",
      status: "completed"
    };

    handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as never, () => undefined);

    expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "idle" });
    expect(useResultsStore.getState().getProgress("workflow-1", "n1")).toBeUndefined();
  });
});
