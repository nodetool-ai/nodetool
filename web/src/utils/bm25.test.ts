import { tokenize, BM25Index, buildNodeBM25Index } from "./bm25";
import type { NodeMetadata } from "../stores/ApiTypes";

describe("tokenize", () => {
  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("returns empty array for null/undefined", () => {
    expect(tokenize(null as unknown as string)).toEqual([]);
    expect(tokenize(undefined as unknown as string)).toEqual([]);
  });

  it("lowercases tokens", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
  });

  it("splits on punctuation and whitespace", () => {
    expect(tokenize("foo.bar-baz_qux")).toEqual(["foo", "bar", "baz", "qux"]);
  });

  it("drops tokens shorter than 2 characters", () => {
    expect(tokenize("I am a test")).toEqual(["am", "test"]);
  });

  it("handles mixed delimiters", () => {
    expect(tokenize("hello, world! (test)")).toEqual([
      "hello",
      "world",
      "test"
    ]);
  });
});

describe("BM25Index", () => {
  const fields = [
    { name: "title", weight: 2.0 },
    { name: "body", weight: 1.0 }
  ];

  it("returns empty results for empty query", () => {
    const idx = new BM25Index(fields);
    idx.index([{ id: "1", fields: { title: "hello", body: "world" } }]);
    expect(idx.search("")).toEqual([]);
  });

  it("returns empty results when no documents indexed", () => {
    const idx = new BM25Index(fields);
    idx.index([]);
    expect(idx.search("anything")).toEqual([]);
  });

  it("scores matching documents higher than non-matching", () => {
    const idx = new BM25Index(fields);
    idx.index([
      { id: "match", fields: { title: "image resize", body: "resize an image" } },
      { id: "nomatch", fields: { title: "text output", body: "print text" } }
    ]);
    const results = idx.search("image");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("match");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("applies field weights so title matches score higher", () => {
    const idx = new BM25Index(fields);
    idx.index([
      { id: "title-match", fields: { title: "image", body: "something else" } },
      { id: "body-match", fields: { title: "something else", body: "image" } }
    ]);
    const results = idx.search("image");
    expect(results[0].id).toBe("title-match");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("respects the limit parameter", () => {
    const idx = new BM25Index(fields);
    idx.index([
      { id: "a", fields: { title: "test one", body: "" } },
      { id: "b", fields: { title: "test two", body: "" } },
      { id: "c", fields: { title: "test three", body: "" } }
    ]);
    const results = idx.search("test", 2);
    expect(results.length).toBe(2);
  });

  it("returns all results when limit is 0", () => {
    const idx = new BM25Index(fields);
    idx.index([
      { id: "a", fields: { title: "test", body: "" } },
      { id: "b", fields: { title: "test", body: "" } }
    ]);
    const results = idx.search("test", 0);
    expect(results.length).toBe(2);
  });

  it("can be re-indexed safely", () => {
    const idx = new BM25Index(fields);
    idx.index([{ id: "old", fields: { title: "old doc", body: "" } }]);
    idx.index([{ id: "new", fields: { title: "new doc", body: "" } }]);
    const results = idx.search("old");
    expect(results.length).toBe(0);
    expect(idx.search("new").length).toBe(1);
  });

  it("handles multi-term queries", () => {
    const idx = new BM25Index(fields);
    idx.index([
      { id: "both", fields: { title: "image resize tool", body: "" } },
      { id: "one", fields: { title: "image viewer", body: "" } }
    ]);
    const results = idx.search("image resize");
    expect(results[0].id).toBe("both");
  });
});

describe("buildNodeBM25Index", () => {
  const makeNode = (
    nodeType: string,
    title: string,
    ns: string,
    desc = ""
  ): NodeMetadata =>
    ({
      node_type: nodeType,
      title,
      namespace: ns,
      description: desc
    }) as NodeMetadata;

  it("builds an index and finds nodes by title", () => {
    const nodes = [
      makeNode("img.resize", "Resize Image", "nodetool.image"),
      makeNode("txt.output", "Text Output", "nodetool.text")
    ];
    const idx = buildNodeBM25Index(nodes);
    const results = idx.search("resize");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("img.resize");
  });

  it("uses extra fields when provided", () => {
    const nodes = [makeNode("a.node", "My Node", "ns", "raw description")];
    const extras = new Map([
      [
        "a.node",
        {
          description: "cleaned description",
          tags: "alpha, beta",
          useCases: "testing"
        }
      ]
    ]);
    const idx = buildNodeBM25Index(nodes, extras);
    const results = idx.search("alpha");
    expect(results.length).toBe(1);
  });
});
