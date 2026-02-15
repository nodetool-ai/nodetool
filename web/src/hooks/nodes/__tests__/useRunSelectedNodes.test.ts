import { renderHook, act } from "@testing-library/react";
import { useRunSelectedNodes } from "../useRunSelectedNodes";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodeStoreRef: jest.fn()
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn()
}));

jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn()
}));

jest.mock("../../../core/graph", () => ({
  subgraph: jest.fn()
}));

jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import { useNodeStoreRef } from "../../../contexts/NodeContext";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import useResultsStore from "../../../stores/ResultsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { subgraph } from "../../../core/graph";

const mockUseNodeStoreRef = useNodeStoreRef as jest.Mock;
const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;
const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockSubgraph = subgraph as jest.Mock;

describe("useRunSelectedNodes", () => {
  const mockRun = jest.fn();
  const mockFindNode = jest.fn();
  const mockGetResult = jest.fn();
  const mockAddNotification = jest.fn();
  const mockGetSelectedNodes = jest.fn();

  const nodeA = {
    id: "node-a",
    type: "nodetool.input.StringInput",
    data: { properties: { value: "hello" } },
    selected: true
  };

  const nodeB = {
    id: "node-b",
    type: "nodetool.llm.Chat",
    data: { properties: {} },
    selected: false
  };

  const nodeC = {
    id: "node-c",
    type: "nodetool.output.TextOutput",
    data: { properties: {} },
    selected: false
  };

  const defaultEdges = [
    { id: "e1", source: "node-a", target: "node-b", sourceHandle: "output", targetHandle: "prompt" },
    { id: "e2", source: "node-b", target: "node-c", sourceHandle: "output", targetHandle: "value" }
  ];

  const defaultWorkflow = { id: "workflow-1", name: "Test Workflow" };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetSelectedNodes.mockReturnValue([nodeA]);

    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        nodes: [nodeA, nodeB, nodeC],
        edges: defaultEdges,
        workflow: defaultWorkflow,
        findNode: mockFindNode,
        getSelectedNodes: mockGetSelectedNodes
      })
    });

    mockUseWebsocketRunner.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = { run: mockRun, state: "idle" };
      return selector(state);
    });

    mockUseResultsStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = { getResult: mockGetResult };
      return selector(state);
    });

    mockUseNotificationStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = { addNotification: mockAddNotification };
      return selector(state);
    });

    mockFindNode.mockImplementation((id: string) =>
      [nodeA, nodeB, nodeC].find((n) => n.id === id)
    );

    mockSubgraph.mockReturnValue({
      nodes: [nodeA, nodeB, nodeC],
      edges: defaultEdges
    });
  });

  it("includes selected start nodes in the subgraph passed to run", () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    act(() => {
      result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];

    // The selected start node (nodeA) must be included
    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).toContain("node-b");
    expect(nodeIds).toContain("node-c");
  });

  it("does not run when workflow is already running", () => {
    mockUseWebsocketRunner.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = { run: mockRun, state: "running" };
      return selector(state);
    });

    const { result } = renderHook(() => useRunSelectedNodes());

    act(() => {
      result.current.runSelectedNodes();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("does not run when no nodes are selected", () => {
    mockGetSelectedNodes.mockReturnValue([]);

    const { result } = renderHook(() => useRunSelectedNodes());

    act(() => {
      result.current.runSelectedNodes();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("handles multiple selected nodes without duplicating shared downstream nodes", () => {
    const nodeD = {
      id: "node-d",
      type: "nodetool.llm.Chat",
      data: { properties: {} },
      selected: true
    };

    // Both nodeA and nodeD converge on nodeB
    const edges = [
      { id: "e1", source: "node-a", target: "node-b", sourceHandle: "output", targetHandle: "prompt" },
      { id: "e3", source: "node-d", target: "node-b", sourceHandle: "output", targetHandle: "context" },
      { id: "e2", source: "node-b", target: "node-c", sourceHandle: "output", targetHandle: "value" }
    ];

    mockGetSelectedNodes.mockReturnValue([nodeA, nodeD]);

    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        nodes: [nodeA, nodeB, nodeC, nodeD],
        edges,
        workflow: defaultWorkflow,
        findNode: mockFindNode,
        getSelectedNodes: mockGetSelectedNodes
      })
    });

    // First call for nodeA
    mockSubgraph.mockImplementation((_edges: unknown, _nodes: unknown, startNode: { id: string }) => {
      if (startNode.id === "node-a") {
        return { nodes: [nodeA, nodeB, nodeC], edges: [edges[0], edges[2]] };
      }
      if (startNode.id === "node-d") {
        return { nodes: [nodeD, nodeB, nodeC], edges: [edges[1], edges[2]] };
      }
      return { nodes: [], edges: [] };
    });

    const { result } = renderHook(() => useRunSelectedNodes());

    act(() => {
      result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);

    // All 4 nodes should be present
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).toContain("node-b");
    expect(nodeIds).toContain("node-c");
    expect(nodeIds).toContain("node-d");

    // No duplicates
    expect(nodeIds.length).toBe(4);
  });

  it("passes subgraphNodeIds to run", () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    act(() => {
      result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const subgraphNodeIds = mockRun.mock.calls[0][5];
    expect(subgraphNodeIds).toBeInstanceOf(Set);
    expect(subgraphNodeIds.has("node-a")).toBe(true);
    expect(subgraphNodeIds.has("node-b")).toBe(true);
    expect(subgraphNodeIds.has("node-c")).toBe(true);
  });

  it("shows notification after triggering run", () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    act(() => {
      result.current.runSelectedNodes();
    });

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        alert: false
      })
    );
  });
});
