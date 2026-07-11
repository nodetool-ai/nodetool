import { describe, it, expect } from "vitest";
import {
  collectionMetadata,
  collectionListItem,
  collectionResponse,
  listOutput,
  getInput,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  queryInput,
  queryOutput
} from "../src/api-schemas/collections.js";

describe("collections.collectionMetadata", () => {
  it("accepts string/number/boolean values", () => {
    const r = collectionMetadata.safeParse({ a: "x", b: 1, c: true });
    expect(r.success).toBe(true);
  });

  it("rejects a null value", () => {
    const r = collectionMetadata.safeParse({ a: null });
    expect(r.success).toBe(false);
  });

  it("rejects nested-object values", () => {
    const r = collectionMetadata.safeParse({ a: { nested: 1 } });
    expect(r.success).toBe(false);
  });
});

describe("collections.collectionListItem", () => {
  it("parses a full item with nullable workflow_name null", () => {
    const r = collectionListItem.safeParse({
      name: "docs",
      count: 3,
      metadata: { model: "x" },
      workflow_name: null
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing workflow_name (not optional, only nullable)", () => {
    const r = collectionListItem.safeParse({
      name: "docs",
      count: 3,
      metadata: {}
    });
    expect(r.success).toBe(false);
  });
});

describe("collections.collectionResponse", () => {
  it("parses valid response", () => {
    expect(
      collectionResponse.safeParse({ name: "c", metadata: {}, count: 0 }).success
    ).toBe(true);
  });

  it("rejects a non-number count", () => {
    expect(
      collectionResponse.safeParse({ name: "c", metadata: {}, count: "0" })
        .success
    ).toBe(false);
  });
});

describe("collections.listOutput", () => {
  it("parses an empty collections array", () => {
    expect(listOutput.safeParse({ collections: [], count: 0 }).success).toBe(
      true
    );
  });
});

describe("collections.getInput / deleteInput", () => {
  it("accepts a non-empty name", () => {
    expect(getInput.safeParse({ name: "a" }).success).toBe(true);
    expect(deleteInput.safeParse({ name: "a" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(getInput.safeParse({ name: "" }).success).toBe(false);
    expect(deleteInput.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("collections.createInput", () => {
  it("accepts name only, embedding fields optional", () => {
    expect(createInput.safeParse({ name: "c" }).success).toBe(true);
  });

  it("accepts embedding_model and embedding_provider", () => {
    expect(
      createInput.safeParse({
        name: "c",
        embedding_model: "m",
        embedding_provider: "p"
      }).success
    ).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createInput.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("collections.updateInput", () => {
  it("accepts name only", () => {
    expect(updateInput.safeParse({ name: "c" }).success).toBe(true);
  });

  it("accepts rename and metadata", () => {
    expect(
      updateInput.safeParse({ name: "c", rename: "d", metadata: { a: 1 } })
        .success
    ).toBe(true);
  });

  it("rejects empty rename", () => {
    expect(updateInput.safeParse({ name: "c", rename: "" }).success).toBe(false);
  });
});

describe("collections.deleteOutput", () => {
  it("requires a message string", () => {
    expect(deleteOutput.safeParse({ message: "ok" }).success).toBe(true);
    expect(deleteOutput.safeParse({}).success).toBe(false);
  });
});

describe("collections.queryInput", () => {
  it("defaults n_results to 10", () => {
    const r = queryInput.parse({ name: "c", query_texts: ["hi"] });
    expect(r.n_results).toBe(10);
  });

  it("rejects an empty query_texts array", () => {
    expect(
      queryInput.safeParse({ name: "c", query_texts: [] }).success
    ).toBe(false);
  });

  it("rejects n_results above 1000", () => {
    expect(
      queryInput.safeParse({ name: "c", query_texts: ["x"], n_results: 1001 })
        .success
    ).toBe(false);
  });

  it("rejects a non-integer n_results", () => {
    expect(
      queryInput.safeParse({ name: "c", query_texts: ["x"], n_results: 1.5 })
        .success
    ).toBe(false);
  });

  it("rejects n_results below 1", () => {
    expect(
      queryInput.safeParse({ name: "c", query_texts: ["x"], n_results: 0 })
        .success
    ).toBe(false);
  });
});

describe("collections.queryOutput", () => {
  it("parses nested arrays with nullable documents/metadatas", () => {
    const r = queryOutput.safeParse({
      ids: [["a"]],
      documents: [["doc", null]],
      metadatas: [[{ k: 1 }, null]],
      distances: [[0.1]]
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-array distances", () => {
    expect(
      queryOutput.safeParse({
        ids: [],
        documents: [],
        metadatas: [],
        distances: "nope"
      }).success
    ).toBe(false);
  });
});
