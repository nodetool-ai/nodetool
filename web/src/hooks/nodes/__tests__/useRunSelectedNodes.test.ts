import { renderHook, act } from "@testing-library/react";
import { useRunSelectedNodes } from "../useRunSelectedNodes";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodeStoreRef: jest.fn()
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn(),
  getWorkflowRunnerStore: jest.fn()
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
  default: { getState: jest.fn(() => ({ getMetadata: () => undefined })) }
}));

jest.mock("../../../utils/edgeValue", () => ({
  resolveExternalEdgeValue: jest.fn(() => ({
    value: undefined,
    hasValue: false,
    isFallback: false
  }))
}));

// Multi-select stream source. getNodeGenerations is unused on this path (the
// hook resolves the value list through getNodeSelectedOutputs); default the
// selection to "none" so the existing single-selection tests are untouched.
jest.mock("../../../stores/nodeGenerationAccessor", () => ({
  getNodeGenerations: jest.fn(() => []),
  getNodeSelectedOutputs: jest.fn(() => undefined)
}));


import { useNodeStoreRef } from "../../../contexts/NodeContext";
import useMetadataStore from "../../../stores/MetadataStore";
import { resolveExternalEdgeValue } from "../../../utils/edgeValue";
import {
  useWebsocketRunner,
  getWorkflowRunnerStore
} from "../../../stores/WorkflowRunner";
import useResultsStore from "../../../stores/ResultsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { getNodeSelectedOutputs } from "../../../stores/nodeGenerationAccessor";

const mockUseNodeStoreRef = useNodeStoreRef as jest.Mock;
const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;
const mockGetWorkflowRunnerStore = getWorkflowRunnerStore as jest.Mock;
const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockMetadataGetState = (useMetadataStore as unknown as { getState: jest.Mock }).getState;
const mockResolveExternalEdgeValue = resolveExternalEdgeValue as jest.Mock;
const mockGetNodeSelectedOutputs = getNodeSelectedOutputs as jest.Mock;

type RunnerState = {
  state: "idle" | "running" | "error" | "cancelled" | "connecting";
};

// Minimal stand-in for the Zustand runner store's `.subscribe`. Tests can
// invoke `emitState(...)` to simulate a transition between runs.
function makeRunnerStoreMock() {
  const listeners = new Set<(s: RunnerState) => void>();
  return {
    subscribe: (cb: (s: RunnerState) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: (s: RunnerState) => {
      listeners.forEach((cb) => cb(s));
    }
  };
}

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
  let runnerStore: ReturnType<typeof makeRunnerStoreMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRun.mockResolvedValue(undefined);
    runnerStore = makeRunnerStoreMock();
    mockGetWorkflowRunnerStore.mockReturnValue(runnerStore);

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

    // Default: no source has a multi-select set (single-selection behavior).
    mockGetNodeSelectedOutputs.mockReturnValue(undefined);
  });

  it("only includes selected nodes in the nodes passed to run", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];

    // Only the selected node (nodeA) must be included, not downstream nodes
    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).not.toContain("node-b");
    expect(nodeIds).not.toContain("node-c");
  });

  it("does not include downstream nodes when running selected nodes", async () => {
    // nodeA is selected, nodeB and nodeC are downstream but not selected
    mockGetSelectedNodes.mockReturnValue([nodeA]);

    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);

    expect(nodeIds).toEqual(["node-a"]);
    expect(nodeIds).not.toContain("node-b");
    expect(nodeIds).not.toContain("node-c");
  });

  it("does not run when workflow is already running", async () => {
    mockUseWebsocketRunner.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
      const state = { run: mockRun, state: "running" };
      return selector(state);
    });

    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("does not run when no nodes are selected", async () => {
    mockGetSelectedNodes.mockReturnValue([]);

    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("handles multiple selected nodes without duplicating shared downstream nodes", async () => {
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

    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);

    // Only selected nodes (nodeA and nodeD) should be present, not downstream nodeB and nodeC
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).toContain("node-d");
    expect(nodeIds).not.toContain("node-b");
    expect(nodeIds).not.toContain("node-c");

    // No duplicates
    expect(nodeIds.length).toBe(2);
  });

  it("passes selectedNodeIds to run", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const selectedNodeIds = mockRun.mock.calls[0][5];
    expect(selectedNodeIds).toBeInstanceOf(Set);
    expect(selectedNodeIds.has("node-a")).toBe(true);
    expect(selectedNodeIds.has("node-b")).toBe(false);
    expect(selectedNodeIds.has("node-c")).toBe(false);
  });

  it("shows notification after triggering run", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        alert: false
      })
    );
  });

  it("runs the subgraph N times sequentially when given runs > 1", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    let sequence: Promise<void> | undefined;
    await act(async () => {
      sequence = result.current.runSelectedNodes(3);
      // First run fires immediately; later runs await idle transitions.
      await Promise.resolve();
    });

    // After the first dispatch, the hook is awaiting the runner to settle.
    expect(mockRun).toHaveBeenCalledTimes(1);

    // Simulate the runner going idle between each run.
    await act(async () => {
      runnerStore.emit({ state: "idle" });
      await Promise.resolve();
    });
    expect(mockRun).toHaveBeenCalledTimes(2);

    await act(async () => {
      runnerStore.emit({ state: "idle" });
      await sequence;
    });
    expect(mockRun).toHaveBeenCalledTimes(3);
  });

  it("stops the sequence when the runner reports an error mid-sequence", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    let sequence: Promise<void> | undefined;
    await act(async () => {
      sequence = result.current.runSelectedNodes(4);
      await Promise.resolve();
    });
    expect(mockRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      runnerStore.emit({ state: "error" });
      await sequence;
    });

    // Only the first run was dispatched; the sequence broke on error.
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("aggregates multiple external edges into a list[image] handle instead of last-write-wins", async () => {
    const falNode = {
      id: "node-f",
      type: "fal.image_to_image.IdeogramV3Edit",
      data: { properties: { images: [] } },
      selected: true
    };
    const img1 = {
      id: "img-1",
      type: "nodetool.constant.Image",
      data: { properties: {} },
      selected: false
    };
    const img2 = {
      id: "img-2",
      type: "nodetool.constant.Image",
      data: { properties: {} },
      selected: false
    };
    const edges = [
      { id: "ei1", source: "img-1", target: "node-f", sourceHandle: "output", targetHandle: "images" },
      { id: "ei2", source: "img-2", target: "node-f", sourceHandle: "output", targetHandle: "images" }
    ];

    mockGetSelectedNodes.mockReturnValue([falNode]);
    mockFindNode.mockImplementation((id: string) =>
      [falNode, img1, img2].find((n) => n.id === id)
    );
    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        nodes: [falNode, img1, img2],
        edges,
        workflow: defaultWorkflow,
        findNode: mockFindNode,
        getSelectedNodes: mockGetSelectedNodes
      })
    });

    // Each upstream edge resolves to a distinct image ref.
    mockResolveExternalEdgeValue.mockImplementation((edge: { source: string }) => ({
      value: { type: "image", uri: edge.source === "img-1" ? "a.png" : "b.png" },
      hasValue: true,
      isFallback: false
    }));

    // `images` is a list[image] (collect) handle.
    mockMetadataGetState.mockReturnValue({
      getMetadata: (type: string) =>
        type === "fal.image_to_image.IdeogramV3Edit"
          ? {
              properties: [
                {
                  name: "images",
                  type: { type: "list", type_args: [{ type: "image", type_args: [] }] }
                }
              ]
            }
          : undefined
    });

    const { result } = renderHook(() => useRunSelectedNodes());
    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const fal = nodesPassedToRun.find((n: { id: string }) => n.id === "node-f");
    expect(fal.data.properties.images).toEqual([
      { type: "image", uri: "a.png" },
      { type: "image", uri: "b.png" }
    ]);
  });

  it("clamps runs to the supported range [1, 32]", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    let sequence: Promise<void> | undefined;
    await act(async () => {
      sequence = result.current.runSelectedNodes(999);
      await Promise.resolve();
    });

    // Drain 31 transitions to complete the 32-run sequence (the 32nd run
    // does not await an idle since it's the last iteration).
    for (let i = 0; i < 31; i++) {
      await act(async () => {
        runnerStore.emit({ state: "idle" });
        await Promise.resolve();
      });
    }
    await act(async () => {
      await sequence;
    });

    expect(mockRun).toHaveBeenCalledTimes(32);
  });

  describe("multi-select ForEach replay injection", () => {
    const selectedValues = [
      { uri: "a.png", type: "image" },
      { uri: "b.png", type: "image" }
    ];

    // A selected target node fed by a NON-selected external multi-select source.
    const setup = (targetHandle: string): { genX: { id: string } } => {
      const genX = {
        id: "gen-x",
        type: "gen.Image",
        data: { properties: {} },
        selected: false
      };
      const target = {
        id: "node-t",
        type: "proc.Plain",
        data: { properties: {} },
        selected: true
      };
      const edges = [
        {
          id: "ext",
          source: "gen-x",
          target: "node-t",
          sourceHandle: "output",
          targetHandle
        }
      ];
      mockGetSelectedNodes.mockReturnValue([target]);
      mockFindNode.mockImplementation((id: string) =>
        [genX, target].find((n) => n.id === id)
      );
      mockUseNodeStoreRef.mockReturnValue({
        getState: () => ({
          nodes: [genX, target],
          edges,
          workflow: defaultWorkflow,
          findNode: mockFindNode,
          getSelectedNodes: mockGetSelectedNodes
        })
      });
      // The source has 2+ selected generations → the value list to stream.
      mockGetNodeSelectedOutputs.mockImplementation(
        (_wf: string, src: string) =>
          src === "gen-x" ? selectedValues : undefined
      );
      return { genX };
    };

    const expectForEachInjected = (targetHandle: string): void => {
      expect(mockRun).toHaveBeenCalledTimes(1);
      const nodesPassedToRun = mockRun.mock.calls[0][2];
      const edgesPassedToRun = mockRun.mock.calls[0][3];

      const replay = nodesPassedToRun.find(
        (n: { type?: string }) => n.type === "nodetool.control.ForEach"
      );
      expect(replay).toBeDefined();
      expect(replay.data.properties.input_list).toEqual(selectedValues);

      const replayEdge = edgesPassedToRun.find(
        (e: { source: string }) => e.source === replay.id
      );
      expect(replayEdge).toBeDefined();
      expect(replayEdge.sourceHandle).toBe("output");
      expect(replayEdge.target).toBe("node-t");
      expect(replayEdge.targetHandle).toBe(targetHandle);

      // The multi-select source is pruned: never streamed as a static override
      // and not part of the run node set (it isn't selected).
      const target = nodesPassedToRun.find(
        (n: { id: string }) => n.id === "node-t"
      );
      expect(target.data.properties[targetHandle]).toBeUndefined();
      expect(
        nodesPassedToRun.some((n: { id: string }) => n.id === "gen-x")
      ).toBe(false);
    };

    it("injects a ForEach replay into a LIST target handle", async () => {
      setup("tiles");
      const { result } = renderHook(() => useRunSelectedNodes());
      await act(async () => {
        await result.current.runSelectedNodes();
      });
      expectForEachInjected("tiles");
    });

    it("injects a ForEach replay into a SCALAR target handle too (no list gate)", async () => {
      setup("input");
      const { result } = renderHook(() => useRunSelectedNodes());
      await act(async () => {
        await result.current.runSelectedNodes();
      });
      expectForEachInjected("input");
    });
  });
});
