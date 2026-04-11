import { describe, it, expect } from "vitest";
import { GraphBuilder, AGENT_STEP_NODE_TYPE } from "../src/graph-builder.js";

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

  it("detects cycles", () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addNode("c", "test.Node");
    builder.addEdge("a", "out", "b", "in");
    builder.addEdge("b", "out", "c", "in");
    builder.addEdge("c", "out", "a", "in");

    const errors = builder.validate();
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
    builder.addNode("step1", AGENT_STEP_NODE_TYPE, {
      instructions: "Do something",
      tools: ["browser"]
    });
    const graph = builder.build();
    expect(graph.nodes[0].properties).toEqual({
      instructions: "Do something",
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
