import { EdgeOverrideCollector, applyNodeOverrides } from "./edgeOverrides";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

const makeNode = (
  id: string,
  type: string,
  properties: Record<string, unknown> = {},
  dynamic_properties: Record<string, unknown> = {}
): Node<NodeData> =>
  ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: { properties, dynamic_properties }
  }) as unknown as Node<NodeData>;

describe("EdgeOverrideCollector", () => {
  it("stores and resolves a single value per handle", () => {
    const collector = new EdgeOverrideCollector();
    collector.add("node1", "input_a", 42);

    const findNode = () => undefined;
    const getMetadata = () => undefined;
    const result = collector.resolve(findNode, getMetadata);

    expect(result.get("node1")).toEqual({ input_a: 42 });
  });

  it("last-write-wins for multiple values on a non-collect handle", () => {
    const collector = new EdgeOverrideCollector();
    collector.add("node1", "input_a", "first");
    collector.add("node1", "input_a", "second");

    const node = makeNode("node1", "some.Type");
    const findNode = (id: string) => (id === "node1" ? node : undefined);
    const getMetadata = () => ({
      title: "Test",
      namespace: "test",
      node_type: "some.Type",
      properties: [{ name: "input_a", type: { type: "string" } }],
      outputs: [],
      layout: "default",
      description: ""
    });

    const result = collector.resolve(
      findNode,
      getMetadata as unknown as (type: string) => undefined
    );
    expect(result.get("node1")).toEqual({ input_a: "second" });
  });

  it("aggregates values into a list for collect-type handles", () => {
    const collector = new EdgeOverrideCollector();
    collector.add("node1", "images", "img1");
    collector.add("node1", "images", "img2");

    const node = makeNode("node1", "some.Type");
    const findNode = (id: string) => (id === "node1" ? node : undefined);
    const getMetadata = () => ({
      title: "Test",
      namespace: "test",
      node_type: "some.Type",
      properties: [{ name: "images", type: { type: "list", type_args: [{ type: "image" }] } }],
      outputs: [],
      layout: "default",
      description: ""
    });

    const result = collector.resolve(
      findNode,
      getMetadata as unknown as (type: string) => undefined
    );
    expect(result.get("node1")).toEqual({ images: ["img1", "img2"] });
  });

  it("handles multiple nodes independently", () => {
    const collector = new EdgeOverrideCollector();
    collector.add("node1", "a", 1);
    collector.add("node2", "b", 2);

    const findNode = () => undefined;
    const getMetadata = () => undefined;
    const result = collector.resolve(findNode, getMetadata);

    expect(result.get("node1")).toEqual({ a: 1 });
    expect(result.get("node2")).toEqual({ b: 2 });
  });

  it("returns empty map when nothing is added", () => {
    const collector = new EdgeOverrideCollector();
    const result = collector.resolve(
      () => undefined,
      () => undefined
    );
    expect(result.size).toBe(0);
  });
});

describe("applyNodeOverrides", () => {
  it("returns the node unchanged when overrides is undefined", () => {
    const node = makeNode("n1", "t", { x: 1 });
    expect(applyNodeOverrides(node, undefined)).toBe(node);
  });

  it("returns the node unchanged when overrides is empty", () => {
    const node = makeNode("n1", "t", { x: 1 });
    expect(applyNodeOverrides(node, {})).toBe(node);
  });

  it("applies overrides to static properties by default", () => {
    const node = makeNode("n1", "t", { x: 1, y: 2 });
    const result = applyNodeOverrides(node, { x: 99 });
    expect(result.data.properties).toEqual({ x: 99, y: 2 });
  });

  it("routes to dynamic_properties when the key already exists there", () => {
    const node = makeNode("n1", "t", { x: 1 }, { dynKey: "old" });
    const result = applyNodeOverrides(node, { dynKey: "new" });
    expect(result.data.dynamic_properties).toEqual({ dynKey: "new" });
    expect(result.data.properties).toEqual({ x: 1 });
  });

  it("does not mutate the original node", () => {
    const node = makeNode("n1", "t", { x: 1 });
    applyNodeOverrides(node, { x: 99 });
    expect(node.data.properties).toEqual({ x: 1 });
  });
});
