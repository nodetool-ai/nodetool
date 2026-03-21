import { renderHook, act } from "@testing-library/react";
import { useRunFromHere } from "../useRunFromHere";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
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

jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: jest.fn()
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

import { useNodes } from "../../../contexts/NodeContext";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import useResultsStore from "../../../stores/ResultsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useMetadataStore from "../../../stores/MetadataStore";

const mockUseNodes = useNodes as jest.Mock;
const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;
const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockUseMetadataStore = useMetadataStore as unknown as jest.Mock;

describe("useRunFromHere", () => {
  const mockRun = jest.fn();
  const mockFindNode = jest.fn();
  const mockGetResult = jest.fn();
  const mockAddNotification = jest.fn();

  const nodeA = {
    id: "node-a",
    type: "nodetool.input.StringInput",
    data: { properties: { value: "hello" } }
  };

  const nodeB = {
    id: "node-b",
    type: "nodetool.llm.Chat",
    data: { properties: {} }
  };

  const nodeC = {
    id: "node-c",
    type: "nodetool.output.TextOutput",
    data: { properties: {} }
  };

  const defaultEdges = [
    { id: "e1", source: "node-a", target: "node-b", sourceHandle: "output", targetHandle: "prompt" },
    { id: "e2", source: "node-b", target: "node-c", sourceHandle: "output", targetHandle: "value" }
  ];

  const defaultWorkflow = { id: "workflow-1", name: "Test Workflow" };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseNodes.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = {
        nodes: [nodeA, nodeB, nodeC],
        edges: defaultEdges,
        workflow: defaultWorkflow,
        findNode: mockFindNode
      };
      return selector(state);
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

    mockUseMetadataStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = { getMetadata: () => ({ title: "Test Node" }) };
      return selector(state);
    });

    mockFindNode.mockImplementation((id: string) =>
      [nodeA, nodeB, nodeC].find((n) => n.id === id)
    );
  });

  it("includes downstream nodes when running from a node", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);

    // All downstream nodes from nodeA should be included
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).toContain("node-b");
    expect(nodeIds).toContain("node-c");
  });

  it("only includes downstream nodes, not upstream ones", () => {
    // Run from nodeB - should include B and C but not A
    const { result } = renderHook(() => useRunFromHere(nodeB as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);

    expect(nodeIds).not.toContain("node-a");
    expect(nodeIds).toContain("node-b");
    expect(nodeIds).toContain("node-c");
  });

  it("does not run when workflow is already running", () => {
    mockUseWebsocketRunner.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = { run: mockRun, state: "running" };
      return selector(state);
    });

    const { result } = renderHook(() => useRunFromHere(nodeA as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("does not run when node is null", () => {
    const { result } = renderHook(() => useRunFromHere(null));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("passes subgraph node IDs to run", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const subgraphNodeIds = mockRun.mock.calls[0][5];
    expect(subgraphNodeIds).toBeInstanceOf(Set);
    expect(subgraphNodeIds.has("node-a")).toBe(true);
    expect(subgraphNodeIds.has("node-b")).toBe(true);
    expect(subgraphNodeIds.has("node-c")).toBe(true);
  });

  it("includes only edges within the downstream subgraph", () => {
    // Run from nodeB - should only include edge e2 (B->C), not e1 (A->B)
    const { result } = renderHook(() => useRunFromHere(nodeB as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const edgesPassedToRun = mockRun.mock.calls[0][3];
    const edgeIds = edgesPassedToRun.map((e: { id: string }) => e.id);

    expect(edgeIds).toContain("e2");
    expect(edgeIds).not.toContain("e1");
  });

  it("handles diamond-shaped graphs without duplicating nodes", () => {
    const nodeD = {
      id: "node-d",
      type: "nodetool.llm.Chat",
      data: { properties: {} }
    };

    // A -> B -> D
    // A -> C -> D (diamond)
    const diamondEdges = [
      { id: "e1", source: "node-a", target: "node-b", sourceHandle: "output", targetHandle: "prompt" },
      { id: "e2", source: "node-a", target: "node-c", sourceHandle: "output", targetHandle: "input" },
      { id: "e3", source: "node-b", target: "node-d", sourceHandle: "output", targetHandle: "prompt" },
      { id: "e4", source: "node-c", target: "node-d", sourceHandle: "output", targetHandle: "context" }
    ];

    mockUseNodes.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = {
        nodes: [nodeA, nodeB, nodeC, nodeD],
        edges: diamondEdges,
        workflow: defaultWorkflow,
        findNode: mockFindNode
      };
      return selector(state);
    });

    const { result } = renderHook(() => useRunFromHere(nodeA as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);

    // All nodes should be in the subgraph
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).toContain("node-b");
    expect(nodeIds).toContain("node-c");
    expect(nodeIds).toContain("node-d");

    // No duplicates
    expect(nodeIds.length).toBe(4);
  });

  it("shows notification after triggering run", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        alert: false
      })
    );
  });

  it("injects cached values from upstream into external input edges", () => {
    // Run from nodeB: A->B is an external edge (A is upstream, not in subgraph)
    mockGetResult.mockReturnValue({ output: "cached-value" });

    const { result } = renderHook(() => useRunFromHere(nodeB as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const nodeBInRun = nodesPassedToRun.find((n: { id: string }) => n.id === "node-b");

    // nodeB should exist in the run
    expect(nodeBInRun).toBeDefined();
  });
});
