/**
 * Mutation-hardening for JinaProvider: model list, embed request shape (URL,
 * headers, model default, v3-only task, dimensions), text validation, the
 * index-sorted response mapping, error body, and chat-unsupported generators.
 * See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi } from "vitest";
import {
  JinaProvider,
  sortEmbeddingsByIndex
} from "../../src/providers/jina-provider.js";

const make = (fetchFn?: unknown, opts: object = {}, key = "k") =>
  new JinaProvider({ JINA_API_KEY: key }, { fetchFn: fetchFn as never, ...(opts as never) });
const ok = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body });
const bodyOf = (fetchFn: ReturnType<typeof vi.fn>) =>
  JSON.parse(fetchFn.mock.calls[0][1].body);

describe("JinaProvider model list", () => {
  it("returns the exact curated list", async () => {
    const models = await make().getAvailableEmbeddingModels();
    expect(models.map((m) => m.id)).toEqual([
      "jina-embeddings-v3",
      "jina-clip-v2",
      "jina-embeddings-v2-base-en",
      "jina-embeddings-v2-base-de",
      "jina-embeddings-v2-base-zh",
      "jina-embeddings-v2-base-code"
    ]);
    for (const m of models) {
      expect(m.provider).toBe("jina");
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.dimensions).toBeGreaterThan(0);
    }
  });
});

describe("JinaProvider chat unsupported", () => {
  it("generateMessage rejects", async () => {
    await expect(make().generateMessage({ messages: [], model: "x" } as never)).rejects.toThrow(
      "does not support chat"
    );
  });
  it("generateMessages yields nothing then throws", async () => {
    await expect(
      make().generateMessages({ messages: [], model: "x" } as never).next()
    ).rejects.toThrow("does not support chat");
  });
});

describe("JinaProvider.generateEmbedding", () => {
  it("POSTs the documented request with default model + v3 task", async () => {
    const fetchFn = ok({ data: [{ embedding: [1], index: 0 }] });
    await make(fetchFn, { task: "retrieval.query" }).generateEmbedding({
      text: ["a"],
      model: "",
      dimensions: 256
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.jina.ai/v1/embeddings");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer k", "Content-Type": "application/json" });
    expect(bodyOf(fetchFn)).toEqual({
      model: "jina-embeddings-v3",
      input: ["a"],
      task: "retrieval.query",
      dimensions: 256
    });
  });

  it("adds task for any model starting with jina-embeddings-v3 (prefix, not suffix)", async () => {
    const fetchFn = ok({ data: [{ embedding: [1] }] });
    await make(fetchFn, { task: "retrieval.query" }).generateEmbedding({
      text: "x",
      model: "jina-embeddings-v3-tuned"
    });
    expect(bodyOf(fetchFn).task).toBe("retrieval.query");
  });

  it("only adds task for v3 models", async () => {
    const fetchFn = ok({ data: [{ embedding: [1] }] });
    await make(fetchFn, { task: "retrieval.query" }).generateEmbedding({
      text: "x",
      model: "jina-clip-v2"
    });
    expect("task" in bodyOf(fetchFn)).toBe(false);
  });

  it("adds no task when task is null", async () => {
    const fetchFn = ok({ data: [{ embedding: [1] }] });
    await make(fetchFn, { task: "" }).generateEmbedding({
      text: "x",
      model: "jina-embeddings-v3"
    });
    expect("task" in bodyOf(fetchFn)).toBe(false);
  });

  it("omits dimensions when not provided", async () => {
    const fetchFn = ok({ data: [{ embedding: [1] }] });
    await make(fetchFn).generateEmbedding({ text: "x", model: "jina-embeddings-v3" });
    expect("dimensions" in bodyOf(fetchFn)).toBe(false);
  });

  it("rejects empty/blank/non-string input", async () => {
    const p = make(ok({ data: [] }));
    await expect(p.generateEmbedding({ text: [], model: "m" })).rejects.toThrow("text must not be empty");
    await expect(p.generateEmbedding({ text: ["", "x"], model: "m" })).rejects.toThrow("text must not be empty");
    await expect(
      p.generateEmbedding({ text: [3 as unknown as string], model: "m" })
    ).rejects.toThrow("text must not be empty");
  });

  it("returns embeddings ordered by index", async () => {
    const fetchFn = ok({
      data: [
        { embedding: [9, 9], index: 1 },
        { embedding: [1, 1], index: 0 }
      ]
    });
    expect(await make(fetchFn).generateEmbedding({ text: ["a", "b"], model: "m" })).toEqual([
      [1, 1],
      [9, 9]
    ]);
  });

  it("returns [] when the response has no data", async () => {
    expect(await make(ok({})).generateEmbedding({ text: "x", model: "m" })).toEqual([]);
  });

  it("sortEmbeddingsByIndex orders by index (default 0) and projects", () => {
    expect(
      sortEmbeddingsByIndex([
        { embedding: [9], index: 2 },
        { embedding: [5] }, // no index → 0, sorts first
        { embedding: [7], index: 1 }
      ])
    ).toEqual([[5], [7], [9]]);
  });

  it("surfaces HTTP errors, with an empty body when text() rejects", async () => {
    const errFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "down"
    });
    await expect(make(errFetch).generateEmbedding({ text: "x", model: "m" })).rejects.toThrow(
      "Jina embedding error 502: down"
    );
    const throwFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => {
        throw new Error("boom");
      }
    });
    await expect(make(throwFetch).generateEmbedding({ text: "x", model: "m" })).rejects.toThrow(
      /Jina embedding error 502: $/
    );
  });

  it("throws when the API key is missing", async () => {
    await expect(
      make(ok({}), {}, "").generateEmbedding({ text: "x", model: "m" })
    ).rejects.toThrow("JINA_API_KEY is not configured");
  });
});
