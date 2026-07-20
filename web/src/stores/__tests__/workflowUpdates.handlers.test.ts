import type {
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  OutputUpdate,
  LogUpdate,
  TerminalUpdate,
  WorkflowAttributes
} from "../ApiTypes";
import useResultsStore from "../ResultsStore";
import useStatusStore from "../StatusStore";
import useLogsStore from "../LogStore";
import useErrorStore from "../ErrorStore";
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
  useResultsStore.setState({
    outputResults: {},
    providerCosts: {},
    progress: {},
    edges: {},
    chunks: {},
    terminals: {},
    tasks: {},
    toolCalls: {},
    planningUpdates: {}
  });
  useStatusStore.setState({ statuses: {} });
  useLogsStore.setState({ logs: [], logsByNode: {} });
  useErrorStore.setState({ errors: {} });
  mockRunnerStore.setState.mockClear();
  mockAddNotification.mockClear();
  mockDequeueNextPendingRun.mockClear();
});

describe("handleUpdate", () => {
  it("routes terminal_update into the per-node terminal buffer", () => {
    const terminalUpdate = {
      type: "terminal_update",
      node_id: "n1",
      content: "\x1b[2J$ claude\r\n",
      cols: 120,
      rows: 36,
      job_id: "job-1"
    } as unknown as TerminalUpdate;

    handleUpdate(mockWorkflow, terminalUpdate, mockRunnerStore as never, () => undefined);

    const terminal = useResultsStore
      .getState()
      .getTerminal("workflow-1", "job-1", "n1");
    expect(terminal?.buffer).toBe("\x1b[2J$ claude\r\n");
    expect(terminal?.cols).toBe(120);
    expect(terminal?.rows).toBe(36);
  });

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
    const progress = {
      type: "node_progress",
      node_id: "n1",
      progress: 5,
      total: 10,
      // Per-node progress is keyed by the producing run's job_id.
      job_id: "job-1"
    } as unknown as NodeProgress;

    handleUpdate(mockWorkflow, progress, mockRunnerStore as never, () => undefined);

    const stored = useResultsStore
      .getState()
      .getProgress("workflow-1", "job-1", "n1");
    expect(stored).toMatchObject({ progress: 5, total: 10 });
  });

  it("stores error on node_update with error", () => {
    const update = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "test.Node",
      status: "error",
      error: "something failed",
      // Per-node error is keyed by the producing run's job_id.
      job_id: "job-1"
    } as unknown as NodeUpdate;

    handleUpdate(mockWorkflow, update, mockRunnerStore as never, () => undefined);

    const error = useErrorStore.getState().getError("workflow-1", "job-1", "n1");
    expect(error).toBe("something failed");
    expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
  });

  it("stores provider_cost on completed node_update", () => {
    const update = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "kie.test.Node",
      status: "completed",
      provider_cost: { provider: "kie", amount: 12, unit: "credits" },
      // Per-node provider cost is keyed by the producing run's job_id.
      job_id: "job-1"
    } as unknown as NodeUpdate;

    handleUpdate(mockWorkflow, update, mockRunnerStore as never, () => undefined);

    expect(
      useResultsStore.getState().getProviderCost("workflow-1", "job-1", "n1")
    ).toEqual({
      provider: "kie",
      amount: 12,
      unit: "credits"
    });
  });

  it("stores output result on output_update", () => {
    const output = {
      type: "output_update",
      node_id: "n1",
      node_name: "Out",
      output_name: "output",
      output_type: "string",
      value: "result",
      metadata: {},
      // Per-node output result is keyed by the producing run's job_id.
      job_id: "job-1"
    } as unknown as OutputUpdate;

    handleUpdate(mockWorkflow, output, mockRunnerStore as never, () => undefined);

    const stored = useResultsStore
      .getState()
      .getOutputResult("workflow-1", "job-1", "n1");
    expect(stored).toBe("result");
  });

  it("updates runner state and keeps the run's per-job progress on job_update completed", () => {
    useResultsStore.getState().setProgress("workflow-1", "job-1", "n1", 5, 10);

    const jobUpdate: JobUpdate = {
      type: "job_update",
      job_id: "job-1",
      status: "completed"
    };

    handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as never, () => undefined);

    expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "idle" });
    // Completion no longer clears per-job state: those clears spanned the whole
    // workflow and would wipe a concurrently running sibling. The finished
    // run's slice persists so it can still be focused.
    expect(
      useResultsStore.getState().getProgress("workflow-1", "job-1", "n1")
    ).toMatchObject({ progress: 5, total: 10 });
  });
});
