import { Edge, Node } from "@xyflow/react";
import { buildRunSubgraph } from "../runSubgraph";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata } from "../../stores/ApiTypes";
import { createNodeHasher } from "../nodeHash";
import { getCurrentGeneration, type Generation } from "../nodeGenerations";

const WF = "wf1";
const NOW = 1_700_000_000_000;
const HOUR_MS = 3600 * 1000;

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

/**
 * Per-type metadata by prefix convention:
 *  - nodetool.constant.* / nodetool.input.* → Constant
 *  - gen.*                                  → Generative (auto_save_asset)
 *  - pure.* / nodetool.text.Prompt          → Computed, cache_ttl "forever"
 *  - ttl.*                                  → Computed, cache_ttl 3600
 *  - vol.*                                  → Computed, cache_ttl 0
 *  - anything else (proc.*)                 → Computed, no cache_ttl (re-run)
 */
const PURE_TYPES = new Set(["nodetool.text.Prompt"]);
const baseMeta = (type: string): NodeMetadata =>
  ({
    auto_save_asset: type.startsWith("gen."),
    cache_ttl: type.startsWith("pure.") || PURE_TYPES.has(type)
      ? "forever"
      : type.startsWith("ttl.")
        ? 3600
        : type.startsWith("vol.")
          ? 0
          : undefined,
    title: type,
    properties: []
  }) as unknown as NodeMetadata;

/** Decorate a getMetadata so the named types expose list[image] input handles. */
const withListHandles = (
  base: (t: string) => NodeMetadata,
  handlesByType: Record<string, string[]>
) =>
  (type: string): NodeMetadata => {
    const meta = base(type);
    const handles = handlesByType[type];
    if (!handles) return meta;
    return {
      ...meta,
      properties: handles.map((name) => ({
        name,
        type: { type: "list", type_args: [{ type: "image", type_args: [] }] }
      }))
    } as unknown as NodeMetadata;
  };

/**
 * The input signature a node WOULD be stamped with at dispatch — computed
 * against the same graph with the same hasher the resolver uses. Stamping a
 * cached generation with this value is exactly what makes a Computed reuse hit
 * (spec §3.4). A node's own generations never feed back into its own signature,
 * so this is stable regardless of what we later put in `gens[id]`.
 */
const sigOf = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  getMetadata: (t: string) => NodeMetadata | undefined,
  gens: Record<string, Generation[]>,
  id: string
): string =>
  createNodeHasher({
    findNode: (i) => nodes.find((n) => n.id === i),
    inboundEdges: (i) => edges.filter((e) => e.target === i),
    getMetadata,
    currentGenerationId: (i) =>
      getCurrentGeneration(
        gens[i] ?? [],
        nodes.find((n) => n.id === i)?.data?.selected_generation
      )?.id
  }).inputSignature(id);

const build = (
  targetId: string,
  nodes: Node<NodeData>[],
  edges: Edge[],
  opts: {
    getMetadata?: (t: string) => NodeMetadata | undefined;
    gens?: Record<string, Generation[]>;
    now?: number;
  } = {}
) =>
  buildRunSubgraph({
    targetId,
    nodes,
    edges,
    workflowId: WF,
    getMetadata: opts.getMetadata ?? baseMeta,
    getGenerations: (_wf: string, id: string) => opts.gens?.[id] ?? [],
    now: opts.now ?? NOW
  });

const propsOf = (sub: ReturnType<typeof build>, id: string) =>
  sub.nodes.find((n) => n.id === id)!.data.properties;

describe("buildRunSubgraph", () => {
  it("runs a node with no inputs by itself", () => {
    const target = node("t", "proc.Plain");
    const sub = build("t", [target], []);
    expect(sub.nodeIds).toEqual(new Set(["t"]));
    expect(sub.edges).toEqual([]);
    expect(sub.blocked).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // §7.3 Constant
  // -------------------------------------------------------------------------
  describe("Constant (§7.3)", () => {
    it("S1: constant upstream → live value inlined, source pruned", () => {
      const target = node("t", "proc.Plain");
      const c = node("c", "nodetool.constant.String", { value: "hi" });
      const sub = build("t", [target, c], [edge("e", "c", "t")]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(sub.edges).toEqual([]);
      expect(propsOf(sub, "t").input).toBe("hi");
      expect(sub.blocked).toEqual([]);
    });

    it("S2: constant with a stale cached generation → live value inlined (not the cache)", () => {
      const target = node("t", "proc.Plain");
      const c = node("c", "nodetool.constant.String", { value: "fresh" });
      const sub = build("t", [target, c], [edge("e", "c", "t")], {
        gens: { c: [gen({ id: "gc", outputs: { output: "stale" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toBe("fresh");
    });

    it("S3: nodetool.input.* is treated as a Constant", () => {
      const target = node("t", "proc.Plain");
      const c = node("c", "nodetool.input.StringInput", { value: "x" });
      const sub = build("t", [target, c], [edge("e", "c", "t")]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toBe("x");
    });

    it("S4: a constant feeding two handles is inlined to both", () => {
      const target = node("t", "proc.Plain");
      const c = node("c", "nodetool.constant.Integer", { value: 7 });
      const sub = build("t", [target, c], [
        edge("e1", "c", "t", "a"),
        edge("e2", "c", "t", "b")
      ]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").a).toBe(7);
      expect(propsOf(sub, "t").b).toBe(7);
    });

    it("S5: constant with undefined value falls through to Computed (included & run)", () => {
      const target = node("t", "proc.Plain");
      const c = node("c", "nodetool.constant.String"); // no value
      const sub = build("t", [target, c], [edge("e", "c", "t")]);
      expect(sub.nodeIds).toEqual(new Set(["t", "c"]));
      expect(sub.edges.map((e) => e.id)).toEqual(["e"]);
      expect(propsOf(sub, "t").input).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // §7.4 Computed
  // -------------------------------------------------------------------------
  describe("Computed (§7.4)", () => {
    it("S6: pure computed, cache hit → output inlined, source pruned (NOT submitted)", () => {
      const target = node("t", "proc.Plain");
      const u = node("u", "pure.Format", { x: 1 });
      const nodes = [target, u];
      const edges = [edge("e", "u", "t")];
      const sig = sigOf(nodes, edges, baseMeta, {}, "u");
      const sub = build("t", nodes, edges, {
        gens: { u: [gen({ id: "gu", inputSignature: sig, outputs: { output: "cached" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(sub.edges).toEqual([]);
      expect(propsOf(sub, "t").input).toBe("cached");
    });

    it("S7: pure computed, cache miss (input changed) → included & re-run", () => {
      const target = node("t", "proc.Plain");
      const u = node("u", "pure.Format", { x: 2 });
      const sub = build("t", [target, u], [edge("e", "u", "t")], {
        gens: { u: [gen({ id: "gu", inputSignature: "stale", outputs: { output: "old" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["t", "u"]));
      expect(sub.edges.map((e) => e.id)).toEqual(["e"]);
      expect(propsOf(sub, "t").input).toBeUndefined();
    });

    it("S8: edited Prompt (cache miss) → included & re-run with current text, no stale value on target", () => {
      const target = node("agent", "proc.Agent");
      const prompt = node("p", "nodetool.text.Prompt", { prompt: "Say C" });
      const sub = build("agent", [target, prompt], [edge("e", "p", "agent", "prompt")], {
        // Stale generation from a prior run with the old text.
        gens: { p: [gen({ id: "gp", inputSignature: "old", outputs: { output: "Say B" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["agent", "p"]));
      expect(propsOf(sub, "p").prompt).toBe("Say C");
      expect(propsOf(sub, "agent").prompt).toBeUndefined();
    });

    it("S9: unchanged Prompt (cache hit) → output inlined, source pruned", () => {
      const target = node("agent", "proc.Agent");
      const prompt = node("p", "nodetool.text.Prompt", { prompt: "Say C" });
      const nodes = [target, prompt];
      const edges = [edge("e", "p", "agent", "prompt")];
      const sig = sigOf(nodes, edges, baseMeta, {}, "p");
      const sub = build("agent", nodes, edges, {
        gens: { p: [gen({ id: "gp", inputSignature: sig, outputs: { output: "Say C result" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["agent"]));
      expect(propsOf(sub, "agent").prompt).toBe("Say C result");
    });

    it("S10: computed→computed chain all cache-hit → all pruned, only target submitted", () => {
      const t = node("t", "proc.Plain");
      const m = node("m", "pure.A", { x: 1 });
      const n = node("n", "pure.B", { y: 2 });
      const nodes = [t, m, n];
      const edges = [edge("e1", "m", "t"), edge("e2", "n", "m")];
      const sigN = sigOf(nodes, edges, baseMeta, {}, "n");
      const gensWithN = { n: [gen({ id: "gn", inputSignature: sigN, outputs: { output: "nval" } })] };
      const sigM = sigOf(nodes, edges, baseMeta, gensWithN, "m");
      const sub = build("t", nodes, edges, {
        gens: {
          ...gensWithN,
          m: [gen({ id: "gm", inputSignature: sigM, outputs: { output: "mval" } })]
        }
      });
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(sub.edges).toEqual([]);
      expect(propsOf(sub, "t").input).toBe("mval");
    });

    it("S11: chain, leaf changed → leaf + descendants submitted; unaffected branch pruned", () => {
      const t = node("t", "proc.Plain");
      const m = node("m", "pure.A", { x: 1 });
      const leaf = node("leaf", "pure.Leaf", { z: 9 });
      const b = node("b", "pure.B", { y: 2 });
      const nodes = [t, m, leaf, b];
      const edges = [
        edge("eM", "m", "t", "a"),
        edge("eL", "leaf", "m"),
        edge("eB", "b", "t", "b")
      ];
      const sigM = sigOf(nodes, edges, baseMeta, {}, "m");
      const sigB = sigOf(nodes, edges, baseMeta, {}, "b");
      const sub = build("t", nodes, edges, {
        gens: {
          // leaf cached with a STALE signature → leaf re-runs.
          leaf: [gen({ id: "gl", inputSignature: "stale-leaf" })],
          // m's own cache matches, but its upstream re-runs → m must re-run too.
          m: [gen({ id: "gm", inputSignature: sigM, outputs: { output: "mval" } })],
          // b is an independent fresh branch → reused.
          b: [gen({ id: "gb", inputSignature: sigB, outputs: { output: "bval" } })]
        }
      });
      expect(sub.nodeIds).toEqual(new Set(["t", "m", "leaf"]));
      expect(propsOf(sub, "t").b).toBe("bval"); // b pruned, inlined
      expect(propsOf(sub, "t").a).toBeUndefined(); // m runs, no inline
    });

    it("S12: finite-TTL fetch expired → fetch included & re-run", () => {
      const t = node("t", "proc.Plain");
      const f = node("f", "ttl.Fetch", { url: "u" });
      const nodes = [t, f];
      const edges = [edge("e", "f", "t")];
      const sig = sigOf(nodes, edges, baseMeta, {}, "f");
      const sub = build("t", nodes, edges, {
        gens: { f: [gen({ id: "gf", inputSignature: sig, createdAt: NOW - HOUR_MS - 1, outputs: { output: "old" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["t", "f"]));
      expect(propsOf(sub, "t").input).toBeUndefined();
    });

    it("S13: finite-TTL fetch within TTL → output inlined, pruned", () => {
      const t = node("t", "proc.Plain");
      const f = node("f", "ttl.Fetch", { url: "u" });
      const nodes = [t, f];
      const edges = [edge("e", "f", "t")];
      const sig = sigOf(nodes, edges, baseMeta, {}, "f");
      const sub = build("t", nodes, edges, {
        gens: { f: [gen({ id: "gf", inputSignature: sig, createdAt: NOW - 1000, outputs: { output: "fresh" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toBe("fresh");
    });

    it("S14: cacheTtl=0 node (Random) → always included & re-run, never inlined", () => {
      const t = node("t", "proc.Plain");
      const r = node("r", "vol.Random", {});
      const nodes = [t, r];
      const edges = [edge("e", "r", "t")];
      const sig = sigOf(nodes, edges, baseMeta, {}, "r");
      const sub = build("t", nodes, edges, {
        gens: { r: [gen({ id: "gr", inputSignature: sig, outputs: { output: 0.5 } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["t", "r"]));
      expect(propsOf(sub, "t").input).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // §7.5 Generative (history-based)
  // -------------------------------------------------------------------------
  describe("Generative (§7.5)", () => {
    it("S15: completed current generation → output inlined, pruned (no hash check)", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image");
      const sub = build("t", [t, g], [edge("e", "g", "t")], {
        gens: { g: [gen({ id: "gg", outputs: { output: { uri: "x.png", type: "image" } } })] }
      });
      expect(sub.blocked).toEqual([]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toEqual({ uri: "x.png", type: "image" });
    });

    it("S16: no completed generation → BLOCK", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image");
      const sub = build("t", [t, g], [edge("e", "g", "t")]);
      expect(sub.blocked).toEqual([{ nodeId: "g", title: "gen.Image" }]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(sub.edges).toEqual([]);
    });

    it("S17: in-flight (running) generation → BLOCK", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image");
      const sub = build("t", [t, g], [edge("e", "g", "t")], {
        gens: { g: [gen({ id: "gg", status: "running" })] }
      });
      expect(sub.blocked).toEqual([{ nodeId: "g", title: "gen.Image" }]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
    });

    it("S18a: errored current with no completed fallback → BLOCK", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image");
      const sub = build("t", [t, g], [edge("e", "g", "t")], {
        gens: { g: [gen({ id: "gg", status: "error" })] }
      });
      expect(sub.blocked).toEqual([{ nodeId: "g", title: "gen.Image" }]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
    });

    it("S18b: errored current with an older completed gen → inline the latest completed", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image");
      const sub = build("t", [t, g], [edge("e", "g", "t")], {
        gens: {
          g: [
            gen({ id: "old", status: "completed", outputs: { output: "ok" } }),
            gen({ id: "new", status: "error" })
          ]
        }
      });
      expect(sub.blocked).toEqual([]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toBe("ok");
    });

    it("S19: inputs changed since the generation → STILL inlined (no block)", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image");
      // Generation's inputSignature is irrelevant for generatives — reuse keys on
      // generation id, not the hash.
      const sub = build("t", [t, g], [edge("e", "g", "t")], {
        gens: { g: [gen({ id: "gg", inputSignature: "anything", outputs: { output: "v" } })] }
      });
      expect(sub.blocked).toEqual([]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toBe("v");
    });

    it("S20: explicitly pinned generation → that generation inlined", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image", {}, { selected_generation: "pinned" });
      const sub = build("t", [t, g], [edge("e", "g", "t")], {
        gens: {
          g: [
            gen({ id: "pinned", outputs: { output: "A" } }),
            gen({ id: "newer", outputs: { output: "B" } })
          ]
        }
      });
      expect(propsOf(sub, "t").input).toBe("A");
    });

    it("S20b: pinned generation that is NOT completed → BLOCK (no silent fallback)", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image", {}, { selected_generation: "pinned" });
      const sub = build("t", [t, g], [edge("e", "g", "t")], {
        gens: {
          g: [
            gen({ id: "pinned", status: "error" }),
            gen({ id: "other", outputs: { output: "B" } })
          ]
        }
      });
      expect(sub.blocked).toEqual([{ nodeId: "g", title: "gen.Image" }]);
      expect(propsOf(sub, "t").input).toBeUndefined();
    });

    it("S21: G1 → G2 → target, both have generations → both reused, only target submitted", () => {
      const t = node("t", "proc.Plain");
      const g2 = node("g2", "gen.Edit");
      const g1 = node("g1", "gen.Image");
      const sub = build("t", [t, g2, g1], [edge("e1", "g2", "t"), edge("e2", "g1", "g2")], {
        gens: {
          g2: [gen({ id: "g2gen", outputs: { output: "g2out" } })],
          g1: [gen({ id: "g1gen", outputs: { output: "g1out" } })]
        }
      });
      expect(sub.blocked).toEqual([]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toBe("g2out");
    });
  });

  // -------------------------------------------------------------------------
  // §7.6 multi-select replay (explicit)
  // -------------------------------------------------------------------------
  describe("multi-select replay (§7.6)", () => {
    const selA = { uri: "a.png", type: "image" };
    const selB = { uri: "b.png", type: "image" };
    const multiGens = {
      g: [
        gen({ id: "a", outputs: { output: selA } }),
        gen({ id: "b", outputs: { output: selB } })
      ]
    };
    const multiNode = () =>
      node("g", "gen.Image", {}, { selected_generations: ["a", "b"] });

    const expectReplay = (
      sub: ReturnType<typeof build>,
      targetHandle: string
    ): void => {
      expect(sub.blocked).toEqual([]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      const replay = sub.nodes.find((n) => n.type === "nodetool.control.ForEach")!;
      expect(replay).toBeDefined();
      expect(replay.data.properties.input_list).toEqual([selA, selB]);
      const replayEdge = sub.edges.find((e) => e.source === replay.id)!;
      expect(replayEdge.sourceHandle).toBe("output");
      expect(replayEdge.target).toBe("t");
      expect(replayEdge.targetHandle).toBe(targetHandle);
      expect(sub.nodes.some((n) => n.id === "g")).toBe(false);
      expect(sub.edges.some((e) => e.source === "g")).toBe(false);
      expect(propsOf(sub, "t")[targetHandle]).toBeUndefined();
    };

    it("S22b: ≥2 selected but NONE completed → BLOCK (no empty replay)", () => {
      const g = node("g", "gen.Image", {}, { selected_generations: ["a", "b"] });
      const sub = build("t", [node("t", "proc.Plain"), g], [edge("e", "g", "t", "tiles")], {
        gens: {
          g: [gen({ id: "a", status: "error" }), gen({ id: "b", status: "running" })]
        }
      });
      expect(sub.blocked).toEqual([{ nodeId: "g", title: "gen.Image" }]);
      expect(sub.nodes.some((n) => n.type === "nodetool.control.ForEach")).toBe(false);
    });

    it("S22/S24: ≥2 selected into a LIST handle → one ForEach replay, source pruned", () => {
      const sub = build("t", [node("t", "proc.Plain"), multiNode()], [
        edge("e", "g", "t", "tiles")
      ], {
        getMetadata: withListHandles(baseMeta, { "proc.Plain": ["tiles"] }),
        gens: multiGens
      });
      expectReplay(sub, "tiles");
    });

    it("S23: ≥2 selected into a SCALAR handle → replay too (no list gate)", () => {
      const sub = build("t", [node("t", "proc.Plain"), multiNode()], [
        edge("e", "g", "t", "input")
      ], { gens: multiGens });
      expectReplay(sub, "input");
    });

    it("S25: <2 selected → single-generation path (no ForEach)", () => {
      const g = node("g", "gen.Image", {}, { selected_generations: ["a"] });
      const sub = build("t", [node("t", "proc.Plain"), g], [edge("e", "g", "t")], {
        gens: { g: [gen({ id: "a", outputs: { output: selA } })] }
      });
      expect(sub.nodes.some((n) => n.type === "nodetool.control.ForEach")).toBe(false);
      expect(propsOf(sub, "t").input).toEqual(selA);
    });

    it("S26: empty selected set → single-generation path (no ForEach)", () => {
      const g = node("g", "gen.Image", {}, { selected_generations: [] });
      const sub = build("t", [node("t", "proc.Plain"), g], [edge("e", "g", "t")], {
        gens: { g: [gen({ id: "a", outputs: { output: selA } })] }
      });
      expect(sub.nodes.some((n) => n.type === "nodetool.control.ForEach")).toBe(false);
      expect(propsOf(sub, "t").input).toEqual(selA);
    });

    it("S27: multi-select feeding the same target handle twice → exactly one replay node", () => {
      const sub = build("t", [node("t", "proc.Plain"), multiNode()], [
        edge("e1", "g", "t", "tiles"),
        edge("e2", "g", "t", "tiles")
      ], {
        getMetadata: withListHandles(baseMeta, { "proc.Plain": ["tiles"] }),
        gens: multiGens
      });
      const replays = sub.nodes.filter((n) => n.type === "nodetool.control.ForEach");
      expect(replays).toHaveLength(1);
      expect(sub.edges.filter((e) => e.source === replays[0].id)).toHaveLength(1);
    });

    it("S27b: changing selected_generations [a,b]→[a,c] changes a downstream computed's signature", () => {
      const t = node("t", "proc.Plain");
      const c = node("c", "pure.Format");
      const gAB = node("g", "gen.Image", {}, { selected_generations: ["a", "b"] });
      const gAC = node("g", "gen.Image", {}, { selected_generations: ["a", "c"] });
      const edges = [edge("e1", "c", "t"), edge("e2", "g", "c")];
      const gens = {
        g: [
          gen({ id: "a", outputs: { output: selA } }),
          gen({ id: "b", outputs: { output: selB } }),
          gen({ id: "c", outputs: { output: { uri: "c.png", type: "image" } } })
        ]
      };
      const sigAB = sigOf([t, c, gAB], edges, baseMeta, gens, "c");
      const sigAC = sigOf([t, c, gAC], edges, baseMeta, gens, "c");
      expect(sigAB).not.toBe(sigAC);
    });
  });

  // -------------------------------------------------------------------------
  // §7.7 aggregation, dedup, sharing, edges
  // -------------------------------------------------------------------------
  describe("aggregation / dedup / sharing / edges (§7.7)", () => {
    const listMeta = withListHandles(baseMeta, { "lib.Grid": ["tiles"] });

    it("S28: two generatives into one list handle → outputs aggregated into a list", () => {
      const grid = node("grid", "lib.Grid");
      const a = node("a", "gen.Image");
      const b = node("b", "gen.Image");
      const sub = build("grid", [grid, a, b], [
        edge("e1", "a", "grid", "tiles"),
        edge("e2", "b", "grid", "tiles")
      ], {
        getMetadata: listMeta,
        gens: {
          a: [gen({ id: "ga", outputs: { output: { uri: "a.png", type: "image" } } })],
          b: [gen({ id: "gb", outputs: { output: { uri: "b.png", type: "image" } } })]
        }
      });
      expect(sub.blocked).toEqual([]);
      expect(sub.nodeIds).toEqual(new Set(["grid"]));
      expect(propsOf(sub, "grid").tiles).toEqual([
        { uri: "a.png", type: "image" },
        { uri: "b.png", type: "image" }
      ]);
    });

    it("S29: two generatives into one list handle, one without a gen → BLOCK (the empty one)", () => {
      const grid = node("grid", "lib.Grid");
      const a = node("a", "gen.Image");
      const b = node("b", "gen.Image");
      const sub = build("grid", [grid, a, b], [
        edge("e1", "a", "grid", "tiles"),
        edge("e2", "b", "grid", "tiles")
      ], {
        getMetadata: listMeta,
        gens: { a: [gen({ id: "ga", outputs: { output: { uri: "a.png", type: "image" } } })] }
      });
      expect(sub.blocked).toEqual([{ nodeId: "b", title: "gen.Image" }]);
    });

    it("S30: one generative feeding two handles → inlined to both, single source pruned", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image");
      const sub = build("t", [t, g], [
        edge("e1", "g", "t", "a"),
        edge("e2", "g", "t", "b")
      ], { gens: { g: [gen({ id: "gg", outputs: { output: "v" } })] } });
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").a).toBe("v");
      expect(propsOf(sub, "t").b).toBe("v");
    });

    it("S31: one generative with no gen feeding two handles → blocked once (dedup)", () => {
      const t = node("t", "proc.Plain");
      const g = node("g", "gen.Image");
      const sub = build("t", [t, g], [
        edge("e1", "g", "t", "a"),
        edge("e2", "g", "t", "b")
      ]);
      expect(sub.blocked).toHaveLength(1);
      expect(sub.blocked[0].nodeId).toBe("g");
    });

    it("S32: constant + computed into different handles → constant inlined, computed per cache state", () => {
      const t = node("t", "proc.Plain");
      const c = node("c", "nodetool.constant.String", { value: "k" });
      const u = node("u", "pure.Format", { x: 1 });
      const nodes = [t, c, u];
      const edges = [edge("e1", "c", "t", "a"), edge("e2", "u", "t", "b")];
      const sigU = sigOf(nodes, edges, baseMeta, {}, "u");
      const sub = build("t", nodes, edges, {
        gens: { u: [gen({ id: "gu", inputSignature: sigU, outputs: { output: "uval" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").a).toBe("k");
      expect(propsOf(sub, "t").b).toBe("uval");
    });

    it("S33: diamond t←A←C, t←B←C → C inlined into A and B", () => {
      const t = node("t", "proc.Plain");
      const a = node("A", "proc.A");
      const b = node("B", "proc.B");
      const c = node("C", "nodetool.constant.String", { value: "shared" });
      const sub = build("t", [t, a, b, c], [
        edge("eA", "A", "t", "a"),
        edge("eB", "B", "t", "b"),
        edge("eCA", "C", "A"),
        edge("eCB", "C", "B")
      ]);
      expect(sub.nodeIds).toEqual(new Set(["t", "A", "B"]));
      expect(propsOf(sub, "A").input).toBe("shared");
      expect(propsOf(sub, "B").input).toBe("shared");
    });

    it("S34: dangling edge with a cache → reuse, then skip", () => {
      const t = node("t", "proc.Plain");
      const sub = build("t", [t], [edge("e", "ghost", "t")], {
        gens: { ghost: [gen({ id: "gh", outputs: { output: "cached" } })] }
      });
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toBe("cached");
      expect(sub.blocked).toEqual([]);
    });

    it("S35: dangling edge, no cache → dropped", () => {
      const t = node("t", "proc.Plain");
      const sub = build("t", [t], [edge("e", "ghost", "t")]);
      expect(sub.nodeIds).toEqual(new Set(["t"]));
      expect(propsOf(sub, "t").input).toBeUndefined();
      expect(sub.blocked).toEqual([]);
    });

    // S36: bypass — the web bundle does NOT depend on @nodetool-ai/kernel and the
    // kernel rewriteBypassedNodes operates on protocol GraphData/NodeDescriptor
    // (with outputs/propertyTypes maps), not ReactFlow Node<NodeData>. It is not
    // cleanly importable, so per the spec the coarse `bypassed`-in-hash fallback
    // is kept (already folded into inputSignature) and these per-handle rewrite
    // sub-cases are deferred.
    it.todo(
      "S36: bypassed upstream is bypass-rewritten first (kernel rewriteBypassedNodes) — deferred: kernel not importable from web; coarse bypassed-in-hash fallback used"
    );

    it("S37: cycle region → treated as a unit, no infinite recursion", () => {
      const t = node("t", "proc.Plain");
      const a = node("a", "proc.A");
      const b = node("b", "proc.B");
      const sub = build("t", [t, a, b], [
        edge("eA", "a", "t"),
        edge("eBA", "b", "a"),
        edge("eAB", "a", "b")
      ]);
      expect(sub.nodeIds).toEqual(new Set(["t", "a", "b"]));
      expect(sub.blocked).toEqual([]);
    });

    // S38: stamping a run generative's generation with the full-graph signature
    // happens in the dispatcher (handleUpdate / workflowUpdates.ts, spec §3.4),
    // not in buildRunSubgraph. buildRunSubgraph only ever submits the target.
    it("S38: a generative target is always submitted (stamping is dispatcher-side)", () => {
      const g = node("g", "gen.Image");
      const c = node("c", "nodetool.constant.String", { value: "p" });
      const sub = build("g", [g, c], [edge("e", "c", "g", "prompt")]);
      expect(sub.nodeIds).toEqual(new Set(["g"]));
      expect(propsOf(sub, "g").prompt).toBe("p");
      expect(sub.blocked).toEqual([]);
    });
    // S38: the dispatcher stamping the run generative's generation with the
    // live-full-graph inputSignature lives in handleUpdate (workflowUpdates.ts,
    // §3.4), so its real test lives next to that reducer:
    // src/stores/__tests__/workflowUpdates.signatures.test.ts.

  });
});
