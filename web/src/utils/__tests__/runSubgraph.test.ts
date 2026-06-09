import { Edge, Node } from "@xyflow/react";
import { buildRunSubgraph } from "../runSubgraph";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata } from "../../stores/ApiTypes";

const WF = "wf1";

const node = (
  id: string,
  type: string,
  properties: Record<string, unknown> = {}
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties,
    dynamic_properties: {},
    selectable: true,
    workflow_id: WF
  }
});

const edge = (
  id: string,
  source: string,
  target: string,
  targetHandle = "input",
  sourceHandle = "output"
): Edge => ({ id, source, target, sourceHandle, targetHandle, type: "default" });

// Generative nodes are the ones flagged auto_save_asset.
const getMetadata = (type: string): NodeMetadata =>
  ({
    auto_save_asset: type.startsWith("gen."),
    title: type,
    properties: []
  }) as unknown as NodeMetadata;

const noResults = () => undefined;

describe("buildRunSubgraph", () => {
  it("runs a node with no inputs by itself", () => {
    const target = node("t", "proc.Plain");
    const sub = buildRunSubgraph({
      targetId: "t",
      nodes: [target],
      edges: [],
      workflowId: WF,
      getResult: noResults,
      getMetadata
    });
    expect(sub.nodeIds).toEqual(new Set(["t"]));
    expect(sub.edges).toEqual([]);
    expect(sub.blocked).toEqual([]);
  });

  it("injects a constant upstream value as an override and prunes the source", () => {
    const target = node("t", "proc.Plain");
    const constant = node("c", "nodetool.constant.String", { value: "hi" });
    const sub = buildRunSubgraph({
      targetId: "t",
      nodes: [target, constant],
      edges: [edge("e", "c", "t")],
      workflowId: WF,
      getResult: noResults,
      getMetadata
    });
    // Constant is not part of the submitted graph; value is inlined.
    expect(sub.nodeIds).toEqual(new Set(["t"]));
    expect(sub.edges).toEqual([]);
    const submitted = sub.nodes.find((n) => n.id === "t")!;
    expect(submitted.data.properties.input).toBe("hi");
    expect(sub.blocked).toEqual([]);
  });

  it("includes a deterministic upstream node in the submitted subgraph", () => {
    const target = node("t", "proc.Plain");
    const upstream = node("u", "proc.Format");
    const sub = buildRunSubgraph({
      targetId: "t",
      nodes: [target, upstream],
      edges: [edge("e", "u", "t")],
      workflowId: WF,
      getResult: noResults,
      getMetadata
    });
    expect(sub.nodeIds).toEqual(new Set(["t", "u"]));
    expect(sub.edges.map((e) => e.id)).toEqual(["e"]);
    expect(sub.blocked).toEqual([]);
  });

  it("blocks on an uncached generative upstream", () => {
    const target = node("t", "proc.Plain");
    const generator = node("g", "gen.Image");
    const sub = buildRunSubgraph({
      targetId: "t",
      nodes: [target, generator],
      edges: [edge("e", "g", "t")],
      workflowId: WF,
      getResult: noResults,
      getMetadata
    });
    expect(sub.blocked).toEqual([{ nodeId: "g", title: "gen.Image" }]);
    // Generator is neither submitted nor inlined.
    expect(sub.nodeIds).toEqual(new Set(["t"]));
    expect(sub.edges).toEqual([]);
  });

  it("reuses a cached generative result instead of blocking", () => {
    const target = node("t", "proc.Plain");
    const generator = node("g", "gen.Image");
    const getResult = (_wf: string, src: string) =>
      src === "g" ? { output: "cached.png" } : undefined;
    const sub = buildRunSubgraph({
      targetId: "t",
      nodes: [target, generator],
      edges: [edge("e", "g", "t")],
      workflowId: WF,
      getResult,
      getMetadata
    });
    expect(sub.blocked).toEqual([]);
    expect(sub.nodeIds).toEqual(new Set(["t"]));
    const submitted = sub.nodes.find((n) => n.id === "t")!;
    expect(submitted.data.properties.input).toBe("cached.png");
  });

  it("walks transitively through deterministic nodes and inlines their constants", () => {
    const target = node("t", "proc.Plain");
    const mid = node("m", "proc.Format");
    const constant = node("c", "nodetool.constant.Integer", { value: 42 });
    const sub = buildRunSubgraph({
      targetId: "t",
      nodes: [target, mid, constant],
      edges: [edge("e1", "m", "t"), edge("e2", "c", "m")],
      workflowId: WF,
      getResult: noResults,
      getMetadata
    });
    expect(sub.nodeIds).toEqual(new Set(["t", "m"]));
    expect(sub.edges.map((e) => e.id)).toEqual(["e1"]);
    const submittedMid = sub.nodes.find((n) => n.id === "m")!;
    expect(submittedMid.data.properties.input).toBe(42);
    expect(sub.blocked).toEqual([]);
  });

  it("blocks on a generative node reached through a deterministic node", () => {
    const target = node("t", "proc.Plain");
    const mid = node("m", "proc.Format");
    const generator = node("g", "gen.Audio");
    const sub = buildRunSubgraph({
      targetId: "t",
      nodes: [target, mid, generator],
      edges: [edge("e1", "m", "t"), edge("e2", "g", "m")],
      workflowId: WF,
      getResult: noResults,
      getMetadata
    });
    expect(sub.nodeIds).toEqual(new Set(["t", "m"]));
    expect(sub.blocked).toEqual([{ nodeId: "g", title: "gen.Audio" }]);
  });

  it("aggregates two edges into a list[image] handle instead of last-write-wins", () => {
    const target = node("grid", "lib.grid.CombineImageGrid");
    const genA = node("a", "gen.Image");
    const genB = node("b", "gen.Image");

    // Both upstreams have cached results, so they're inlined as overrides.
    const getResult = (_wf: string, src: string) =>
      src === "a"
        ? { output: { uri: "a.png", type: "image" } }
        : src === "b"
          ? { output: { uri: "b.png", type: "image" } }
          : undefined;

    // The grid's `tiles` handle is list[image] → a collect type.
    const getMetadataWithList = (type: string): NodeMetadata =>
      ({
        auto_save_asset: type.startsWith("gen."),
        title: type,
        properties:
          type === "lib.grid.CombineImageGrid"
            ? [
                {
                  name: "tiles",
                  type: {
                    type: "list",
                    type_args: [{ type: "image", type_args: [] }]
                  }
                }
              ]
            : []
      }) as unknown as NodeMetadata;

    const sub = buildRunSubgraph({
      targetId: "grid",
      nodes: [target, genA, genB],
      edges: [
        edge("e1", "a", "grid", "tiles"),
        edge("e2", "b", "grid", "tiles")
      ],
      workflowId: WF,
      getResult,
      getMetadata: getMetadataWithList
    });

    expect(sub.blocked).toEqual([]);
    expect(sub.nodeIds).toEqual(new Set(["grid"]));
    const submitted = sub.nodes.find((n) => n.id === "grid")!;
    expect(submitted.data.properties.tiles).toEqual([
      { uri: "a.png", type: "image" },
      { uri: "b.png", type: "image" }
    ]);
  });

  it("deduplicates a generative upstream feeding two inputs", () => {
    const target = node("t", "proc.Plain");
    const generator = node("g", "gen.Image");
    const sub = buildRunSubgraph({
      targetId: "t",
      nodes: [target, generator],
      edges: [
        edge("e1", "g", "t", "a"),
        edge("e2", "g", "t", "b")
      ],
      workflowId: WF,
      getResult: noResults,
      getMetadata
    });
    expect(sub.blocked).toHaveLength(1);
  });
});
