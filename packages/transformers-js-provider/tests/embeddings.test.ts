import { describe, expect, it, vi } from "vitest";

const embedPipelineFn = vi.fn();

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  getPipeline: vi.fn(async () => embedPipelineFn)
}));

import { generateEmbedding } from "../src/embeddings.js";

describe("generateEmbedding", () => {
  it("returns vectors via tolist() when available", async () => {
    embedPipelineFn.mockResolvedValue({
      tolist: () => [[0.1, 0.2, 0.3]]
    });
    const out = await generateEmbedding({
      text: "hello",
      model: "Xenova/all-MiniLM-L6-v2"
    });
    expect(out).toEqual([[0.1, 0.2, 0.3]]);
    const opts = embedPipelineFn.mock.calls[0][1];
    expect(opts).toMatchObject({ pooling: "mean", normalize: true });
  });

  it("reshapes flat data using dims when tolist is absent", async () => {
    embedPipelineFn.mockResolvedValue({
      data: Float32Array.from([1, 2, 3, 4, 5, 6]),
      dims: [2, 3]
    });
    const out = await generateEmbedding({
      text: ["a", "b"],
      model: "fake"
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(3);
    expect(out[1]).toEqual([4, 5, 6]);
  });

  it("ignores the dimensions argument (no truncation supported)", async () => {
    embedPipelineFn.mockResolvedValue({ tolist: () => [[1, 2, 3, 4]] });
    const out = await generateEmbedding({
      text: "x",
      model: "fake",
      dimensions: 2
    });
    // Length is unchanged because we do not honor `dimensions`.
    expect(out[0]).toHaveLength(4);
  });
});
