import { Edge } from "@xyflow/react";
import { edgesTargeting, isHandleConnected } from "../edgeIndex";

const edge = (id: string, target: string, targetHandle?: string): Edge =>
  ({ id, source: "s", target, targetHandle } as Edge);

describe("edgeIndex", () => {
  it("groups edges by target in graph order", () => {
    const a = edge("e1", "n1", "in");
    const b = edge("e2", "n2");
    const c = edge("e3", "n1", "other");
    const edges = [a, b, c];

    expect(edgesTargeting(edges, "n1")).toEqual([a, c]);
    expect(edgesTargeting(edges, "n2")).toEqual([b]);
    expect(edgesTargeting(edges, "missing")).toEqual([]);
  });

  it("returns the same array for repeated lookups of one edges array", () => {
    const edges = [edge("e1", "n1", "in")];
    expect(edgesTargeting(edges, "n1")).toBe(edgesTargeting(edges, "n1"));
    expect(edgesTargeting(edges, "missing")).toBe(
      edgesTargeting(edges, "missing")
    );
  });

  it("rebuilds for a new edges array", () => {
    const a = edge("e1", "n1", "in");
    expect(edgesTargeting([a], "n1")).toEqual([a]);

    const b = edge("e2", "n1", "second");
    expect(edgesTargeting([a, b], "n1")).toEqual([a, b]);
  });

  it("reports connected target handles", () => {
    const edges = [edge("e1", "n1", "prompt"), edge("e2", "n2")];

    expect(isHandleConnected(edges, "n1", "prompt")).toBe(true);
    expect(isHandleConnected(edges, "n1", "model")).toBe(false);
    expect(isHandleConnected(edges, "n2", "prompt")).toBe(false);
  });

  it("matches the whole node id, not a prefix of it", () => {
    const edges = [edge("e1", "a b", "c")];

    expect(isHandleConnected(edges, "a b", "c")).toBe(true);
    expect(isHandleConnected(edges, "a", "b c")).toBe(false);
  });
});
