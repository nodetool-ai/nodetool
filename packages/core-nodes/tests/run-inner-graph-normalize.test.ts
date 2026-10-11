import { describe, it, expect } from "vitest";
import {
  normalizeEdges,
  normalizeNodes
} from "../src/nodes/run-inner-graph.js";

describe("normalizeNodes", () => {
  it("keeps a node that already has properties", () => {
    expect(
      normalizeNodes([{ id: "a", properties: { x: 1 }, data: { y: 2 } }])
    ).toEqual([{ id: "a", properties: { x: 1 }, data: { y: 2 } }]);
  });

  it("unwraps data.properties", () => {
    expect(
      normalizeNodes([{ id: "a", data: { title: "t", properties: { x: 1 } } }])
    ).toEqual([{ id: "a", properties: { x: 1 } }]);
  });

  it("uses data itself when it has no properties object", () => {
    expect(normalizeNodes([{ id: "a", data: { x: 1 } }])).toEqual([
      { id: "a", properties: { x: 1 } }
    ]);
    expect(
      normalizeNodes([{ id: "a", data: { properties: [1], x: 1 } }])
    ).toEqual([{ id: "a", properties: { properties: [1], x: 1 } }]);
  });

  it("leaves a node with neither properties nor data alone", () => {
    expect(normalizeNodes([{ id: "a" }])).toEqual([{ id: "a" }]);
  });

  it.each([null, [1], "s", 0])(
    "yields empty properties for non-object data %j",
    (data) => {
      expect(normalizeNodes([{ id: "a", data }])).toEqual([
        { id: "a", properties: {} }
      ]);
    }
  );
});

describe("normalizeEdges", () => {
  it.each([
    [{ edge_type: "control" }, "control"],
    [{ type: "control" }, "control"],
    [{ edge_type: "data", type: "control" }, "data"],
    [{ edge_type: null, type: "control" }, "control"],
    [{ type: "default" }, "data"],
    [{}, "data"]
  ])("maps %j to %s and drops type", (edge, expected) => {
    const [out] = normalizeEdges([{ source: "a", target: "b", ...edge }]);
    expect(out.edge_type).toBe(expected);
    expect("type" in out).toBe(false);
  });
});
