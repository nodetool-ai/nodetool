import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../../../stores/NodeData";
import { browserRunnablePrefix } from "../buildDownstreamRunGraph";

const node = (id: string, type: string): Node<NodeData> =>
  ({ id, type, data: {} }) as unknown as Node<NodeData>;
const edge = (source: string, target: string): Edge =>
  ({ id: `${source}-${target}`, source, target }) as Edge;

const BROWSER = new Set(["browser"]);
const isBrowser = (type: string | undefined): boolean =>
  !!type && BROWSER.has(type);

describe("browserRunnablePrefix", () => {
  it("keeps the browser prefix and drops the server tail", () => {
    // [A:browser] → [B:browser] → [C:server]
    const graph = {
      nodes: [node("A", "browser"), node("B", "browser"), node("C", "server")],
      edges: [edge("A", "B"), edge("B", "C")]
    };
    const { nodes, edges } = browserRunnablePrefix(graph, isBrowser);
    expect(nodes.map((n) => n.id).sort()).toEqual(["A", "B"]);
    expect(edges.map((e) => e.id)).toEqual(["A-B"]);
  });

  it("excludes browser nodes that depend on a server node", () => {
    // [A:browser] → [B:server] → [C:browser]  → only A is runnable
    const graph = {
      nodes: [node("A", "browser"), node("B", "server"), node("C", "browser")],
      edges: [edge("A", "B"), edge("B", "C")]
    };
    const { nodes } = browserRunnablePrefix(graph, isBrowser);
    expect(nodes.map((n) => n.id)).toEqual(["A"]);
  });

  it("excludes a node fed by both a browser and a server node", () => {
    // A:browser → C ; B:server → C  → C can't run (needs B's output)
    const graph = {
      nodes: [node("A", "browser"), node("B", "server"), node("C", "browser")],
      edges: [edge("A", "C"), edge("B", "C")]
    };
    const { nodes } = browserRunnablePrefix(graph, isBrowser);
    expect(nodes.map((n) => n.id)).toEqual(["A"]);
  });

  it("returns empty when the root isn't browser-capable", () => {
    const graph = {
      nodes: [node("A", "server"), node("B", "browser")],
      edges: [edge("A", "B")]
    };
    expect(browserRunnablePrefix(graph, isBrowser).nodes).toEqual([]);
  });

  it("keeps a fully-browser graph intact", () => {
    const graph = {
      nodes: [node("A", "browser"), node("B", "browser")],
      edges: [edge("A", "B")]
    };
    const { nodes, edges } = browserRunnablePrefix(graph, isBrowser);
    expect(nodes.map((n) => n.id).sort()).toEqual(["A", "B"]);
    expect(edges.map((e) => e.id)).toEqual(["A-B"]);
  });
});
