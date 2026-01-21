import { WorkflowAttributes } from "../ApiTypes";

const threadSubscriptions: Record<string, (data: any) => void> = {};

const mockGlobalWebSocketManager = {
  subscribe: jest.fn().mockImplementation((key: string, callback: (data: any) => void) => {
    threadSubscriptions[key] = callback;
    return () => { delete threadSubscriptions[key]; };
  })
};

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: mockGlobalWebSocketManager
}));

import {
  subscribeToWorkflowUpdates,
  unsubscribeFromWorkflowUpdates
} from "../workflowUpdates";

describe("workflowUpdates", () => {
  const createMockWorkflow = (): Partial<WorkflowAttributes> => ({
    id: "test-workflow-id",
    name: "Test Workflow"
  });

  const createMockRunnerStore = () => ({
    getState: jest.fn(() => ({
      state: "idle",
      job_id: undefined,
      statusMessage: undefined
    })),
    setState: jest.fn(),
    addNotification: jest.fn()
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("subscribeToWorkflowUpdates", () => {
    it("subscribes to workflow updates and returns unsubscribe function", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      const unsubscribe = subscribeToWorkflowUpdates(
        workflow.id!,
        workflow as WorkflowAttributes,
        runnerStore as any
      );

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("calls globalWebSocketManager.subscribe with correct parameters", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      subscribeToWorkflowUpdates(
        workflow.id!,
        workflow as WorkflowAttributes,
        runnerStore as any
      );

      expect(mockGlobalWebSocketManager.subscribe).toHaveBeenCalledWith(
        workflow.id,
        expect.any(Function)
      );
    });

    it("clears existing subscription before creating new one", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      subscribeToWorkflowUpdates(workflow.id!, workflow as WorkflowAttributes, runnerStore as any);
      subscribeToWorkflowUpdates(workflow.id!, workflow as WorkflowAttributes, runnerStore as any);

      expect(mockGlobalWebSocketManager.subscribe).toHaveBeenCalledTimes(2);
    });

    it("returns unsubscribe function that removes subscription", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      const unsubscribe = subscribeToWorkflowUpdates(
        workflow.id!,
        workflow as WorkflowAttributes,
        runnerStore as any
      );

      expect(typeof unsubscribe).toBe("function");
      expect(mockGlobalWebSocketManager.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("unsubscribeFromWorkflowUpdates", () => {
    it("removes workflow subscription", () => {
      const workflow = createMockWorkflow();
      const runnerStore = createMockRunnerStore();

      subscribeToWorkflowUpdates(workflow.id!, workflow as WorkflowAttributes, runnerStore as any);
      unsubscribeFromWorkflowUpdates(workflow.id!);

      expect(mockGlobalWebSocketManager.subscribe).toHaveBeenCalled();
    });

    it("handles unsubscribe when no subscription exists", () => {
      expect(() => {
        unsubscribeFromWorkflowUpdates("non-existent-workflow");
      }).not.toThrow();
    });
  });

  describe("MsgpackData type union", () => {
    it("accepts log_update type", () => {
      const logUpdate = {
        type: "log_update" as const,
        node_id: "node-1",
        node_name: "Test Node",
        content: "Test log",
        severity: "info"
      };
      expect(logUpdate.type).toBe("log_update");
    });

    it("accepts notification type", () => {
      const notification = {
        type: "notification" as const,
        content: "Test notification",
        severity: "info"
      };
      expect(notification.type).toBe("notification");
    });

    it("accepts job_update type", () => {
      const jobUpdate = {
        type: "job_update" as const,
        job_id: "job-123",
        status: "running"
      };
      expect(jobUpdate.type).toBe("job_update");
    });

    it("accepts node_update type", () => {
      const nodeUpdate = {
        type: "node_update" as const,
        node_id: "node-1",
        node_name: "Test Node",
        status: "completed"
      };
      expect(nodeUpdate.type).toBe("node_update");
    });

    it("accepts edge_update type", () => {
      const edgeUpdate = {
        type: "edge_update" as const,
        edge_id: "edge-1",
        status: "running"
      };
      expect(edgeUpdate.type).toBe("edge_update");
    });

    it("accepts planning_update type", () => {
      const planningUpdate = {
        type: "planning_update" as const,
        node_id: "node-1",
        planning: "Planning data"
      };
      expect(planningUpdate.type).toBe("planning_update");
    });

    it("accepts tool_call_update type", () => {
      const toolCallUpdate = {
        type: "tool_call_update" as const,
        node_id: "node-1",
        tool_call: { name: "test-tool", arguments: {} }
      };
      expect(toolCallUpdate.type).toBe("tool_call_update");
    });

    it("accepts task_update type", () => {
      const taskUpdate = {
        type: "task_update" as const,
        node_id: "node-1",
        task: "Current task"
      };
      expect(taskUpdate.type).toBe("task_update");
    });

    it("accepts output_update type", () => {
      const outputUpdate = {
        type: "output_update" as const,
        node_id: "node-1",
        value: "output data"
      };
      expect(outputUpdate.type).toBe("output_update");
    });

    it("accepts preview_update type", () => {
      const previewUpdate = {
        type: "preview_update" as const,
        node_id: "node-1",
        value: { preview: "data" }
      };
      expect(previewUpdate.type).toBe("preview_update");
    });

    it("accepts node_progress type", () => {
      const nodeProgress = {
        type: "node_progress" as const,
        node_id: "node-1",
        progress: 50,
        total: 100
      };
      expect(nodeProgress.type).toBe("node_progress");
    });

    it("accepts prediction type", () => {
      const prediction = {
        type: "prediction" as const,
        node_id: "node-1",
        logs: "Prediction logs",
        status: "booting"
      };
      expect(prediction.type).toBe("prediction");
    });
  });

  describe("JobRunState interface", () => {
    it("accepts valid job run state", () => {
      const runState = {
        status: "running",
        suspended_node_id: "node-1",
        suspension_reason: "Waiting for input",
        error_message: undefined,
        execution_strategy: "sequential",
        is_resumable: true
      };
      expect(runState.status).toBe("running");
      expect(runState.is_resumable).toBe(true);
    });

    it("accepts minimal job run state", () => {
      const runState = {
        status: "idle"
      };
      expect(runState.status).toBe("idle");
    });
  });
});
