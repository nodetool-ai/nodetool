import { handleUpdate, MsgpackData } from "../workflowUpdates";
import useResultsStore from "../ResultsStore";
import useStatusStore from "../StatusStore";
import useLogsStore from "../LogStore";
import useErrorStore from "../ErrorStore";
import { useNotificationStore } from "../NotificationStore";
import useExecutionTimeStore from "../ExecutionTimeStore";
import { useNodeResultHistoryStore } from "../NodeResultHistoryStore";
import type { WorkflowAttributes } from "../ApiTypes";

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: jest.fn().mockReturnValue(jest.fn())
  }
}));

jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn().mockResolvedValue(undefined)
  }
}));

const mockSetResult = jest.fn();
const mockSetOutputResult = jest.fn();
const mockClearOutputResults = jest.fn();
const mockSetProgress = jest.fn();
const mockClearProgress = jest.fn();
const mockSetPreview = jest.fn();
const mockSetTask = jest.fn();
const mockSetToolCall = jest.fn();
const mockSetPlanningUpdate = jest.fn();
const mockSetEdge = jest.fn();
const mockClearEdges = jest.fn();
const mockGetOutputResult = jest.fn().mockReturnValue(null);

jest.mock("../ResultsStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setResult: mockSetResult,
      setOutputResult: mockSetOutputResult,
      clearOutputResults: mockClearOutputResults,
      setProgress: mockSetProgress,
      clearProgress: mockClearProgress,
      setPreview: mockSetPreview,
      setTask: mockSetTask,
      setToolCall: mockSetToolCall,
      setPlanningUpdate: mockSetPlanningUpdate,
      setEdge: mockSetEdge,
      clearEdges: mockClearEdges,
      getOutputResult: mockGetOutputResult
    })
  }
}));

const mockSetStatus = jest.fn();
const mockGetStatus = jest.fn().mockReturnValue(null);
const mockClearStatuses = jest.fn();

jest.mock("../StatusStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setStatus: mockSetStatus,
      getStatus: mockGetStatus,
      clearStatuses: mockClearStatuses
    })
  }
}));

const mockAppendLog = jest.fn();

jest.mock("../LogStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      appendLog: mockAppendLog
    })
  }
}));

const mockSetError = jest.fn();

jest.mock("../ErrorStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setError: mockSetError
    })
  }
}));

const mockAddNotification = jest.fn();

jest.mock("../NotificationStore", () => ({
  useNotificationStore: {
    getState: () => ({
      addNotification: mockAddNotification
    })
  }
}));

const mockStartExecution = jest.fn();
const mockEndExecution = jest.fn();
const mockClearTimings = jest.fn();

jest.mock("../ExecutionTimeStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      startExecution: mockStartExecution,
      endExecution: mockEndExecution,
      clearTimings: mockClearTimings
    })
  }
}));

const mockAddToHistory = jest.fn();

jest.mock("../NodeResultHistoryStore", () => ({
  useNodeResultHistoryStore: {
    getState: () => ({
      addToHistory: mockAddToHistory
    })
  }
}));

describe("workflowUpdates handleUpdate", () => {
  const workflow: WorkflowAttributes = {
    id: "wf-1",
    name: "Test Workflow",
    description: "",
    access: "private",
    updated_at: "2024-01-01T00:00:00Z",
    created_at: "2024-01-01T00:00:00Z"
  } as WorkflowAttributes;

  const mockRunnerAddNotification = jest.fn();
  const mockRunnerState = {
    state: "running" as const,
    job_id: "job-1",
    addNotification: mockRunnerAddNotification,
    notifications: []
  };

  let mockRunnerStore: {
    getState: () => typeof mockRunnerState;
    setState: jest.Mock;
    subscribe: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (window as any).__UPDATES__ = undefined;
    mockRunnerStore = {
      getState: () => mockRunnerState,
      setState: jest.fn(),
      subscribe: jest.fn()
    };
  });

  it("handles save_update by storing result", () => {
    const data: MsgpackData = {
      type: "save_update",
      node_id: "node-1",
      name: "saved_value",
      value: { text: "hello" },
      output_type: "string"
    };

    handleUpdate(workflow, data, mockRunnerStore as any);

    expect(mockSetResult).toHaveBeenCalledWith("wf-1", "node-1", {
      text: "hello"
    });
  });

  it("handles error messages by showing notification", () => {
    const data: MsgpackData = {
      type: "error",
      message: "Something went wrong"
    };

    handleUpdate(workflow, data, mockRunnerStore as any);

    expect(mockRunnerAddNotification).toHaveBeenCalledWith({
      type: "error",
      alert: true,
      content: "Something went wrong"
    });
  });

  it("pushes updates to window.__UPDATES__", () => {
    const data: MsgpackData = {
      type: "save_update",
      node_id: "node-1",
      name: "test",
      value: 42,
      output_type: "integer"
    };

    handleUpdate(workflow, data, mockRunnerStore as any);

    expect((window as any).__UPDATES__).toContain(data);
  });
});
