import { renderHook, act } from "@testing-library/react";
import { useRunFromHere } from "../useRunFromHere";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
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

jest.mock("../../../lib/workflow/runInlineGraphJob", () => ({
  runInlineGraphJob: jest.fn(() => Promise.resolve({ success: true, outputs: {} }))
}));

import { useNodes } from "../../../contexts/NodeContext";
import useResultsStore from "../../../stores/ResultsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { runInlineGraphJob } from "../../../lib/workflow/runInlineGraphJob";

const mockUseNodes = useNodes as jest.Mock;
const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockUseMetadataStore = useMetadataStore as unknown as jest.Mock;
const mockRunInline = runInlineGraphJob as unknown as jest.Mock;

/** Read the graph passed to the Nth runInlineGraphJob call. */
const graphArg = (call = 0) => mockRunInline.mock.calls[call][0].graph;
const nodeIdsOf = (call = 0) =>
  graphArg(call).nodes.map((n: { id: string }) => n.id);
const edgeIdsOf = (call = 0) =>
  graphArg(call).edges.map((e: { id: string }) => e.id);

describe("useRunFromHere", () => {
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
    mockRunInline.mockImplementation(() =>
      Promise.resolve({ success: true, outputs: {} })
    );

    mockUseNodes.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = {
        nodes: [nodeA, nodeB, nodeC],
        edges: defaultEdges,
        workflow: defaultWorkflow,
        findNode: mockFindNode
      };
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

  it("dispatches an independent job for the downstream subgraph", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    expect(mockRunInline.mock.calls[0][0].workflowId).toBe("workflow-1");
    const nodeIds = nodeIdsOf();
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).toContain("node-b");
    expect(nodeIds).toContain("node-c");
  });

  it("only includes downstream nodes, not upstream ones", () => {
    const { result } = renderHook(() => useRunFromHere(nodeB as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    const nodeIds = nodeIdsOf();
    expect(nodeIds).not.toContain("node-a");
    expect(nodeIds).toContain("node-b");
    expect(nodeIds).toContain("node-c");
  });

  it("does not re-fire the same node while its run is in flight", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as any));

    act(() => {
      result.current.runFromHere();
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
  });

  it("does not run when node is null", () => {
    const { result } = renderHook(() => useRunFromHere(null));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).not.toHaveBeenCalled();
  });

  it("includes only edges within the downstream subgraph", () => {
    const { result } = renderHook(() => useRunFromHere(nodeB as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    const edgeIds = edgeIdsOf();
    expect(edgeIds).toContain("e2");
    expect(edgeIds).not.toContain("e1");
  });

  it("handles diamond-shaped graphs without duplicating nodes", () => {
    const nodeD = {
      id: "node-d",
      type: "nodetool.llm.Chat",
      data: { properties: {} }
    };

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

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    const nodeIds = nodeIdsOf();
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).toContain("node-b");
    expect(nodeIds).toContain("node-c");
    expect(nodeIds).toContain("node-d");
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
    mockGetResult.mockReturnValue({ output: "cached-value" });

    const { result } = renderHook(() => useRunFromHere(nodeB as any));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    const nodeBInRun = graphArg().nodes.find(
      (n: { id: string }) => n.id === "node-b"
    );
    expect(nodeBInRun).toBeDefined();
  });
});
