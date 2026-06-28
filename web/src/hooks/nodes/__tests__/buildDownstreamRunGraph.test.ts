import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../../../stores/NodeData";

jest.mock("../../../core/graph", () => ({ subgraph: jest.fn() }));
jest.mock("../../../stores/nodeGenerationAccessor", () => ({
  getNodeGenerations: jest.fn(() => []),
  getNodeSelectedOutputs: jest.fn(() => undefined)
}));

import {
  findExternalInputEdges,
  applyPropertyOverrides,
  browserRunnablePrefix,
  collectCachedValuesForSubgraph,
  buildDownstreamRunGraph
} from "../buildDownstreamRunGraph";
import { subgraph } from "../../../core/graph";
import { getNodeSelectedOutputs } from "../../../stores/nodeGenerationAccessor";

const mockSubgraph = subgraph as jest.Mock;
const mockGetNodeSelectedOutputs = getNodeSelectedOutputs as jest.Mock;

function mkNode(id: string, type = "nodetool.test.Node"): Node<NodeData> {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      dynamic_properties: {},
      selectable: true,
      workflow_id: "wf1"
    }
  };
}

function mkEdge(source: string, target: string, opts?: { sourceHandle?: string; targetHandle?: string }): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle: opts?.sourceHandle ?? "output",
    targetHandle: opts?.targetHandle ?? "input"
  };
}

describe("findExternalInputEdges", () => {
  it("returns edges whose target is in the subgraph but source is not", () => {
    const subgraphIds = new Set(["b", "c"]);
    const edges = [
      mkEdge("a", "b"),
      mkEdge("b", "c"),
      mkEdge("d", "c")
    ];
    const external = findExternalInputEdges(edges, subgraphIds);
    expect(external).toHaveLength(2);
    expect(external.map((e) => e.source).sort()).toEqual(["a", "d"]);
  });

  it("returns empty array when all edges are internal", () => {
    const subgraphIds = new Set(["a", "b", "c"]);
    const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
    expect(findExternalInputEdges(edges, subgraphIds)).toHaveLength(0);
  });

  it("returns empty array when there are no edges", () => {
    expect(findExternalInputEdges([], new Set(["a"]))).toEqual([]);
  });

  it("excludes edges whose target is outside the subgraph", () => {
    const subgraphIds = new Set(["b"]);
    const edges = [mkEdge("a", "b"), mkEdge("b", "c")];
    const external = findExternalInputEdges(edges, subgraphIds);
    expect(external).toHaveLength(1);
    expect(external[0].source).toBe("a");
  });
});

describe("applyPropertyOverrides", () => {
  it("returns nodes unchanged when no overrides exist", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const overrides = new Map<string, Record<string, unknown>>();
    const result = applyPropertyOverrides(nodes, overrides);
    expect(result).toEqual(nodes);
  });

  it("injects static properties for nodes with overrides", () => {
    const nodes = [mkNode("a")];
    const overrides = new Map([["a", { input: "cached_value" }]]);
    const result = applyPropertyOverrides(nodes, overrides);
    expect(result[0].data.properties).toEqual({ input: "cached_value" });
  });

  it("routes to dynamic_properties when the key already exists there", () => {
    const node = mkNode("a");
    node.data.dynamic_properties = { prompt: "old" };
    const overrides = new Map([["a", { prompt: "new" }]]);
    const result = applyPropertyOverrides([node], overrides);
    expect(result[0].data.dynamic_properties).toEqual({ prompt: "new" });
    expect(result[0].data.properties).toEqual({});
  });

  it("does not mutate original nodes", () => {
    const node = mkNode("a");
    const originalProps = { ...node.data.properties };
    const overrides = new Map([["a", { input: "val" }]]);
    applyPropertyOverrides([node], overrides);
    expect(node.data.properties).toEqual(originalProps);
  });

  it("skips nodes not in the overrides map", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const overrides = new Map([["a", { input: "val" }]]);
    const result = applyPropertyOverrides(nodes, overrides);
    expect(result[1]).toBe(nodes[1]);
  });
});

describe("collectCachedValuesForSubgraph", () => {
  it("builds override map from external edges with cached results", () => {
    const edges = [
      mkEdge("ext1", "node1", { sourceHandle: "output", targetHandle: "prompt" }),
      mkEdge("ext2", "node1", { sourceHandle: "output", targetHandle: "seed" })
    ];
    const getResult = (_wfId: string, nodeId: string): unknown => {
      if (nodeId === "ext1") return { output: "hello" };
      if (nodeId === "ext2") return { output: 42 };
      return undefined;
    };
    const findNode = (id: string) => mkNode(id);
    const result = collectCachedValuesForSubgraph(edges, "wf1", getResult, findNode);
    expect(result.get("node1")).toEqual({ prompt: "hello", seed: 42 });
  });

  it("skips edges with no targetHandle", () => {
    const edge: Edge = { id: "e1", source: "ext", target: "node" };
    const result = collectCachedValuesForSubgraph(
      [edge], "wf1",
      () => ({ output: "val" }),
      (id: string) => mkNode(id)
    );
    expect(result.size).toBe(0);
  });

  it("denies the cache for a CONSTANT source — inlines the LIVE property value, not a stale generation", () => {
    const edges = [
      mkEdge("const1", "node1", { sourceHandle: "output", targetHandle: "value" })
    ];
    // The constant has a STALE cached generation, but its live property was edited.
    const getResult = (_wf: string, nodeId: string): unknown =>
      nodeId === "const1" ? { output: "stale_cached" } : undefined;
    const constNode = mkNode("const1", "nodetool.constant.String");
    constNode.data.properties = { value: "live_edited" };
    const findNode = (id: string) => (id === "const1" ? constNode : mkNode(id));
    const result = collectCachedValuesForSubgraph(edges, "wf1", getResult, findNode);
    expect(result.get("node1")).toEqual({ value: "live_edited" });
  });

  it("denies the cache for an INPUT source too (nodetool.input.*)", () => {
    const edges = [
      mkEdge("in1", "node1", { sourceHandle: "output", targetHandle: "value" })
    ];
    const getResult = (_wf: string, nodeId: string): unknown =>
      nodeId === "in1" ? { output: "stale_cached" } : undefined;
    const inNode = mkNode("in1", "nodetool.input.IntegerInput");
    inNode.data.properties = { value: 7 };
    const findNode = (id: string) => (id === "in1" ? inNode : mkNode(id));
    const result = collectCachedValuesForSubgraph(edges, "wf1", getResult, findNode);
    expect(result.get("node1")).toEqual({ value: 7 });
  });

  it("keeps the cache-first value for a computed/generative source (preview liveness preserved)", () => {
    const edges = [
      mkEdge("gen1", "node1", { sourceHandle: "output", targetHandle: "image" })
    ];
    // The generative source's last output is reused even though it may be "stale".
    const getResult = (_wf: string, nodeId: string): unknown =>
      nodeId === "gen1" ? { output: "last_cached_output" } : undefined;
    const genNode = mkNode("gen1", "gen.Image");
    genNode.data.properties = { value: "ignored_live_value" };
    const findNode = (id: string) => (id === "gen1" ? genNode : mkNode(id));
    const result = collectCachedValuesForSubgraph(edges, "wf1", getResult, findNode);
    expect(result.get("node1")).toEqual({ image: "last_cached_output" });
  });
});

describe("browserRunnablePrefix", () => {
  const isBrowser = (type: string | undefined) => type !== "server-only";

  it("includes all nodes when all are browser-capable", () => {
    const graph = {
      nodes: [mkNode("a", "browser"), mkNode("b", "browser")],
      edges: [mkEdge("a", "b")]
    };
    const result = browserRunnablePrefix(graph, isBrowser);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it("excludes server-only nodes", () => {
    const graph = {
      nodes: [mkNode("a", "browser"), mkNode("b", "server-only"), mkNode("c", "browser")],
      edges: [mkEdge("a", "b"), mkEdge("b", "c")]
    };
    const result = browserRunnablePrefix(graph, isBrowser);
    expect(result.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(result.edges).toHaveLength(0);
  });

  it("excludes browser nodes downstream of server-only nodes", () => {
    const graph = {
      nodes: [mkNode("a", "browser"), mkNode("b", "server-only"), mkNode("c", "browser")],
      edges: [mkEdge("a", "b"), mkEdge("b", "c")]
    };
    const result = browserRunnablePrefix(graph, isBrowser);
    expect(result.nodes.map((n) => n.id)).toEqual(["a"]);
  });

  it("includes nodes with no in-graph predecessors", () => {
    const graph = {
      nodes: [mkNode("a", "browser"), mkNode("b", "browser")],
      edges: []
    };
    const result = browserRunnablePrefix(graph, isBrowser);
    expect(result.nodes).toHaveLength(2);
  });

  it("handles empty graph", () => {
    const result = browserRunnablePrefix({ nodes: [], edges: [] }, isBrowser);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("handles diamond with server-only node on one path", () => {
    const graph = {
      nodes: [
        mkNode("a", "browser"),
        mkNode("b", "browser"),
        mkNode("c", "server-only"),
        mkNode("d", "browser")
      ],
      edges: [
        mkEdge("a", "b"),
        mkEdge("a", "c"),
        mkEdge("b", "d"),
        mkEdge("c", "d")
      ]
    };
    const result = browserRunnablePrefix(graph, isBrowser);
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });
});

describe("buildDownstreamRunGraph multi-select ForEach replay injection", () => {
  const selectedValues = [
    { uri: "a.png", type: "image" },
    { uri: "b.png", type: "image" }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNodeSelectedOutputs.mockReturnValue(undefined);
  });

  // A downstream subgraph rooted at `start`; an external multi-select source
  // `gen-x` feeds the target node's handle from outside the subgraph.
  const runFor = (targetHandle: string) => {
    const start = mkNode("start");
    const target = mkNode("node-t", "proc.Plain");
    const genX = mkNode("gen-x", "gen.Image");
    const allNodes = [start, target, genX];
    const allEdges = [
      mkEdge("start", "node-t", { sourceHandle: "output", targetHandle: "in" }),
      mkEdge("gen-x", "node-t", { sourceHandle: "output", targetHandle })
    ];
    // The downstream subgraph from `start` includes start + target only.
    mockSubgraph.mockReturnValue({
      nodes: [start, target],
      edges: [allEdges[0]]
    });
    mockGetNodeSelectedOutputs.mockImplementation((_wf: string, src: string) =>
      src === "gen-x" ? selectedValues : undefined
    );
    const findNode = (id: string) => allNodes.find((n) => n.id === id);
    return buildDownstreamRunGraph({
      nodeId: "start",
      nodes: allNodes,
      edges: allEdges,
      workflowId: "wf1",
      findNode
    });
  };

  const expectForEach = (
    built: ReturnType<typeof buildDownstreamRunGraph>,
    targetHandle: string
  ): void => {
    expect(built).not.toBeNull();
    const replay = built!.nodes.find(
      (n) => n.type === "nodetool.control.ForEach"
    )!;
    expect(replay).toBeDefined();
    expect(replay.data.properties.input_list).toEqual(selectedValues);

    const replayEdge = built!.edges.find((e) => e.source === replay.id)!;
    expect(replayEdge).toBeDefined();
    expect(replayEdge.sourceHandle).toBe("output");
    expect(replayEdge.target).toBe("node-t");
    expect(replayEdge.targetHandle).toBe(targetHandle);

    // The multi-select source isn't injected as a static override and the
    // streamed handle carries no cached value.
    const target = built!.nodes.find((n) => n.id === "node-t")!;
    expect(target.data.properties[targetHandle]).toBeUndefined();
  };

  it("injects a ForEach replay into a LIST target handle", () => {
    expectForEach(runFor("tiles"), "tiles");
  });

  it("injects a ForEach replay into a SCALAR target handle too (no list gate)", () => {
    expectForEach(runFor("input"), "input");
  });
});
