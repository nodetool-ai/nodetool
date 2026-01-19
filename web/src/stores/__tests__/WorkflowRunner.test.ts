import { renderHook, act, waitFor } from "@testing-library/react";
import { useWorkflowRunner } from "../WorkflowRunner";
import useWorkflowRunnerStore from "../WorkflowRunner";
import { WorkflowAttributes } from "../ApiTypes";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";

jest.mock("../WorkflowRunner", () => ({
  useWorkflowRunner: jest.fn()
}));

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    send: jest.fn()
  }
}));

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

const mockCancel = jest.fn().mockResolvedValue(undefined);
const mockPause = jest.fn().mockResolvedValue(undefined);
const mockResume = jest.fn().mockResolvedValue(undefined);
const mockRun = jest.fn().mockResolvedValue(undefined);
const mockReconnect = jest.fn().mockResolvedValue(undefined);
const mockReconnectWithWorkflow = jest.fn().mockResolvedValue(undefined);
const mockEnsureConnection = jest.fn().mockResolvedValue(undefined);
const mockCleanup = jest.fn();
const mockSetStatusMessage = jest.fn();

describe("WorkflowRunner", () => {
  const createMockWorkflow = (id: string): WorkflowAttributes => ({
    id,
    name: `Workflow ${id}`,
    description: "Test workflow",
    version: 1,
    graph: { nodes: [], edges: [] },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const createMockNode = (id: string): Node<NodeData> => ({
    id,
    type: "default",
    position: { x: 0, y: 0 },
    data: { label: `Node ${id}` }
  });

  const createMockEdge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
    type: "default"
  });

  beforeEach(() => {
    jest.clearAllMocks();

    (useWorkflowRunner as jest.Mock).mockImplementation(() => ({
      workflow: null,
      nodes: [],
      edges: [],
      job_id: null,
      unsubscribe: null,
      state: "idle",
      statusMessage: null,
      notifications: [],
      messageHandler: null,
      setMessageHandler: jest.fn(),
      addNotification: jest.fn(),
      cancel: mockCancel,
      pause: mockPause,
      resume: mockResume,
      run: mockRun,
      reconnect: mockReconnect,
      reconnectWithWorkflow: mockReconnectWithWorkflow,
      ensureConnection: mockEnsureConnection,
      cleanup: mockCleanup,
      setStatusMessage: mockSetStatusMessage,
      streamInput: jest.fn(),
      endInputStream: jest.fn()
    }));
  });

  describe("state transitions", () => {
    it("should initialize in idle state", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));

      expect(result.current.state).toBe("idle");
    });

    it("should return workflow", () => {
      const mockWorkflow = createMockWorkflow("workflow-1");
      
      (useWorkflowRunner as jest.Mock).mockImplementation(() => ({
        workflow: mockWorkflow,
        nodes: [],
        edges: [],
        job_id: null,
        unsubscribe: null,
        state: "idle",
        statusMessage: null,
        notifications: [],
        messageHandler: null,
        setMessageHandler: jest.fn(),
        addNotification: jest.fn(),
        cancel: mockCancel,
        pause: mockPause,
        resume: mockResume,
        run: mockRun,
        reconnect: mockReconnect,
        reconnectWithWorkflow: mockReconnectWithWorkflow,
        ensureConnection: mockEnsureConnection,
        cleanup: mockCleanup,
        setStatusMessage: mockSetStatusMessage,
        streamInput: jest.fn(),
        endInputStream: jest.fn()
      }));

      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.workflow).toEqual(mockWorkflow);
    });

    it("should return nodes", () => {
      const mockNodes = [createMockNode("node-1"), createMockNode("node-2")];
      
      (useWorkflowRunner as jest.Mock).mockImplementation(() => ({
        workflow: null,
        nodes: mockNodes,
        edges: [],
        job_id: null,
        unsubscribe: null,
        state: "idle",
        statusMessage: null,
        notifications: [],
        messageHandler: null,
        setMessageHandler: jest.fn(),
        addNotification: jest.fn(),
        cancel: mockCancel,
        pause: mockPause,
        resume: mockResume,
        run: mockRun,
        reconnect: mockReconnect,
        reconnectWithWorkflow: mockReconnectWithWorkflow,
        ensureConnection: mockEnsureConnection,
        cleanup: mockCleanup,
        setStatusMessage: mockSetStatusMessage,
        streamInput: jest.fn(),
        endInputStream: jest.fn()
      }));

      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.nodes).toEqual(mockNodes);
    });

    it("should return edges", () => {
      const mockEdges = [createMockEdge("e-1", "node-1", "node-2")];
      
      (useWorkflowRunner as jest.Mock).mockImplementation(() => ({
        workflow: null,
        nodes: [],
        edges: mockEdges,
        job_id: null,
        unsubscribe: null,
        state: "idle",
        statusMessage: null,
        notifications: [],
        messageHandler: null,
        setMessageHandler: jest.fn(),
        addNotification: jest.fn(),
        cancel: mockCancel,
        pause: mockPause,
        resume: mockResume,
        run: mockRun,
        reconnect: mockReconnect,
        reconnectWithWorkflow: mockReconnectWithWorkflow,
        ensureConnection: mockEnsureConnection,
        cleanup: mockCleanup,
        setStatusMessage: mockSetStatusMessage,
        streamInput: jest.fn(),
        endInputStream: jest.fn()
      }));

      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.edges).toEqual(mockEdges);
    });

    it("should return job_id", () => {
      (useWorkflowRunner as jest.Mock).mockImplementation(() => ({
        workflow: null,
        nodes: [],
        edges: [],
        job_id: "job-123",
        unsubscribe: jest.fn(),
        state: "running",
        statusMessage: "Processing",
        notifications: [],
        messageHandler: null,
        setMessageHandler: jest.fn(),
        addNotification: jest.fn(),
        cancel: mockCancel,
        pause: mockPause,
        resume: mockResume,
        run: mockRun,
        reconnect: mockReconnect,
        reconnectWithWorkflow: mockReconnectWithWorkflow,
        ensureConnection: mockEnsureConnection,
        cleanup: mockCleanup,
        setStatusMessage: mockSetStatusMessage,
        streamInput: jest.fn(),
        endInputStream: jest.fn()
      }));

      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.job_id).toBe("job-123");
    });
  });

  describe("actions", () => {
    it("should return cancel function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.cancel).toBe("function");
    });

    it("should return pause function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.pause).toBe("function");
    });

    it("should return resume function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.resume).toBe("function");
    });

    it("should return run function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.run).toBe("function");
    });

    it("should return reconnect function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.reconnect).toBe("function");
    });

    it("should return reconnectWithWorkflow function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.reconnectWithWorkflow).toBe("function");
    });

    it("should return ensureConnection function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.ensureConnection).toBe("function");
    });

    it("should return cleanup function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.cleanup).toBe("function");
    });

    it("should return setMessageHandler function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.setMessageHandler).toBe("function");
    });

    it("should return addNotification function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.addNotification).toBe("function");
    });

    it("should return streamInput function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.streamInput).toBe("function");
    });

    it("should return endInputStream function", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(typeof result.current.endInputStream).toBe("function");
    });
  });

  describe("statusMessage", () => {
    it("should return null initially", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.statusMessage).toBeNull();
    });

    it("should return statusMessage when set", () => {
      (useWorkflowRunner as jest.Mock).mockImplementation(() => ({
        workflow: null,
        nodes: [],
        edges: [],
        job_id: null,
        unsubscribe: null,
        state: "running",
        statusMessage: "Processing node 1/10",
        notifications: [],
        messageHandler: null,
        setMessageHandler: jest.fn(),
        addNotification: jest.fn(),
        cancel: mockCancel,
        pause: mockPause,
        resume: mockResume,
        run: mockRun,
        reconnect: mockReconnect,
        reconnectWithWorkflow: mockReconnectWithWorkflow,
        ensureConnection: mockEnsureConnection,
        cleanup: mockCleanup,
        setStatusMessage: mockSetStatusMessage,
        streamInput: jest.fn(),
        endInputStream: jest.fn()
      }));

      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.statusMessage).toBe("Processing node 1/10");
    });
  });

  describe("notifications", () => {
    it("should return empty notifications array initially", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.notifications).toEqual([]);
    });
  });

  describe("messageHandler", () => {
    it("should return null initially", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.messageHandler).toBeNull();
    });
  });

  describe("unsubscribe", () => {
    it("should return null initially", () => {
      const { result } = renderHook(() => useWorkflowRunner("workflow-1"));
      expect(result.current.unsubscribe).toBeNull();
    });
  });
});
