/**
 * Memoization of the registry's derived metadata views:
 *  - listMetadata() returns a fresh copy backed by a cached merge
 *  - searchMetadata() uses a cached NodeSearchIndex
 *  - every mutation invalidates both caches
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NodeRegistry } from "../src/registry.js";
import { rankNodeMetadata } from "../src/search.js";
import type { NodeMetadata } from "../src/metadata.js";

function meta(node_type: string, overrides: Partial<NodeMetadata> = {}): NodeMetadata {
  return {
    title: overrides.title ?? node_type.split(".").pop() ?? node_type,
    description: overrides.description ?? "",
    namespace: overrides.namespace ?? node_type.split(".").slice(0, -1).join("."),
    node_type,
    properties: overrides.properties ?? [],
    outputs: overrides.outputs ?? []
  };
}

describe("NodeRegistry metadata caches", () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it("returns a fresh array each call so in-place sorts don't corrupt the cache", () => {
    registry.loadMetadata("test.B", meta("test.B"));
    registry.loadMetadata("test.A", meta("test.A"));

    const first = registry.listMetadata();
    expect(first.map((m) => m.node_type)).toEqual(["test.B", "test.A"]);

    // Simulate http-api / tRPC sorting the result in place.
    first.sort((a, b) => a.node_type.localeCompare(b.node_type));

    const second = registry.listMetadata();
    expect(second).not.toBe(first);
    expect(second.map((m) => m.node_type)).toEqual(["test.B", "test.A"]);
  });

  it("reflects newly loaded metadata after invalidation", () => {
    registry.loadMetadata("test.A", meta("test.A"));
    expect(registry.listMetadata().map((m) => m.node_type)).toEqual(["test.A"]);

    registry.loadMetadata("test.B", meta("test.B"));
    expect(registry.listMetadata().map((m) => m.node_type).sort()).toEqual([
      "test.A",
      "test.B"
    ]);
  });

  it("drops entries from the cache after unregister and clear", () => {
    registry.loadMetadata("test.A", meta("test.A"));
    registry.loadMetadata("test.B", meta("test.B"));

    registry.unregister("test.A");
    expect(registry.listMetadata().map((m) => m.node_type)).toEqual(["test.B"]);

    registry.clear();
    expect(registry.listMetadata()).toEqual([]);
  });

  it("searchMetadata matches rankNodeMetadata over the same nodes", () => {
    const nodes = [
      meta("nodetool.image.TextToImage", {
        title: "Text To Image",
        description: "Generate an image from a text prompt."
      }),
      meta("nodetool.text.Concat", {
        title: "Concat Text",
        description: "Concatenate strings."
      }),
      meta("openai.ImageCreation", {
        namespace: "openai",
        title: "Image Creation",
        description: "Create an image with OpenAI."
      })
    ];
    for (const m of nodes) registry.loadMetadata(m.node_type, m);

    const viaRegistry = registry.searchMetadata(["image"]);
    const viaRank = rankNodeMetadata(registry.listMetadata(), ["image"]);
    expect(viaRegistry.map((r) => [r.meta.node_type, r.score])).toEqual(
      viaRank.map((r) => [r.meta.node_type, r.score])
    );
    // Provider node hidden by default.
    expect(viaRegistry.map((r) => r.meta.node_type)).toEqual([
      "nodetool.image.TextToImage"
    ]);
  });

  it("rebuilds the search index after the node set changes", () => {
    registry.loadMetadata(
      "nodetool.text.Concat",
      meta("nodetool.text.Concat", { title: "Concat Text" })
    );
    expect(registry.searchMetadata(["split"])).toEqual([]);

    registry.loadMetadata(
      "nodetool.text.Split",
      meta("nodetool.text.Split", {
        title: "Split Text",
        description: "Split text by a delimiter."
      })
    );
    const ranked = registry.searchMetadata(["split"]);
    expect(ranked.map((r) => r.meta.node_type)).toEqual(["nodetool.text.Split"]);
  });
});
