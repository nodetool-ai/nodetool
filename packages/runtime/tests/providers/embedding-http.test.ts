import { describe, it, expect } from "vitest";
import {
  normalizeEmbeddingTexts,
  sortEmbeddingsByIndex
} from "../../src/providers/embedding-http.js";

describe("embedding-http", () => {
  it("sortEmbeddingsByIndex orders by index (default 0) and projects", () => {
    expect(
      sortEmbeddingsByIndex([
        { embedding: [9], index: 2 },
        { embedding: [5] }, // no index → 0, sorts first
        { embedding: [7], index: 1 }
      ])
    ).toEqual([[5], [7], [9]]);
  });

  it("normalizeEmbeddingTexts wraps a string and rejects empty input", () => {
    expect(normalizeEmbeddingTexts("a")).toEqual(["a"]);
    expect(normalizeEmbeddingTexts(["a", "b"])).toEqual(["a", "b"]);
    expect(() => normalizeEmbeddingTexts([])).toThrow("text must not be empty");
    expect(() => normalizeEmbeddingTexts(["a", ""])).toThrow(
      "text must not be empty"
    );
  });
});
