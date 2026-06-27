import { Edge, Node } from "@xyflow/react";
import {
  createNodeHasher,
  computeInputSignatures,
  type HasherContext
} from "../nodeHash";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata } from "../../stores/ApiTypes";

// Generative nodes use the `gen.` prefix convention (mirrors runSubgraph.test.ts).
const getMetadata = (type: string): NodeMetadata =>
  ({
    auto_save_asset: type.startsWith("gen."),
    title: type,
    properties: []
  }) as unknown as NodeMetadata;

const node = (
  id: string,
  type: string,
  properties: Record<string, unknown> = {},
  extraData: Partial<NodeData> = {}
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties,
    dynamic_properties: {},
    selectable: true,
    workflow_id: "wf",
    ...extraData
  } as NodeData
});

const edge = (
  id: string,
  source: string,
  target: string,
  targetHandle = "input",
  sourceHandle = "output"
): Edge => ({ id, source, target, sourceHandle, targetHandle, type: "default" });

const hasher = (
  nodes: Node<NodeData>[],
  edges: Edge[] = [],
  gens: Record<string, string> = {}
) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return createNodeHasher({
    findNode: (id) => byId.get(id),
    inboundEdges: (id) => edges.filter((e) => e.target === id),
    getMetadata,
    currentGenerationId: (id) => gens[id]
  });
};

const sig = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  id: string,
  gens?: Record<string, string>
) => hasher(nodes, edges, gens).inputSignature(id);

describe("nodeHash — inputSignature / outputIdentity", () => {
  it("H1: UI-only changes (position/select/title/color/collapsed) leave the signature unchanged", () => {
    const a = node("n", "proc.Plain", { x: 1 });
    const moved: Node<NodeData> = {
      ...a,
      position: { x: 999, y: 999 },
      selected: true,
      data: {
        ...a.data,
        title: "renamed",
        color: "#fff",
        collapsed: true,
        selected_generation: "g7"
      }
    };
    expect(sig([moved], [], "n")).toBe(sig([a], [], "n"));
  });

  it("H2: a static property change changes the signature", () => {
    expect(sig([node("n", "proc.Plain", { x: 1 })], [], "n")).not.toBe(
      sig([node("n", "proc.Plain", { x: 2 })], [], "n")
    );
  });

  it("H3: a dynamic property change changes the signature", () => {
    const a = node("n", "proc.Plain", {}, { dynamic_properties: { k: "a" } });
    const b = node("n", "proc.Plain", {}, { dynamic_properties: { k: "b" } });
    expect(sig([a], [], "n")).not.toBe(sig([b], [], "n"));
  });

  it("H4: toggling bypassed changes the signature", () => {
    const a = node("n", "proc.Plain", {}, { bypassed: false });
    const b = node("n", "proc.Plain", {}, { bypassed: true });
    expect(sig([a], [], "n")).not.toBe(sig([b], [], "n"));
  });

  it("H5: inbound edge order does not affect the signature", () => {
    const t = node("t", "proc.Plain");
    const a = node("a", "proc.A");
    const b = node("b", "proc.B");
    const e1 = edge("e1", "a", "t", "x");
    const e2 = edge("e2", "b", "t", "y");
    expect(sig([t, a, b], [e1, e2], "t")).toBe(sig([t, a, b], [e2, e1], "t"));
  });

  it("H6: adding an inbound edge changes the signature", () => {
    const t = node("t", "proc.Plain");
    const a = node("a", "proc.A");
    expect(sig([t, a], [], "t")).not.toBe(
      sig([t, a], [edge("e", "a", "t", "x")], "t")
    );
  });

  it("H7: changing an edge's source handle changes the signature", () => {
    const t = node("t", "proc.Plain");
    const a = node("a", "proc.A");
    expect(sig([t, a], [edge("e", "a", "t", "x", "out1")], "t")).not.toBe(
      sig([t, a], [edge("e", "a", "t", "x", "out2")], "t")
    );
  });

  it("H8: a constant's outputIdentity is value-derived and changes when the value changes", () => {
    const idA = hasher([node("c", "nodetool.constant.String", { value: "a" })])
      .outputIdentity("c");
    const idB = hasher([node("c", "nodetool.constant.String", { value: "b" })])
      .outputIdentity("c");
    expect(idA).not.toBe(idB);
  });

  it("H9: a computed node's outputIdentity equals its inputSignature", () => {
    const h = hasher([node("n", "proc.Plain", { x: 1 })]);
    expect(h.outputIdentity("n")).toBe(h.inputSignature("n"));
  });

  it("H10: a generative node's outputIdentity is its current generation id (∅ when none)", () => {
    const withGen = hasher([node("g", "gen.Image")], [], { g: "gen-1" });
    expect(withGen.outputIdentity("g")).toBe("gen-1");
    const noGen = hasher([node("g", "gen.Image")], [], {});
    expect(noGen.outputIdentity("g")).toBe("∅");
  });

  it("H11: re-running a generative (new generation id) changes its outputIdentity", () => {
    const before = hasher([node("g", "gen.Image")], [], { g: "gen-1" });
    const after = hasher([node("g", "gen.Image")], [], { g: "gen-2" });
    expect(before.outputIdentity("g")).not.toBe(after.outputIdentity("g"));
  });

  it("H11b: a generative's outputIdentity reflects its multi-select set (replay), not just the current id", () => {
    const gens = { g: "g1" }; // same current generation id throughout
    const ab = hasher(
      [node("g", "gen.Image", {}, { selected_generations: ["a", "b"] })],
      [],
      gens
    );
    const ac = hasher(
      [node("g", "gen.Image", {}, { selected_generations: ["a", "c"] })],
      [],
      gens
    );
    // Selection changed [a,b] → [a,c] ⇒ identity changes, so a downstream cache invalidates.
    expect(ab.outputIdentity("g")).not.toBe(ac.outputIdentity("g"));
    // Replay streams in pick order, so order matters.
    const ba = hasher(
      [node("g", "gen.Image", {}, { selected_generations: ["b", "a"] })],
      [],
      gens
    );
    expect(ab.outputIdentity("g")).not.toBe(ba.outputIdentity("g"));
    // <2 selected ⇒ falls back to the current generation id (single-select path).
    const single = hasher(
      [node("g", "gen.Image", {}, { selected_generations: ["a"] })],
      [],
      gens
    );
    expect(single.outputIdentity("g")).toBe("g1");
  });

  it("H12: an asset-valued property is hashed by id/uri, not by in-memory bitmap bytes", () => {
    const withBitmapA = node("c", "nodetool.constant.Image", {
      value: { type: "image", uri: "asset://x", data: { bitmap: 1 } }
    });
    const withBitmapB = node("c", "nodetool.constant.Image", {
      value: { type: "image", uri: "asset://x", data: { bitmap: 2 } }
    });
    expect(sig([withBitmapA], [], "c")).toBe(sig([withBitmapB], [], "c"));

    const otherUri = node("c", "nodetool.constant.Image", {
      value: { type: "image", uri: "asset://y", data: { bitmap: 1 } }
    });
    expect(sig([withBitmapA], [], "c")).not.toBe(sig([otherUri], [], "c"));
  });

  it("H14: editing a leaf changes its descendants' signatures but not its siblings'", () => {
    // c -> m -> t ; s -> t (s is a sibling branch, unaffected by editing c)
    const t = node("t", "proc.T");
    const m = node("m", "proc.M");
    const s = node("s", "proc.S");
    const cV1 = node("c", "nodetool.constant.Integer", { value: 1 });
    const cV2 = node("c", "nodetool.constant.Integer", { value: 2 });
    const edges = [
      edge("e1", "m", "t", "a"),
      edge("e2", "c", "m", "x"),
      edge("e3", "s", "t", "b")
    ];

    // Descendant m changes; descendant t changes; sibling s unchanged.
    expect(sig([t, m, s, cV2], edges, "m")).not.toBe(
      sig([t, m, s, cV1], edges, "m")
    );
    expect(sig([t, m, s, cV2], edges, "t")).not.toBe(
      sig([t, m, s, cV1], edges, "t")
    );
    expect(sig([t, m, s, cV2], edges, "s")).toBe(
      sig([t, m, s, cV1], edges, "s")
    );
  });

  it("H15: TTL/time is not part of the signature (same config ⇒ same signature regardless of generations)", () => {
    const fetch = node("f", "proc.Fetch", { url: "http://x" });
    expect(sig([fetch], [], "f", { f: "old" })).toBe(
      sig([fetch], [], "f", { f: "new" })
    );
  });

  it("H13: a property fed by an inbound edge is excluded from the signature (its value rides the upstream; the post-run echo-back of the inlined value must not self-invalidate the cache)", () => {
    const u = node("u", "proc.U");
    const edges = [edge("e", "u", "t", "x")]; // u feeds t's "x" handle
    const atDispatch = node("t", "proc.T", { x: "default" });
    // After a partial run, the inlined upstream value echoes back into the live
    // node's `x` property (actor echoes node.properties → handleUpdate writes it).
    const afterEchoBack = node("t", "proc.T", { x: "inlined-runtime-value" });
    // The edge-fed property's value must NOT move t's signature — otherwise the
    // echo-back would shift t's own signature off its dispatch-time stamp and
    // computed caching would never hit.
    expect(sig([atDispatch, u], edges, "t")).toBe(
      sig([afterEchoBack, u], edges, "t")
    );
    // A NON-edge-fed property (a real config knob) still counts.
    const cfgA = node("t", "proc.T", { x: "x", knob: 1 });
    const cfgB = node("t", "proc.T", { x: "x", knob: 2 });
    expect(sig([cfgA, u], edges, "t")).not.toBe(sig([cfgB, u], edges, "t"));
    // The value rides the edge: changing the upstream still moves t's signature.
    const uChanged = node("u", "proc.U", { p: "different" });
    expect(sig([atDispatch, u], edges, "t")).not.toBe(
      sig([atDispatch, uChanged], edges, "t")
    );
  });

  it("H13b: dynamic_properties fed by an inbound edge are also excluded", () => {
    const u = node("u", "proc.U");
    const edges = [edge("e", "u", "t", "x")];
    const a = node("t", "proc.T", {}, { dynamic_properties: { x: "a" } });
    const b = node("t", "proc.T", {}, { dynamic_properties: { x: "b" } });
    expect(sig([a, u], edges, "t")).toBe(sig([b, u], edges, "t"));
  });
});

describe("computeInputSignatures", () => {
  // Mixed graph: constant → computed → target, plus a generative branch.
  const t = node("t", "proc.T");
  const m = node("m", "proc.M");
  const c = node("c", "nodetool.constant.Integer", { value: 1 });
  const g = node("g", "gen.Image");
  const nodes = [t, m, c, g];
  const edges = [
    edge("e1", "m", "t", "a"),
    edge("e2", "c", "m", "x"),
    edge("e3", "g", "t", "b")
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ctx: HasherContext = {
    findNode: (id) => byId.get(id),
    inboundEdges: (id) => edges.filter((e) => e.target === id),
    getMetadata,
    currentGenerationId: (id) =>
      (({ g: "gen-1" }) as Record<string, string>)[id]
  };

  it("returns each id's inputSignature, identical to createNodeHasher(ctx).inputSignature(id)", () => {
    const ids = ["t", "m", "c", "g"];
    const sigs = computeInputSignatures(ids, ctx);
    // A fresh, independent hasher over the same ctx is the contract: a stamp
    // computed here must later match a resolve()/buildRunSubgraph lookup.
    const ref = createNodeHasher(ctx);
    for (const id of ids) {
      expect(sigs[id]).toBe(ref.inputSignature(id));
    }
    expect(Object.keys(sigs).sort()).toEqual([...ids].sort());
  });

  it("computes only the requested ids", () => {
    const sigs = computeInputSignatures(["m"], ctx);
    expect(Object.keys(sigs)).toEqual(["m"]);
    expect(sigs.m).toBe(createNodeHasher(ctx).inputSignature("m"));
  });

  it("returns an empty object for an empty id set", () => {
    expect(computeInputSignatures([], ctx)).toEqual({});
  });
});
