import type { NodeKind } from "../nodeHash";
import type { Generation } from "../nodeGenerations";
import { resolve, type ResolveContext, type ResolveDecision } from "../runResolve";

// Fixed clock so finite-TTL freshness is deterministic.
const NOW = 1_700_000_000_000;

interface NodeSpec {
  kind: NodeKind;
  signature?: string;
  upstreams?: string[];
  ttl?: number | "forever";
  generations?: Generation[];
  selectedGenerationIds?: string[];
  selectedGenerationId?: string;
}

const gen = (overrides: Partial<Generation> & { id: string }): Generation => ({
  jobId: null,
  createdAt: NOW,
  outputs: {},
  status: "completed",
  ...overrides
});

const ctxOf = (
  nodes: Record<string, NodeSpec>,
  now: number = NOW
): ResolveContext => ({
  classify: (id) => nodes[id]?.kind ?? "computed",
  inputSignature: (id) => nodes[id]?.signature ?? id,
  upstreamIds: (id) => nodes[id]?.upstreams ?? [],
  cacheTtl: (id) => nodes[id]?.ttl,
  generations: (id) => nodes[id]?.generations ?? [],
  selectedGenerationIds: (id) => nodes[id]?.selectedGenerationIds ?? [],
  selectedGenerationId: (id) => nodes[id]?.selectedGenerationId,
  now
});

const decide = (nodes: Record<string, NodeSpec>, id: string, now?: number) =>
  resolve(id, ctxOf(nodes, now));

const HOUR_MS = 3600 * 1000;

describe("resolve — constant", () => {
  it("constant always reuses (its live value, never dirty)", () => {
    expect(decide({ c: { kind: "constant" } }, "c")).toBe<ResolveDecision>(
      "reuse"
    );
  });
});

describe("resolve — Computed cache + TTL (spec §7.2 R1–R14)", () => {
  it("R1: pure computed (forever), cached gen with matching signature → reuse", () => {
    const nodes: Record<string, NodeSpec> = {
      n: {
        kind: "computed",
        signature: "sig",
        ttl: "forever",
        generations: [gen({ id: "g1", inputSignature: "sig" })]
      }
    };
    expect(decide(nodes, "n")).toBe("reuse");
  });

  it("R2: pure computed, no cached gen → run", () => {
    const nodes: Record<string, NodeSpec> = {
      n: { kind: "computed", signature: "sig", ttl: "forever", generations: [] }
    };
    expect(decide(nodes, "n")).toBe("run");
  });

  it("R3: pure computed, cached gen with DIFFERENT signature (input changed) → run", () => {
    const nodes: Record<string, NodeSpec> = {
      n: {
        kind: "computed",
        signature: "sig",
        ttl: "forever",
        generations: [gen({ id: "g1", inputSignature: "other" })]
      }
    };
    expect(decide(nodes, "n")).toBe("run");
  });

  it("R4: cacheTtl=0 computed, even with a matching fresh gen → run (never reuse)", () => {
    const nodes: Record<string, NodeSpec> = {
      n: {
        kind: "computed",
        signature: "sig",
        ttl: 0,
        generations: [gen({ id: "g1", inputSignature: "sig" })]
      }
    };
    expect(decide(nodes, "n")).toBe("run");
  });

  it("R5: unset cacheTtl (default opt-in / 0) → run even with a matching gen", () => {
    const nodes: Record<string, NodeSpec> = {
      n: {
        kind: "computed",
        signature: "sig",
        generations: [gen({ id: "g1", inputSignature: "sig" })]
      }
    };
    expect(decide(nodes, "n")).toBe("run");
  });

  it("R6: finite TTL, matching gen, age < ttl → reuse", () => {
    const nodes: Record<string, NodeSpec> = {
      n: {
        kind: "computed",
        signature: "sig",
        ttl: 3600,
        generations: [
          gen({ id: "g1", inputSignature: "sig", createdAt: NOW - 1000 })
        ]
      }
    };
    expect(decide(nodes, "n")).toBe("reuse");
  });

  it("R7: finite TTL, matching gen, age ≥ ttl → run (expired)", () => {
    const nodes: Record<string, NodeSpec> = {
      n: {
        kind: "computed",
        signature: "sig",
        ttl: 3600,
        generations: [
          gen({ id: "g1", inputSignature: "sig", createdAt: NOW - HOUR_MS - 1 })
        ]
      }
    };
    expect(decide(nodes, "n")).toBe("run");
  });

  it("R8: finite TTL, age exactly at boundary → run (strict < at ==)", () => {
    const nodes: Record<string, NodeSpec> = {
      n: {
        kind: "computed",
        signature: "sig",
        ttl: 3600,
        generations: [
          gen({ id: "g1", inputSignature: "sig", createdAt: NOW - HOUR_MS })
        ]
      }
    };
    expect(decide(nodes, "n")).toBe("run");
  });

  it("R9: pure computed M ← finite-TTL F, F within TTL → both reuse", () => {
    const nodes: Record<string, NodeSpec> = {
      M: {
        kind: "computed",
        signature: "sigM",
        ttl: "forever",
        upstreams: ["F"],
        generations: [gen({ id: "gM", inputSignature: "sigM" })]
      },
      F: {
        kind: "computed",
        signature: "sigF",
        ttl: 3600,
        generations: [
          gen({ id: "gF", inputSignature: "sigF", createdAt: NOW - 1000 })
        ]
      }
    };
    expect(decide(nodes, "F")).toBe("reuse");
    expect(decide(nodes, "M")).toBe("reuse");
  });

  it("R10: pure computed M ← finite-TTL F, F expired → F run AND M run (anyUpstreamWillRun)", () => {
    const nodes: Record<string, NodeSpec> = {
      M: {
        kind: "computed",
        signature: "sigM",
        ttl: "forever",
        upstreams: ["F"],
        generations: [gen({ id: "gM", inputSignature: "sigM" })]
      },
      F: {
        kind: "computed",
        signature: "sigF",
        ttl: 3600,
        generations: [
          gen({
            id: "gF",
            inputSignature: "sigF",
            createdAt: NOW - HOUR_MS - 1
          })
        ]
      }
    };
    expect(decide(nodes, "F")).toBe("run");
    expect(decide(nodes, "M")).toBe("run");
  });

  it("R11: deep pure chain M ← N ← F(expired) → F, N, M all run", () => {
    const nodes: Record<string, NodeSpec> = {
      M: {
        kind: "computed",
        signature: "sigM",
        ttl: "forever",
        upstreams: ["N"],
        generations: [gen({ id: "gM", inputSignature: "sigM" })]
      },
      N: {
        kind: "computed",
        signature: "sigN",
        ttl: "forever",
        upstreams: ["F"],
        generations: [gen({ id: "gN", inputSignature: "sigN" })]
      },
      F: {
        kind: "computed",
        signature: "sigF",
        ttl: 3600,
        generations: [
          gen({
            id: "gF",
            inputSignature: "sigF",
            createdAt: NOW - HOUR_MS - 1
          })
        ]
      }
    };
    expect(decide(nodes, "F")).toBe("run");
    expect(decide(nodes, "N")).toBe("run");
    expect(decide(nodes, "M")).toBe("run");
  });

  it("R12: computed with a BLOCK upstream → block (propagates)", () => {
    const nodes: Record<string, NodeSpec> = {
      C: {
        kind: "computed",
        signature: "sigC",
        ttl: "forever",
        upstreams: ["G"],
        generations: [gen({ id: "gC", inputSignature: "sigC" })]
      },
      G: { kind: "generative", generations: [] }
    };
    expect(decide(nodes, "C")).toBe("block");
  });

  it("R13: computed fed by a fresh Generative → reuse (own cache valid, generative reused)", () => {
    const nodes: Record<string, NodeSpec> = {
      C: {
        kind: "computed",
        signature: "sigC",
        ttl: "forever",
        upstreams: ["G"],
        generations: [gen({ id: "gC", inputSignature: "sigC" })]
      },
      G: { kind: "generative", generations: [gen({ id: "gG" })] }
    };
    expect(decide(nodes, "C")).toBe("reuse");
  });

  it("R14: computed fed by a re-pointed Generative (signature changed) → run", () => {
    const nodes: Record<string, NodeSpec> = {
      C: {
        kind: "computed",
        signature: "sigC_new",
        ttl: "forever",
        upstreams: ["G"],
        // Cache was built on the old upstream identity.
        generations: [gen({ id: "gC", inputSignature: "sigC_old" })]
      },
      G: { kind: "generative", generations: [gen({ id: "gG2" })] }
    };
    expect(decide(nodes, "C")).toBe("run");
  });
});

describe("resolve — Generative (history-based)", () => {
  it("single completed generation → reuse", () => {
    const nodes: Record<string, NodeSpec> = {
      G: { kind: "generative", generations: [gen({ id: "g1" })] }
    };
    expect(decide(nodes, "G")).toBe("reuse");
  });

  it("no generation → block", () => {
    const nodes: Record<string, NodeSpec> = {
      G: { kind: "generative", generations: [] }
    };
    expect(decide(nodes, "G")).toBe("block");
  });

  it("≥2 selected generations → replay", () => {
    const nodes: Record<string, NodeSpec> = {
      G: {
        kind: "generative",
        selectedGenerationIds: ["a", "b"],
        generations: [gen({ id: "a" }), gen({ id: "b" })]
      }
    };
    expect(decide(nodes, "G")).toBe("replay");
  });

  it("errored current generation but an older completed gen exists → reuse (latest completed)", () => {
    const nodes: Record<string, NodeSpec> = {
      G: {
        kind: "generative",
        generations: [
          gen({ id: "old", status: "completed" }),
          gen({ id: "new", status: "error" })
        ]
      }
    };
    expect(decide(nodes, "G")).toBe("reuse");
  });

  it("in-flight (running) current generation, no completed gen → block", () => {
    const nodes: Record<string, NodeSpec> = {
      G: {
        kind: "generative",
        generations: [gen({ id: "g1", status: "running" })]
      }
    };
    expect(decide(nodes, "G")).toBe("block");
  });

  it("pinned generation (selected_generation) that is completed → reuse", () => {
    const nodes: Record<string, NodeSpec> = {
      G: {
        kind: "generative",
        selectedGenerationId: "pinned",
        generations: [
          gen({ id: "pinned", status: "completed" }),
          gen({ id: "newer", status: "error" })
        ]
      }
    };
    expect(decide(nodes, "G")).toBe("reuse");
  });

  // Codex review #1: an explicit selection is intentional (§1.5), so an
  // unusable explicit selection must block rather than silently fall back to a
  // different generation.
  it("pinned generation that is NOT completed → block (no silent fallback)", () => {
    const nodes: Record<string, NodeSpec> = {
      G: {
        kind: "generative",
        selectedGenerationId: "p",
        generations: [
          gen({ id: "p", status: "error" }),
          gen({ id: "other", status: "completed" })
        ]
      }
    };
    expect(decide(nodes, "G")).toBe("block");
  });

  it("pinned generation id missing from history → block", () => {
    const nodes: Record<string, NodeSpec> = {
      G: {
        kind: "generative",
        selectedGenerationId: "ghost",
        generations: [gen({ id: "other", status: "completed" })]
      }
    };
    expect(decide(nodes, "G")).toBe("block");
  });

  it("≥2 selected but NONE completed → block (no empty replay)", () => {
    const nodes: Record<string, NodeSpec> = {
      G: {
        kind: "generative",
        selectedGenerationIds: ["a", "b"],
        generations: [
          gen({ id: "a", status: "error" }),
          gen({ id: "b", status: "running" })
        ]
      }
    };
    expect(decide(nodes, "G")).toBe("block");
  });

  it("≥2 selected with at least one completed → replay (stream the completed subset)", () => {
    const nodes: Record<string, NodeSpec> = {
      G: {
        kind: "generative",
        selectedGenerationIds: ["a", "b"],
        generations: [
          gen({ id: "a", status: "completed" }),
          gen({ id: "b", status: "error" })
        ]
      }
    };
    expect(decide(nodes, "G")).toBe("replay");
  });
});

describe("resolve — propagation", () => {
  it("computed whose upstream resolves replay → run (anyUpstreamWillRun)", () => {
    const nodes: Record<string, NodeSpec> = {
      C: {
        kind: "computed",
        signature: "sigC",
        ttl: "forever",
        upstreams: ["G"],
        // C's own cache is fresh, yet the replay upstream forces a re-run.
        generations: [gen({ id: "gC", inputSignature: "sigC" })]
      },
      G: {
        kind: "generative",
        selectedGenerationIds: ["a", "b"],
        generations: [gen({ id: "a" }), gen({ id: "b" })]
      }
    };
    expect(decide(nodes, "C")).toBe("run");
  });

  it("cycle: a back-edge is treated as run, no infinite recursion", () => {
    const nodes: Record<string, NodeSpec> = {
      A: {
        kind: "computed",
        signature: "sigA",
        ttl: "forever",
        upstreams: ["B"],
        generations: [gen({ id: "gA", inputSignature: "sigA" })]
      },
      B: {
        kind: "computed",
        signature: "sigB",
        ttl: "forever",
        upstreams: ["A"],
        generations: [gen({ id: "gB", inputSignature: "sigB" })]
      }
    };
    expect(decide(nodes, "A")).toBe("run");
  });
});
