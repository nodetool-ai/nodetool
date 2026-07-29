import { describe, it, expect } from "vitest";
import { GraphBuilder, AGENT_NODE_TYPE } from "../src/graph-builder.js";

describe("GraphBuilder", () => {
  it("adds nodes and builds a valid graph", () => {
    const builder = new GraphBuilder();
    expect(builder.addNode("a", "test.NodeA")).toEqual([]);
    expect(builder.addNode("b", "test.NodeB")).toEqual([]);
    expect(builder.addEdge("a", "output", "b", "input")).toEqual([]);

    const graph = builder.build();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes[0].id).toBe("a");
    expect(graph.nodes[1].id).toBe("b");
  });

  it("rejects duplicate node ids", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    const errors = builder.addNode("a", "test.Node");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Duplicate");
  });

  it("rejects edges with non-existent nodes", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    const errors = builder.addEdge("a", "output", "missing", "input");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("missing");
  });

  it("rejects self-loops", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    const errors = builder.addEdge("a", "out", "a", "in");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Self-loops");
  });

  it("rejects an edge that would close a cycle", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addNode("c", "test.Node");
    expect(builder.addEdge("a", "out", "b", "in")).toHaveLength(0);
    expect(builder.addEdge("b", "out", "c", "in")).toHaveLength(0);

    // The closing edge c→a is rejected at add time (a is reachable from c),
    // so the cycle never enters the graph.
    const errors = builder.addEdge("c", "out", "a", "in");
    expect(errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("requires at least one node", () => {
    const builder = new GraphBuilder();
    const errors = builder.validate();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("at least one node");
  });

  it("rejects duplicate edges", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");
    const errors = builder.addEdge("a", "out", "b", "in");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Duplicate edge");
  });

  it("topologically sorts nodes", () => {
    const builder = new GraphBuilder();
    builder.addNode("c", "test.Node");
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");
    builder.addEdge("b", "out", "c", "in");

    const graph = builder.build();
    const ids = graph.nodes.map((n) => n.id);
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
  });

  it("stores properties on nodes", () => {
    const builder = new GraphBuilder();
    builder.addNode("step1", AGENT_NODE_TYPE, {
      prompt: "Do something",
      tools: ["browser"]
    });
    const graph = builder.build();
    expect(graph.nodes[0].properties).toEqual({
      prompt: "Do something",
      tools: ["browser"]
    });
  });

  it("prevents adding after build", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.build();
    const errors = builder.addNode("b", "test.Node");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("finalized");
  });

  it("supports parallel nodes (diamond shape)", () => {
    const builder = new GraphBuilder();
    builder.addNode("source", "test.Source");
    builder.addNode("left", "test.Process");
    builder.addNode("right", "test.Process");
    builder.addNode("sink", "test.Sink");
    builder.addEdge("source", "out", "left", "in");
    builder.addEdge("source", "out", "right", "in");
    builder.addEdge("left", "out", "sink", "left_in");
    builder.addEdge("right", "out", "sink", "right_in");

    const graph = builder.build();
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(4);
    // Source must come before left, right, and sink
    const ids = graph.nodes.map((n) => n.id);
    expect(ids.indexOf("source")).toBeLessThan(ids.indexOf("sink"));
  });

  it("removes a node and its attached edges", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addNode("c", "test.Node");
    builder.addEdge("a", "out", "b", "in");
    builder.addEdge("b", "out", "c", "in");

    expect(builder.removeNode("b")).toEqual([]);
    expect(builder.nodeCount).toBe(2);
    expect(builder.edgeCount).toBe(0);
  });

  it("errors when removing a missing node or edge", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    expect(builder.removeNode("nope")[0]).toContain("does not exist");
    expect(builder.removeEdge("a", "out", "nope", "in")[0]).toContain(
      "does not exist"
    );
  });

  it("removes a specific edge", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");
    builder.addEdge("a", "out2", "b", "in2");

    expect(builder.removeEdge("a", "out", "b", "in")).toEqual([]);
    expect(builder.edgeCount).toBe(1);
  });

  it("allows re-adding an edge that previously closed a cycle after removal", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");
    expect(builder.addEdge("b", "out", "a", "in")).not.toEqual([]);
    builder.removeEdge("a", "out", "b", "in");
    expect(builder.addEdge("b", "out", "a", "in")).toEqual([]);
  });

  it("refuses removal after build", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.build();
    expect(builder.removeNode("a")[0]).toContain("finalized");
    expect(builder.removeEdge("a", "o", "b", "i")[0]).toContain("finalized");
  });

  it("snapshots the current graph without finalizing", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");

    const snap = builder.snapshot();
    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges).toHaveLength(1);

    // Snapshot is a copy — mutating it does not affect the builder.
    snap.nodes.pop();
    snap.edges.pop();
    expect(builder.nodeCount).toBe(2);
    expect(builder.edgeCount).toBe(1);
    // And the builder is still mutable afterwards.
    expect(builder.addNode("c", "test.Node")).toEqual([]);
  });

  it("describes the current graph state", () => {
    const empty = new GraphBuilder();
    expect(empty.describe()).toContain("empty graph");

    const builder = new GraphBuilder();
    builder.addNode("a", "test.NodeA");
    builder.addNode("b", "test.NodeB");
    builder.addEdge("a", "out", "b", "in");
    const text = builder.describe();
    expect(text).toContain("node a (test.NodeA)");
    expect(text).toContain("edge a.out → b.in");
  });

  it("resets for reuse", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.build();
    builder.reset();
    expect(builder.nodeCount).toBe(0);
    expect(builder.edgeCount).toBe(0);
    builder.addNode("b", "test.Node");
    const graph = builder.build();
    expect(graph.nodes).toHaveLength(1);
  });
});
