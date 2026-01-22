import {
  handleUpdate,
  subscribeToWorkflowUpdates,
  unsubscribeFromWorkflowUpdates,
  MsgpackData
} from "../workflowUpdates";
import { WorkflowAttributes, JobUpdate, NodeUpdate, Notification } from "../ApiTypes";

const mockAddNotification = jest.fn();

jest.mock("../NotificationStore", () => ({
  useNotificationStore: {
    getState: () => ({
      addNotification: mockAddNotification
    })
  }
}));

describe("workflowUpdates", () => {
  const mockWorkflow: WorkflowAttributes = {
    id: "test-workflow-123",
    name: "Test Workflow",
    package_name: "test-package",
    graph: { nodes: [], edges: [] }
  };

  const createMockRunnerStore = () => {
    const addNotification = jest.fn();
    const state = {
      job_id: null as string | null,
      state: "idle" as "idle" | "running" | "paused" | "suspended" | "error" | "cancelled",
      statusMessage: null as string | null,
      addNotification
    };
    
    return {
      getState: () => state,
      setState: jest.fn((updates: Partial<typeof state>) => {
        Object.assign(state, updates);
      }),
      subscribe: jest.fn((callback: (state: typeof state, prevState: typeof state) => void) => {
        return () => {};
      }),
      addNotification
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddNotification.mockClear();
    if (typeof window !== 'undefined') {
      window.__UPDATES__ = undefined;
    }
  });

  describe("handleUpdate", () => {
    it("handles notification updates", () => {
      const runnerStore = createMockRunnerStore();

      const notification: Notification = {
        type: "notification",
        severity: "info",
        content: "Test notification"
      };

      handleUpdate(mockWorkflow, notification, runnerStore as any);

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "info",
        content: "Test notification"
      });
    });

    it("handles job_update with running status", () => {
      const runnerStore = createMockRunnerStore();
      
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "running",
        message: "Job started"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore as any);

      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ state: "running" })
      );
      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ job_id: "job-123" })
      );
    });

    it("handles job_update with completed status", () => {
      const runnerStore = createMockRunnerStore();
      
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "completed"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore as any);

      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ state: "idle" })
      );
    });

    it("handles job_update with cancelled status", () => {
      const runnerStore = createMockRunnerStore();
      
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "cancelled"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore as any);

      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ state: "cancelled" })
      );
    });

    it("handles job_update with failed status", () => {
      const runnerStore = createMockRunnerStore();
      
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "failed",
        error: "Job failed"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore as any);

      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ state: "error" })
      );
    });

    it("handles job_update with suspended status", () => {
      const runnerStore = createMockRunnerStore();
      
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "suspended",
        message: "Waiting for input"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore as any);

      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ state: "suspended" })
      );
    });

    it("handles job_update with paused status", () => {
      const runnerStore = createMockRunnerStore();
      
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "paused"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore as any);

      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ state: "paused" })
      );
    });

    it("handles job_update with queued status", () => {
      const runnerStore = createMockRunnerStore();
      
      const jobUpdate: JobUpdate = {
        type: "job_update",
        job_id: "job-123",
        status: "queued"
      };

      handleUpdate(mockWorkflow, jobUpdate, runnerStore as any);

      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ 
          statusMessage: "Worker is booting (may take a 15 seconds)..." 
        })
      );
    });

    it("handles node_update with error", () => {
      const runnerStore = createMockRunnerStore();
      
      const nodeUpdate: NodeUpdate = {
        type: "node_update",
        node_id: "node-1",
        node_name: "Test Node",
        status: "error",
        error: "Node failed"
      };

      handleUpdate(mockWorkflow, nodeUpdate, runnerStore as any);

      expect(runnerStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ state: "error" })
      );
    });

    it("stores __UPDATES__ on window object", () => {
      const runnerStore = createMockRunnerStore();
      
      const notification: Notification = {
        type: "notification",
        severity: "info",
        content: "Test"
      };

      handleUpdate(mockWorkflow, notification, runnerStore as any);

      expect((window as any).__UPDATES__).toBeDefined();
      expect((window as any).__UPDATES__).toHaveLength(1);
    });

    it("appends to existing __UPDATES__", () => {
      const runnerStore = createMockRunnerStore();
      (window as any).__UPDATES__ = [{ type: "existing" }];
      
      const notification: Notification = {
        type: "notification",
        severity: "info",
        content: "Test"
      };

      handleUpdate(mockWorkflow, notification, runnerStore as any);

      expect((window as any).__UPDATES__).toHaveLength(2);
    });
  });

  describe("subscribeToWorkflowUpdates", () => {
    it("returns unsubscribe function", () => {
      const runnerStore = createMockRunnerStore();
      const unsubscribe = subscribeToWorkflowUpdates(
        mockWorkflow.id,
        mockWorkflow,
        runnerStore as any
      );

      expect(typeof unsubscribe).toBe("function");
    });

    it("handles subscription with existing workflow", () => {
      const runnerStore = createMockRunnerStore();
      
      const unsub1 = subscribeToWorkflowUpdates(
        mockWorkflow.id,
        mockWorkflow,
        runnerStore as any
      );
      
      const unsub2 = subscribeToWorkflowUpdates(
        mockWorkflow.id,
        mockWorkflow,
        runnerStore as any
      );

      expect(typeof unsub1).toBe("function");
      expect(typeof unsub2).toBe("function");
    });
  });

  describe("unsubscribeFromWorkflowUpdates", () => {
    it("handles unsubscribe for non-existent subscription", () => {
      expect(() => {
        unsubscribeFromWorkflowUpdates("non-existent");
      }).not.toThrow();
    });

    it("removes subscription after unsubscribe", () => {
      const runnerStore = createMockRunnerStore();
      
      const unsub1 = subscribeToWorkflowUpdates(
        mockWorkflow.id,
        mockWorkflow,
        runnerStore as any
      );

      expect(typeof unsub1).toBe("function");

      unsubscribeFromWorkflowUpdates(mockWorkflow.id);
    });
  });

  describe("MsgpackData type handling", () => {
    it("accepts Notification type", () => {
      const runnerStore = createMockRunnerStore();
      const data: MsgpackData = {
        type: "notification",
        severity: "info",
        content: "Test"
      };

      expect(() => {
        handleUpdate(mockWorkflow, data, runnerStore as any);
      }).not.toThrow();
    });

    it("accepts JobUpdate type", () => {
      const runnerStore = createMockRunnerStore();
      const data: MsgpackData = {
        type: "job_update",
        job_id: "job-1",
        status: "running"
      };

      expect(() => {
        handleUpdate(mockWorkflow, data, runnerStore as any);
      }).not.toThrow();
    });

    it("accepts NodeUpdate type", () => {
      const runnerStore = createMockRunnerStore();
      const data: MsgpackData = {
        type: "node_update",
        node_id: "node-1",
        status: "running"
      };

      expect(() => {
        handleUpdate(mockWorkflow, data, runnerStore as any);
      }).not.toThrow();
    });
  });
});
