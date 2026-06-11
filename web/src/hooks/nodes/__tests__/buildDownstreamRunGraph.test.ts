import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../../../stores/NodeData";
import {
  findExternalInputEdges,
  applyPropertyOverrides,
  browserRunnablePrefix,
  collectCachedValuesForSubgraph
} from "../buildDownstreamRunGraph";

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
