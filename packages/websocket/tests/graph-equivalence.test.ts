import { describe, it, expect } from "vitest";
import type { WorkflowGraph } from "@nodetool-ai/models";
import { graphsEquivalent } from "../src/lib/graph-equivalence.js";

const node = (over: Record<string, unknown> = {}) => ({
  id: "n1",
  type: "nodetool.text.Concat",
  data: { a: "hello" },
  ui_properties: { position: { x: 0, y: 0 }, selected: false, width: 200 },
  ...over
});

const graph = (over: Partial<WorkflowGraph> = {}): WorkflowGraph =>
  ({ nodes: [node()], edges: [], ...over }) as WorkflowGraph;

describe("graphsEquivalent", () => {
  it("treats identical graphs as equivalent", () => {
    expect(graphsEquivalent(graph(), graph())).toBe(true);
  });

  it("ignores transient selection state", () => {
    const a = graph();
    const b = graph({
      nodes: [node({ ui_properties: { position: { x: 0, y: 0 }, selected: true, width: 200 } })]
    });
    expect(graphsEquivalent(a, b)).toBe(true);
  });

  it("ignores transient zIndex changes", () => {
    const a = graph({
      nodes: [node({ ui_properties: { position: { x: 0, y: 0 }, zIndex: 1 } })]
    });
    const b = graph({
      nodes: [node({ ui_properties: { position: { x: 0, y: 0 }, zIndex: 99 } })]
    });
    expect(graphsEquivalent(a, b)).toBe(true);
  });

  it("is independent of object key order", () => {
    const a = graph({ nodes: [{ id: "n1", type: "t", data: { a: 1, b: 2 } } as never] });
    const b = graph({ nodes: [{ type: "t", data: { b: 2, a: 1 }, id: "n1" } as never] });
    expect(graphsEquivalent(a, b)).toBe(true);
  });

  it("detects a node position change", () => {
    const a = graph();
    const b = graph({
      nodes: [node({ ui_properties: { position: { x: 50, y: 0 }, selected: false, width: 200 } })]
    });
    expect(graphsEquivalent(a, b)).toBe(false);
  });

  it("detects a data change", () => {
    const a = graph();
    const b = graph({ nodes: [node({ data: { a: "world" } })] });
    expect(graphsEquivalent(a, b)).toBe(false);
  });

  it("detects added or removed nodes", () => {
    const a = graph();
    const b = graph({ nodes: [node(), node({ id: "n2" })] });
    expect(graphsEquivalent(a, b)).toBe(false);
  });

  it("detects edge changes", () => {
    const a = graph();
    const b = graph({
      edges: [
        {
          id: "e1",
          source: "n1",
          sourceHandle: "out",
          target: "n2",
          targetHandle: "in"
        } as never
      ]
    });
    expect(graphsEquivalent(a, b)).toBe(false);
  });

  it("handles null/empty graphs", () => {
    expect(graphsEquivalent(null, { nodes: [], edges: [] } as WorkflowGraph)).toBe(true);
    expect(graphsEquivalent(undefined, undefined)).toBe(true);
    expect(graphsEquivalent(null, graph())).toBe(false);
  });
});
