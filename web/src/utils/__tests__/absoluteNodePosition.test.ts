import { describe, it, expect } from "@jest/globals";
import type { Node } from "@xyflow/react";
import { absoluteNodePosition } from "../absoluteNodePosition";

const node = (
  id: string,
  x: number,
  y: number,
  parentId?: string
): Node<Record<string, unknown>> => ({
  id,
  position: { x, y },
  data: {},
  parentId
});

const byId = (...nodes: Node<Record<string, unknown>>[]) =>
  new Map(nodes.map((n) => [n.id, n]));

describe("absoluteNodePosition", () => {
  it("returns the node's own position when it has no parent", () => {
    const n = node("a", 10, 20);
    expect(absoluteNodePosition(n, byId(n))).toEqual({ x: 10, y: 20 });
  });

  it("does not mutate the node's position", () => {
    const parent = node("p", 100, 100);
    const child = node("c", 5, 5, "p");
    absoluteNodePosition(child, byId(parent, child));
    expect(child.position).toEqual({ x: 5, y: 5 });
  });

  it("adds the offsets of every ancestor group", () => {
    const root = node("root", 100, 200);
    const mid = node("mid", 10, 20, "root");
    const leaf = node("leaf", 1, 2, "mid");
    expect(absoluteNodePosition(leaf, byId(root, mid, leaf))).toEqual({
      x: 111,
      y: 222
    });
  });

  it("stops at a parent that is missing from the map", () => {
    const child = node("c", 3, 4, "ghost");
    expect(absoluteNodePosition(child, byId(child))).toEqual({ x: 3, y: 4 });
  });

  it("ends the walk on a parent cycle", () => {
    const a = node("a", 1, 1, "b");
    const b = node("b", 10, 10, "a");
    expect(absoluteNodePosition(a, byId(a, b))).toEqual({ x: 11, y: 11 });
  });
});
