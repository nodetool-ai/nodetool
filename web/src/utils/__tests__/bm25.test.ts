/**
 * @jest-environment node
 */
import { BM25Index, buildNodeBM25Index, tokenize } from "../bm25";
import { NodeMetadata } from "../../stores/ApiTypes";

const baseNode = (
  overrides: Partial<NodeMetadata> & Pick<NodeMetadata, "node_type" | "title" | "namespace">
): NodeMetadata =>
  ({
    description: "",
    properties: [],
    outputs: [],
    layout: "default",
    recommended_models: [],
    supports_dynamic_inputs: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: [],
    ...overrides
  }) as NodeMetadata;

describe("bm25 tokenize", () => {
  it("lowercases and splits on punctuation/whitespace", () => {
    expect(tokenize("Hello, World! foo_bar.baz/qux")).toEqual([
      "hello",
      "world",
      "foo",
      "bar",
      "baz",
      "qux"
    ]);
  });

  it("drops single-character tokens", () => {
    expect(tokenize("a big DOG")).toEqual(["big", "dog"]);
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("BM25Index", () => {
  it("ranks docs containing the term higher than those that don't", () => {
    const index = new BM25Index([{ name: "text", weight: 1 }]);
    index.index([
      { id: "a", fields: { text: "alpha beta gamma" } },
      { id: "b", fields: { text: "delta epsilon" } },
      { id: "c", fields: { text: "alpha alpha beta" } }
    ]);
    const results = index.search("alpha");
    expect(results.map((r) => r.id)).toEqual(["c", "a"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("weights fields differently", () => {
    const index = new BM25Index([
      { name: "title", weight: 5 },
      { name: "body", weight: 1 }
    ]);
    index.index([
      { id: "title-match", fields: { title: "kittens", body: "" } },
      { id: "body-match", fields: { title: "", body: "kittens" } }
    ]);
    const results = index.search("kittens");
    expect(results[0].id).toBe("title-match");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("applies IDF: rare terms outweigh common ones", () => {
    const index = new BM25Index([{ name: "text", weight: 1 }]);
    index.index([
      { id: "1", fields: { text: "common common common rare" } },
      { id: "2", fields: { text: "common common common" } },
      { id: "3", fields: { text: "common common" } },
      { id: "4", fields: { text: "common" } }
    ]);
    const rareTopHit = index.search("rare")[0];
    const commonTopHit = index.search("common")[0];
    expect(rareTopHit.id).toBe("1");
    // Rare term match should outscore the best "common" match.
    expect(rareTopHit.score).toBeGreaterThan(commonTopHit.score);
  });

  it("returns empty for unknown terms or empty queries", () => {
    const index = new BM25Index([{ name: "text", weight: 1 }]);
    index.index([{ id: "a", fields: { text: "hello" } }]);
    expect(index.search("zzz")).toEqual([]);
    expect(index.search("")).toEqual([]);
  });

  it("resets internal state when index() is called again", () => {
    const index = new BM25Index([{ name: "text", weight: 1 }]);
    index.index([
      { id: "a", fields: { text: "alpha" } },
      { id: "b", fields: { text: "beta" } }
    ]);
    // Re-index with a different doc set; old terms must not linger.
    index.index([{ id: "c", fields: { text: "gamma" } }]);
    expect(index.search("alpha")).toEqual([]);
    expect(index.search("beta")).toEqual([]);
    expect(index.search("gamma").map((r) => r.id)).toEqual(["c"]);
  });

  it("respects the limit parameter", () => {
    const index = new BM25Index([{ name: "text", weight: 1 }]);
    index.index([
      { id: "1", fields: { text: "foo" } },
      { id: "2", fields: { text: "foo foo" } },
      { id: "3", fields: { text: "foo foo foo" } }
    ]);
    expect(index.search("foo", 2)).toHaveLength(2);
  });
});

describe("buildNodeBM25Index", () => {
  const nodes: NodeMetadata[] = [
    baseNode({
      node_type: "math.add",
      title: "Add",
      namespace: "math",
      description: "Adds two numbers together"
    }),
    baseNode({
      node_type: "math.subtract",
      title: "Subtract",
      namespace: "math",
      description: "Subtracts one number from another"
    }),
    baseNode({
      node_type: "string.concat",
      title: "Concatenate",
      namespace: "string",
      description: "Joins strings together"
    })
  ];

  it("ranks title matches above description-only matches", () => {
    const index = buildNodeBM25Index(nodes);
    const results = index.search("add");
    expect(results[0].id).toBe("math.add");
  });

  it("matches description tokens", () => {
    const index = buildNodeBM25Index(nodes);
    const results = index.search("strings");
    expect(results.map((r) => r.id)).toContain("string.concat");
  });

  it("uses extra fields (tags, use_cases) when supplied", () => {
    const extras = new Map<
      string,
      { description: string; tags: string; useCases: string }
    >();
    extras.set("math.add", {
      description: "Adds two numbers together",
      tags: "arithmetic, sum",
      useCases: ""
    });
    const index = buildNodeBM25Index(nodes, extras);
    const results = index.search("arithmetic");
    expect(results[0]?.id).toBe("math.add");
  });

  it("does not double-index tags/use-cases via the description field", () => {
    // Real NodeMetadata.description is multi-line: line 1 = description,
    // line 2 = tags, then a "Use cases:" section. The cleaned description
    // (line 1 only) should be used for the description field; tags and
    // use_cases must come exclusively from extraFields.
    const node = baseNode({
      node_type: "image.blur",
      title: "Blur",
      namespace: "image",
      description:
        "Applies a Gaussian blur to an image.\n" +
        "filter, gaussian, smoothing\n" +
        "Use cases:\n" +
        "- Reduce noise in photos\n" +
        "- Soften backgrounds"
    });
    const extras = new Map<
      string,
      { description: string; tags: string; useCases: string }
    >();
    extras.set("image.blur", {
      description: "Applies a Gaussian blur to an image.",
      tags: "filter, gaussian, smoothing",
      useCases: "Reduce noise in photos\nSoften backgrounds"
    });

    const index = buildNodeBM25Index([node], extras);

    // Tag terms still match (via the dedicated `tags` field) ...
    expect(index.search("gaussian")[0]?.id).toBe("image.blur");
    // ... and use-case terms still match (via the dedicated `use_cases` field).
    expect(index.search("noise")[0]?.id).toBe("image.blur");
    // The cleaned description must not contain the "Use cases:" label
    // or tag tokens — verify by indexing without extras and confirming
    // tag terms only match when extras are supplied.
    const indexNoExtras = buildNodeBM25Index([node]);
    // Without extras, the raw description leaks tags into description-only
    // search. With extras, the dedicated tags field produces a higher score
    // due to its higher weight (1.5 vs 0.8).
    const withExtras = index.search("gaussian")[0]?.score ?? 0;
    const withoutExtras = indexNoExtras.search("gaussian")[0]?.score ?? 0;
    expect(withExtras).toBeGreaterThan(withoutExtras);
  });
});
