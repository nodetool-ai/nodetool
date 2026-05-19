import React from "react";
import { renderHook } from "@testing-library/react";

import { useNodeOutput, useUpstreamValue } from "../useNodeIO";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// The hooks read from two stores: NodeStore (via NodeContext, for edges) and
// ResultsStore (for outputs / previews). The simplest test setup mocks each
// store hook so we can drive selectors with hand-rolled state objects.

let mockEdges: Array<{
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
}> = [];

let mockStores: {
  outputResults: Record<string, unknown>;
  results: Record<string, unknown>;
  previews: Record<string, unknown>;
} = { outputResults: {}, results: {}, previews: {} };

const setMockState = (
  edges: typeof mockEdges,
  stores: Partial<typeof mockStores> = {},
  nodes: typeof mockNodes = {}
) => {
  mockEdges = edges;
  mockStores = {
    outputResults: stores.outputResults ?? {},
    results: stores.results ?? {},
    previews: stores.previews ?? {}
  };
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
      findNode: (id: string) => mockNodes[id]
    })
}));

const mockNodes: Record<string, { id: string; type?: string; data: { properties: Record<string, unknown> } }> = {};

jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({
      getOutputResult: (_w: string, n: string) => mockStores.outputResults[n],
      getResult: (_w: string, n: string) => mockStores.results[n],
      getPreview: (_w: string, n: string) => mockStores.previews[n]
    })
}));

// ---------------------------------------------------------------------------
// useNodeOutput
// ---------------------------------------------------------------------------

describe("useNodeOutput", () => {
  it("returns undefined when no value exists in any store", () => {
    setMockState([]);
    const { result } = renderHook(() => useNodeOutput("wf", "n1"));
    expect(result.current).toBeUndefined();
  });

  it("unwraps an { output } envelope from the results store", () => {
    setMockState([], {
      results: { n1: { output: { uri: "image.png" } } }
    });
    const { result } = renderHook(() => useNodeOutput("wf", "n1"));
    expect(result.current).toEqual({ uri: "image.png" });
  });

  it("prefers outputResults (bare value) over the results envelope", () => {
    setMockState([], {
      outputResults: { n1: { uri: "from-output.png" } },
      results: { n1: { output: { uri: "from-result.png" } } }
    });
    const { result } = renderHook(() => useNodeOutput("wf", "n1"));
    expect(result.current).toEqual({ uri: "from-output.png" });
  });

  it("returns the latest entry when outputResults is an accumulated array", () => {
    // setOutputResult uses append=true; after multiple runs the value is an
    // array of per-run outputs. We want the most recent one.
    setMockState([], {
      outputResults: {
        n1: [{ uri: "old.png" }, { uri: "new.png" }]
      }
    });
    const { result } = renderHook(() => useNodeOutput("wf", "n1"));
    expect(result.current).toEqual({ uri: "new.png" });
  });
});

// ---------------------------------------------------------------------------
// useUpstreamValue
// ---------------------------------------------------------------------------

describe("useUpstreamValue", () => {
  it("returns the constant fallback when no edge feeds the input", () => {
    setMockState([]);
    const { result } = renderHook(() =>
      useUpstreamValue("wf", "blur", "image", { uri: "const.png" })
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
      { results: { load: { output: { uri: "from-load.png" } } } }
    );
    const { result } = renderHook(() =>
      useUpstreamValue("wf", "blur", "image", { uri: "const.png" })
    );
    expect(result.current).toEqual({ uri: "from-load.png" });
  });

  it("matches edges with a null targetHandle to the empty input name", () => {
    setMockState(
      [{ source: "load", sourceHandle: null, target: "x", targetHandle: null }],
      { outputResults: { load: { uri: "p.png" } } }
    );
    const { result } = renderHook(() => useUpstreamValue("wf", "x", "", "fallback"));
    expect(result.current).toEqual({ uri: "p.png" });
  });

  it("picks the latest value when the upstream's outputResults accumulated", () => {
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
        outputResults: {
          load: [{ uri: "first.png" }, { uri: "latest.png" }]
        }
      }
    );
    const { result } = renderHook(() =>
      useUpstreamValue("wf", "blur", "image", undefined)
    );
    expect(result.current).toEqual({ uri: "latest.png" });
  });

  it("falls back to the constant value when wired upstream has no resolvable value", () => {
    setMockState([
      {
        source: "non-literal-upstream",
        sourceHandle: "output",
        target: "invert",
        targetHandle: "image"
      }
    ]);
    const fallback = { uri: "cached-input.png" };
    const { result } = renderHook(() =>
      useUpstreamValue("wf", "invert", "image", fallback)
    );
    expect(result.current).toEqual(fallback);
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
      useUpstreamValue("wf", "painter", "image", { uri: "local.png" })
    );
    expect(result.current).toEqual({ uri: "asset://img-1", type: "image" });
  });
});
