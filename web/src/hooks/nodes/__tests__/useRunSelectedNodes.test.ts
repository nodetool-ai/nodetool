import { renderHook, act } from "@testing-library/react";
import { useRunSelectedNodes } from "../useRunSelectedNodes";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodeStoreRef: jest.fn()
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn(),
  getWorkflowRunnerStore: jest.fn()
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn()
}));

jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: { getState: jest.fn(() => ({ getMetadata: () => undefined })) }
}));

// getNodeGenerations is passed to the resolver, which is itself mocked below, so
// the accessor is never actually consulted on this path. Stub it so the import
// resolves.
jest.mock("../../../stores/nodeGenerationAccessor", () => ({
  getNodeGenerations: jest.fn(() => [])
}));

// The shared run-resolver is the unit boundary: these tests drive the hook's
// classify/reuse/replay/block WIRING by configuring decide/reuseValue/
// replayValues/nodeTitle directly. The resolver's own freshness/classification
// logic is covered by runResolver.test.ts / runResolve.test.ts.
jest.mock("../../../utils/runResolver", () => ({
  createRunResolver: jest.fn()
}));

import { useNodeStoreRef } from "../../../contexts/NodeContext";
import useMetadataStore from "../../../stores/MetadataStore";
import {
  useWebsocketRunner,
  getWorkflowRunnerStore
} from "../../../stores/WorkflowRunner";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { createRunResolver } from "../../../utils/runResolver";

const mockUseNodeStoreRef = useNodeStoreRef as jest.Mock;
const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;
const mockGetWorkflowRunnerStore = getWorkflowRunnerStore as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockMetadataGetState = (
  useMetadataStore as unknown as { getState: jest.Mock }
).getState;
const mockCreateRunResolver = createRunResolver as jest.Mock;

type RunnerState = {
  state: "idle" | "running" | "error" | "cancelled" | "connecting";
};

// Minimal stand-in for the Zustand runner store's `.subscribe`. Tests can
// invoke `emit(...)` to simulate a transition between runs.
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
  const mockAddNotification = jest.fn();
  const mockGetSelectedNodes = jest.fn();

  // Resolver surface — reconfigured per test.
  let mockDecide: jest.Mock;
  let mockReuseValue: jest.Mock;
  let mockReplayValues: jest.Mock;
  let mockNodeTitle: jest.Mock;

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
    {
      id: "e1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "output",
      targetHandle: "prompt"
    },
    {
      id: "e2",
      source: "node-b",
      target: "node-c",
      sourceHandle: "output",
      targetHandle: "value"
    }
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

    mockUseWebsocketRunner.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) => {
        const state = { run: mockRun, state: "idle" };
        return selector(state);
      }
    );

    mockUseNotificationStore.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) => {
        const state = { addNotification: mockAddNotification };
        return selector(state);
      }
    );

    mockFindNode.mockImplementation((id: string) =>
      [nodeA, nodeB, nodeC].find((n) => n.id === id)
    );

    // Default resolver: an external input that isn't explicitly configured
    // resolves to a reuse with no value (which the hook treats as blocked). The
    // default-graph tests below have no external inbound edges, so decide is
    // never called there.
    mockDecide = jest.fn(() => "reuse");
    mockReuseValue = jest.fn(() => ({ value: undefined, hasValue: false }));
    mockReplayValues = jest.fn(() => []);
    mockNodeTitle = jest.fn((id: string) => id);
    mockCreateRunResolver.mockReturnValue({
      classify: jest.fn(() => "computed"),
      decide: mockDecide,
      reuseValue: mockReuseValue,
      replayValues: mockReplayValues,
      nodeTitle: mockNodeTitle,
      generations: jest.fn(() => [])
    });
  });

  // Helper: a selected target fed by a single NON-selected external source.
  const setupExternal = (
    targetHandle = "prompt"
  ): {
    source: { id: string; type: string };
    target: { id: string; type: string };
  } => {
    const source = {
      id: "src",
      type: "gen.Image",
      data: { properties: {} },
      selected: false
    };
    const target = {
      id: "tgt",
      type: "proc.Plain",
      data: { properties: {} },
      selected: true
    };
    const edges = [
      {
        id: "ext",
        source: "src",
        target: "tgt",
        sourceHandle: "output",
        targetHandle
      }
    ];
    mockGetSelectedNodes.mockReturnValue([target]);
    mockFindNode.mockImplementation((id: string) =>
      [source, target].find((n) => n.id === id)
    );
    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        nodes: [source, target],
        edges,
        workflow: defaultWorkflow,
        findNode: mockFindNode,
        getSelectedNodes: mockGetSelectedNodes
      })
    });
    return { source, target };
  };

  it("only includes selected nodes in the nodes passed to run", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];

    const nodeIds = nodesPassedToRun.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain("node-a");
    expect(nodeIds).not.toContain("node-b");
    expect(nodeIds).not.toContain("node-c");
  });

  it("does not include downstream nodes when running selected nodes", async () => {
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

  it("runs a pure selection (no external inputs) unchanged", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    // No external inbound edges → resolver is never consulted, run proceeds.
    expect(mockDecide).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info", alert: false })
    );
  });

  it("does not run when workflow is already running", async () => {
    mockUseWebsocketRunner.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) => {
        const state = { run: mockRun, state: "running" };
        return selector(state);
      }
    );

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

    const edges = [
      {
        id: "e1",
        source: "node-a",
        target: "node-b",
        sourceHandle: "output",
        targetHandle: "prompt"
      },
      {
        id: "e3",
        source: "node-d",
        target: "node-b",
        sourceHandle: "output",
        targetHandle: "context"
      },
      {
        id: "e2",
        source: "node-b",
        target: "node-c",
        sourceHandle: "output",
        targetHandle: "value"
      }
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

    expect(nodeIds).toContain("node-a");
    expect(nodeIds).toContain("node-d");
    expect(nodeIds).not.toContain("node-b");
    expect(nodeIds).not.toContain("node-c");
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

  it("passes FULL-graph inputSignatures to run so Run-selected outputs stamp for reuse", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    await act(async () => {
      await result.current.runSelectedNodes();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const selectedNodeIds: Set<string> = mockRun.mock.calls[0][5];
    const inputSignatures = mockRun.mock.calls[0][7];
    // run() must receive an explicit full-graph signature map; without it,
    // WorkflowRunner.run falls back to hashing the PRUNED subgraph and the
    // stamps never match a later resolve() reuse lookup.
    expect(inputSignatures).toBeDefined();
    for (const id of selectedNodeIds) {
      expect(typeof inputSignatures[id]).toBe("string");
    }
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
      await Promise.resolve();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);

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

    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("clamps runs to the supported range [1, 32]", async () => {
    const { result } = renderHook(() => useRunSelectedNodes());

    let sequence: Promise<void> | undefined;
    await act(async () => {
      sequence = result.current.runSelectedNodes(999);
      await Promise.resolve();
    });

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

  describe("reusable external inputs are inlined", () => {
    // All three kinds resolve to "reuse" + a value at the hook boundary; the
    // kind distinction lives inside the resolver (mocked here).
    it.each([
      ["constant", "const-value"],
      ["generative", { type: "image", uri: "gen.png" }],
      ["computed", 42]
    ])(
      "inlines a fresh %s external input into the target override",
      async (_kind, value) => {
        setupExternal("prompt");
        mockDecide.mockReturnValue("reuse");
        mockReuseValue.mockReturnValue({ value, hasValue: true });

        const { result } = renderHook(() => useRunSelectedNodes());
        await act(async () => {
          await result.current.runSelectedNodes();
        });

        expect(mockRun).toHaveBeenCalledTimes(1);
        const nodesPassedToRun = mockRun.mock.calls[0][2];
        const tgt = nodesPassedToRun.find((n: { id: string }) => n.id === "tgt");
        expect(tgt.data.properties.prompt).toEqual(value);
        // No warning, only the info "running" notification.
        expect(mockAddNotification).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: "warning" })
        );
      }
    );

    it("aggregates multiple reusable external edges into a list[image] handle", async () => {
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
        {
          id: "ei1",
          source: "img-1",
          target: "node-f",
          sourceHandle: "output",
          targetHandle: "images"
        },
        {
          id: "ei2",
          source: "img-2",
          target: "node-f",
          sourceHandle: "output",
          targetHandle: "images"
        }
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

      mockDecide.mockReturnValue("reuse");
      mockReuseValue.mockImplementation(
        (_source: string, edge: { source: string }) => ({
          value: {
            type: "image",
            uri: edge.source === "img-1" ? "a.png" : "b.png"
          },
          hasValue: true
        })
      );

      // `images` is a list[image] (collect) handle.
      mockMetadataGetState.mockReturnValue({
        getMetadata: (type: string) =>
          type === "fal.image_to_image.IdeogramV3Edit"
            ? {
                properties: [
                  {
                    name: "images",
                    type: {
                      type: "list",
                      type_args: [{ type: "image", type_args: [] }]
                    }
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
      const fal = nodesPassedToRun.find(
        (n: { id: string }) => n.id === "node-f"
      );
      expect(fal.data.properties.images).toEqual([
        { type: "image", uri: "a.png" },
        { type: "image", uri: "b.png" }
      ]);
    });
  });

  describe("non-reusable external inputs block the run", () => {
    it("blocks and aborts when an external computed input is stale/uncached (decide → run)", async () => {
      setupExternal("prompt");
      mockDecide.mockReturnValue("run");
      mockNodeTitle.mockReturnValue("Upstream Calc");

      const { result } = renderHook(() => useRunSelectedNodes());
      await act(async () => {
        await result.current.runSelectedNodes();
      });

      expect(mockRun).not.toHaveBeenCalled();
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning",
          alert: true,
          content: expect.stringContaining("Upstream Calc")
        })
      );
    });

    it("blocks and aborts when an external generative input is uncached (decide → block)", async () => {
      setupExternal("prompt");
      mockDecide.mockReturnValue("block");
      mockNodeTitle.mockReturnValue("Image Generator");

      const { result } = renderHook(() => useRunSelectedNodes());
      await act(async () => {
        await result.current.runSelectedNodes();
      });

      expect(mockRun).not.toHaveBeenCalled();
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning",
          alert: true,
          content: expect.stringContaining("Image Generator")
        })
      );
    });

    it("blocks when a reused external input has no value (constant with undefined value)", async () => {
      setupExternal("prompt");
      mockDecide.mockReturnValue("reuse");
      mockReuseValue.mockReturnValue({ value: undefined, hasValue: false });
      mockNodeTitle.mockReturnValue("Empty Constant");

      const { result } = renderHook(() => useRunSelectedNodes());
      await act(async () => {
        await result.current.runSelectedNodes();
      });

      expect(mockRun).not.toHaveBeenCalled();
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning",
          content: expect.stringContaining("Empty Constant")
        })
      );
    });

    it("dedupes a blocked source feeding two handles into one warning entry", async () => {
      const source = {
        id: "src",
        type: "gen.Image",
        data: { properties: {} },
        selected: false
      };
      const target = {
        id: "tgt",
        type: "proc.Plain",
        data: { properties: {} },
        selected: true
      };
      const edges = [
        {
          id: "ext1",
          source: "src",
          target: "tgt",
          sourceHandle: "output",
          targetHandle: "a"
        },
        {
          id: "ext2",
          source: "src",
          target: "tgt",
          sourceHandle: "output",
          targetHandle: "b"
        }
      ];
      mockGetSelectedNodes.mockReturnValue([target]);
      mockFindNode.mockImplementation((id: string) =>
        [source, target].find((n) => n.id === id)
      );
      mockUseNodeStoreRef.mockReturnValue({
        getState: () => ({
          nodes: [source, target],
          edges,
          workflow: defaultWorkflow,
          findNode: mockFindNode,
          getSelectedNodes: mockGetSelectedNodes
        })
      });
      mockDecide.mockReturnValue("block");
      mockNodeTitle.mockReturnValue("Gen Source");

      const { result } = renderHook(() => useRunSelectedNodes());
      await act(async () => {
        await result.current.runSelectedNodes();
      });

      expect(mockRun).not.toHaveBeenCalled();
      const warning = mockAddNotification.mock.calls
        .map((c) => c[0])
        .find((n) => n.type === "warning");
      expect(warning).toBeDefined();
      const occurrences = warning.content.split("Gen Source").length - 1;
      expect(occurrences).toBe(1);
    });
  });

  describe("multi-select ForEach replay injection", () => {
    const selectedValues = [
      { uri: "a.png", type: "image" },
      { uri: "b.png", type: "image" }
    ];

    const setup = (targetHandle: string): void => {
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
      mockDecide.mockReturnValue("replay");
      mockReplayValues.mockImplementation((src: string) =>
        src === "gen-x" ? selectedValues : []
      );
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
