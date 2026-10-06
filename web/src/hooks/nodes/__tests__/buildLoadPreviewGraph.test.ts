import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../../../stores/NodeData";
import {
  buildLoadPreviewGraph,
  hasSourceValue
} from "../buildLoadPreviewGraph";

function mkNode(
  id: string,
  type: string,
  properties: Record<string, unknown> = {}
): Node<NodeData> {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      properties,
      dynamic_properties: {},
      selectable: true,
      workflow_id: "wf1"
    }
  };
}

function mkEdge(source: string, target: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle: "output",
    targetHandle: "image"
  };
}

const IMAGE = { type: "image", uri: "/api/storage/a.png" };
const SERVER = "server.Node";
const isBrowser = (type: string | undefined) =>
  type !== undefined && type !== SERVER;
const ids = (graph: { nodes: Node<NodeData>[] } | null) =>
  graph ? graph.nodes.map((n) => n.id).sort() : null;

describe("hasSourceValue", () => {
  it("accepts a media ref with a uri, asset id, or data", () => {
    expect(hasSourceValue(IMAGE)).toBe(true);
    expect(hasSourceValue({ type: "image", asset_id: "abc" })).toBe(true);
    expect(hasSourceValue({ type: "image", data: new Uint8Array([1]) })).toBe(
      true
    );
  });

  it("rejects an empty media ref and empty scalars", () => {
    expect(hasSourceValue({ type: "image", uri: "", asset_id: null })).toBe(
      false
    );
    expect(hasSourceValue({ type: "image", data: new Uint8Array() })).toBe(
      false
    );
    expect(hasSourceValue(undefined)).toBe(false);
    expect(hasSourceValue(null)).toBe(false);
    expect(hasSourceValue("")).toBe(false);
  });

  it("accepts plain non-empty values", () => {
    expect(hasSourceValue("hello")).toBe(true);
    expect(hasSourceValue(0)).toBe(true);
    expect(hasSourceValue(false)).toBe(true);
  });
});

describe("buildLoadPreviewGraph", () => {
  it("selects the input and its browser-runnable downstream chain", () => {
    const nodes = [
      mkNode("in", "nodetool.input.ImageInput", { value: IMAGE }),
      mkNode("blur", "lib.image.filter.GaussianBlur"),
      mkNode("tone", "lib.image.color.BrightnessContrast"),
      mkNode("out", SERVER),
      mkNode("note", "nodetool.workflows.base_node.Comment")
    ];
    const edges = [
      mkEdge("in", "blur"),
      mkEdge("blur", "tone"),
      mkEdge("tone", "out")
    ];
    const graph = buildLoadPreviewGraph(nodes, edges, (t) =>
      t === "nodetool.workflows.base_node.Comment" ? false : isBrowser(t)
    );
    expect(ids(graph)).toEqual(["blur", "in", "tone"]);
    expect(graph?.edges.map((e) => e.id).sort()).toEqual([
      "blur-tone",
      "in-blur"
    ]);
  });

  it("returns null when no input has a value", () => {
    const nodes = [
      mkNode("in", "nodetool.input.ImageInput", {
        value: { type: "image", uri: "" }
      }),
      mkNode("blur", "lib.image.filter.GaussianBlur")
    ];
    expect(
      buildLoadPreviewGraph(nodes, [mkEdge("in", "blur")], isBrowser)
    ).toBeNull();
  });

  it("returns null when an input has no browser-runnable downstream node", () => {
    const nodes = [
      mkNode("in", "nodetool.input.ImageInput", { value: IMAGE }),
      mkNode("out", SERVER)
    ];
    expect(
      buildLoadPreviewGraph(nodes, [mkEdge("in", "out")], isBrowser)
    ).toBeNull();
  });

  it("stops at a server node and skips everything behind it", () => {
    const nodes = [
      mkNode("in", "nodetool.input.ImageInput", { value: IMAGE }),
      mkNode("a", "browser.A"),
      mkNode("srv", SERVER),
      mkNode("b", "browser.B")
    ];
    const edges = [mkEdge("in", "a"), mkEdge("a", "srv"), mkEdge("srv", "b")];
    expect(ids(buildLoadPreviewGraph(nodes, edges, isBrowser))).toEqual([
      "a",
      "in"
    ]);
  });

  it("skips a downstream node that also needs an empty input", () => {
    const nodes = [
      mkNode("in", "nodetool.input.ImageInput", { value: IMAGE }),
      mkNode("mask", "nodetool.input.ImageInput", {
        value: { type: "image", uri: "" }
      }),
      mkNode("a", "browser.A"),
      mkNode("merge", "browser.Merge")
    ];
    const edges = [
      mkEdge("in", "a"),
      mkEdge("a", "merge"),
      mkEdge("mask", "merge")
    ];
    expect(ids(buildLoadPreviewGraph(nodes, edges, isBrowser))).toEqual([
      "a",
      "in"
    ]);
  });

  it("includes a browser upstream that feeds an input's downstream node", () => {
    const nodes = [
      mkNode("in", "nodetool.input.ImageInput", { value: IMAGE }),
      mkNode("gen", "browser.Generator"),
      mkNode("blend", "browser.Blend")
    ];
    const edges = [mkEdge("in", "blend"), mkEdge("gen", "blend")];
    expect(ids(buildLoadPreviewGraph(nodes, edges, isBrowser))).toEqual([
      "blend",
      "gen",
      "in"
    ]);
  });

  it("does not run a browser chain that no input reaches", () => {
    const nodes = [
      mkNode("in", "nodetool.input.ImageInput", { value: IMAGE }),
      mkNode("a", "browser.A"),
      mkNode("gen", "browser.Generator"),
      mkNode("b", "browser.B")
    ];
    const edges = [mkEdge("in", "a"), mkEdge("gen", "b")];
    expect(ids(buildLoadPreviewGraph(nodes, edges, isBrowser))).toEqual([
      "a",
      "in"
    ]);
  });
});
