import { describe, expect, it } from "vitest";
import {
  NodeSearchIndex,
  rankNodeMetadata,
  type ScoreOptions
} from "../src/search.js";
import type { NodeMetadata } from "../src/metadata.js";

function meta(
  overrides: Partial<NodeMetadata> & { node_type: string }
): NodeMetadata {
  const ns =
    overrides.namespace ??
    overrides.node_type.split(".").slice(0, -1).join(".");
  return {
    title:
      overrides.title ??
      overrides.node_type.split(".").pop() ??
      overrides.node_type,
    description: overrides.description ?? "",
    namespace: ns,
    node_type: overrides.node_type,
    properties: overrides.properties ?? [],
    outputs: overrides.outputs ?? []
  };
}

const NODES: NodeMetadata[] = [
  meta({
    node_type: "nodetool.image.TextToImage",
    title: "Text To Image",
    description: "Generate an image from a text prompt."
  }),
  meta({
    node_type: "nodetool.text.Concat",
    title: "Concat Text",
    description: "Concatenate strings together."
  }),
  meta({
    node_type: "nodetool.text.Split",
    title: "Split Text",
    description: "Split text by a delimiter."
  }),
  meta({
    node_type: "lib.image.Resize",
    namespace: "lib.image",
    title: "Resize Image",
    description: "Resize an image to target dimensions."
  }),
  meta({
    node_type: "openai.ImageCreation",
    namespace: "openai",
    title: "Image Creation",
    description: "Create an image with OpenAI."
  }),
  meta({
    node_type: "anthropic.text.Summarize",
    namespace: "anthropic.text",
    title: "Summarize",
    description: "Summarize text with Claude."
  })
];

describe("NodeSearchIndex", () => {
  it("reports its size", () => {
    expect(new NodeSearchIndex(NODES).size).toBe(NODES.length);
    expect(new NodeSearchIndex([]).size).toBe(0);
  });

  // The index must score and order results identically to the one-shot
  // rankNodeMetadata it replaces in the registry hot path.
  const cases: Array<{ name: string; terms: string[]; options?: ScoreOptions }> =
    [
      { name: "single term", terms: ["image"] },
      { name: "multiple terms", terms: ["text", "split"] },
      { name: "title vs description weighting", terms: ["text"] },
      { name: "no matches", terms: ["nonexistent"] },
      { name: "empty terms", terms: [] },
      { name: "empty string term", terms: [""] },
      {
        name: "include provider nodes",
        terms: ["image"],
        options: { includeProviderNodes: true }
      },
      {
        name: "namespace prefix lifts provider exclusion",
        terms: ["image"],
        options: { namespacePrefix: "openai" }
      },
      {
        name: "namespace prefix core",
        terms: ["text"],
        options: { namespacePrefix: "nodetool.text" }
      }
    ];

  for (const { name, terms, options } of cases) {
    it(`matches rankNodeMetadata: ${name}`, () => {
      const index = new NodeSearchIndex(NODES);
      const fromIndex = index.rank(terms, options);
      const fromRank = rankNodeMetadata(NODES, terms, options);
      expect(fromIndex.map((r) => [r.meta.node_type, r.score])).toEqual(
        fromRank.map((r) => [r.meta.node_type, r.score])
      );
    });
  }

  it("applies the core multiplier so core ranks above provider", () => {
    const index = new NodeSearchIndex(NODES);
    const ranked = index.rank(["image"], { includeProviderNodes: true });
    const types = ranked.map((r) => r.meta.node_type);
    expect(types).toContain("nodetool.image.TextToImage");
    expect(types).toContain("openai.ImageCreation");
    expect(types.indexOf("nodetool.image.TextToImage")).toBeLessThan(
      types.indexOf("openai.ImageCreation")
    );
  });

  it("hides provider nodes by default", () => {
    const ranked = new NodeSearchIndex(NODES).rank(["image"]);
    const types = ranked.map((r) => r.meta.node_type);
    expect(types).toContain("nodetool.image.TextToImage");
    expect(types).not.toContain("openai.ImageCreation");
  });

  it("breaks score ties alphabetically by node_type", () => {
    const tied = [
      meta({ node_type: "nodetool.b.Foo", title: "Foo" }),
      meta({ node_type: "nodetool.a.Foo", title: "Foo" })
    ];
    const ranked = new NodeSearchIndex(tied).rank(["foo"]);
    expect(ranked.map((r) => r.meta.node_type)).toEqual([
      "nodetool.a.Foo",
      "nodetool.b.Foo"
    ]);
  });
});
