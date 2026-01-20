import { handleUpdate, subscribeToWorkflowUpdates, unsubscribeFromWorkflowUpdates } from "../workflowUpdates";
import { WorkflowAttributes } from "../ApiTypes";
import type { MsgpackData } from "../workflowUpdates";

describe("workflowUpdates", () => {
  let mockRunnerStore: any;
  let mockWorkflow: WorkflowAttributes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkflow = {
      id: "test-workflow-id",
      name: "Test Workflow",
      created_at: new Date().toISOString(),
      access: "private",
      updated_at: new Date().toISOString(),
      description: "Test workflow"
    };

    mockRunnerStore = {
      getState: jest.fn().mockReturnValue({
        state: "idle",
        job_id: null,
        statusMessage: null,
        addNotification: jest.fn()
      }),
      setState: jest.fn()
    };
  });

  describe("handleUpdate - basic functionality", () => {
    it("does not throw for valid workflow and runner store with log_update", () => {
      const logUpdate = {
        type: "log_update" as const,
        node_id: "node-1",
        node_name: "Test Node",
        content: "Test log message",
        severity: "info"
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, logUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles notification update without throwing", () => {
      const notification = {
        type: "notification" as const,
        content: "Test notification",
        severity: "info"
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, notification, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles job_update with completed status - verifies state transitions", () => {
      const jobUpdate = {
        type: "job_update" as const,
        job_id: "job-123",
        status: "completed"
      } as unknown as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "idle" });
      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ job_id: "job-123" });
    });

    it("handles job_update with cancelled status - verifies state transitions", () => {
      const jobUpdate = {
        type: "job_update" as const,
        job_id: "job-456",
        status: "cancelled"
      } as unknown as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "cancelled" });
    });

    it("handles job_update with failed status - verifies state transitions", () => {
      const jobUpdate = {
        type: "job_update" as const,
        job_id: "job-789",
        status: "failed",
        error: "Something went wrong"
      } as unknown as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
    });

    it("handles job_update with running status - verifies state transitions", () => {
      const jobUpdate = {
        type: "job_update" as const,
        status: "running",
        message: "Job is running"
      } as unknown as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "running" });
    });

    it("handles job_update with suspended status - verifies state transitions", () => {
      const jobUpdate = {
        type: "job_update" as const,
        status: "suspended",
        message: "Waiting for input",
        run_state: {
          suspension_reason: "Waiting for input"
        }
      } as unknown as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "suspended" });
      expect(mockRunnerStore.setState).toHaveBeenCalledWith({
        statusMessage: "Waiting for input"
      });
    });

    it("handles job_update with queued status", () => {
      const jobUpdate = {
        type: "job_update" as const,
        status: "queued"
      } as unknown as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({
        statusMessage: "Worker is booting (may take a 15 seconds)..."
      });
    });

    it("handles node_progress update when running", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "running" });

      const progressUpdate = {
        type: "node_progress" as const,
        node_id: "node-1",
        progress: 50,
        total: 100,
        chunk: ""
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, progressUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles output_update correctly", () => {
      const outputUpdate = {
        type: "output_update" as const,
        node_id: "node-1",
        value: "output value"
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, outputUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles preview_update correctly", () => {
      const previewUpdate = {
        type: "preview_update" as const,
        node_id: "node-1",
        value: { preview: "data" }
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, previewUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles edge_update when not cancelled or in error", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "running" });

      const edgeUpdate = {
        type: "edge_update" as const,
        workflow_id: "test-workflow-id",
        edge_id: "edge-1",
        status: "completed",
        counter: 5
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles planning_update correctly", () => {
      const planningUpdate = {
        type: "planning_update" as const,
        node_id: "node-1",
        phase: "planning",
        status: "in_progress",
        planning: { step: 1, total: 5 }
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, planningUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles tool_call_update correctly", () => {
      const toolCallUpdate = {
        type: "tool_call_update" as const,
        node_id: "node-1",
        tool_call_id: "tc-1",
        name: "test_tool",
        args: {},
        status: "pending"
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, toolCallUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles task_update correctly", () => {
      const taskUpdate = {
        type: "task_update" as const,
        node_id: "node-1",
        task: {
          type: "task" as const,
          id: "task-1",
          title: "Process data",
          description: "Process the data",
          steps: [],
          event: "task_created"
        }
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, taskUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles prediction with booting status", () => {
      const prediction = {
        type: "prediction" as const,
        id: "pred-1",
        user_id: "user-1",
        node_id: "node-1",
        status: "booting",
        logs: "Booting..."
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, prediction, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles node_update with successful completion", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "running" });

      const nodeUpdate = {
        type: "node_update" as const,
        node_id: "node-1",
        node_name: "Test Node",
        node_type: "test",
        status: "completed",
        result: { output: "test result" }
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("ignores node_update when workflow is cancelled", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "cancelled" });

      const nodeUpdate = {
        type: "node_update" as const,
        node_id: "node-1",
        node_name: "Test Node",
        node_type: "test",
        status: "completed"
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles node_progress when running", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "running" });

      const progressUpdate = {
        type: "node_progress" as const,
        node_id: "node-1",
        progress: 50,
        total: 100,
        chunk: ""
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, progressUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("handles edge_update when running", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "running" });

      const edgeUpdate = {
        type: "edge_update" as const,
        workflow_id: "test-workflow-id",
        edge_id: "edge-1",
        status: "completed"
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("ignores edge_update when cancelled", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "cancelled" });

      const edgeUpdate = {
        type: "edge_update" as const,
        workflow_id: "test-workflow-id",
        edge_id: "edge-1",
        status: "completed"
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("ignores edge_update in error state", () => {
      mockRunnerStore.getState.mockReturnValue({ state: "error" });

      const edgeUpdate = {
        type: "edge_update" as const,
        workflow_id: "test-workflow-id",
        edge_id: "edge-1",
        status: "completed"
      } as unknown as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
      }).not.toThrow();
    });
  });

  describe("subscribeToWorkflowUpdates", () => {
    it("creates subscription and returns unsubscribe function", () => {
      const unsubscribe = subscribeToWorkflowUpdates(
        "workflow-123",
        mockWorkflow,
        mockRunnerStore
      );

      expect(typeof unsubscribe).toBe("function");
    });

    it("can call unsubscribe without error", () => {
      const unsubscribe = subscribeToWorkflowUpdates(
        "workflow-123",
        mockWorkflow,
        mockRunnerStore
      );

      expect(() => {
        unsubscribe();
      }).not.toThrow();
    });
  });

  describe("unsubscribeFromWorkflowUpdates", () => {
    it("handles unsubscribe for non-existent subscription", () => {
      expect(() => {
        unsubscribeFromWorkflowUpdates("non-existent");
      }).not.toThrow();
    });
  });
});
