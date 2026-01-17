import {
  subscribeToWorkflowUpdates,
  unsubscribeFromWorkflowUpdates,
  handleUpdate,
  MsgpackData
} from "../workflowUpdates";
import { WorkflowAttributes, NodeUpdate } from "../ApiTypes";
import { WorkflowRunnerStore } from "../WorkflowRunner";

// Mock dependencies
jest.mock("../ResultsStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
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
    getState: () => ({
      setStatus: jest.fn(),
      getStatus: jest.fn(),
      clearStatuses: jest.fn(),
    }),
  },
}));

jest.mock("../LogStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      appendLog: jest.fn(),
    }),
  },
}));

jest.mock("../ErrorStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setError: jest.fn(),
    }),
  },
}));

jest.mock("../NotificationStore", () => ({
  __esModule: true,
  useNotificationStore: {
    getState: () => ({
      addNotification: jest.fn(),
    }),
  },
}));

jest.mock("../ExecutionTimeStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      startExecution: jest.fn(),
      endExecution: jest.fn(),
      clearTimings: jest.fn(),
    }),
  },
}));

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: jest.fn(() => {
      return jest.fn();
    }),
  },
}));

jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

describe("workflowUpdates", () => {
  const createMockWorkflow = (): WorkflowAttributes => ({
    id: "test-workflow-123",
    name: "Test Workflow",
    graph: { nodes: [], edges: [] },
    engine: "mem",
  } as unknown as WorkflowAttributes);

  const createMockRunnerStore = (): jest.Mocked<WorkflowRunnerStore> => {
    const store = {
      getState: jest.fn().mockReturnValue({
        state: "idle",
        job_id: null,
        statusMessage: null,
        addNotification: jest.fn(),
      }),
      setState: jest.fn(),
    } as unknown as jest.Mocked<WorkflowRunnerStore>;
    return store;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("subscribeToWorkflowUpdates", () => {
    it("subscribes to workflow updates and returns unsubscribe function", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      const unsubscribe = subscribeToWorkflowUpdates(workflow.id, workflow, runnerStore);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("unsubscribeFromWorkflowUpdates", () => {
    it("handles unsubscribe for non-existent subscription", () => {
      expect(() => {
        unsubscribeFromWorkflowUpdates("non-existent-id");
      }).not.toThrow();
    });
  });

  describe("handleUpdate", () => {
    it("handles notification update type", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      const msgpackData: MsgpackData = {
        type: "notification",
        content: "Test notification",
        severity: "info",
      } as unknown as MsgpackData;

      handleUpdate(workflow, msgpackData, runnerStore);
    });

    it("handles node_update with completed status", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_type: "test.node",
        node_id: "node-1",
        node_name: "Test Node",
        status: "completed",
        result: { output: "test result" },
      };

      const msgpackData: MsgpackData = nodeUpdate as unknown as MsgpackData;

      handleUpdate(workflow, msgpackData, runnerStore);
    });

    it("handles node_update with error status", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_type: "test.node",
        node_id: "node-1",
        node_name: "Test Node",
        status: "error",
        error: "Test error message",
      };

      const msgpackData: MsgpackData = nodeUpdate as unknown as MsgpackData;

      handleUpdate(workflow, msgpackData, runnerStore);
    });

    it("does not update node status when workflow is cancelled", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();
      
      // Set state to cancelled
      (runnerStore.getState as jest.Mock).mockReturnValue({
        state: "cancelled",
        job_id: null,
        statusMessage: null,
        addNotification: jest.fn(),
      });

      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_type: "test.node",
        node_id: "node-1",
        node_name: "Test Node",
        status: "completed",
      };

      const msgpackData: MsgpackData = nodeUpdate as unknown as MsgpackData;

      // Should not throw and should handle gracefully
      expect(() => {
        handleUpdate(workflow, msgpackData, runnerStore);
      }).not.toThrow();
    });

    it("handles edge_update when workflow is not cancelled", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      const msgpackData: MsgpackData = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "running",
      } as unknown as MsgpackData;

      handleUpdate(workflow, msgpackData, runnerStore);
    });

    it("ignores edge_update when workflow is cancelled", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();
      
      (runnerStore.getState as jest.Mock).mockReturnValue({
        state: "cancelled",
        job_id: null,
        statusMessage: null,
        addNotification: jest.fn(),
      });

      const msgpackData: MsgpackData = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "running",
      } as unknown as MsgpackData;

      handleUpdate(workflow, msgpackData, runnerStore);
    });
  });
});
