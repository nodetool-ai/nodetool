import { createWorkflowRunnerStore } from "../WorkflowRunner";
import {
  handleUpdate,
  subscribeToWorkflowUpdates,
  unsubscribeFromWorkflowUpdates,
  MsgpackData
} from "../workflowUpdates";
import { WorkflowAttributes, JobUpdate, NodeUpdate, LogUpdate } from "../ApiTypes";

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: jest.fn().mockReturnValue(jest.fn()),
  },
}));

jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

jest.mock("../ResultsStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn().mockReturnValue({
      setResult: jest.fn(),
      setOutputResult: jest.fn(),
      clearOutputResults: jest.fn(),
      setProgress: jest.fn(),
      clearProgress: jest.fn(),
      setPreview: jest.fn(),
      setTask: jest.fn(),
      setToolCall: jest.fn(),
      setPlanningUpdate: jest.fn(),
      setEdge: jest.fn(),
      clearEdges: jest.fn(),
    }),
  },
}));

jest.mock("../StatusStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn().mockReturnValue({
      setStatus: jest.fn(),
      getStatus: jest.fn().mockReturnValue(null),
      clearStatuses: jest.fn(),
    }),
  },
}));

jest.mock("../LogStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn().mockReturnValue({
      appendLog: jest.fn(),
    }),
  },
}));

jest.mock("../ErrorStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn().mockReturnValue({
      setError: jest.fn(),
    }),
  },
}));

jest.mock("../NotificationStore", () => ({
  useNotificationStore: {
    getState: jest.fn().mockReturnValue({
      addNotification: jest.fn(),
    }),
  },
}));

jest.mock("../ExecutionTimeStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn().mockReturnValue({
      startExecution: jest.fn(),
      endExecution: jest.fn(),
      clearTimings: jest.fn(),
    }),
  },
}));

import useResultsStore from "../ResultsStore";
import useStatusStore from "../StatusStore";
import useLogsStore from "../LogStore";
import useErrorStore from "../ErrorStore";

const createMockWorkflow = (): WorkflowAttributes => ({
  id: "test-workflow-id",
  name: "Test Workflow",
  access: "private",
  description: "Test description",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const createMockRunnerStore = () => {
  const store = createWorkflowRunnerStore("test-workflow-id");
  return store;
};

describe("workflowUpdates", () => {
  let mockRunnerStore: ReturnType<typeof createMockRunnerStore>;
  let mockWorkflow: WorkflowAttributes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunnerStore = createMockRunnerStore();
    mockWorkflow = createMockWorkflow();

    (useResultsStore.getState as jest.Mock).mockReturnValue({
      setResult: jest.fn(),
      setOutputResult: jest.fn(),
      clearOutputResults: jest.fn(),
      setProgress: jest.fn(),
      clearProgress: jest.fn(),
      setPreview: jest.fn(),
      setTask: jest.fn(),
      setToolCall: jest.fn(),
      setPlanningUpdate: jest.fn(),
      setEdge: jest.fn(),
      clearEdges: jest.fn(),
    });

    (useStatusStore.getState as jest.Mock).mockReturnValue({
      setStatus: jest.fn(),
      getStatus: jest.fn().mockReturnValue(null),
      clearStatuses: jest.fn(),
    });

    (useLogsStore.getState as jest.Mock).mockReturnValue({
      appendLog: jest.fn(),
    });

    (useErrorStore.getState as jest.Mock).mockReturnValue({
      setError: jest.fn(),
    });

    (globalThis as any).__UPDATES__ = undefined;
  });

  afterEach(() => {
    if (mockRunnerStore) {
      mockRunnerStore.getState().cleanup();
    }
    delete (globalThis as any).__UPDATES__;
  });

  describe("handleUpdate", () => {
    it("stores updates in __UPDATES__ global", () => {
      const update: MsgpackData = {
        type: "node_update",
        node_id: "node-1",
        status: "running"
      } as any;

      handleUpdate(mockWorkflow, update, mockRunnerStore);

      expect((globalThis as any).__UPDATES__).toContain(update);
    });

    it("handles log_update type", () => {
      const logUpdate: LogUpdate = {
        type: "log_update",
        node_id: "node-1",
        node_name: "Test Node",
        content: "Test log message",
        severity: "info"
      };

      handleUpdate(mockWorkflow, logUpdate, mockRunnerStore);

      expect(useLogsStore.getState().appendLog).toHaveBeenCalledWith({
        workflowId: "test-workflow-id",
        workflowName: "Test Workflow",
        nodeId: "node-1",
        nodeName: "Test Node",
        content: "Test log message",
        severity: "info",
        timestamp: expect.any(Number)
      });
    });

    it("handles job_update with completed status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "completed"
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.getState().state).toBe("idle");
      expect(useResultsStore.getState().clearEdges).toHaveBeenCalledWith("test-workflow-id");
      expect(useResultsStore.getState().clearProgress).toHaveBeenCalledWith("test-workflow-id");
    });

    it("handles job_update with running status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "running"
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.getState().state).toBe("running");
      expect(mockRunnerStore.getState().job_id).toBe("job-123");
    });

    it("handles job_update with error status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "failed",
        error: "Job failed"
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.getState().state).toBe("error");
    });

    it("handles job_update with cancelled status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "cancelled"
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.getState().state).toBe("cancelled");
    });

    it("handles node_update with running status", () => {
      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        node_type: "test",
        status: "running"
      };

      handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);

      expect(useStatusStore.getState().setStatus).toHaveBeenCalledWith(
        "test-workflow-id",
        "node-1",
        "running"
      );
    });

    it("handles node_update with error", () => {
      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        node_type: "test",
        status: "error",
        error: "Node error occurred"
      };

      handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);

      expect(useErrorStore.getState().setError).toHaveBeenCalledWith(
        "test-workflow-id",
        "node-1",
        "Node error occurred"
      );
      expect(mockRunnerStore.getState().state).toBe("error");
    });

    it("does not update node status when workflow is cancelled", () => {
      mockRunnerStore.setState({ state: "cancelled" });

      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        status: "running"
      } as any;

      handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);

      expect(useStatusStore.getState().setStatus).not.toHaveBeenCalled();
    });

    it("handles output_update type", () => {
      const outputUpdate = {
        type: "output_update",
        node_id: "node-1",
        value: { type: "text", data: "Output value" }
      } as any;

      handleUpdate(mockWorkflow, outputUpdate, mockRunnerStore);

      expect(useResultsStore.getState().setOutputResult).toHaveBeenCalledWith(
        "test-workflow-id",
        "node-1",
        { type: "text", data: "Output value" },
        true
      );
    });

    it("handles node_progress update", () => {
      const progressUpdate = {
        type: "node_progress",
        node_id: "node-1",
        progress: 50,
        total: 100
      } as any;

      handleUpdate(mockWorkflow, progressUpdate, mockRunnerStore);

      expect(useResultsStore.getState().setProgress).toHaveBeenCalledWith(
        "test-workflow-id",
        "node-1",
        50,
        100
      );
    });

    it("skips node_progress when workflow is cancelled", () => {
      mockRunnerStore.setState({ state: "cancelled" });

      const progressUpdate = {
        type: "node_progress",
        node_id: "node-1",
        progress: 50,
        total: 100
      } as any;

      handleUpdate(mockWorkflow, progressUpdate, mockRunnerStore);

      expect(useResultsStore.getState().setProgress).not.toHaveBeenCalled();
    });

    it("handles edge_update when not cancelled or in error", () => {
      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "running",
        counter: 10
      } as any;

      handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);

      expect(useResultsStore.getState().setEdge).toHaveBeenCalledWith(
        "test-workflow-id",
        "edge-1",
        "running",
        10
      );
    });

    it("skips edge_update when workflow is cancelled", () => {
      mockRunnerStore.setState({ state: "cancelled" });

      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "running"
      } as any;

      handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);

      expect(useResultsStore.getState().setEdge).not.toHaveBeenCalled();
    });

    it("skips edge_update when workflow is in error state", () => {
      mockRunnerStore.setState({ state: "error" });

      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "running"
      } as any;

      handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);

      expect(useResultsStore.getState().setEdge).not.toHaveBeenCalled();
    });
  });

  describe("subscribeToWorkflowUpdates", () => {
    it("creates a subscription for the workflow", () => {
      const unsubscribe = subscribeToWorkflowUpdates(
        mockWorkflow.id,
        mockWorkflow,
        mockRunnerStore
      );

      expect(typeof unsubscribe).toBe("function");
      expect(unsubscribe).not.toThrow();
    });

    it("replaces existing subscription when called again", () => {
      const unsub1 = subscribeToWorkflowUpdates(
        mockWorkflow.id,
        mockWorkflow,
        mockRunnerStore
      );

      const unsub2 = subscribeToWorkflowUpdates(
        mockWorkflow.id,
        mockWorkflow,
        mockRunnerStore
      );

      expect(typeof unsub1).toBe("function");
      expect(typeof unsub2).toBe("function");
    });
  });

  describe("unsubscribeFromWorkflowUpdates", () => {
    it("cleans up subscription when unsubscribing", () => {
      subscribeToWorkflowUpdates(mockWorkflow.id, mockWorkflow, mockRunnerStore);

      expect(() => {
        unsubscribeFromWorkflowUpdates(mockWorkflow.id);
      }).not.toThrow();
    });

    it("handles unsubscribe for non-existent workflow", () => {
      expect(() => {
        unsubscribeFromWorkflowUpdates("non-existent-workflow");
      }).not.toThrow();
    });
  });
});
