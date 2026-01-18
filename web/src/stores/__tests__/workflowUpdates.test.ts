import { handleUpdate, MsgpackData } from "../workflowUpdates";
import { WorkflowAttributes } from "../ApiTypes";

describe("workflowUpdates", () => {
  let mockRunnerStore: any;
  let mockWorkflow: WorkflowAttributes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkflow = {
      id: "workflow-123",
      name: "Test Workflow",
      created_at: new Date().toISOString(),
      access: "private",
      updated_at: new Date().toISOString(),
      description: "Test description",
      graph: { nodes: [], edges: [] }
    } as WorkflowAttributes;

    mockRunnerStore = {
      getState: jest.fn().mockReturnValue({
        state: "idle",
        job_id: null,
        statusMessage: null,
        addNotification: jest.fn()
      }),
      setState: jest.fn()
    };

    delete (window as any).__UPDATES__;
  });

  describe("handleUpdate", () => {
    it("should initialize __UPDATES__ array on first update", () => {
      const logUpdate = {
        type: "log_update",
        node_id: "node-1",
        node_name: "Test Node",
        content: "Test log",
        severity: "info"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, logUpdate, mockRunnerStore);

      expect(window.__UPDATES__).toBeDefined();
      expect(Array.isArray(window.__UPDATES__)).toBe(true);
      expect(window.__UPDATES__).toHaveLength(1);
    });

    it("should append log updates to __UPDATES__ array", () => {
      const logUpdate1 = {
        type: "log_update",
        node_id: "node-1",
        node_name: "Test Node",
        content: "First log",
        severity: "info"
      } as any as MsgpackData;

      const logUpdate2 = {
        type: "log_update",
        node_id: "node-2",
        node_name: "Another Node",
        content: "Second log",
        severity: "info"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, logUpdate1, mockRunnerStore);
      handleUpdate(mockWorkflow, logUpdate2, mockRunnerStore);

      expect(window.__UPDATES__).toHaveLength(2);
    });

    it("should handle edge_update when not cancelled or error", () => {
      mockRunnerStore.getState.mockReturnValueOnce({
        state: "running"
      });

      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "active"
      } as any as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("should not throw when handling edge_update when cancelled", () => {
      mockRunnerStore.getState.mockReturnValueOnce({
        state: "cancelled"
      });

      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "active"
      } as any as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("should not throw when handling edge_update when in error state", () => {
      mockRunnerStore.getState.mockReturnValueOnce({
        state: "error"
      });

      const edgeUpdate = {
        type: "edge_update",
        edge_id: "edge-1",
        status: "active"
      } as any as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
      }).not.toThrow();
    });

    it("should handle node_progress when not cancelled", () => {
      mockRunnerStore.getState.mockReturnValueOnce({
        state: "running"
      });

      const nodeProgress = {
        type: "node_progress",
        node_id: "node-1",
        progress: 50,
        total: 100
      } as any as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, nodeProgress, mockRunnerStore);
      }).not.toThrow();
    });

    it("should not throw when handling node_progress when cancelled", () => {
      mockRunnerStore.getState.mockReturnValueOnce({
        state: "cancelled"
      });

      const nodeProgress = {
        type: "node_progress",
        node_id: "node-1",
        progress: 50,
        total: 100
      } as any as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, nodeProgress, mockRunnerStore);
      }).not.toThrow();
    });

    it("should handle preview_update", () => {
      const previewUpdate = {
        type: "preview_update",
        node_id: "node-1",
        value: { preview: "test" }
      } as any as MsgpackData;

      expect(() => {
        handleUpdate(mockWorkflow, previewUpdate, mockRunnerStore);
      }).not.toThrow();
    });
  });

  describe("job_update handling", () => {
    it("should map running status to running state", () => {
      const jobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "running"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "running" });
      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ job_id: "job-123" });
    });

    it("should map queued status to running state", () => {
      const jobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "queued"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "running" });
    });

    it("should map suspended status to suspended state", () => {
      const jobUpdate = {
        type: "job_update",
        status: "suspended",
        message: "Waiting for input"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "suspended" });
    });

    it("should map paused status to paused state", () => {
      const jobUpdate = {
        type: "job_update",
        status: "paused"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "paused" });
    });

    it("should map completed status to idle state", () => {
      const jobUpdate = {
        type: "job_update",
        status: "completed"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "idle" });
      expect(mockRunnerStore.getState().addNotification).toHaveBeenCalledWith({
        type: "info",
        alert: true,
        content: "Job completed"
      });
    });

    it("should map cancelled status to cancelled state", () => {
      const jobUpdate = {
        type: "job_update",
        status: "cancelled"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "cancelled" });
      expect(mockRunnerStore.getState().addNotification).toHaveBeenCalledWith({
        type: "info",
        alert: true,
        content: "Job cancelled"
      });
    });

    it("should map failed status to error state", () => {
      const jobUpdate = {
        type: "job_update",
        status: "failed",
        error: "Test error"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
      expect(mockRunnerStore.getState().addNotification).toHaveBeenCalledWith({
        type: "error",
        alert: true,
        content: "Job failed Test error",
        timeout: 30000
      });
    });

    it("should handle queued status with worker booting message", () => {
      const jobUpdate = {
        type: "job_update",
        status: "queued"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({
        statusMessage: "Worker is booting (may take a 15 seconds)..."
      });
    });

    it("should handle suspended status with suspension reason", () => {
      const jobUpdate = {
        type: "job_update",
        status: "suspended",
        run_state: {
          status: "suspended",
          is_resumable: true,
          suspension_reason: "Waiting for user input"
        }
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({
        statusMessage: "Waiting for user input"
      });
    });

    it("should handle timed_out status as error", () => {
      const jobUpdate = {
        type: "job_update",
        status: "timed_out",
        error: "Timeout error"
      } as any as MsgpackData;

      handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

      expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
    });
  });
});
