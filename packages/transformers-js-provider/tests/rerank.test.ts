import { describe, expect, it, vi } from "vitest";

const tokenizer = vi.fn(() => ({ input_ids: "ids" }));
const model = vi.fn();

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  getPipeline: vi.fn(async () => ({ tokenizer, model }))
}));

import { getPipeline } from "@nodetool-ai/transformers-js-nodes";
import { rerank } from "../src/rerank.js";

describe("rerank", () => {
  it("pairs the query with each document and sorts by relevance", async () => {
    model.mockResolvedValue({
      logits: { data: Float32Array.from([0, -4, 2]), dims: [3, 1] }
    });
    const out = await rerank({
      model: "mixedbread-ai/mxbai-rerank-xsmall-v1",
      query: "bread",
      documents: ["a", "b", "c"]
    });

    expect(getPipeline).toHaveBeenCalledWith({
      task: "text-classification",
      model: "mixedbread-ai/mxbai-rerank-xsmall-v1"
    });
    expect(tokenizer).toHaveBeenCalledWith(["bread", "bread", "bread"], {
      text_pair: ["a", "b", "c"],
      padding: true,
      truncation: true
    });
    expect(out.map((r) => r.index)).toEqual([2, 0, 1]);
    expect(out[1].score).toBeCloseTo(0.5);
    expect(out[0].score).toBeCloseTo(1 / (1 + Math.exp(-2)));
  });

  it("keeps the best topK documents", async () => {
    model.mockResolvedValue({
      logits: { data: Float32Array.from([1, 3, 2]), dims: [3, 1] }
    });
    const out = await rerank({
      model: "m",
      query: "q",
      documents: ["a", "b", "c"],
      topK: 2
    });
    expect(out.map((r) => r.index)).toEqual([1, 2]);
  });

  it("scores a two-label head by its last label", async () => {
    model.mockResolvedValue({
      logits: { data: Float32Array.from([0, 0, 0, 2]), dims: [2, 2] }
    });
    const out = await rerank({ model: "m", query: "q", documents: ["a", "b"] });
    expect(out[0]).toEqual({ index: 1, score: expect.closeTo(0.881, 3) });
    expect(out[1].score).toBeCloseTo(0.5);
  });

  it("answers no documents without loading a model", async () => {
    vi.mocked(getPipeline).mockClear();
    expect(await rerank({ model: "m", query: "q", documents: [] })).toEqual([]);
    expect(getPipeline).not.toHaveBeenCalled();
  });
});
