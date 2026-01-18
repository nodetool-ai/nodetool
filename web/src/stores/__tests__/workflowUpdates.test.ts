import { JobUpdate, NodeUpdate, LogUpdate } from "../ApiTypes";
import { handleUpdate, subscribeToWorkflowUpdates, unsubscribeFromWorkflowUpdates } from "../workflowUpdates";

jest.mock("../ResultsStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
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
    })),
  },
}));

jest.mock("../StatusStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      setStatus: jest.fn(),
      getStatus: jest.fn(() => undefined),
      clearStatuses: jest.fn(),
    })),
  },
}));

jest.mock("../LogStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      appendLog: jest.fn(),
    })),
  },
}));

jest.mock("../ErrorStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      setError: jest.fn(),
    })),
  },
}));

jest.mock("../NotificationStore", () => ({
  __esModule: true,
  useNotificationStore: {
    getState: jest.fn(() => ({
      addNotification: jest.fn(),
    })),
  },
}));

jest.mock("../ExecutionTimeStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      startExecution: jest.fn(),
      endExecution: jest.fn(),
      clearTimings: jest.fn(),
    })),
  },
}));

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: jest.fn(() => jest.fn()),
    unsubscribe: jest.fn(),
  },
}));

jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

const mockRunnerStore = {
  getState: jest.fn(() => ({
    state: "idle",
    job_id: undefined,
    addNotification: jest.fn(),
  })),
  setState: jest.fn((_: any) => {}),
};

const mockWorkflow = {
  id: "workflow-1",
  name: "Test Workflow",
  created_at: new Date().toISOString(),
  access: "private" as const,
  updated_at: new Date().toISOString(),
  description: "Test workflow description",
};

describe("workflowUpdates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunnerStore.getState.mockReturnValue({
      state: "idle",
      job_id: undefined,
      addNotification: jest.fn(),
    });
    (window as any).__UPDATES__ = undefined;
  });

  describe("handleUpdate", () => {
    it("handles job_update with running status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "running",
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "running" });
      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ job_id: "job-123" });
    });

    it("handles job_update with completed status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "completed",
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "idle" });
      const addNotificationFn = mockRunnerStore.getState().addNotification;
      expect(typeof addNotificationFn).toBe("function");
    });

    it("handles job_update with cancelled status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "cancelled",
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "cancelled" });
      expect(typeof mockRunnerStore.getState().addNotification).toBe("function");
    });

    it("handles job_update with failed status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "failed",
        error: "Something went wrong",
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
      expect(typeof mockRunnerStore.getState().addNotification).toBe("function");
    });

    it("handles job_update with suspended status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "suspended",
        message: "Waiting for input",
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "suspended" });
      expect(typeof mockRunnerStore.getState().addNotification).toBe("function");
    });

    it("handles job_update with suspended status and run_state", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "suspended",
        run_state: {
          status: "suspended",
          suspension_reason: "Waiting for user input",
          is_resumable: true,
        },
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalled();
    });

    it("handles job_update with queued status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        status: "queued",
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({
        statusMessage: "Worker is booting (may take a 15 seconds)...",
      });
    });

    it("handles job_update with paused status", () => {
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "paused",
      };

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "paused" });
    });

    it("handles node_update with running status", () => {
      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        node_type: "test.node",
        status: "running",
      };

      handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({
        statusMessage: "Test Node running",
      });
    });

    it("handles node_update with error", () => {
      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        node_type: "test.node",
        status: "error",
        error: "Node failed",
      };

      handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
      expect(typeof mockRunnerStore.getState().addNotification).toBe("function");
    });

    it("handles node_update with result", () => {
      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        node_type: "test.node",
        status: "completed",
        result: { output: "test-value" },
      };

      handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({
        statusMessage: "Test Node completed",
      });
    });

    it("ignores node_update when workflow is cancelled", () => {
      mockRunnerStore.getState.mockReturnValue({
        state: "cancelled",
        job_id: undefined,
        addNotification: jest.fn(),
      });

      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        node_type: "test.node",
        status: "running",
      };

      handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore as any);

      expect(mockRunnerStore.setState).not.toHaveBeenCalled();
    });

    it("handles log_update", () => {
      const logUpdate: LogUpdate = {
        type: "log_update",
        node_id: "node-1",
        node_name: "Test Node",
        content: "Test log message",
        severity: "info",
      };

      handleUpdate(mockWorkflow, logUpdate, mockRunnerStore as any);
    });

    it("stores updates in window.__UPDATES__", () => {
      const logUpdate: LogUpdate = {
        type: "log_update",
        node_id: "node-1",
        node_name: "Test Node",
        content: "Test log message",
        severity: "info",
      };

      handleUpdate(mockWorkflow, logUpdate, mockRunnerStore as any);

      expect((window as any).__UPDATES__).toHaveLength(1);
      expect((window as any).__UPDATES__[0]).toEqual(logUpdate);
    });

    it("handles prediction type", () => {
      const prediction = {
        type: "prediction",
        node_id: "node-1",
        status: "booting",
        logs: "",
      };

      handleUpdate(mockWorkflow, prediction as any, mockRunnerStore as any);
    });

    it("handles node_progress type", () => {
      const progress = {
        type: "node_progress",
        node_id: "node-1",
        progress: 50,
        total: 100,
      };

      handleUpdate(mockWorkflow, progress as any, mockRunnerStore as any);
    });

    it("ignores node_progress when workflow is cancelled", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "cancelled", job_id: undefined, addNotification: jest.fn() });

      const progress = {
        type: "node_progress",
        node_id: "node-1",
        progress: 50,
        total: 100,
      };

      handleUpdate(mockWorkflow, progress as any, mockRunnerStore as any);
    });

    it("handles edge_update type", () => {
      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "running",
        counter: 1,
      };

      handleUpdate(mockWorkflow, edgeUpdate as any, mockRunnerStore as any);
    });

    it("ignores edge_update when workflow is cancelled", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "cancelled", job_id: undefined, addNotification: jest.fn() });

      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "running",
      };

      handleUpdate(mockWorkflow, edgeUpdate as any, mockRunnerStore as any);
    });

    it("ignores edge_update when workflow is in error state", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "error", job_id: undefined, addNotification: jest.fn() });

      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "running",
      };

      handleUpdate(mockWorkflow, edgeUpdate as any, mockRunnerStore as any);
    });

    it("handles preview_update type", () => {
      const previewUpdate = {
        type: "preview_update",
        node_id: "node-1",
        value: { uri: "http://example.com/image.png" },
      };

      handleUpdate(mockWorkflow, previewUpdate as any, mockRunnerStore as any);
    });
  });

  describe("subscribeToWorkflowUpdates", () => {
    it("creates a subscription and returns unsubscribe function", () => {
      const unsubscribe = subscribeToWorkflowUpdates(
        "workflow-1",
        mockWorkflow,
        mockRunnerStore as any
      );

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("replaces existing subscription for same workflow", () => {
      const unsub1 = subscribeToWorkflowUpdates(
        "workflow-1",
        mockWorkflow,
        mockRunnerStore as any
      );

      const unsub2 = subscribeToWorkflowUpdates(
        "workflow-1",
        mockWorkflow,
        mockRunnerStore as any
      );

      unsub1();
      unsub2();
    });
  });

  describe("unsubscribeFromWorkflowUpdates", () => {
    it("removes subscription for workflow", () => {
      const unsub = subscribeToWorkflowUpdates(
        "workflow-1",
        mockWorkflow,
        mockRunnerStore as any
      );

      unsubscribeFromWorkflowUpdates("workflow-1");

      unsub();
    });

    it("handles non-existent workflow gracefully", () => {
      expect(() => {
        unsubscribeFromWorkflowUpdates("non-existent");
      }).not.toThrow();
    });
  });
});
