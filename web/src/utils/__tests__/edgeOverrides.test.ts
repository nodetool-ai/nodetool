import { Node } from "@xyflow/react";
import { EdgeOverrideCollector, applyNodeOverrides } from "../edgeOverrides";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata } from "../../stores/ApiTypes";

const node = (
  id: string,
  type: string,
  data: Partial<NodeData> = {}
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "wf",
    ...data
  } as NodeData
});

// `target.list` is a collect (list[image]) handle; everything else is scalar.
const getMetadata = (type: string): NodeMetadata =>
  ({
    title: type,
    properties: [
      {
        name: "list",
        type: { type: "list", type_args: [{ type: "image", type_args: [] }] }
      },
      { name: "scalar", type: { type: "image", type_args: [] } }
    ]
  }) as unknown as NodeMetadata;

describe("EdgeOverrideCollector", () => {
  const findNode = (nodes: Node<NodeData>[]) => (id: string) =>
    nodes.find((n) => n.id === id);

  it("passes a single edge's value through unchanged (no list wrapping)", () => {
    const n = node("t", "T");
    const c = new EdgeOverrideCollector();
    c.add("t", "list", { uri: "a.png" });
    const overrides = c.resolve(findNode([n]), getMetadata);
    expect(overrides.get("t")).toEqual({ list: { uri: "a.png" } });
  });

  it("aggregates 2+ edges into a list when the handle is a collect type", () => {
    const n = node("t", "T");
    const c = new EdgeOverrideCollector();
    c.add("t", "list", { uri: "a.png" });
    c.add("t", "list", { uri: "b.png" });
    const overrides = c.resolve(findNode([n]), getMetadata);
    expect(overrides.get("t")).toEqual({
      list: [{ uri: "a.png" }, { uri: "b.png" }]
    });
  });

  it("keeps last-write-wins for 2+ edges into a non-collect handle", () => {
    const n = node("t", "T");
    const c = new EdgeOverrideCollector();
    c.add("t", "scalar", { uri: "a.png" });
    c.add("t", "scalar", { uri: "b.png" });
    const overrides = c.resolve(findNode([n]), getMetadata);
    expect(overrides.get("t")).toEqual({ scalar: { uri: "b.png" } });
  });

  it("does not aggregate when metadata is missing for the handle", () => {
    const n = node("t", "T");
    const c = new EdgeOverrideCollector();
    c.add("t", "unknown", { uri: "a.png" });
    c.add("t", "unknown", { uri: "b.png" });
    const overrides = c.resolve(findNode([n]), getMetadata);
    expect(overrides.get("t")).toEqual({ unknown: { uri: "b.png" } });
  });
});

describe("applyNodeOverrides", () => {
  it("returns the node unchanged when there are no overrides", () => {
    const n = node("t", "T");
    expect(applyNodeOverrides(n, undefined)).toBe(n);
    expect(applyNodeOverrides(n, {})).toBe(n);
  });

  it("routes keys to dynamic_properties when present there, else static", () => {
    const n = node("t", "T", {
      properties: { a: 1 },
      dynamic_properties: { b: 2 }
    });
    const result = applyNodeOverrides(n, { a: 10, b: 20, c: 30 });
    expect(result.data.properties).toEqual({ a: 10, c: 30 });
    expect(result.data.dynamic_properties).toEqual({ b: 20 });
  });
});
