import { Edge, Node } from "@xyflow/react";
import { createRunResolver } from "../runResolver";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata } from "../../stores/ApiTypes";
import { createNodeHasher } from "../nodeHash";
import { getCurrentGeneration, type Generation } from "../nodeGenerations";

const WF = "wf1";
const NOW = 1_700_000_000_000;

const node = (
  id: string,
  type: string,
  properties: Record<string, unknown> = {},
  data: Partial<NodeData> = {}
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties,
    dynamic_properties: {},
    selectable: true,
    workflow_id: WF,
    ...data
  }
});

const edge = (
  id: string,
  source: string,
  target: string,
  targetHandle = "input",
  sourceHandle = "output"
): Edge => ({ id, source, target, sourceHandle, targetHandle, type: "default" });

const gen = (o: Partial<Generation> & { id: string }): Generation => ({
  jobId: "job",
  createdAt: NOW,
  outputs: {},
  status: "completed",
  ...o
});

const PURE_TYPES = new Set(["nodetool.text.Prompt"]);
const baseMeta = (type: string): NodeMetadata =>
  ({
    auto_save_asset: type.startsWith("gen."),
    cache_ttl:
      type.startsWith("pure.") || PURE_TYPES.has(type) ? "forever" : undefined,
    title: type,
    properties: []
  }) as unknown as NodeMetadata;

const sigOf = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  gens: Record<string, Generation[]>,
  id: string
): string =>
  createNodeHasher({
    findNode: (i) => nodes.find((n) => n.id === i),
    inboundEdges: (i) => edges.filter((e) => e.target === i),
    getMetadata: baseMeta,
    currentGenerationId: (i) =>
      getCurrentGeneration(
        gens[i] ?? [],
        nodes.find((n) => n.id === i)?.data?.selected_generation
      )?.id
  }).inputSignature(id);

const make = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  gens: Record<string, Generation[]> = {}
) =>
  createRunResolver({
    nodes,
    edges,
    workflowId: WF,
    getMetadata: baseMeta,
    getGenerations: (_wf: string, id: string) => gens[id] ?? [],
    now: NOW
  });

describe("createRunResolver", () => {
  it("classify distinguishes constant / generative / computed", () => {
    const r = make(
      [
        node("c", "nodetool.constant.String", { value: "x" }),
        node("g", "gen.Image"),
        node("u", "pure.Format")
      ],
      []
    );
    expect(r.classify("c")).toBe("constant");
    expect(r.classify("g")).toBe("generative");
    expect(r.classify("u")).toBe("computed");
  });

  it("decide: constant reuses, generative without a gen blocks", () => {
    const r = make(
      [node("c", "nodetool.constant.String", { value: "x" }), node("g", "gen.Image")],
      []
    );
    expect(r.decide("c")).toBe("reuse");
    expect(r.decide("g")).toBe("block");
  });

  it("decide: generative with a completed gen reuses; replays a ≥2 multi-select", () => {
    const r = make(
      [node("g", "gen.Image", {}, { selected_generations: ["a", "b"] })],
      [],
      { g: [gen({ id: "a", outputs: { output: 1 } }), gen({ id: "b", outputs: { output: 2 } })] }
    );
    expect(r.decide("g")).toBe("replay");
  });

  it("reuseValue: constant returns its live value, not the stale cache", () => {
    const nodes = [node("c", "nodetool.constant.String", { value: "fresh" })];
    const r = make(nodes, [edge("e", "c", "t")], {
      c: [gen({ id: "gc", outputs: { output: "stale" } })]
    });
    expect(r.reuseValue("c", edge("e", "c", "t"))).toEqual({
      value: "fresh",
      hasValue: true
    });
  });

  it("reuseValue: constant with undefined live value has no value", () => {
    const r = make([node("c", "nodetool.constant.String")], [edge("e", "c", "t")]);
    expect(r.reuseValue("c", edge("e", "c", "t")).hasValue).toBe(false);
  });

  it("reuseValue: generative returns the current generation output by handle", () => {
    const r = make([node("g", "gen.Image")], [edge("e", "g", "t")], {
      g: [gen({ id: "gg", outputs: { output: { uri: "x.png", type: "image" } } })]
    });
    expect(r.reuseValue("g", edge("e", "g", "t"))).toEqual({
      value: { uri: "x.png", type: "image" },
      hasValue: true
    });
  });

  it("reuseValue: computed returns the signature-matched cached output", () => {
    const nodes = [node("u", "pure.Format", { x: 1 })];
    const edges = [edge("e", "u", "t")];
    const sig = sigOf(nodes, edges, {}, "u");
    const r = make(nodes, edges, {
      u: [gen({ id: "gu", inputSignature: sig, outputs: { output: "cached" } })]
    });
    expect(r.reuseValue("u", edge("e", "u", "t"))).toEqual({
      value: "cached",
      hasValue: true
    });

    const stale = make(nodes, edges, {
      u: [gen({ id: "gu", inputSignature: "nope", outputs: { output: "cached" } })]
    });
    expect(stale.reuseValue("u", edge("e", "u", "t")).hasValue).toBe(false);
  });

  it("replayValues: the ordered, completed, flattened multi-select set", () => {
    const r = make(
      [node("g", "gen.Image", {}, { selected_generations: ["a", "b"] })],
      [],
      {
        g: [
          gen({ id: "a", outputs: { output: "A" } }),
          gen({ id: "b", outputs: { output: "B" } }),
          gen({ id: "c", outputs: { output: "C" } })
        ]
      }
    );
    expect(r.replayValues("g", "output")).toEqual(["A", "B"]);
  });

  it("nodeTitle: data title → metadata title → id fallback", () => {
    const r = make(
      [
        node("a", "gen.Image", {}, { title: "My Node" }),
        node("b", "gen.Image")
      ],
      []
    );
    expect(r.nodeTitle("a")).toBe("My Node");
    expect(r.nodeTitle("b")).toBe("gen.Image");
    expect(r.nodeTitle("missing")).toBe("missing");
  });

  it("generations: returns the merged history for a node", () => {
    const r = make([node("g", "gen.Image")], [], {
      g: [gen({ id: "gg", outputs: { output: 1 } })]
    });
    expect(r.generations("g").map((x) => x.id)).toEqual(["gg"]);
    expect(r.generations("none")).toEqual([]);
  });
});
