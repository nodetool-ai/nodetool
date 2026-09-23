/**
 * Static analysis of looped graphs (docs/workflow-loops.md, "Graph rules").
 */

import { describe, expect, it } from "vitest";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import { LOOP_NODE_TYPE } from "@nodetool-ai/protocol";
import { analyzeCorrelation } from "../../src/correlation-analysis.js";

function node(
  id: string,
  type = "test.Pass",
  extras: Partial<NodeDescriptor> = {}
): NodeDescriptor {
  return { id, type, outputs: { output: "any" }, ...extras };
}

const loop = (id = "loop") =>
  node(id, LOOP_NODE_TYPE, {
    outputs: { value: "any", index: "int", done: "any" }
  });

function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
): Edge {
  return { source, sourceHandle, target, targetHandle };
}

const forEach = (id: string) =>
  node(id, "test.ForEach", {
    outputs: { output: "any", index: "int" },
    output_correlation: {
      output: { kind: "iteration", source: "__execution__", group: "items" },
      index: { kind: "iteration", source: "__execution__", group: "items" }
    }
  });

const collect = (id: string) =>
  node(id, "test.Collect", {
    input_mode: "stream",
    output_correlation: {
      output: { kind: "aggregate", source: "input_item", collapse: "innermost" }
    }
  });

/** src → loop.initial; loop.value → body → loop.next; loop.done → out */
function simpleLoop(): { nodes: NodeDescriptor[]; edges: Edge[] } {
  return {
    nodes: [node("src"), loop(), node("body"), node("out")],
    edges: [
      edge("src", "output", "loop", "initial"),
      edge("loop", "value", "body", "input"),
      edge("body", "output", "loop", "next"),
      edge("loop", "done", "out", "input")
    ]
  };
}

const messages = (r: ReturnType<typeof analyzeCorrelation>) =>
  r.issues.map((i) => i.message);

describe("loop analysis", () => {
  it("accepts a cycle that closes on Loop.next and scopes the body per iteration", () => {
    const result = analyzeCorrelation(simpleLoop());
    expect(result.issues).toEqual([]);
    const loopFacts = result.nodes.get("loop")!;
    expect(loopFacts.invocationScope).toEqual([]);
    expect(loopFacts.outputs.get("value")!.scope).toEqual(["loop:loop"]);
    expect(loopFacts.outputs.get("done")!.scope).toEqual([]);
    expect(loopFacts.inputs.get("next")!.scope).toEqual(["loop:loop"]);
    expect(result.nodes.get("body")!.invocationScope).toEqual(["loop:loop"]);
    expect(result.nodes.get("out")!.invocationScope).toEqual([]);
  });

  it("nests the loop root under an iterating initial", () => {
    const g = simpleLoop();
    g.nodes.push(forEach("fe"));
    g.edges[0] = edge("fe", "output", "loop", "initial");
    const result = analyzeCorrelation(g);
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("body")!.invocationScope).toEqual([
      "fe:items",
      "loop:loop"
    ]);
    expect(result.nodes.get("out")!.invocationScope).toEqual(["fe:items"]);
  });

  it("still rejects a cycle that does not pass through a feedback input", () => {
    const g = simpleLoop();
    g.edges[2] = edge("body", "output", "loop", "initial");
    g.edges.shift();
    const msgs = messages(analyzeCorrelation(g));
    expect(msgs.some((m) => m.includes("Cycle detected"))).toBe(true);
    expect(msgs.some((m) => m.includes("Loop node"))).toBe(true);
  });

  it("requires Loop.next to be connected", () => {
    const g = simpleLoop();
    g.edges[2] = edge("body", "output", "loop", "condition");
    const msgs = messages(analyzeCorrelation(g));
    expect(msgs.some((m) => m.includes('connect the loop body\'s result to its "next"'))).toBe(true);
  });

  it("rejects feedback wired from outside the loop body", () => {
    const g = simpleLoop();
    g.nodes.push(node("outside"));
    g.edges.push(edge("outside", "output", "loop", "condition"));
    const msgs = messages(analyzeCorrelation(g));
    expect(msgs.some((m) => m.includes("outside the loop body"))).toBe(true);
  });

  it("rejects feedback that fans out per item of a nested iteration", () => {
    const g = simpleLoop();
    g.nodes.push(forEach("inner"));
    g.edges[1] = edge("loop", "value", "inner", "input_list");
    g.edges.push(edge("inner", "output", "body", "input"));
    const msgs = messages(analyzeCorrelation(g));
    expect(msgs.some((m) => m.includes("nested iteration"))).toBe(true);
  });

  it("rejects stream aggregates inside the loop body", () => {
    const g = simpleLoop();
    g.nodes.push(forEach("inner"), collect("gather"));
    g.edges[1] = edge("loop", "value", "inner", "input_list");
    g.edges.push(
      edge("inner", "output", "gather", "input_item"),
      edge("gather", "output", "body", "input")
    );
    const result = analyzeCorrelation(g);
    const issue = result.issues.find((i) => i.nodeId === "gather");
    expect(issue?.message).toMatch(/aggregates a stream inside the body/);
  });

  it("allows an aggregate that observes iterations outside the body", () => {
    const g = simpleLoop();
    g.nodes.push(collect("history"));
    g.edges.push(edge("loop", "value", "history", "input_item"));
    const result = analyzeCorrelation(g);
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("history")!.outputs.get("output")!.scope).toEqual([]);
  });

  it("rejects a wired max_iterations and a chunk-stream initial", () => {
    const g = simpleLoop();
    g.nodes.push(
      node("limit"),
      node("chunks", "test.Chunks", {
        output_correlation: { output: { kind: "chunk", source: "__execution__" } }
      })
    );
    g.edges[0] = edge("chunks", "output", "loop", "initial");
    g.edges.push(edge("limit", "output", "loop", "max_iterations"));
    const msgs = messages(analyzeCorrelation(g));
    expect(msgs.some((m) => m.includes('"max_iterations" cannot be wired'))).toBe(true);
    expect(msgs.some((m) => m.includes("chunk stream"))).toBe(true);
  });

  it("scopes a nested loop under the outer loop root", () => {
    const nodes = [
      node("src"),
      loop("outer"),
      loop("inner"),
      node("step"),
      node("out")
    ];
    const edges = [
      edge("src", "output", "outer", "initial"),
      edge("outer", "value", "inner", "initial"),
      edge("inner", "value", "step", "input"),
      edge("step", "output", "inner", "next"),
      edge("inner", "done", "outer", "next"),
      edge("outer", "done", "out", "input")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("step")!.invocationScope).toEqual([
      "outer:loop",
      "inner:loop"
    ]);
  });
});
