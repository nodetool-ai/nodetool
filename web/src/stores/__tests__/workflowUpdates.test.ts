import { handleUpdate, subscribeToWorkflowUpdates, unsubscribeFromWorkflowUpdates, MsgpackData } from "../workflowUpdates";
import { WorkflowAttributes, JobUpdate, NodeUpdate, Notification } from "./ApiTypes";
import { WorkflowRunnerStore } from "./WorkflowRunner";

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: jest.fn().mockReturnValue(() => {}),
    unsubscribe: jest.fn(),
  },
}));

describe("workflowUpdates", () => {
  let mockRunnerStore: jest.Mocked<WorkflowRunnerStore>;
  let mockWorkflow: WorkflowAttributes;

  beforeEach(() => {
    jest.clearAllMocks();

    window.__UPDATES__ = undefined;

    mockRunnerStore = {
      getState: jest.fn().mockReturnValue({
        state: "idle",
        job_id: null,
        statusMessage: null,
      }),
      setState: jest.fn(),
      addNotification: jest.fn(),
    } as any;

    mockWorkflow = {
      id: "workflow-1",
      name: "Test Workflow",
      attributes: {
        name: "Test Workflow",
        description: "A test workflow",
        graph: { nodes: [], edges: [] },
      },
    } as WorkflowAttributes;

    jest.spyOn(require("./ResultsStore"), "default").mockImplementation(() => ({
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
    }));

    jest.spyOn(require("./StatusStore"), "default").mockImplementation(() => ({
      setStatus: jest.fn(),
      getStatus: jest.fn().mockReturnValue(null),
      clearStatuses: jest.fn(),
    }));

    jest.spyOn(require("./LogStore"), "default").mockImplementation(() => ({
      appendLog: jest.fn(),
    }));

    jest.spyOn(require("./ErrorStore"), "default").mockImplementation(() => ({
      setError: jest.fn(),
    }));

    jest.spyOn(require("./NotificationStore"), "useNotificationStore").mockReturnValue({
      addNotification: jest.fn(),
    });

    jest.spyOn(require("./ExecutionTimeStore"), "default").mockImplementation(() => ({
      startExecution: jest.fn(),
      endExecution: jest.fn(),
      clearTimings: jest.fn(),
    }));

    jest.spyOn(require("../queryClient"), "queryClient").mockImplementation({
      invalidateQueries: jest.fn(),
    });
  });

  describe("handleUpdate", () => {
    describe("log_update", () => {
      it("should append log entry for log_update", () => {
        const logUpdate = {
          type: "log_update",
          node_id: "node-1",
          node_name: "Test Node",
          content: "Test log message",
          severity: "info",
        } as any;

        handleUpdate(mockWorkflow, logUpdate, mockRunnerStore);

        const appendLog = require("./LogStore").default.getState().appendLog;
        expect(appendLog).toHaveBeenCalledWith({
          workflowId: "workflow-1",
          workflowName: "Test Workflow",
          nodeId: "node-1",
          nodeName: "Test Node",
          content: "Test log message",
          severity: "info",
          timestamp: expect.any(Number),
        });
      });

      it("should handle different log severities", () => {
        const severities = ["debug", "info", "warning", "error"];

        severities.forEach((severity) => {
          const logUpdate = {
            type: "log_update",
            node_id: "node-1",
            node_name: "Test Node",
            content: "Test log",
            severity,
          } as any;

          handleUpdate(mockWorkflow, logUpdate, mockRunnerStore);
        });

        const appendLog = require("./LogStore").default.getState().appendLog;
        expect(appendLog).toHaveBeenCalledTimes(4);
      });
    });

    describe("notification", () => {
      it("should add notification for notification type", () => {
        const notification = {
          type: "notification",
          severity: "info",
          content: "Test notification",
        } as Notification;

        handleUpdate(mockWorkflow, notification, mockRunnerStore);

        const addNotification = require("./NotificationStore").useNotificationStore.getState().addNotification;
        expect(addNotification).toHaveBeenCalledWith({
          type: "info",
          content: "Test notification",
        });
      });

      it("should handle different notification severities", () => {
        const severities = ["info", "warning", "error", "success"];

        severities.forEach((severity) => {
          const notification = {
            type: "notification",
            severity: severity as any,
            content: `Test ${severity}`,
          } as Notification;

          handleUpdate(mockWorkflow, notification, mockRunnerStore);
        });

        const addNotification = require("./NotificationStore").useNotificationStore.getState().addNotification;
        expect(addNotification).toHaveBeenCalledTimes(4);
      });
    });

    describe("job_update", () => {
      it("should update state to running for status running", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          job_id: "job-123",
          status: "running",
          message: "Job started",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "running" });
        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ job_id: "job-123" });
      });

      it("should update state to running for status queued", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          job_id: "job-123",
          status: "queued",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "running" });
      });

      it("should update state to suspended for status suspended", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "suspended",
          message: "Waiting for input",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "suspended" });
      });

      it("should update state to paused for status paused", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "paused",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "paused" });
      });

      it("should update state to idle for status completed", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "completed",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "idle" });
        expect(mockRunnerStore.addNotification).toHaveBeenCalledWith({
          type: "info",
          alert: true,
          content: "Job completed",
        });
      });

      it("should update state to cancelled for status cancelled", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "cancelled",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "cancelled" });
        expect(mockRunnerStore.addNotification).toHaveBeenCalledWith({
          type: "info",
          alert: true,
          content: "Job cancelled",
        });
      });

      it("should update state to error for status failed", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "failed",
          error: "Something went wrong",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
        expect(mockRunnerStore.addNotification).toHaveBeenCalledWith({
          type: "error",
          alert: true,
          content: "Job failed Something went wrong",
          timeout: 30000,
        });
      });

      it("should update state to error for status timed_out", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "timed_out",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });
      });

      it("should set status message for suspended state", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "suspended",
          run_state: {
            status: "suspended",
            suspension_reason: "Waiting for user input",
          },
        } as any;

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({
          statusMessage: "Waiting for user input",
        });
      });

      it("should show booting message for queued status", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "queued",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({
          statusMessage: "Worker is booting (may take a 15 seconds)...",
        });
      });

      it("should show message for running status", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "running",
          message: "Processing started",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.addNotification).toHaveBeenCalledWith({
          type: "info",
          alert: true,
          content: "Processing started",
        });
      });

      it("should show suspension message", () => {
        const jobUpdate: JobUpdate = {
          type: "job_update",
          status: "suspended",
          message: "Custom suspension message",
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.addNotification).toHaveBeenCalledWith({
          type: "info",
          alert: true,
          content: "Custom suspension message",
          timeout: 10000,
        });
      });
    });

    describe("node_update", () => {
      it("should set status for node update", () => {
        const nodeUpdate: NodeUpdate = {
          type: "node_update",
          node_id: "node-1",
          node_name: "Test Node",
          status: "running",
        };

        handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);

        const setStatus = require("./StatusStore").default.getState().setStatus;
        expect(setStatus).toHaveBeenCalledWith("workflow-1", "node-1", "running");
      });

      it("should handle node update with error", () => {
        const nodeUpdate: NodeUpdate = {
          type: "node_update",
          node_id: "node-1",
          node_name: "Test Node",
          status: "error",
          error: "Node failed",
        };

        handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: "error" });

        const setError = require("./ErrorStore").default.getState().setError;
        expect(setError).toHaveBeenCalledWith("workflow-1", "node-1", "Node failed");
      });

      it("should not update status when workflow is cancelled", () => {
        mockRunnerStore.getState.mockReturnValueOnce({
          state: "cancelled",
          job_id: null,
          statusMessage: null,
        });

        const nodeUpdate: NodeUpdate = {
          type: "node_update",
          node_id: "node-1",
          node_name: "Test Node",
          status: "running",
        };

        handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);

        const setStatus = require("./StatusStore").default.getState().setStatus;
        expect(setStatus).not.toHaveBeenCalled();
      });

      it("should set result when present", () => {
        const nodeUpdate: NodeUpdate = {
          type: "node_update",
          node_id: "node-1",
          node_name: "Test Node",
          status: "completed",
          result: { output: "test result" },
        };

        handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);

        const setResult = require("./ResultsStore").default.getState().setResult;
        expect(setResult).toHaveBeenCalledWith("workflow-1", "node-1", { output: "test result" });
      });
    });

    describe("edge_update", () => {
      it("should update edge status", () => {
        const edgeUpdate = {
          type: "edge_update",
          edge_id: "edge-1",
          status: "running",
          counter: 5,
        };

        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);

        const setEdge = require("./ResultsStore").default.getState().setEdge;
        expect(setEdge).toHaveBeenCalledWith("workflow-1", "edge-1", "running", 5);
      });

      it("should not update edge when workflow is cancelled", () => {
        mockRunnerStore.getState.mockReturnValueOnce({
          state: "cancelled",
          job_id: null,
          statusMessage: null,
        });

        const edgeUpdate = {
          type: "edge_update",
          edge_id: "edge-1",
          status: "running",
        };

        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);

        const setEdge = require("./ResultsStore").default.getState().setEdge;
        expect(setEdge).not.toHaveBeenCalled();
      });

      it("should not update edge when workflow has error", () => {
        mockRunnerStore.getState.mockReturnValueOnce({
          state: "error",
          job_id: null,
          statusMessage: null,
        });

        const edgeUpdate = {
          type: "edge_update",
          edge_id: "edge-1",
          status: "running",
        };

        handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);

        const setEdge = require("./ResultsStore").default.getState().setEdge;
        expect(setEdge).not.toHaveBeenCalled();
      });
    });

    describe("node_progress", () => {
      it("should set progress for node", () => {
        const progressUpdate = {
          type: "node_progress",
          node_id: "node-1",
          progress: 50,
          total: 100,
        };

        handleUpdate(mockWorkflow, progressUpdate, mockRunnerStore);

        const setProgress = require("./ResultsStore").default.getState().setProgress;
        expect(setProgress).toHaveBeenCalledWith("workflow-1", "node-1", 50, 100);
      });

      it("should not update progress when workflow is cancelled", () => {
        mockRunnerStore.getState.mockReturnValueOnce({
          state: "cancelled",
          job_id: null,
          statusMessage: null,
        });

        const progressUpdate = {
          type: "node_progress",
          node_id: "node-1",
          progress: 50,
          total: 100,
        };

        handleUpdate(mockWorkflow, progressUpdate, mockRunnerStore);

        const setProgress = require("./ResultsStore").default.getState().setProgress;
        expect(setProgress).not.toHaveBeenCalled();
      });
    });

    describe("output_update", () => {
      it("should set output result", () => {
        const outputUpdate = {
          type: "output_update",
          node_id: "node-1",
          value: "test output",
        };

        handleUpdate(mockWorkflow, outputUpdate, mockRunnerStore);

        const setOutputResult = require("./ResultsStore").default.getState().setOutputResult;
        expect(setOutputResult).toHaveBeenCalledWith("workflow-1", "node-1", "test output", true);
      });

      it("should handle object output values", () => {
        const outputUpdate = {
          type: "output_update",
          node_id: "node-1",
          value: { key: "value" },
        };

        handleUpdate(mockWorkflow, outputUpdate, mockRunnerStore);

        const setOutputResult = require("./ResultsStore").default.getState().setOutputResult;
        expect(setOutputResult).toHaveBeenCalledWith("workflow-1", "node-1", { key: "value" }, true);
      });
    });

    describe("preview_update", () => {
      it("should set preview", () => {
        const previewUpdate = {
          type: "preview_update",
          node_id: "node-1",
          value: "preview data",
        };

        handleUpdate(mockWorkflow, previewUpdate, mockRunnerStore);

        const setPreview = require("./ResultsStore").default.getState().setPreview;
        expect(setPreview).toHaveBeenCalledWith("workflow-1", "node-1", "preview data", true);
      });
    });

    describe("planning_update", () => {
      it("should set planning update", () => {
        const planningUpdate = {
          type: "planning_update",
          node_id: "node-1",
          content: "Planning content",
        };

        handleUpdate(mockWorkflow, planningUpdate, mockRunnerStore);

        const setPlanningUpdate = require("./ResultsStore").default.getState().setPlanningUpdate;
        expect(setPlanningUpdate).toHaveBeenCalledWith("workflow-1", "node-1", planningUpdate);
      });

      it("should log error when node_id is missing", () => {
        const planningUpdate = {
          type: "planning_update",
          content: "Planning content",
        } as any;

        const logSpy = jest.spyOn(require("loglevel"), "default").mockImplementation(() => ({
          error: jest.fn(),
        }));

        handleUpdate(mockWorkflow, planningUpdate, mockRunnerStore);

        expect(logSpy.error).toHaveBeenCalledWith("PlanningUpdate has no node_id");
      });
    });

    describe("tool_call_update", () => {
      it("should set tool call", () => {
        const toolCallUpdate = {
          type: "tool_call_update",
          node_id: "node-1",
          tool: "test-tool",
          input: { arg: "value" },
        };

        handleUpdate(mockWorkflow, toolCallUpdate, mockRunnerStore);

        const setToolCall = require("./ResultsStore").default.getState().setToolCall;
        expect(setToolCall).toHaveBeenCalledWith("workflow-1", "node-1", toolCallUpdate);
      });
    });

    describe("task_update", () => {
      it("should set task", () => {
        const taskUpdate = {
          type: "task_update",
          node_id: "node-1",
          task: "Current task",
        };

        handleUpdate(mockWorkflow, taskUpdate, mockRunnerStore);

        const setTask = require("./ResultsStore").default.getState().setTask;
        expect(setTask).toHaveBeenCalledWith("workflow-1", "node-1", "Current task");
      });

      it("should log error when node_id is missing", () => {
        const taskUpdate = {
          type: "task_update",
          task: "Current task",
        } as any;

        const logSpy = jest.spyOn(require("loglevel"), "default").mockImplementation(() => ({
          error: jest.fn(),
        }));

        handleUpdate(mockWorkflow, taskUpdate, mockRunnerStore);

        expect(logSpy.error).toHaveBeenCalledWith("TaskUpdate has no node_id");
      });
    });
  });

  describe("subscribeToWorkflowUpdates", () => {
    it("should subscribe to workflow updates", () => {
      const unsubscribe = subscribeToWorkflowUpdates("workflow-1", mockWorkflow, mockRunnerStore);

      expect(unsubscribe).toBeDefined();
      expect(typeof unsubscribe).toBe("function");
    });

    it("should return unsubscribe function that cleans up subscription", () => {
      const unsubscribe = subscribeToWorkflowUpdates("workflow-1", mockWorkflow, mockRunnerStore);

      unsubscribe();

      expect(unsubscribe).toBeDefined();
    });
  });

  describe("unsubscribeFromWorkflowUpdates", () => {
    it("should unsubscribe from workflow updates", () => {
      subscribeToWorkflowUpdates("workflow-1", mockWorkflow, mockRunnerStore);
      expect(() => unsubscribeFromWorkflowUpdates("workflow-1")).not.toThrow();
    });

    it("should handle non-existent workflow gracefully", () => {
      expect(() => unsubscribeFromWorkflowUpdates("non-existent")).not.toThrow();
    });
  });
});
