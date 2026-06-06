/**
 * @jest-environment node
 */
import {
  searchTermsFromQuery,
  rankNodeMetadata,
} from "../nodeRanking";
import type { NodeMetadata } from "../../stores/ApiTypes";

const makeNode = (overrides: Record<string, unknown>): NodeMetadata =>
  ({
    description: "",
    properties: [],
    outputs: [],
    layout: "default",
    recommended_models: [],
    supports_dynamic_inputs: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: [],
    ...overrides,
  }) as unknown as NodeMetadata;

describe("searchTermsFromQuery", () => {
  it("returns empty array for empty/whitespace query", () => {
    expect(searchTermsFromQuery("")).toEqual([]);
    expect(searchTermsFromQuery("   ")).toEqual([]);
  });

  it("returns full query and individual tokens", () => {
    const terms = searchTermsFromQuery("hello world");
    expect(terms).toContain("hello world");
    expect(terms).toContain("hello");
    expect(terms).toContain("world");
  });

  it("returns single term for single-word query", () => {
    const terms = searchTermsFromQuery("blur");
    expect(terms).toEqual(["blur"]);
  });

  it("splits on commas", () => {
    const terms = searchTermsFromQuery("blur,sharpen");
    expect(terms).toContain("blur");
    expect(terms).toContain("sharpen");
  });

  it("deduplicates terms", () => {
    const terms = searchTermsFromQuery("blur");
    const unique = new Set(terms);
    expect(terms.length).toBe(unique.size);
  });
});

describe("rankNodeMetadata", () => {
  const nodes = [
    makeNode({
      node_type: "nodetool.image.Blur",
      title: "Blur",
      namespace: "nodetool.image",
      description: "Apply blur",
    }),
    makeNode({
      node_type: "nodetool.image.Sharpen",
      title: "Sharpen",
      namespace: "nodetool.image",
      description: "Apply sharpen",
    }),
    makeNode({
      node_type: "nodetool.text.Concat",
      title: "Concat",
      namespace: "nodetool.text",
      description: "Concatenate strings",
    }),
  ];

  it("returns matching nodes sorted by score descending", () => {
    const terms = searchTermsFromQuery("blur");
    const results = rankNodeMetadata(nodes, terms);
    expect(results.length).toBe(1);
    expect((results[0].meta as unknown as Record<string, unknown>).node_type).toBe("nodetool.image.Blur");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("returns all nodes when no search terms", () => {
    const results = rankNodeMetadata(nodes, []);
    expect(results.length).toBe(3);
  });

  it("boosts recent node types", () => {
    const terms = searchTermsFromQuery("blur");
    const withoutRecent = rankNodeMetadata(nodes, terms);
    const withRecent = rankNodeMetadata(nodes, terms, {
      recentNodeTypes: ["nodetool.image.Blur"],
    });
    expect(withRecent[0].score).toBeGreaterThan(withoutRecent[0].score);
  });

  it("boosts boosted node types", () => {
    const terms = searchTermsFromQuery("sharpen");
    const withoutBoost = rankNodeMetadata(nodes, terms);
    const withBoost = rankNodeMetadata(nodes, terms, {
      boostedNodeTypes: ["nodetool.image.Sharpen"],
    });
    expect(withBoost[0].score).toBeGreaterThan(withoutBoost[0].score);
  });

  it("applies candidate boosts from a Map", () => {
    const terms = searchTermsFromQuery("concat");
    const boostMap = new Map([["nodetool.text.Concat", 50]]);
    const results = rankNodeMetadata(nodes, terms, {
      candidateBoosts: boostMap,
    });
    expect((results[0].meta as unknown as Record<string, unknown>).node_type).toBe("nodetool.text.Concat");
    expect(results[0].score).toBeGreaterThanOrEqual(50);
  });

  it("applies candidate boosts from a Record", () => {
    const terms = searchTermsFromQuery("concat");
    const results = rankNodeMetadata(nodes, terms, {
      candidateBoosts: { "nodetool.text.Concat": 50 },
    });
    expect(results[0].score).toBeGreaterThanOrEqual(50);
  });

  it("sorts alphabetically on tie", () => {
    const results = rankNodeMetadata(nodes, []);
    const types = results.map((r) => (r.meta as unknown as Record<string, unknown>).node_type);
    const sorted = [...types].sort();
    expect(types).toEqual(sorted);
  });

  it("excludes provider nodes by default", () => {
    const withProvider = [
      ...nodes,
      makeNode({
        node_type: "openai.Chat",
        title: "Chat",
        namespace: "openai",
      }),
    ];
    const results = rankNodeMetadata(withProvider, []);
    expect(results.every((r) => (r.meta as unknown as Record<string, unknown>).namespace !== "openai")).toBe(true);
  });

  it("includes provider nodes when option set", () => {
    const withProvider = [
      ...nodes,
      makeNode({
        node_type: "openai.Chat",
        title: "Chat",
        namespace: "openai",
      }),
    ];
    const results = rankNodeMetadata(withProvider, [], {
      includeProviderNodes: true,
    });
    expect(results.some((r) => (r.meta as unknown as Record<string, unknown>).namespace === "openai")).toBe(true);
  });
});
