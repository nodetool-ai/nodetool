// @ts-nocheck
/**
 * Mutation-hardening tests for search.ts: field weighting, the exact-token
 * bonus, namespace-prefix filtering, per-field score accumulation, and the
 * deterministic ranking tiebreak.
 */
import { describe, it, expect } from "vitest";
import { scoreNodeMetadata, rankNodeMetadata } from "../src/search.js";
import type { NodeMetadata } from "../src/metadata.js";

const meta = (o: Partial<NodeMetadata> & { node_type: string }): NodeMetadata => ({
  title: o.title ?? "",
  description: o.description ?? "",
  namespace: o.namespace ?? o.node_type.split(".").slice(0, -1).join("."),
  node_type: o.node_type,
  properties: [],
  outputs: []
});

describe("scoreNodeMetadata", () => {
  it("returns 0 for an empty term list", () => {
    expect(scoreNodeMetadata(meta({ node_type: "nodetool.X", title: "X" }), [])).toBe(0);
  });

  it("returns 0 when nothing matches", () => {
    const score = scoreNodeMetadata(meta({ node_type: "nodetool.X", title: "Image" }), ["audio"]);
    expect(score).toBe(0);
  });

  it("gives a whole-token match a higher score than a substring match", () => {
    const exact = scoreNodeMetadata(meta({ node_type: "nodetool.gen", title: "image generator" }), ["image"]);
    const substr = scoreNodeMetadata(meta({ node_type: "nodetool.gen", title: "imagery tool" }), ["image"]);
    expect(exact).toBeGreaterThan(substr);
  });

  it("scores a description-only match above zero", () => {
    // Pins raw += description (a -= mutation would make the score negative → filtered).
    const score = scoreNodeMetadata(
      meta({ node_type: "nodetool.x", title: "Foo", description: "resize an image" }),
      ["image"]
    );
    expect(score).toBeGreaterThan(0);
  });

  it("scores a namespace-only match above zero", () => {
    const score = scoreNodeMetadata(
      meta({ node_type: "nodetool.imaging.tool", title: "Tool", namespace: "nodetool.imaging" }),
      ["imaging"]
    );
    expect(score).toBeGreaterThan(0);
  });

  it("applies the core multiplier to nodetool.* namespaces", () => {
    const core = scoreNodeMetadata(meta({ node_type: "nodetool.x", title: "image", namespace: "nodetool" }), ["image"]);
    const other = scoreNodeMetadata(meta({ node_type: "lib.x", title: "image", namespace: "lib" }), ["image"]);
    expect(core).toBeGreaterThan(other);
  });

  it("filters by namespacePrefix using startsWith, not endsWith", () => {
    const node = meta({ node_type: "nodetool.image.gen", title: "gen", namespace: "nodetool.image" });
    expect(scoreNodeMetadata(node, ["gen"], { namespacePrefix: "nodetool" })).toBeGreaterThan(0);
    expect(scoreNodeMetadata(node, ["gen"], { namespacePrefix: "openai" })).toBe(0);
  });

  it("hides provider nodes unless includeProviderNodes is set", () => {
    const node = meta({ node_type: "openai.tts.Speak", title: "speak", namespace: "openai.tts" });
    expect(scoreNodeMetadata(node, ["speak"])).toBe(0);
    expect(scoreNodeMetadata(node, ["speak"], { includeProviderNodes: true })).toBeGreaterThan(0);
  });
});

describe("rankNodeMetadata", () => {
  it("drops zero-score nodes and sorts by score descending", () => {
    const nodes = [
      meta({ node_type: "nodetool.a", title: "audio thing" }),
      meta({ node_type: "nodetool.b", title: "image generator" }),
      meta({ node_type: "nodetool.c", title: "image" })
    ];
    const ranked = rankNodeMetadata(nodes, ["image"]);
    expect(ranked.map((r) => r.meta.node_type)).not.toContain("nodetool.a");
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it("breaks score ties alphabetically by node_type", () => {
    const nodes = [
      meta({ node_type: "nodetool.zeta", title: "image" }),
      meta({ node_type: "nodetool.alpha", title: "image" })
    ];
    const ranked = rankNodeMetadata(nodes, ["image"]);
    expect(ranked.map((r) => r.meta.node_type)).toEqual([
      "nodetool.alpha",
      "nodetool.zeta"
    ]);
  });
});
