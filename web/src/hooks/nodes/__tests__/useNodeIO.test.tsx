import { renderHook } from "@testing-library/react";

import {
  useNodeOutput,
  useUpstreamValue,
  useUpstreamValues
} from "../useNodeIO";
import type { Generation } from "../../../utils/nodeGenerations";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// The hooks now resolve a node's generation timeline from two backings:
// the WorkflowAssetStore (durable assets) and ResultsStore.liveGenerations
// (in-memory live buffer), plus NodeContext for edges + selection. The tests
// drive the live buffer directly (a single completed generation per node is
// the common case) so they exercise the merge + outputOf resolution that
// useNodeGenerations performs.

let mockEdges: Array<{
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
}> = [];

// node_id -> live generations for that node (keyed by node id; the store keys
// by `${workflowId}:${nodeId}` and the mock mirrors that).
let mockLiveGenerations: Record<string, Generation[]> = {};

const mockNodes: Record<
  string,
  {
    id: string;
    type?: string;
    data: {
      properties: Record<string, unknown>;
      selected_generation?: string;
    };
  }
> = {};

const WF = "wf";

const gen = (
  id: string,
  outputs: Record<string, unknown>,
  createdAt = 1
): Generation => ({
  id,
  jobId: id,
  createdAt,
  outputs,
  status: "completed"
});

const setMockState = (
  edges: typeof mockEdges,
  liveByNode: Record<string, Generation[]> = {},
  nodes: typeof mockNodes = {}
) => {
  mockEdges = edges;
  mockLiveGenerations = {};
  for (const [nodeId, gens] of Object.entries(liveByNode)) {
    mockLiveGenerations[`${WF}:${nodeId}`] = gens;
  }
  for (const key of Object.keys(mockNodes)) {
    delete mockNodes[key];
  }
  Object.assign(mockNodes, nodes);
};

jest.mock("../../../contexts/NodeContext", () => ({
  __esModule: true,
  useNodes: (selector: (state: unknown) => unknown) =>
    selector({
      edges: mockEdges,
      findNode: (id: string) => mockNodes[id],
      updateNodeData: () => undefined
    })
}));

jest.mock("../../../stores/WorkflowAssetStore", () => ({
  __esModule: true,
  useWorkflowAssetStore: (selector: (state: unknown) => unknown) =>
    selector({ assetsByWorkflow: {} })
}));

jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ liveGenerations: mockLiveGenerations })
}));

// ---------------------------------------------------------------------------
// useNodeOutput
// ---------------------------------------------------------------------------

describe("useNodeOutput", () => {
  it("returns undefined when the node has no generation", () => {
    setMockState([]);
    const { result } = renderHook(() => useNodeOutput(WF, "n1"));
    expect(result.current).toBeUndefined();
  });

  it("returns the current generation's sole output value", () => {
    setMockState([], { n1: [gen("g1", { output: { uri: "image.png" } })] });
    const { result } = renderHook(() => useNodeOutput(WF, "n1"));
    expect(result.current).toEqual({ uri: "image.png" });
  });

  it("defaults to the latest generation when none is selected", () => {
    setMockState([], {
      n1: [
        gen("g1", { output: { uri: "old.png" } }, 1),
        gen("g2", { output: { uri: "new.png" } }, 2)
      ]
    });
    const { result } = renderHook(() => useNodeOutput(WF, "n1"));
    expect(result.current).toEqual({ uri: "new.png" });
  });

  it("honors the node's persisted selected_generation", () => {
    setMockState(
      [],
      {
        n1: [
          gen("g1", { output: { uri: "old.png" } }, 1),
          gen("g2", { output: { uri: "new.png" } }, 2)
        ]
      },
      {
        n1: {
          id: "n1",
          data: { properties: {}, selected_generation: "g1" }
        }
      }
    );
    const { result } = renderHook(() => useNodeOutput(WF, "n1"));
    expect(result.current).toEqual({ uri: "old.png" });
  });
});

// ---------------------------------------------------------------------------
// useUpstreamValue
// ---------------------------------------------------------------------------

describe("useUpstreamValue", () => {
  it("returns the constant fallback when no edge feeds the input", () => {
    setMockState([]);
    const { result } = renderHook(() =>
      useUpstreamValue(WF, "blur", "image", { uri: "const.png" })
    );
    expect(result.current).toEqual({ uri: "const.png" });
  });

  it("returns the wired upstream value, unwrapped by sourceHandle", () => {
    setMockState(
      [
        {
          source: "load",
          sourceHandle: "output",
          target: "blur",
          targetHandle: "image"
        }
      ],
      { load: [gen("g1", { output: { uri: "from-load.png" } })] }
    );
    const { result } = renderHook(() =>
      useUpstreamValue(WF, "blur", "image", { uri: "const.png" })
    );
    expect(result.current).toEqual({ uri: "from-load.png" });
  });

  it("matches edges with a null targetHandle to the empty input name", () => {
    setMockState(
      [{ source: "load", sourceHandle: null, target: "x", targetHandle: null }],
      { load: [gen("g1", { output: { uri: "p.png" } })] }
    );
    const { result } = renderHook(() =>
      useUpstreamValue(WF, "x", "", "fallback")
    );
    expect(result.current).toEqual({ uri: "p.png" });
  });

  it("switches the resolved upstream value when the current generation changes", () => {
    setMockState(
      [
        {
          source: "load",
          sourceHandle: "output",
          target: "blur",
          targetHandle: "image"
        }
      ],
      {
        load: [
          gen("g1", { output: { uri: "first.png" } }, 1),
          gen("g2", { output: { uri: "latest.png" } }, 2)
        ]
      }
    );
    const { result } = renderHook(() =>
      useUpstreamValue(WF, "blur", "image", undefined)
    );
    // Defaults to latest generation.
    expect(result.current).toEqual({ uri: "latest.png" });

    // Pin the upstream to its earlier generation; the resolved value follows.
    setMockState(
      [
        {
          source: "load",
          sourceHandle: "output",
          target: "blur",
          targetHandle: "image"
        }
      ],
      {
        load: [
          gen("g1", { output: { uri: "first.png" } }, 1),
          gen("g2", { output: { uri: "latest.png" } }, 2)
        ]
      },
      {
        load: {
          id: "load",
          data: { properties: {}, selected_generation: "g1" }
        }
      }
    );
    const { result: pinned } = renderHook(() =>
      useUpstreamValue(WF, "blur", "image", undefined)
    );
    expect(pinned.current).toEqual({ uri: "first.png" });
  });

  it("falls back to a literal source node's property when wired but not run", () => {
    setMockState(
      [
        {
          source: "const-img",
          sourceHandle: "output",
          target: "painter",
          targetHandle: "image"
        }
      ],
      {},
      {
        "const-img": {
          id: "const-img",
          type: "nodetool.constant.Image",
          data: {
            properties: {
              value: { uri: "asset://img-1", type: "image" }
            }
          }
        }
      }
    );
    const { result } = renderHook(() =>
      useUpstreamValue(WF, "painter", "image", { uri: "local.png" })
    );
    expect(result.current).toEqual({ uri: "asset://img-1", type: "image" });
  });
});

// ---------------------------------------------------------------------------
// useUpstreamValues — the multi-input resolver behind the Compositor's
// dynamic `image_N` layers.
// ---------------------------------------------------------------------------

describe("useUpstreamValues", () => {
  it("resolves several inputs at once, keyed by input name", () => {
    setMockState(
      [
        {
          source: "a",
          sourceHandle: "output",
          target: "comp",
          targetHandle: "image_0"
        },
        {
          source: "b",
          sourceHandle: "output",
          target: "comp",
          targetHandle: "image_1"
        }
      ],
      {
        a: [gen("ga", { output: { uri: "a.png" } })],
        b: [gen("gb", { output: { uri: "b.png" } })]
      }
    );
    const { result } = renderHook(() =>
      useUpstreamValues(WF, "comp", ["image_0", "image_1"])
    );
    expect(result.current).toEqual({
      image_0: { uri: "a.png" },
      image_1: { uri: "b.png" }
    });
  });

  it("picks the latest generation when the upstream has several", () => {
    setMockState(
      [
        {
          source: "load",
          sourceHandle: "output",
          target: "comp",
          targetHandle: "image_0"
        }
      ],
      {
        load: [
          gen("g1", { output: { uri: "old.png" } }, 1),
          gen("g2", { output: { uri: "new.png" } }, 2)
        ]
      }
    );
    const { result } = renderHook(() =>
      useUpstreamValues(WF, "comp", ["image_0"])
    );
    expect(result.current).toEqual({ image_0: { uri: "new.png" } });
  });

  it("falls back to the per-input constant when no edge feeds an input", () => {
    setMockState([]);
    const { result } = renderHook(() =>
      useUpstreamValues(WF, "comp", ["image_0", "image_1"], {
        image_0: { uri: "const0.png" }
      })
    );
    expect(result.current).toEqual({
      image_0: { uri: "const0.png" },
      image_1: undefined
    });
  });

  it("falls back to a literal source node's property when wired but not run", () => {
    setMockState(
      [
        {
          source: "const-img",
          sourceHandle: "output",
          target: "comp",
          targetHandle: "image_0"
        }
      ],
      {},
      {
        "const-img": {
          id: "const-img",
          type: "nodetool.constant.Image",
          data: { properties: { value: { uri: "asset://img-1" } } }
        }
      }
    );
    const { result } = renderHook(() =>
      useUpstreamValues(WF, "comp", ["image_0"])
    );
    expect(result.current).toEqual({ image_0: { uri: "asset://img-1" } });
  });
});
