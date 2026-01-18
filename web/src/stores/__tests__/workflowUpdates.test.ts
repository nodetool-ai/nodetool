import {
  JobUpdate,
  LogUpdate,
  PreviewUpdate,
  WorkflowAttributes
} from "../ApiTypes";
import { handleUpdate } from "../workflowUpdates";
import { useNotificationStore } from "../NotificationStore";

describe("workflowUpdates", () => {
  const mockWorkflow: WorkflowAttributes = {
    id: "workflow-1",
    name: "Test Workflow",
    created_at: new Date().toISOString(),
    access: "private",
    updated_at: new Date().toISOString(),
    description: ""
  };

  const createMockRunnerStore = <T extends { state: string; job_id: string | undefined; statusMessage: string | undefined }>(
    initialState?: T
  ) => {
    const defaultState = { state: "idle" as const, job_id: undefined, statusMessage: undefined };
    const mockAddNotification = jest.fn();
    const store = {
      getState: jest.fn(() => ({ ...defaultState, ...initialState, addNotification: mockAddNotification })),
      setState: jest.fn()
    };
    return { store, mockAddNotification };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete window.__UPDATES__;
    
    // Reset notification store
    useNotificationStore.setState({
      notifications: [],
      lastDisplayedTimestamp: null
    });
  });

  describe("handleUpdate - Job Updates", () => {
    it("handles job running status", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "running",
        message: "Job started"
      } as JobUpdate;

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ state: "running" });
      expect(store.setState).toHaveBeenCalledWith({ job_id: "job-123" });
    });

    it("handles job completed status", () => {
      const { store, mockAddNotification } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "completed"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ state: "idle" });
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "info",
        alert: true,
        content: "Job completed"
      });
    });

    it("handles job cancelled status", () => {
      const { store, mockAddNotification } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "cancelled"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ state: "cancelled" });
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "info",
        alert: true,
        content: "Job cancelled"
      });
    });

    it("handles job failed status", () => {
      const { store, mockAddNotification } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "failed",
        error: "Something went wrong"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ state: "error" });
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "error",
        alert: true,
        content: "Job failed Something went wrong",
        timeout: 30000
      });
    });

    it("handles job suspended status", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "suspended",
        message: "Waiting for input"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ state: "suspended" });
    });

    it("handles job paused status", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "paused"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ state: "paused" });
    });

    it("handles job queued status", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "queued"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({
        statusMessage: "Worker is booting (may take a 15 seconds)..."
      });
    });

    it("handles job timed_out status", () => {
      const { store, mockAddNotification } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "timed_out"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ state: "error" });
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "error",
        alert: true,
        content: "Job timed_out",
        timeout: 30000
      });
    });

    it("handles suspension reason from run_state", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const jobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "suspended",
        run_state: { suspension_reason: "Waiting for user input", status: "suspended", is_resumable: true }
      } as any;

      handleUpdate(mockWorkflow, jobUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ statusMessage: "Waiting for user input" });
    });
  });

  describe("handleUpdate - Node Updates", () => {
    it("handles node update with running status", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const nodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        status: "running",
        node_type: "test"
      } as any;

      handleUpdate(mockWorkflow, nodeUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({
        statusMessage: "Test Node running"
      });
    });

    it("handles node update with error", () => {
      const { store, mockAddNotification } = createMockRunnerStore();
      const runnerStore = store as any;
      const nodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        status: "error",
        error: "Node failed",
        node_type: "test"
      } as any;

      handleUpdate(mockWorkflow, nodeUpdate, runnerStore);

      expect(store.setState).toHaveBeenCalledWith({ state: "error" });
      expect(mockAddNotification).toHaveBeenCalled();
    });

    it("ignores node update when workflow is cancelled", () => {
      const { store } = createMockRunnerStore({ state: "cancelled" as const, job_id: undefined, statusMessage: undefined });
      const runnerStore = store as any;
      const nodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        status: "completed",
        node_type: "test"
      } as any;

      handleUpdate(mockWorkflow, nodeUpdate, runnerStore);

      expect(store.setState).not.toHaveBeenCalled();
    });

    it("stores result when present in node update", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const nodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        status: "completed",
        result: { output: "test result" },
        node_type: "test"
      } as any;

      handleUpdate(mockWorkflow, nodeUpdate, runnerStore);
    });
  });

  describe("handleUpdate - Log Updates", () => {
    it("handles log update", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const logUpdate: LogUpdate = {
        type: "log_update",
        node_id: "node-1",
        node_name: "Test Node",
        content: "Log message",
        severity: "info"
      };

      handleUpdate(mockWorkflow, logUpdate, runnerStore);
    });
  });

  describe("handleUpdate - Notification Updates", () => {
    it("handles notification update", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const notification = {
        type: "notification",
        node_id: "node-1",
        severity: "info",
        content: "Test notification"
      } as any;

      handleUpdate(mockWorkflow, notification, runnerStore);
    });
  });

  describe("handleUpdate - Progress Updates", () => {
    it("handles node progress update", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const progress = {
        type: "node_progress",
        node_id: "node-1",
        progress: 50,
        total: 100,
        chunk: ""
      } as any;

      handleUpdate(mockWorkflow, progress, runnerStore);
    });

    it("ignores progress update when workflow is cancelled", () => {
      const { store } = createMockRunnerStore({ state: "cancelled" as const, job_id: undefined, statusMessage: undefined });
      const runnerStore = store as any;
      const progress = {
        type: "node_progress",
        node_id: "node-1",
        progress: 50,
        total: 100,
        chunk: ""
      } as any;

      handleUpdate(mockWorkflow, progress, runnerStore);
    });
  });

  describe("handleUpdate - Preview Updates", () => {
    it("handles preview update", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const preview: PreviewUpdate = {
        type: "preview_update",
        node_id: "node-1",
        value: { uri: "data:image/png;base64,abc123" }
      };

      handleUpdate(mockWorkflow, preview, runnerStore);
    });
  });

  describe("handleUpdate - Output Updates", () => {
    it("handles output update", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const output = {
        type: "output_update",
        node_id: "node-1",
        node_name: "output",
        output_name: "out",
        value: "output value",
        output_type: "text"
      } as any;

      handleUpdate(mockWorkflow, output, runnerStore);
    });
  });

  describe("handleUpdate - Planning Updates", () => {
    it("handles planning update with node_id", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const planning = {
        type: "planning_update",
        node_id: "node-1",
        phase: "planning",
        status: "in_progress",
        content: "Planning content"
      } as any;

      handleUpdate(mockWorkflow, planning, runnerStore);
    });
  });

  describe("handleUpdate - Tool Call Updates", () => {
    it("handles tool call update with node_id", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const toolCall = {
        type: "tool_call_update",
        node_id: "node-1",
        tool_call_id: "call-1",
        name: "test-tool",
        arguments: {}
      } as any;

      handleUpdate(mockWorkflow, toolCall, runnerStore);
    });
  });

  describe("handleUpdate - Task Updates", () => {
    it("handles task update with node_id", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const task = {
        type: "task_update",
        node_id: "node-1",
        task: {
          id: "task-1",
          title: "Task",
          description: "",
          steps: [],
          status: "pending",
          output: null,
          output_schema: {}
        }
      } as any;

      handleUpdate(mockWorkflow, task, runnerStore);
    });
  });

  describe("handleUpdate - Edge Updates", () => {
    it("handles edge update when not cancelled or in error", () => {
      const { store } = createMockRunnerStore({ state: "running" as const, job_id: undefined, statusMessage: undefined });
      const runnerStore = store as any;
      const edgeUpdate = {
        type: "edge_update",
        workflow_id: mockWorkflow.id,
        edge_id: "edge-1",
        status: "executing"
      } as any;

      handleUpdate(mockWorkflow, edgeUpdate, runnerStore);
    });

    it("ignores edge update when workflow is cancelled", () => {
      const { store } = createMockRunnerStore({ state: "cancelled" as const, job_id: undefined, statusMessage: undefined });
      const runnerStore = store as any;
      const edgeUpdate = {
        type: "edge_update",
        workflow_id: mockWorkflow.id,
        edge_id: "edge-1",
        status: "executing"
      } as any;

      handleUpdate(mockWorkflow, edgeUpdate, runnerStore);
    });

    it("ignores edge update when workflow is in error", () => {
      const { store } = createMockRunnerStore({ state: "error" as const, job_id: undefined, statusMessage: undefined });
      const runnerStore = store as any;
      const edgeUpdate = {
        type: "edge_update",
        workflow_id: mockWorkflow.id,
        edge_id: "edge-1",
        status: "executing"
      } as any;

      handleUpdate(mockWorkflow, edgeUpdate, runnerStore);
    });
  });

  describe("handleUpdate - Prediction Updates", () => {
    it("handles prediction update with booting status", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const prediction = {
        type: "prediction",
        id: "pred-1",
        user_id: "user-1",
        node_id: "node-1",
        status: "booting",
        logs: "Booting..."
      } as any;

      handleUpdate(mockWorkflow, prediction, runnerStore);
    });
  });

  describe("handleUpdate - Global Updates Array", () => {
    it("stores updates in window.__UPDATES__", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const logUpdate: LogUpdate = {
        type: "log_update",
        node_id: "node-1",
        node_name: "Test Node",
        content: "Log message",
        severity: "info"
      };

      handleUpdate(mockWorkflow, logUpdate, runnerStore);

      expect(window.__UPDATES__).toEqual([logUpdate]);
    });

    it("appends multiple updates to window.__UPDATES__", () => {
      const { store } = createMockRunnerStore();
      const runnerStore = store as any;
      const logUpdate1: LogUpdate = {
        type: "log_update",
        node_id: "node-1",
        node_name: "Test Node",
        content: "Log 1",
        severity: "info"
      };
      const logUpdate2: LogUpdate = {
        type: "log_update",
        node_id: "node-2",
        node_name: "Test Node 2",
        content: "Log 2",
        severity: "info"
      };

      handleUpdate(mockWorkflow, logUpdate1, runnerStore);
      handleUpdate(mockWorkflow, logUpdate2, runnerStore);

      expect(window.__UPDATES__).toEqual([logUpdate1, logUpdate2]);
    });
  });
});
