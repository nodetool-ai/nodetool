jest.mock("../../contexts/EditorInsertionContext", () => ({
  EditorInsertionProvider: ({ children }: any) => children,
  useEditorInsertion: () => null,
  __esModule: true,
  default: {
    Provider: ({ children }: any) => children,
  },
}));

jest.mock("../../contexts/WorkflowManagerContext");
jest.mock("../../stores/GlobalChatStore");
jest.mock("../../stores/graphNodeToReactFlowNode");
jest.mock("../../stores/graphEdgeToReactFlowEdge");

import { renderHook } from "@testing-library/react";
import { useWorkflowGraphUpdater } from "../useWorkflowGraphUpdater";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";

describe("useWorkflowGraphUpdater", () => {
  const mockGetCurrentWorkflow = jest.fn();
  const mockGetNodeStore = jest.fn();
  const mockNodeStore = {
    getState: jest.fn().mockReturnValue({
      setNodes: jest.fn(),
      setEdges: jest.fn(),
      autoLayout: jest.fn(),
      setWorkflowDirty: jest.fn(),
    }),
  };
  let mockChatState = { lastWorkflowGraphUpdate: null as any };
  const mockUnsubscribe = jest.fn();
  const mockSubscribe = jest.fn((listener: (state: typeof mockChatState, prevState: typeof mockChatState) => void) => {
    listener(mockChatState, { lastWorkflowGraphUpdate: null });
    return mockUnsubscribe;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockChatState = { lastWorkflowGraphUpdate: null };

    (useWorkflowManager as jest.Mock).mockReturnValue({
      getCurrentWorkflow: mockGetCurrentWorkflow,
      getNodeStore: mockGetNodeStore,
    });

    (useGlobalChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector(mockChatState);
      }
      return mockChatState;
    });
    (useGlobalChatStore as unknown as { subscribe?: typeof mockSubscribe }).subscribe = mockSubscribe;

    (graphNodeToReactFlowNode as jest.Mock).mockImplementation(jest.fn());
    (graphEdgeToReactFlowEdge as jest.Mock).mockImplementation(jest.fn());
  });

  it("returns undefined (no return value from hook)", () => {
    const { result } = renderHook(() => useWorkflowGraphUpdater());
    expect(result.current).toBeUndefined();
  });

  it("logs warning when no current workflow found", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
    mockGetCurrentWorkflow.mockReturnValue(null);

    mockChatState = {
      lastWorkflowGraphUpdate: {
        graph: { nodes: [], edges: [] },
      },
    };

    renderHook(() => useWorkflowGraphUpdater());

    expect(consoleSpy).toHaveBeenCalledWith("No current workflow found to update");
    consoleSpy.mockRestore();
  });

  it("logs warning when no node store found for workflow", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
    mockGetCurrentWorkflow.mockReturnValue({ id: "workflow-123" });
    mockGetNodeStore.mockReturnValue(null);

    mockChatState = {
      lastWorkflowGraphUpdate: {
        graph: { nodes: [], edges: [] },
      },
    };

    renderHook(() => useWorkflowGraphUpdater());

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No node store found for workflow")
    );
    consoleSpy.mockRestore();
  });

  it("updates node store when workflow graph update received", () => {
    const mockWorkflow = { id: "workflow-123", name: "Test Workflow" };
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    mockGetNodeStore.mockReturnValue(mockNodeStore);

    const mockGraphNodes = [{ id: "node-1", type: "test", data: {} }];
    const mockGraphEdges = [{ id: "edge-1", source: "node-1", target: "node-2" }];
    const mockReactFlowNodes = [{ id: "node-1", position: { x: 0, y: 0 } }];
    const mockReactFlowEdges = [{ id: "edge-1", source: "node-1", target: "node-2" }];

    (graphNodeToReactFlowNode as jest.Mock).mockReturnValue(mockReactFlowNodes[0]);
    (graphEdgeToReactFlowEdge as jest.Mock).mockReturnValue(mockReactFlowEdges[0]);

    mockChatState = {
      lastWorkflowGraphUpdate: {
        graph: { nodes: mockGraphNodes, edges: mockGraphEdges },
      },
    };

    renderHook(() => useWorkflowGraphUpdater());

    expect(graphNodeToReactFlowNode).toHaveBeenCalledWith(
      mockWorkflow,
      mockGraphNodes[0]
    );
    expect(graphEdgeToReactFlowEdge).toHaveBeenCalledWith(mockGraphEdges[0]);
    expect(mockNodeStore.getState().setNodes).toHaveBeenCalledWith(
      expect.arrayContaining([mockReactFlowNodes[0]])
    );
    expect(mockNodeStore.getState().setEdges).toHaveBeenCalledWith(
      expect.arrayContaining([mockReactFlowEdges[0]])
    );
    expect(mockNodeStore.getState().setWorkflowDirty).toHaveBeenCalledWith(false);
  });

  it("calls autoLayout after updating graph", () => {
    jest.useFakeTimers();
    const mockWorkflow = { id: "workflow-123", name: "Test Workflow" };
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    mockGetNodeStore.mockReturnValue(mockNodeStore);

    mockChatState = {
      lastWorkflowGraphUpdate: {
        graph: { nodes: [], edges: [] },
      },
    };

    renderHook(() => useWorkflowGraphUpdater());

    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    expect(mockNodeStore.getState().autoLayout).toHaveBeenCalled();
  });

  it("handles empty graph update", () => {
    const mockWorkflow = { id: "workflow-123", name: "Test Workflow" };
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    mockGetNodeStore.mockReturnValue(mockNodeStore);

    mockChatState = {
      lastWorkflowGraphUpdate: {
        graph: { nodes: [], edges: [] },
      },
    };

    renderHook(() => useWorkflowGraphUpdater());

    expect(graphNodeToReactFlowNode).not.toHaveBeenCalled();
    expect(graphEdgeToReactFlowEdge).not.toHaveBeenCalled();
    expect(mockNodeStore.getState().setNodes).toHaveBeenCalledWith([]);
    expect(mockNodeStore.getState().setEdges).toHaveBeenCalledWith([]);
  });
});
